import { NextResponse } from 'next/server'
import { createClient } from '@/shared/lib/supabase/server'
import prisma from '@/shared/lib/prisma'
import { sendNotification } from '@/shared/services/notificationService'
import { ensureAiSoulAndKey } from '@/shared/lib/ai/activation'
import { isAiDirectChatRoom } from '@/shared/lib/dm/roomSemantics'

export async function GET(request: Request, props: { params: Promise<{ roomId: string }> }) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const params = await props.params;
    const roomId = params.roomId;

    const { searchParams } = new URL(request.url)
    const cursor = searchParams.get('cursor')
    const limit = parseInt(searchParams.get('limit') || '50', 10)

    // 채팅방 접근 권한 확인
    const participant = await prisma.dmParticipant.findFirst({
      where: {
        roomId,
        userId: user.id,
        leftAt: null,
      },
    });

    if (!participant) {
      return NextResponse.json({ error: 'Room not found or no access' }, { status: 404 })
    }

    const messages = await prisma.dmMessage.findMany({
      where: { roomId, deletedAt: null },
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        sender: {
          select: { id: true, display_name: true, avatar_image_url: true },
        },
      },
    });

    // 읽음 처리 비동기 업데이트
    await prisma.dmParticipant.update({
      where: { id: participant.id },
      data: {
        lastReadAt: new Date(),
        unreadCount: 0,
      },
    });

    // 상대방의 lastReadAt 조회 (읽음 표시 초기값용)
    const partnerParticipant = await prisma.dmParticipant.findFirst({
      where: {
        roomId,
        userId: { not: user.id },
      },
      select: { lastReadAt: true },
    });

    const nextCursor = (messages.length === limit && messages.length > 0) ? messages[messages.length - 1].id : null;
    const reversedMessages = [...messages].reverse();

    return NextResponse.json({
      success: true,
      data: {
        messages: reversedMessages, // 오래된 순으로 반환
        nextCursor,
        partnerLastReadAt: partnerParticipant?.lastReadAt || null,
      },
    })
  } catch (error) {
    console.error('Fetch DM Messages Error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

export async function POST(request: Request, props: { params: Promise<{ roomId: string }> }) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const params = await props.params;
    const roomId = params.roomId;
    const { content = '', type = 'TEXT', images = [] } = await request.json()

    if (type === 'IMAGE' && images.length > 10) {
      return NextResponse.json({ error: 'Max 10 images allowed' }, { status: 400 })
    }

    const room = await prisma.dmRoom.findUnique({
      where: { id: roomId },
      select: { type: true, creatorId: true, maxParticipants: true }
    });

    if (!room) {
      return NextResponse.json({ error: 'Room not found' }, { status: 404 })
    }

    if (room.type === 'CS' && room.creatorId !== user.id) {
      return NextResponse.json({ error: 'Forbidden. Owner cannot write messages in CS room.' }, { status: 403 })
    }

    const participant = await prisma.dmParticipant.findFirst({
      where: {
        roomId,
        userId: user.id,
      },
    });

    if (!participant) {
      return NextResponse.json({ error: 'Room not found or no access' }, { status: 404 })
    }

    const lastMessagePreview = type === 'IMAGE' 
      ? `사진 ${images && images.length > 0 ? images.length : 1}장` 
      : content.slice(0, 100);

    const message = await prisma.$transaction(async (tx) => {
      if (participant.leftAt) {
        await tx.dmParticipant.update({
          where: { id: participant.id },
          data: { leftAt: null },
        });
      }

      const createdMessage = await tx.dmMessage.create({
        data: {
          roomId,
          senderId: user.id,
          content,
          images: type === 'IMAGE' ? images : [],
          type,
        },
        include: {
          sender: {
            select: { id: true, display_name: true, avatar_image_url: true },
          },
        },
      });

      await tx.dmRoom.update({
        where: { id: roomId },
        data: {
          lastMessageAt: new Date(),
          lastMessagePreview,
        },
      });

      // 다른 참여자의 읽지않음 카운트 증가 (그룹방인 경우 퇴장자는 복구하지 않음)
      if (room.type === 'GROUP') {
        await tx.dmParticipant.updateMany({
          where: {
            roomId,
            userId: { not: user.id },
            leftAt: null,
          },
          data: {
            unreadCount: { increment: 1 },
          },
        });
      } else {
        await tx.dmParticipant.updateMany({
          where: {
            roomId,
            userId: { not: user.id },
          },
          data: {
            unreadCount: { increment: 1 },
            leftAt: null,
          },
        });
      }

      return createdMessage;
    });

    // [Neural RAG] 상대가 AI Soul이고, CS 방이거나 아바타 대화방(나와 내 아바타의 대화)일 때만 비동기 대화 서비스 가동
    try {
      if (room && room.type !== 'GROUP') {
        let partnerUserId: string | null = null
        const partner = await prisma.dmParticipant.findFirst({
          where: { roomId, userId: { not: user.id }, leftAt: null },
          select: { userId: true }
        })
        
        const isAvatarDm = !partner && room.maxParticipants === 1
        const isAiDirectChat = isAiDirectChatRoom(room.type, isAvatarDm)

        // CS 방이거나 내 아바타 대화방일 때만 챗봇 트리거 작동 (CS 방의 경우 송신자가 개설자인 경우에만 작동되도록 이중 안전장치 추가)
        if (isAiDirectChat && (room.type !== 'CS' || user.id === room.creatorId)) {
          if (partner) {
            partnerUserId = partner.userId
          } else {
            // 상대방이 없다면(나와 내 아바타의 대화방인 경우), 나 자신을 파트너로 설정하여 내 AI 아바타를 소환
            const selfParticipant = await prisma.dmParticipant.findFirst({
              where: { roomId, userId: user.id, leftAt: null },
              select: { userId: true }
            })
            if (selfParticipant) {
              partnerUserId = selfParticipant.userId
            }
          }

          if (partnerUserId) {
            // ⚠️ [On-Demand 이중 가드] 기존 개설 방의 경우에도 AI Soul이 유실되어 있다면 송신 시점에 온디맨드 활성화
            let aiSoul = await prisma.aiSoul.findUnique({
              where: { userId: partnerUserId },
              select: { id: true }
            })
            
            if (!aiSoul) {
              try {
                await ensureAiSoulAndKey(partnerUserId)
                aiSoul = await prisma.aiSoul.findUnique({
                  where: { userId: partnerUserId },
                  select: { id: true }
                })
              } catch (err) {
                console.error('[AiSoul On-Demand Create Failed on Message] for UserId:', partnerUserId, err)
              }
            }

            if (aiSoul) {
              const directChatMode = isAvatarDm ? 'OWNER_AVATAR' : 'VISITOR_AVATAR'
              // 비동기 실행 (메시지 응답 속도에 영향 없음)
              import('@/shared/lib/ai/directChatService')
                .then(({ triggerDirectChat }) =>
                  triggerDirectChat(aiSoul.id, user.id, roomId, content, directChatMode)
                )
                .catch(err => console.error('[AI DirectChat] non-critical:', err))
            }
          }
        }
      }
    } catch (aiErr) {
      console.error('[AI DirectChat Lookup] non-critical:', aiErr)
    }

    // [알림 DB+Push] DM 수신 알림 (상대방에게) — 알림 실패가 메시지 전송 실패로 이어지면 안 됨
    try {
      const otherParticipants = await prisma.dmParticipant.findMany({
        where: {
          roomId,
          userId: { not: user.id },
          leftAt: null,
        },
        select: { userId: true, muteUntil: true, lastReadAt: true },
      })

      const senderData = await prisma.user.findUnique({
        where: { id: user.id },
        select: { display_name: true },
      })

      await Promise.allSettled(
        otherParticipants.map(async (p) => {
          // 뮤트 기간 내면 알림 미발송
          if (p.muteUntil && new Date(p.muteUntil) > new Date()) return

          // [UX 개선/업계 표준] 상대방이 실시간으로 방을 활성화하여 대화 중이라면 알림 전송을 생략(Mute)합니다.
          if (p.lastReadAt) {
            const timeDiff = new Date().getTime() - new Date(p.lastReadAt).getTime()
            if (timeDiff < 6000) {
              console.log(`[DM Notif Mute] 상대방이 대화방 상주 상태(실시간 핑퐁 중)이므로 알림을 생략합니다. userId=${p.userId}`)
              return
            }
          }

          try {
            await sendNotification({
              userId: p.userId,
              type: 'DM',
              title: `${senderData?.display_name || '누군가'}님의 메시지`,
              body: lastMessagePreview,
              link: `/?dm=${roomId}`,
              actorId: user.id,
              resourceId: roomId,
            })
          } catch (err) {
            console.error(`[DM Notif] Failed to send notification to user ${p.userId}:`, err)
          }
        })
      )
    } catch (notifError) {
      console.error('[DM] Notification failed (non-critical):', notifError)
    }

    try {
      const { createAdminClient } = await import('@/shared/lib/supabase/admin')
      const adminSupabase = createAdminClient()
      const broadcastChannel = adminSupabase.channel(`dm-room-${roomId}`)
      await broadcastChannel.send({
        type: 'broadcast',
        event: 'new-message',
        payload: {
          id: message.id,
          roomId: message.roomId,
          senderId: message.senderId,
          content: message.content,
          images: message.images,
          type: message.type,
          deletedAt: message.deletedAt,
          createdAt: message.createdAt.toISOString(),
          sender: message.sender,
        },
      })
      // adminSupabase.removeChannel(broadcastChannel) // [조기 소멸 차단] REST 전송 버퍼가 완전히 게이트웨이에 도달하기 전에 파이프라인이 소멸되는 것을 방지합니다.
    } catch (broadcastErr) {
      console.error('[DM] Broadcast failed (non-critical):', broadcastErr)
    }

    return NextResponse.json({ success: true, data: { message } })
  } catch (error) {
    console.error('Create DM Message Error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

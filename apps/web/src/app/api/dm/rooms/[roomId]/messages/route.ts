import { NextResponse } from 'next/server'
import { createClient } from '@/shared/lib/supabase/server'
import prisma from '@/shared/lib/prisma'
import { sendNotification } from '@/shared/services/notificationService'
import { ensureAiSoulAndKey } from '@/shared/lib/ai/activation'
import { isAiDirectChatRoom } from '@/shared/lib/dm/roomSemantics'
import { attachDmDisplayFields, normalizeDmLocale, truncateDmPreview } from '@/shared/lib/dm/messageDisplay'
import { translateDmMessageForTargets } from '@/shared/lib/ai/dmBabelService'
import {
  assertActiveAiProviderKey,
  assertNoUserBlockBetween,
  type DmGuardResult,
} from '@/shared/lib/dm/serverGuards'

function guardToResponse(result: DmGuardResult) {
  if (result.ok) return null
  return NextResponse.json(
    { error: result.error, code: result.code },
    { status: result.status },
  )
}

function isValidMessageImage(value: unknown): value is string {
  if (typeof value !== 'string') return false
  if (value.length === 0 || value.length > 4_000_000) return false
  return value.startsWith('/')
    || value.startsWith('https://')
    || (process.env.NODE_ENV === 'development' && value.startsWith('http://'))
    || /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/i.test(value)
}

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

      const viewer = await prisma.user.findUnique({
        where: { id: user.id },
        select: { language: true },
      })
      const viewerLocale = normalizeDmLocale(viewer?.language)

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
      const reversedMessages = [...messages]
        .reverse()
        .map((message) => attachDmDisplayFields(message, viewerLocale));

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
      const body = await request.json()
      const type = typeof body.type === 'string' ? body.type : 'TEXT'
      const content = typeof body.content === 'string' ? body.content.trim() : ''
      const rawImages: unknown[] = Array.isArray(body.images) ? body.images : []
      const images = rawImages.filter(isValidMessageImage)

      if (type !== 'TEXT' && type !== 'IMAGE') {
        return NextResponse.json({ error: 'Unsupported message type' }, { status: 400 })
      }

      if (type === 'TEXT' && !content) {
        return NextResponse.json({ error: 'Message content is required' }, { status: 400 })
      }

      if (type === 'IMAGE' && (images.length === 0 || images.length > 10 || images.length !== rawImages.length)) {
        return NextResponse.json({ error: 'Invalid image payload' }, { status: 400 })
      }

      const room = await prisma.dmRoom.findUnique({
        where: { id: roomId },
        select: {
          type: true,
          creatorId: true,
          maxParticipants: true,
          participants: {
            select: {
              id: true,
              userId: true,
              leftAt: true,
              user: { select: { language: true } },
            },
          },
        }
      });

    if (!room) {
      return NextResponse.json({ error: 'Room not found' }, { status: 404 })
    }

    if (room.type === 'CS' && room.creatorId !== user.id) {
      return NextResponse.json({ error: 'Forbidden. Owner cannot write messages in CS room.' }, { status: 403 })
    }

      const participant = room.participants.find((roomParticipant) => roomParticipant.userId === user.id)

      if (!participant) {
        return NextResponse.json({ error: 'Room not found or no access' }, { status: 404 })
      }

      const senderLanguage = normalizeDmLocale(participant.user.language)
      const otherParticipants = room.participants.filter((roomParticipant) => roomParticipant.userId !== user.id)
      const partnerParticipant = otherParticipants[0] || null
      const isAvatarDm = !partnerParticipant && room.maxParticipants === 1
      const isAiDirectChat = isAiDirectChatRoom(room.type, isAvatarDm)

      if (partnerParticipant) {
        const blockGuard = await assertNoUserBlockBetween(user.id, partnerParticipant.userId)
        const blockGuardResponse = guardToResponse(blockGuard)
        if (blockGuardResponse) return blockGuardResponse
      }

      if (room.type === 'DM' && !isAvatarDm) {
        const senderKeyGuard = await assertActiveAiProviderKey(user.id)
        const senderKeyGuardResponse = guardToResponse(senderKeyGuard)
        if (senderKeyGuardResponse) return senderKeyGuardResponse

        if (partnerParticipant) {
          const partnerKeyGuard = await assertActiveAiProviderKey(partnerParticipant.userId)
          const partnerKeyGuardResponse = guardToResponse(partnerKeyGuard)
          if (partnerKeyGuardResponse) return partnerKeyGuardResponse
        }
      }

      if (isAiDirectChat) {
        const ownerUserId = isAvatarDm ? user.id : partnerParticipant?.userId
        if (ownerUserId) {
          const ownerKeyGuard = await assertActiveAiProviderKey(ownerUserId)
          const ownerKeyGuardResponse = guardToResponse(ownerKeyGuard)
          if (ownerKeyGuardResponse) return ownerKeyGuardResponse
        }
      }

      const lastMessagePreview = type === 'IMAGE'
        ? `사진 ${images && images.length > 0 ? images.length : 1}장`
        : truncateDmPreview(content);

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
          translations: true,
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

      let messageForDelivery = message
      if (room.type === 'DM' && !isAvatarDm && type === 'TEXT') {
        const translations = await translateDmMessageForTargets({
          messageId: message.id,
          content,
          senderUserId: user.id,
          sourceLanguage: senderLanguage,
          targetLanguages: otherParticipants.map((roomParticipant) => roomParticipant.user.language),
        })
        messageForDelivery = { ...message, translations }
      }

      const responseMessage = attachDmDisplayFields(messageForDelivery, senderLanguage)

      // [Neural RAG] 상대가 AI Soul이고, CS 방이거나 아바타 대화방(나와 내 아바타의 대화)일 때만 비동기 대화 서비스 가동
      try {
        if (room.type !== 'GROUP') {
          // CS 방이거나 내 아바타 대화방일 때만 챗봇 트리거 작동 (CS 방의 경우 송신자가 개설자인 경우에만 작동되도록 이중 안전장치 추가)
          if (isAiDirectChat && (room.type !== 'CS' || user.id === room.creatorId)) {
            const partnerUserId = partnerParticipant?.userId || user.id
            const ownerLanguage = normalizeDmLocale(
              (isAvatarDm ? participant : partnerParticipant)?.user.language,
            )

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
                    triggerDirectChat(aiSoul.id, user.id, roomId, content, directChatMode, {
                      targetLanguage: senderLanguage,
                      ownerLanguage,
                      ownerUserId: partnerUserId,
                    })
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
            id: responseMessage.id,
            roomId: responseMessage.roomId,
            senderId: responseMessage.senderId,
            content: responseMessage.content,
            originalContent: responseMessage.originalContent,
            displayContent: responseMessage.displayContent,
            displayLanguage: responseMessage.displayLanguage,
            translationStatus: responseMessage.translationStatus,
            translations: responseMessage.translations,
            images: responseMessage.images,
            type: responseMessage.type,
            deletedAt: responseMessage.deletedAt,
            createdAt: responseMessage.createdAt.toISOString(),
            sender: responseMessage.sender,
          },
        })
      // adminSupabase.removeChannel(broadcastChannel) // [조기 소멸 차단] REST 전송 버퍼가 완전히 게이트웨이에 도달하기 전에 파이프라인이 소멸되는 것을 방지합니다.
    } catch (broadcastErr) {
      console.error('[DM] Broadcast failed (non-critical):', broadcastErr)
    }

      return NextResponse.json({ success: true, data: { message: responseMessage } })
  } catch (error) {
    console.error('Create DM Message Error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

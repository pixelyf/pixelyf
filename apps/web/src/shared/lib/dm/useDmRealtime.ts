import { useCallback, useEffect, useRef, useState } from 'react';
import { mutate } from 'swr';
import { unstable_serialize } from 'swr/infinite';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { createClient } from '@/shared/lib/supabase/browser';
import { dmService } from './dmService';
import type { DmMessageData, DmRoomData } from './types';


interface UseDmRealtimeOptions {
  roomId: string;
  currentUserId?: string;
  enabled?: boolean;
  /** AI 아바타 응답 수신 시 호출되는 콜백 (타이핑 인디케이터 해제용) */
  onAiReply?: () => void;
}

/**
 * Supabase Realtime Broadcast로 채팅 메시지 실시간 수신
 * 
 * 동작 흐름:
 * 1. 서버 API (POST /api/dm/rooms/[roomId]/messages)에서 INSERT 후 broadcast 전송
 * 2. 클라이언트는 동일 채널명(`dm-room-{roomId}`)으로 broadcast 수신
 * 3. SWR 캐시 업데이트 → UI 즉시 반영
 * 
 * broadcast는 JWT/RLS 불필요 → postgres_changes보다 안정적
 */
export function useDmRealtime({ roomId, currentUserId, enabled = true, onAiReply }: UseDmRealtimeOptions) {
  const channelRef = useRef<RealtimeChannel | null>(null);
  const retryCountRef = useRef(0);
  // onAiReply를 ref로 안정적으로 참조 (클로저 stale 방지)
  const onAiReplyRef = useRef(onAiReply);
  onAiReplyRef.current = onAiReply;

  // currentUserId를 ref로 참조 (Effect 재실행 방지)
  const currentUserIdRef = useRef(currentUserId);
  currentUserIdRef.current = currentUserId;

  // 상대방 타이핑 상태
  const [isPartnerTyping, setIsPartnerTyping] = useState(false);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingSentRef = useRef(0);

  // 채널 이름 충돌 방지 (React Strict Mode → setup/cleanup/setup 빠르게 반복)
  const channelIdRef = useRef(0);

  useEffect(() => {
    if (!enabled || !roomId) return;

    // 재시도 카운터 초기화
    retryCountRef.current = 0;

    // 채널명은 서버 broadcast 채널명과 정확히 일치해야 함
    // Strict Mode 충돌 방지를 위해 suffix 추가하되, subscribe 시 서버 채널로 연결
    const channelId = ++channelIdRef.current;
    const channelName = `dm-room-${roomId}`;

    const supabase = createClient();
    const MAX_RETRIES = 3;
    
    const channel = supabase
      .channel(channelName)
      .on(
        'broadcast',
        { event: 'typing' },
        (payload: { payload: { userId: string } }) => {
          const senderId = payload.payload?.userId;
          // 자기 자신의 타이핑 이벤트는 무시
          if (senderId === currentUserIdRef.current) return;
          setIsPartnerTyping(true);
          // 3초간 타이핑 이벤트가 없으면 자동 해제
          if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
          typingTimeoutRef.current = setTimeout(() => setIsPartnerTyping(false), 3000);
        }
      )
      .on(
        'broadcast',
        { event: 'new-message' },
        (payload: { payload: Record<string, unknown> }) => {
          console.info('[DmRealtime] 🔔 broadcast 이벤트 수신:', JSON.stringify(payload.payload).slice(0, 100));
          // broadcast payload: 서버에서 camelCase로 전송
          const msg = payload.payload as {
            id: string;
            roomId: string;
            senderId: string;
            content: string;
            images: string[] | null;
            type: string;
            deletedAt: string | null;
            createdAt: string;
            sender?: { id: string; display_name: string; avatar_image_url: string | null };
          };
          
          const transformedMessage: DmMessageData = {
            id: msg.id,
            roomId: msg.roomId,
            senderId: msg.senderId,
            content: msg.content,
            images: msg.images || [],
            type: msg.type,
            deletedAt: msg.deletedAt,
            createdAt: msg.createdAt,
            sender: msg.sender,
          };

          // 1. 메시지 목록 SWR 캐시 업데이트
          // SWR Infinite의 정확한 캐시 키를 생성하여 $inf$ 스킵 문제를 우회
          const infiniteKey = unstable_serialize(
            (pageIndex: number, previousPageData: { nextCursor?: string | null } | null) => {
              if (previousPageData && !previousPageData.nextCursor) return null;
              return `/api/dm/rooms/${roomId}/messages?limit=50${previousPageData ? `&cursor=${previousPageData.nextCursor}` : ''}`;
            }
          );
          
          mutate(
            infiniteKey,
            (oldData: unknown) => {
              if (!oldData) return oldData;
              
              if (Array.isArray(oldData)) {
                const pages = oldData as { messages?: DmMessageData[] }[];
                const firstPage = pages[0];
                if (!firstPage || !firstPage.messages) return oldData;
                
                const exists = pages.some(page => page.messages?.some((m) => m.id === transformedMessage.id));
                if (exists) return oldData;

                const newPages = [...pages];
                const firstPageMessages = firstPage.messages || [];

                // 중복 렌더링 방지 (Duplication Flash 차단): 임시 메시지(id가 'temp-'로 시작하고 senderId와 content가 동일한 메시지) 탐색
                const tempIndex = firstPageMessages.findIndex(
                  (m) => m.id.startsWith('temp-') && m.senderId === transformedMessage.senderId && m.content === transformedMessage.content
                );

                if (tempIndex !== -1) {
                  // 임시 메시지를 실제 서버 메시지로 정밀 교체
                  const updatedMessages = [...firstPageMessages];
                  updatedMessages[tempIndex] = transformedMessage;
                  newPages[0] = {
                    ...firstPage,
                    messages: updatedMessages
                  };
                } else {
                  // 일반적인 실시간 수신: 캐시 오름차순에 맞춰 맨 뒤(append)에 추가
                  newPages[0] = {
                    ...firstPage,
                    messages: [...firstPageMessages, transformedMessage]
                  };
                }
                return newPages;
              }
              
              // SWR 일반 Single 캐시 구조 ({ messages: [...] } 또는 { data: { messages: [...] } } 둘 다 안전하게 지원)
              const singleObj = oldData as { messages?: DmMessageData[]; data?: { messages?: DmMessageData[] } };
              
              if (singleObj.messages) {
                const exists = singleObj.messages.some((m) => m.id === transformedMessage.id);
                if (exists) return oldData;
                
                const singleMessages = singleObj.messages || [];
                const tempIndex = singleMessages.findIndex(
                  (m) => m.id.startsWith('temp-') && m.senderId === transformedMessage.senderId && m.content === transformedMessage.content
                );

                if (tempIndex !== -1) {
                  const updatedMessages = [...singleMessages];
                  updatedMessages[tempIndex] = transformedMessage;
                  return {
                    ...singleObj,
                    messages: updatedMessages
                  };
                } else {
                  return {
                    ...singleObj,
                    messages: [...singleMessages, transformedMessage]
                  };
                }
              } else if (singleObj.data?.messages) {
                const exists = singleObj.data.messages.some((m) => m.id === transformedMessage.id);
                if (exists) return oldData;
                
                const singleMessages = singleObj.data.messages || [];
                const tempIndex = singleMessages.findIndex(
                  (m) => m.id.startsWith('temp-') && m.senderId === transformedMessage.senderId && m.content === transformedMessage.content
                );

                const newMessages = [...singleMessages];
                if (tempIndex !== -1) {
                  newMessages[tempIndex] = transformedMessage;
                } else {
                  newMessages.push(transformedMessage);
                }

                return {
                  ...singleObj,
                  data: {
                    ...singleObj.data,
                    messages: newMessages
                  }
                };
              }
              
              return oldData;
            },
            { revalidate: false }
          );

          // 2. 채팅방 목록 SWR 캐시 업데이트 (마지막 메시지 미리보기 갱신)
          mutate(
            '/api/dm/rooms',
            (roomsCache: unknown) => {
               if (!roomsCache) return roomsCache;
               
               let roomsArray: DmRoomData[] = [];
               let wrapType: 'none' | 'data.rooms' | 'rooms' = 'none';

               const cacheObj = roomsCache as { data?: { rooms?: DmRoomData[] }, rooms?: DmRoomData[] };

               if (Array.isArray(roomsCache)) {
                 roomsArray = roomsCache as DmRoomData[];
               } else if (cacheObj?.data?.rooms) {
                 roomsArray = cacheObj.data.rooms;
                 wrapType = 'data.rooms';
               } else if (cacheObj?.rooms) {
                 roomsArray = cacheObj.rooms;
                 wrapType = 'rooms';
               } else {
                 return roomsCache;
               }

               const userId = currentUserIdRef.current;
               const updatedRooms = roomsArray.map((r) => {
                 if (r.id === roomId) {
                    return {
                      ...r,
                      lastMessage: transformedMessage,
                      updatedAt: transformedMessage.createdAt,
                      unreadCount: 0
                    }
                 }
                 return r;
               });
               
               updatedRooms.sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime());
               
               if (wrapType === 'data.rooms') {
                 return { ...cacheObj, data: { ...cacheObj.data, rooms: updatedRooms } };
               } else if (wrapType === 'rooms') {
                 return { ...cacheObj, rooms: updatedRooms };
               }
               return updatedRooms;
            },
            { revalidate: false }
          );

          // 3. AI 아바타 응답(AI_TEXT) 수신 → 타이핑 인디케이터 즉시 해제
          // 주의: "나와 내 아바타의 대화방"에서는 AI 응답의 senderId === currentUserId이므로
          // senderId 비교가 아닌 메시지 type으로 AI 응답을 감지해야 합니다.
          if (transformedMessage.type === 'AI_TEXT') {
            onAiReplyRef.current?.();
          }

          // 4. 상대방 메시지 수신 시 읽음 처리 비동기 호출
          const userId = currentUserIdRef.current;
          if (userId && transformedMessage.senderId !== userId) {
            dmService.markAsRead(roomId).catch(console.error);
          }
        }
      )
      .subscribe((status: string, err?: Error) => {
        if (status === 'SUBSCRIBED') {
          retryCountRef.current = 0;
          console.info(`[DmRealtime] ✅ 구독 성공: ${channelName}`);
        } else if (status === 'CHANNEL_ERROR') {
          retryCountRef.current++;
          if (retryCountRef.current <= MAX_RETRIES) {
            console.warn(`[DmRealtime] ❌ 채널 오류 (${retryCountRef.current}/${MAX_RETRIES}): ${err?.message || 'unknown'}`);
          } else if (retryCountRef.current === MAX_RETRIES + 1) {
            console.warn(`[DmRealtime] 🔇 Realtime 연결 실패 — 재시도 중단 (${MAX_RETRIES}회 초과)`);
            channel.unsubscribe();
            supabase.removeChannel(channel);
          }
        } else if (status === 'TIMED_OUT') {
          retryCountRef.current++;
          if (retryCountRef.current <= MAX_RETRIES) {
            console.warn(`[DmRealtime] ⏰ 구독 타임아웃 (${retryCountRef.current}/${MAX_RETRIES}): ${channelName}`);
          } else if (retryCountRef.current === MAX_RETRIES + 1) {
            console.warn(`[DmRealtime] 🔇 Realtime 타임아웃 — 재시도 중단`);
            channel.unsubscribe();
            supabase.removeChannel(channel);
          }
        }
      });

    channelRef.current = channel;

    return () => {
      // Supabase 공식 권장: unsubscribe → removeChannel 순서
      channel.unsubscribe();
      supabase.removeChannel(channel);
      channelRef.current = null;
      // 타이핑 타이머 정리
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
      setIsPartnerTyping(false);
    };
    // deps를 최소화: roomId, enabled만 변경 시 재구독
    // currentUserId, onAiReply는 ref로 참조
  }, [roomId, enabled]);

  // 타이핑 이벤트 전송 (2초 debounce)
  const sendTyping = useCallback(() => {
    const now = Date.now();
    if (now - lastTypingSentRef.current < 2000) return; // 2초 내 중복 전송 방지
    lastTypingSentRef.current = now;

    const channel = channelRef.current;
    if (!channel || !currentUserIdRef.current) return;

    channel.send({
      type: 'broadcast',
      event: 'typing',
      payload: { userId: currentUserIdRef.current },
    }).catch(() => { /* non-critical */ });
  }, []);

  return { isPartnerTyping, sendTyping };
}

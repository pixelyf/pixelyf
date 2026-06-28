'use client'

import React, { useState, useCallback, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useRouter } from '@/i18n/navigation'
import useSWRInfinite from 'swr/infinite'
import useSWR from 'swr'
import { X, Send, Loader2, MessageSquare, AlertCircle, Settings, Users } from 'lucide-react'

import { useGalaxyStore } from '@/stores/galaxyStore'
import { dmService } from '@/shared/lib/dm/dmService'
import { useDmRealtime } from '@/shared/lib/dm/useDmRealtime'
import { isAiDirectChatRoom } from '@/shared/lib/dm/roomSemantics'
import { DmMessageData } from '@/shared/lib/dm/types'
import { useUserStore } from '@/entities/user/model/useUserStore'
import { useMediaQuery } from '@/shared/hooks/useMediaQuery'
import { useMoodColor } from '@/shared/hooks/useMoodColor'
import { LogoSpinner } from '@/shared/ui/LogoSpinner'
import { GroupSettingsDrawer } from './GroupSettingsDrawer'
import { InviteMembersModal } from './InviteMembersModal'
import { MobileFullPopupWrapper } from '@/shared/ui/MobileFullPopupWrapper'

// ══════════════════════════════════════════════════════════════
// DmRoomDrawer — 1:1 DM + 그룹(별자리) 채팅 통합 컴포넌트
// Phase 1: 1:1 DM 지원
// Phase 3: 그룹 채팅 분기 (보낸 사람 표시, 헤더 변경, 설정 버튼)
// ══════════════════════════════════════════════════════════════

interface RoomDetailParticipant {
  userId: string
  role?: string
  leftAt?: string | null
  user?: {
    id: string
    display_name: string
    avatar_image_url: string | null
    current_aura?: string
    coordinates?: {
      galaxyKey: string | null
      display_name: string | null
      avatar_image_url: string | null
    }[]
  }
}

interface RoomDetailResponse {
  id: string
  type: string
  name: string | null
  avatarUrl: string | null
  participants: RoomDetailParticipant[]
  creatorId?: string | null
}

// ── 날짜 구분선용 헬퍼 함수 ──
const formatDateHeader = (dateString: string) => {
  const d = new Date(dateString)
  const weekdays = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일']
  const year = d.getFullYear()
  const month = d.getMonth() + 1
  const date = d.getDate()
  const dayOfWeek = weekdays[d.getDay()]
  return `${year}년 ${month}월 ${date}일 ${dayOfWeek}`
}

const isDifferentDay = (dateStr1: string, dateStr2: string) => {
  const d1 = new Date(dateStr1)
  const d2 = new Date(dateStr2)
  return (
    d1.getFullYear() !== d2.getFullYear() ||
    d1.getMonth() !== d2.getMonth() ||
    d1.getDate() !== d2.getDate()
  )
}

const formatMessageTime = (dateString: string) => {
  const d = new Date(dateString)
  let hours = d.getHours()
  const minutes = d.getMinutes()
  const ampm = hours < 12 ? '오전' : '오후'
  hours = hours % 12
  hours = hours ? hours : 12 // 0시 -> 12시
  const minutesStr = minutes < 10 ? `0${minutes}` : minutes
  return `${ampm} ${hours}:${minutesStr}`
}

const isDifferentMinute = (dateStr1: string, dateStr2: string) => {
  const d1 = new Date(dateStr1)
  const d2 = new Date(dateStr2)
  return (
    d1.getFullYear() !== d2.getFullYear() ||
    d1.getMonth() !== d2.getMonth() ||
    d1.getDate() !== d2.getDate() ||
    d1.getHours() !== d2.getHours() ||
    d1.getMinutes() !== d2.getMinutes()
  )
}

interface DmRoomDrawerProps {
  roomId: string
  isStandalone?: boolean
  isOverlay?: boolean
  onOpenGroupSettings?: () => void
}

export function DmRoomDrawer({
  roomId,
  isStandalone = false,
  isOverlay = false,
  onOpenGroupSettings,
}: DmRoomDrawerProps) {
  const router = useRouter()
  const isMobile = useMediaQuery('(max-width: 767px)')
  const userProfile = useUserStore(s => s.user)
  const pixelPanelWidth = useGalaxyStore(s => s.pixelPanelWidth)
  const galaxyKey = useGalaxyStore(s => s.galaxyKey)
  const setActiveDmRoomId = useGalaxyStore(s => s.setActiveDmRoomId)
  const { themeStyle } = useMoodColor(userProfile?.current_mood_id)
  
  const [inputText, setInputText] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [isAiTyping, setIsAiTyping] = useState(false)
  const [isGroupSettingsOpen, setIsGroupSettingsOpen] = useState(false)
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const aiTypingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // AI 아바타 응답 수신 시 타이핑 인디케이터 해제 콜백
  const onAiReply = useCallback(() => {
    setIsAiTyping(false)
    if (aiTypingTimerRef.current) {
      clearTimeout(aiTypingTimerRef.current)
      aiTypingTimerRef.current = null
    }
  }, [])
  
  const { isPartnerTyping, sendTyping } = useDmRealtime({
    roomId,
    currentUserId: userProfile?.id,
    currentLanguage: userProfile?.language,
    onAiReply,
  });

  const { data: roomData, isLoading: isRoomLoading, error: roomError } = useSWR<{ data: { room: RoomDetailResponse } }>(
    `/api/dm/rooms/${roomId}`,
    (url: string) => fetch(url).then(r => r.json())
  )
  const room = roomData?.data?.room
  const isGroup = room?.type === 'GROUP'
  const activeParticipants = room?.participants?.filter((participant) => !participant.leftAt) || []
  const isCsRoomOwner = room?.type === 'CS' && userProfile?.id !== room?.creatorId

  const getKey = (pageIndex: number, previousPageData: { nextCursor?: string | null } | null) => {
    if (previousPageData && !previousPageData.nextCursor) return null
    return `/api/dm/rooms/${roomId}/messages?limit=50${previousPageData ? `&cursor=${previousPageData.nextCursor}` : ''}`
  }

  const { data, size, setSize, isValidating, mutate } = useSWRInfinite(
    getKey,
    (url) => fetch(url).then(r => r.json()).then(r => r.data)
  )

  // [A-5 Fix] flex-col-reverse와 정합성 보정: 각 페이지 내부만 reverse하여 DESC(최신→오래된) 유지
  const messages = data ? data.flatMap(page => [...(page?.messages || [])].reverse()) : []
  const hasNextPage = data ? data[data.length - 1]?.nextCursor !== null && data[data.length - 1]?.nextCursor !== undefined : false

  // 1:1 DM의 상대방
  let partner = isGroup
    ? null
    : room?.participants?.find((p: RoomDetailParticipant) => p.userId !== userProfile?.id)

  // 나와 내 아바타의 대화방(DIRECT_CHAT)인 경우 partner를 나 자신으로 역매핑
  if (!isGroup && !partner && room?.participants) {
    partner = room.participants.find((p: RoomDetailParticipant) => p.userId === userProfile?.id)
  }

  // 그룹 메시지에서 보낸 사람 정보 조회 (캐시)
  const participantMap = React.useMemo(() => {
    const map = new Map<string, RoomDetailParticipant>()
    if (room?.participants) {
      for (const p of room.participants) {
        map.set(p.userId, p)
      }
    }
    return map
  }, [room])

  const handleClose = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault()
      e.stopPropagation()
    }
    if (isOverlay) {
      setActiveDmRoomId(null)
    } else if (isStandalone) {
      router.push('/')
    } else {
      window.history.back()
    }
  }

  // CS 방과 참여자 1명인 자기 아바타 방은 동일한 AI 대화 UX를 사용합니다.
  const isAiRoom = isAiDirectChatRoom(room?.type, !isGroup && activeParticipants.length === 1)

  const handleSend = async () => {
    if (!inputText.trim() || isSending || isCsRoomOwner) return
    setIsSending(true)
    const textToSend = inputText.trim()
    setInputText('')

    // 낙관적 업데이트
    const tempId = `temp-${Date.now()}`
      const optimisticMsg: DmMessageData = {
        id: tempId,
        roomId,
        senderId: userProfile?.id as string,
        content: textToSend,
        originalContent: textToSend,
        displayContent: textToSend,
        displayLanguage: userProfile?.language || 'ko',
        translationStatus: 'original',
        translations: [],
        images: [],
      type: 'TEXT',
      createdAt: new Date().toISOString(),
      deletedAt: null,
      sender: userProfile ? {
        id: userProfile.id,
        display_name: userProfile.display_name || '나',
        avatar_image_url: userProfile.avatar_url || null,
      } : undefined,
    }

    mutate((currentData: { messages?: DmMessageData[]; nextCursor?: string | null }[] | undefined) => {
      if (!currentData || !currentData[0]) return currentData;
      const newPages = [...currentData];
      newPages[0] = {
        ...newPages[0],
        messages: [...(newPages[0].messages || []), optimisticMsg]
      };
      return newPages;
    }, false);

    try {
      await dmService.sendMessage(roomId, textToSend, 'TEXT', [])
      if (isAiRoom) {
        setIsAiTyping(true)
        if (aiTypingTimerRef.current) clearTimeout(aiTypingTimerRef.current)
        aiTypingTimerRef.current = setTimeout(() => {
          setIsAiTyping(false)
          aiTypingTimerRef.current = null
        }, 15_000)
      }
      } catch (e) {
        console.error(e)
        setInputText(textToSend)
        alert(e instanceof Error ? e.message : '메시지 전송에 실패했습니다. 네트워크를 확인해주세요.')
        mutate()
      } finally {
      setIsSending(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing) return
    if (isCsRoomOwner) return
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // ── 헤더 ──
  const renderHeader = () => {
    if (isRoomLoading) {
      return (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-white/10 animate-pulse" />
          <div className="w-24 h-4 rounded bg-white/10 animate-pulse" />
        </div>
      )
    }

    if (isGroup) {
      return (
        <div className="flex items-center gap-3">
          {room?.avatarUrl ? (
            <img src={room.avatarUrl} alt={`${room.name} 프로필`} className="w-8 h-8 rounded-full object-cover" />
          ) : (
            <div className="w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center">
              <Users className="w-4 h-4 text-purple-300" />
            </div>
          )}
          <div className="flex flex-col">
            <span className="font-bold text-white text-sm leading-tight">
              {room?.name || '별자리 대화'}
            </span>
            <span className="text-[10px] text-white/40 leading-tight">
              {activeParticipants.length}명 참여 중
            </span>
          </div>
        </div>
      )
    }

    const customProfile = partner?.user?.coordinates?.find((coordinate) => coordinate.galaxyKey === galaxyKey)
      || partner?.user?.coordinates?.find((coordinate) => coordinate.galaxyKey === 'PIXELYF')
    const displayName = customProfile?.display_name || partner?.user?.display_name || '알 수 없음'
    const avatarUrl = customProfile?.avatar_image_url || partner?.user?.avatar_image_url || null

    return (
      <div className="flex items-center gap-3">
        {avatarUrl ? (
          <img src={avatarUrl} alt={`${displayName} 아바타`} className="w-8 h-8 rounded-full object-cover" />
        ) : (
          <div className="w-8 h-8 rounded-full bg-indigo-500/20 flex items-center justify-center font-bold text-indigo-300">
            {displayName?.[0] || '?'}
          </div>
        )}
        <span className="font-bold text-white">
          {displayName}
        </span>
      </div>
    )
  }

  // ── 메시지 버블 ──
  const renderMessage = (msg: DmMessageData, showTime: boolean, isUnread: boolean) => {
    const isMe = msg.senderId === userProfile?.id && msg.type !== 'AI_TEXT'
    const isAiMessage = msg.type === 'AI_TEXT'
    const messageText = msg.displayContent || msg.content

    if (msg.type === 'SYSTEM') {
      return (
        <div key={msg.id} className="flex justify-center my-2">
          <span className="text-[11px] text-white/30 bg-white/5 px-3 py-1 rounded-full">
              {messageText}
          </span>
        </div>
      )
    }

    const senderInfo = isGroup && !isMe 
      ? participantMap.get(msg.senderId) 
      : (!isGroup && !isMe ? { user: partner?.user } : null)

    let msgDisplayName = senderInfo?.user?.display_name || msg.sender?.display_name || '알 수 없음'
    let msgAvatarUrl = senderInfo?.user?.avatar_image_url || null

    if (!isMe && senderInfo?.user) {
      const customProfile = senderInfo.user.coordinates?.find((coordinate) => coordinate.galaxyKey === galaxyKey)
        || senderInfo.user.coordinates?.find((coordinate) => coordinate.galaxyKey === 'PIXELYF')
      if (customProfile) {
        msgDisplayName = customProfile.display_name || msgDisplayName
        msgAvatarUrl = customProfile.avatar_image_url || msgAvatarUrl
      }
    }

    return (
      <div key={msg.id} className={`flex max-w-[85%] ${isMe ? 'self-end' : 'self-start'}`}>
        {!isMe && (msgAvatarUrl || msgDisplayName) && (
          <div className="shrink-0 mr-2 mt-auto">
            {msgAvatarUrl ? (
              <img
                src={msgAvatarUrl}
                alt=""
                className="w-6 h-6 rounded-full object-cover"
              />
            ) : (
              <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-[10px] font-bold text-white/50">
                {msgDisplayName?.[0] || '?'}
              </div>
            )}
          </div>
        )}

        {isMe ? (
          <div className="flex items-end gap-1.5 self-end">
            <div className="flex flex-col items-end shrink-0 select-none mb-0.5 min-w-[32px]">
              {isUnread && (
                <span className="text-[10px] text-yellow-400 font-extrabold leading-none mb-1 tabular-nums">
                  1
                </span>
              )}
              {showTime && (
                <span className="text-[9px] text-white/30 leading-none tabular-nums">
                  {formatMessageTime(msg.createdAt)}
                </span>
              )}
            </div>
            <div className="p-3 bg-indigo-500 text-white rounded-2xl rounded-br-sm">
                  <p className="text-sm break-words whitespace-pre-wrap">{messageText}</p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col">
            {!isMe && (
              <div className="flex items-center gap-1 mb-0.5 ml-1">
                <span className="text-[10px] text-white/40 font-medium">
                  {msgDisplayName}
                </span>
                {isAiMessage && (
                  <span className="text-[9px] px-1 py-0.5 bg-white/10 text-white/60 rounded border border-white/20 select-none leading-tight font-semibold">
                    🤖 AI
                  </span>
                )}
              </div>
            )}
            <div className="flex items-end gap-1.5">
              <div className="p-3 bg-white/10 text-white rounded-2xl rounded-bl-sm">
                <p className="text-sm break-words whitespace-pre-wrap">{messageText}</p>
              </div>
              {showTime && (
                <span className="text-[9px] text-white/30 shrink-0 select-none mb-0.5 tabular-nums">
                  {formatMessageTime(msg.createdAt)}
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── [1] 스탠드얼론 라우팅 렌더링 분기 ──
  if (isStandalone) {
    return (
      <div style={themeStyle} className="w-full h-full flex flex-col theme-panel-bg text-theme-primary overflow-hidden">
         {/* ── 헤더 ── */}
         <div className="h-15 flex items-center px-4 border-b border-white/10 shrink-0 bg-white/2 justify-between">
           {renderHeader()}
           <div className="flex items-center gap-1">
             {isGroup && !isRoomLoading && (
               <button
                 onClick={(e) => {
                   e.stopPropagation()
                   if (onOpenGroupSettings) onOpenGroupSettings()
                   else setIsGroupSettingsOpen(true)
                 }}
                 className="p-2 text-white/50 hover:text-white transition rounded-full hover:bg-white/5"
                 aria-label="별자리 설정"
               >
                 <Settings className="w-5 h-5" />
               </button>
             )}
             <button 
               onClick={handleClose} 
               className="p-2 -mr-2 text-white/50 hover:text-white transition rounded-full hover:bg-white/5"
               aria-label="닫기"
             >
               <X className="w-5 h-5" />
             </button>
           </div>
         </div>

         {/* ── 메시지 영역 ── */}
         <div className="flex-1 overflow-y-auto p-4 flex flex-col-reverse gap-4 custom-scrollbar">
            <AnimatePresence>
              {(isAiTyping || isPartnerTyping) && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.25 }}
                  className="flex items-center gap-2 self-start pl-1"
                >
                  <LogoSpinner size={16} variant="white" />
                  <span className="text-xs text-white/40 font-medium">답변중...</span>
                </motion.div>
              )}
            </AnimatePresence>

           {roomError && (
             <div className="flex flex-col items-center justify-center h-full text-red-400 space-y-3 opacity-80 mt-10">
                <AlertCircle className="w-10 h-10" />
                <p className="text-sm font-bold">네트워크 오류</p>
                <p className="text-xs text-red-400/70">채팅방 정보를 불러오지 못했습니다.</p>
             </div>
           )}

            {!roomError && messages.length === 0 && !isValidating && !isRoomLoading && (
              <div className="flex flex-col items-center justify-center h-full text-white/70 space-y-3 mt-10">
                 <MessageSquare className="w-10 h-10 opacity-60" />
                 <p className="text-sm font-medium">
                   {isGroup ? '별자리 대화를 시작해보세요' : '새로운 대화를 시작해보세요'}
                 </p>
              </div>
            )}

            {!roomError && messages.map((msg, index) => {
              const hasPrevious = index < messages.length - 1
              const prevMsg = hasPrevious ? messages[index + 1] : null
              const showDateSep = !prevMsg || isDifferentDay(msg.createdAt, prevMsg.createdAt)
              
              const nextMsg = index > 0 ? messages[index - 1] : null
              const showTime = !nextMsg || 
                nextMsg.senderId !== msg.senderId || 
                isDifferentMinute(msg.createdAt, nextMsg.createdAt) ||
                nextMsg.type === 'SYSTEM' ||
                msg.type === 'SYSTEM'

              const partnerLastReadAtStr = data?.[0]?.partnerLastReadAt
              const isMe = msg.senderId === userProfile?.id && msg.type !== 'AI_TEXT'
              const isUnread = !isAiRoom && !isGroup && isMe && (
                !partnerLastReadAtStr || 
                new Date(msg.createdAt).getTime() > new Date(partnerLastReadAtStr).getTime()
              )

              return (
                <React.Fragment key={msg.id}>
                  {renderMessage(msg, showTime, isUnread)}
                  {showDateSep && (
                    <div className="flex items-center my-4 shrink-0 w-full">
                      <div className="flex-1 h-[1px] bg-white/15" />
                      <div className="mx-4 bg-white/5 border border-white/20 text-white text-[11px] font-semibold px-4 py-1.5 rounded-full backdrop-blur-sm shadow-sm select-none">
                        {formatDateHeader(msg.createdAt)}
                      </div>
                      <div className="flex-1 h-[1px] bg-white/15" />
                    </div>
                  )}
                </React.Fragment>
              )
            })}

            {isValidating && (
              <div className="flex justify-center py-4">
                <Loader2 className="w-5 h-5 animate-spin text-white/30" />
              </div>
            )}
            {hasNextPage && !isValidating && (
              <button
                onClick={() => setSize(size + 1)}
                className="self-center px-4 py-2 text-xs font-bold text-white/50 hover:text-white/80 transition bg-white/5 rounded-full mb-2"
              >
                이전 메시지 보기
              </button>
            )}
         </div>

          {/* ── 입력 영역 ── */}
          <div className="p-3 pb-4 border-t border-white/10 bg-white/2" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
            <div className="flex items-end gap-2 bg-white/5 border border-white/30 rounded-2xl p-2 focus-within:border-white/60 transition-colors">
              <textarea
                ref={textareaRef}
                value={inputText}
                onChange={e => {
                  setInputText(e.target.value)
                  sendTyping()
                  const el = e.target
                  el.style.height = 'auto'
                  el.style.height = `${Math.min(el.scrollHeight, 128)}px`
                }}
                onKeyDown={handleKeyDown}
                placeholder={
                  roomError 
                    ? "채팅방을 불러올 수 없습니다" 
                    : isCsRoomOwner 
                    ? "고객문의는 아바타가 자동으로 응답합니다. 직접 대화는 일반 DM을 이용해주세요." 
                    : "메시지 보내기..."
                }
                disabled={!!roomError || isRoomLoading || isCsRoomOwner}
                className="flex-1 bg-transparent text-sm text-white placeholder-white/60 resize-none max-h-32 min-h-9 px-2 py-1.5 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                rows={1}
              />
              <button
                onClick={() => {
                  handleSend()
                  if (textareaRef.current) {
                    textareaRef.current.style.height = 'auto'
                  }
                }}
                disabled={!inputText.trim() || isSending || !!roomError || isRoomLoading || isCsRoomOwner}
                className="p-2 rounded-full bg-white text-black hover:bg-white/90 transition disabled:cursor-not-allowed shrink-0 shadow-sm opacity-100"
              >
                {isSending ? <Loader2 className="w-4 h-4 animate-spin text-black" /> : <Send className="w-4 h-4 text-black" />}
              </button>
            </div>
          </div>

          <GroupSettingsDrawer
            roomId={roomId}
            isOpen={isGroupSettingsOpen}
            onClose={() => setIsGroupSettingsOpen(false)}
            onInvite={() => {
              setIsInviteModalOpen(true)
            }}
          />

          <InviteMembersModal
            isOpen={isInviteModalOpen}
            onClose={() => setIsInviteModalOpen(false)}
            roomId={roomId}
            currentParticipants={activeParticipants}
            onSuccess={() => {
              mutate()
            }}
          />
      </div>
    )
  }

  // ── [2] 오버레이/팝업 렌더링 분기 (공통 래퍼 적용) ──
  return (
    <div style={themeStyle} className="contents">
      <MobileFullPopupWrapper
        isOpen={true}
        onClose={handleClose}
        transitionType="slide-in"
        desktopWidth={pixelPanelWidth}
        desktopClassName="relative pointer-events-auto h-full theme-panel-bg flex flex-col z-10 border-l border-white/10 shadow-2xl"
      >
         {/* ── 헤더 ── */}
         <div className="h-15 flex items-center px-4 border-b border-white/10 shrink-0 bg-white/2 justify-between">
           {renderHeader()}
           <div className="flex items-center gap-1">
             {isGroup && !isRoomLoading && (
               <button
                 onClick={(e) => {
                   e.stopPropagation()
                   if (onOpenGroupSettings) onOpenGroupSettings()
                   else setIsGroupSettingsOpen(true)
                 }}
                 className="p-2 text-white/50 hover:text-white transition rounded-full hover:bg-white/5"
                 aria-label="별자리 설정"
               >
                 <Settings className="w-5 h-5" />
               </button>
             )}
             <button 
               onClick={handleClose} 
               className="p-2 -mr-2 text-white/50 hover:text-white transition rounded-full hover:bg-white/5"
               aria-label="닫기"
             >
               <X className="w-5 h-5" />
             </button>
           </div>
         </div>

         {/* ── 메시지 영역 ── */}
         <div className="flex-1 overflow-y-auto p-4 flex flex-col-reverse gap-4 custom-scrollbar">
            <AnimatePresence>
              {(isAiTyping || isPartnerTyping) && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.25 }}
                  className="flex items-center gap-2 self-start pl-1"
                >
                  <LogoSpinner size={16} variant="white" />
                  <span className="text-xs text-white/40 font-medium">답변중...</span>
                </motion.div>
              )}
            </AnimatePresence>

           {roomError && (
             <div className="flex flex-col items-center justify-center h-full text-red-400 space-y-3 opacity-80 mt-10">
                <AlertCircle className="w-10 h-10" />
                <p className="text-sm font-bold">네트워크 오류</p>
                <p className="text-xs text-red-400/70">채팅방 정보를 불러오지 못했습니다.</p>
             </div>
           )}

            {!roomError && messages.length === 0 && !isValidating && !isRoomLoading && (
              <div className="flex flex-col items-center justify-center h-full text-white/70 space-y-3 mt-10">
                 <MessageSquare className="w-10 h-10 opacity-60" />
                 <p className="text-sm font-medium">
                   {isGroup ? '별자리 대화를 시작해보세요' : '새로운 대화를 시작해보세요'}
                 </p>
              </div>
            )}

            {!roomError && messages.map((msg, index) => {
              const hasPrevious = index < messages.length - 1
              const prevMsg = hasPrevious ? messages[index + 1] : null
              const showDateSep = !prevMsg || isDifferentDay(msg.createdAt, prevMsg.createdAt)
              
              const nextMsg = index > 0 ? messages[index - 1] : null
              const showTime = !nextMsg || 
                nextMsg.senderId !== msg.senderId || 
                isDifferentMinute(msg.createdAt, nextMsg.createdAt) ||
                nextMsg.type === 'SYSTEM' ||
                msg.type === 'SYSTEM'

              const partnerLastReadAtStr = data?.[0]?.partnerLastReadAt
              const isMe = msg.senderId === userProfile?.id && msg.type !== 'AI_TEXT'
              const isUnread = !isAiRoom && !isGroup && isMe && (
                !partnerLastReadAtStr || 
                new Date(msg.createdAt).getTime() > new Date(partnerLastReadAtStr).getTime()
              )

              return (
                <React.Fragment key={msg.id}>
                  {renderMessage(msg, showTime, isUnread)}
                  {showDateSep && (
                    <div className="flex items-center my-4 shrink-0 w-full">
                      <div className="flex-1 h-[1px] bg-white/15" />
                      <div className="mx-4 bg-white/5 border border-white/20 text-white text-[11px] font-semibold px-4 py-1.5 rounded-full backdrop-blur-sm shadow-sm select-none">
                        {formatDateHeader(msg.createdAt)}
                      </div>
                      <div className="flex-1 h-[1px] bg-white/15" />
                    </div>
                  )}
                </React.Fragment>
              )
            })}

            {isValidating && (
              <div className="flex justify-center py-4">
                <Loader2 className="w-5 h-5 animate-spin text-white/30" />
              </div>
            )}
            {hasNextPage && !isValidating && (
              <button
                onClick={() => setSize(size + 1)}
                className="self-center px-4 py-2 text-xs font-bold text-white/50 hover:text-white/80 transition bg-white/5 rounded-full mb-2"
              >
                이전 메시지 보기
              </button>
            )}
         </div>

         {/* ── 입력 영역 ── */}
         <div className="p-3 pb-4 border-t border-white/10 bg-white/2" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
           <div className="flex items-end gap-2 bg-white/5 border border-white/30 rounded-2xl p-2 focus-within:border-white/60 transition-colors">
             <textarea
               ref={textareaRef}
               value={inputText}
               onChange={e => {
                 setInputText(e.target.value)
                 sendTyping()
                 const el = e.target
                 el.style.height = 'auto'
                 el.style.height = `${Math.min(el.scrollHeight, 128)}px`
               }}
               onKeyDown={handleKeyDown}
               placeholder={
                 roomError 
                   ? "채팅방을 불러올 수 없습니다" 
                   : isCsRoomOwner 
                   ? "고객문의는 아바타가 자동으로 응답합니다. 직접 대화는 일반 DM을 이용해주세요." 
                   : "메시지 보내기..."
               }
               disabled={!!roomError || isRoomLoading || isCsRoomOwner}
               className="flex-1 bg-transparent text-sm text-white placeholder-white/60 resize-none max-h-32 min-h-9 px-2 py-1.5 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
               rows={1}
             />
             <button
               onClick={() => {
                 handleSend()
                 if (textareaRef.current) {
                   textareaRef.current.style.height = 'auto'
                 }
               }}
               disabled={!inputText.trim() || isSending || !!roomError || isRoomLoading || isCsRoomOwner}
               className="p-2 rounded-full bg-white text-black hover:bg-white/90 transition disabled:cursor-not-allowed shrink-0 shadow-sm opacity-100"
             >
               {isSending ? <Loader2 className="w-4 h-4 animate-spin text-black" /> : <Send className="w-4 h-4 text-black" />}
             </button>
           </div>
         </div>

         <GroupSettingsDrawer
           roomId={roomId}
           isOpen={isGroupSettingsOpen}
           onClose={() => setIsGroupSettingsOpen(false)}
           onInvite={() => {
             setIsInviteModalOpen(true)
           }}
         />

         <InviteMembersModal
           isOpen={isInviteModalOpen}
           onClose={() => setIsInviteModalOpen(false)}
           roomId={roomId}
           currentParticipants={activeParticipants}
           onSuccess={() => {
             mutate()
           }}
         />
      </MobileFullPopupWrapper>
    </div>
  )
}

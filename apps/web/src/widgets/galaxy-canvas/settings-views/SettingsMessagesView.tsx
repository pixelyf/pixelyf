'use client'

import React, { useMemo } from 'react'
import useSWR from 'swr'
import { MessageCircle, Users, Loader2, Inbox } from 'lucide-react'
import { useGalaxyStore } from '@/stores/galaxyStore'
import { useUserStore } from '@/entities/user/model/useUserStore'
import { LogoSpinner } from '@/shared/ui/LogoSpinner'

// ══════════════════════════════════════════════════════════════
// SettingsMessagesView — 인스타그램 DM Inbox 참고 대화 목록 뷰
// GET /api/dm/rooms 의 응답을 소비하여 전체 대화 목록을 렌더링합니다.
// ══════════════════════════════════════════════════════════════

interface RoomPartner {
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

interface RoomItem {
  id: string
  type: 'DM' | 'GROUP' | 'CS'
  partner: RoomPartner | null
  name: string | null
  avatarUrl: string | null
  participantCount: number
    lastMessage: {
      id: string
      content: string
      displayContent?: string
      createdAt: string
      type: string
    } | null
  unreadCount: number
  updatedAt: string | null
}

// ── 카카오톡 스타일 대화 목록 시간 포맷 ──
function formatChatListTime(dateStr: string | null): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  const now = new Date()
  
  const dDate = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const nowDate = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  
  const diffTime = nowDate.getTime() - dDate.getTime()
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))
  
  if (diffDays <= 0) {
    // 오늘: 오전/오후 H:MM
    let hours = d.getHours()
    const minutes = d.getMinutes()
    const ampm = hours < 12 ? '오전' : '오후'
    hours = hours % 12
    hours = hours ? hours : 12
    const minutesStr = minutes < 10 ? `0${minutes}` : minutes
    return `${ampm} ${hours}:${minutesStr}`
  } else if (diffDays === 1) {
    // 어제
    return '어제'
  } else if (d.getFullYear() === now.getFullYear()) {
    // 올해: M월 D일
    return `${d.getMonth() + 1}월 ${d.getDate()}일`
  } else {
    // 올해 이전: YYYY.M.D
    return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`
  }
}

const fetcher = (url: string) => fetch(url).then(r => r.json())

export function SettingsMessagesView() {
  const { data, isLoading, error } = useSWR<{ success: boolean; data: { rooms: RoomItem[] } }>(
    '/api/dm/rooms',
    fetcher,
    { revalidateOnFocus: true }
  )
  const rooms = data?.data?.rooms || []
  const userProfile = useUserStore(s => s.user)
  const galaxyKey = useGalaxyStore(s => s.galaxyKey)
  const setActiveDmRoomId = useGalaxyStore(s => s.setActiveDmRoomId)
  const setIsSettingsOpen = useGalaxyStore(s => s.setIsSettingsOpen)

  // 읽지 않은 메시지가 있는 방을 상단에 정렬
  const sortedRooms = useMemo(() => {
    return [...rooms].sort((a, b) => {
      // 읽지 않은 메시지가 있는 방 우선
      if (a.unreadCount > 0 && b.unreadCount === 0) return -1
      if (a.unreadCount === 0 && b.unreadCount > 0) return 1
      // 최신 메시지 순
      const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0
      const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0
      return bTime - aTime
    })
  }, [rooms])

  const handleRoomClick = (roomId: string) => {
    // 설정 모달을 닫고 DM 오버레이를 연다
    setIsSettingsOpen(false)
    // requestAnimationFrame으로 설정 모달 닫힘 후 DM 오버레이가 자연스럽게 열리도록
    requestAnimationFrame(() => {
      setActiveDmRoomId(roomId)
    })
  }

  // 은하 멀티 프로필 오버라이드로 표시명/아바타 결정
  // 현재은하/기본은하 우선
  const resolveDisplay = (partner: RoomPartner | null, isSelfChat: boolean) => {
    if (!partner) return { name: '알 수 없음', avatar: null }
    const customProfile = partner.coordinates?.find(c => c.galaxyKey === galaxyKey)
      || partner.coordinates?.find(c => c.galaxyKey === 'PIXELYF')
    return {
      name: customProfile?.display_name || partner.display_name || '알 수 없음',
      avatar: customProfile?.avatar_image_url || partner.avatar_image_url || null,
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <LogoSpinner size={48} variant="white" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-white/40 gap-3">
        <MessageCircle className="w-10 h-10 opacity-40" />
        <p className="text-sm">대화 목록을 불러오지 못했습니다.</p>
        <p className="text-xs text-white/20">네트워크를 확인해주세요.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* ── 헤더 ── */}
      <div className="flex items-center gap-2">
        <MessageCircle className="w-5 h-5 text-[rgb(var(--theme-rgb))]" />
        <h3 className="text-[16px] font-bold text-white">메시지</h3>
        {rooms.length > 0 && (
          <span className="ml-auto text-[12px] text-white/85">{rooms.length}개의 대화</span>
        )}
      </div>
      <p className="text-sm text-white/90 leading-relaxed">
        다른 픽셀과의 대화 목록입니다. 대화를 선택하면 채팅으로 이동합니다.
      </p>

      {/* ── 빈 상태 ── */}
      {sortedRooms.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center">
            <Inbox className="w-8 h-8 text-white/15" />
          </div>
          <p className="text-sm font-medium text-white/40">아직 대화가 없습니다</p>
          <p className="text-xs text-white/20 text-center leading-relaxed max-w-xs">
            은하에서 다른 픽셀을 탐색하고<br />메시지를 보내보세요
          </p>
        </div>
      )}

      {/* ── 대화 목록 ── */}
      {sortedRooms.length > 0 && (
        <div className="space-y-1 -mx-2">
          {sortedRooms.map((room) => {
            const isGroup = room.type === 'GROUP'
            const isSelfChat = !isGroup && room.partner?.id === userProfile?.id
            const { name: displayName, avatar: avatarUrl } = isGroup
              ? { name: room.name || '별자리 대화', avatar: room.avatarUrl }
              : resolveDisplay(room.partner, isSelfChat)

            // 마지막 메시지 미리보기
              let preview = ''
              if (room.lastMessage) {
                const previewContent = room.lastMessage.displayContent || room.lastMessage.content
                if (room.lastMessage.type === 'SYSTEM') {
                  preview = `📢 ${previewContent}`
                } else if (room.lastMessage.type === 'AI_TEXT') {
                  preview = `🤖 ${previewContent}`
                } else {
                  preview = previewContent
                }
              if (preview.length > 40) preview = preview.slice(0, 40) + '…'
            }

            return (
              <button
                key={room.id}
                onClick={() => handleRoomClick(room.id)}
                className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left transition-all hover:bg-white/5 active:bg-white/10 active:scale-[0.99] group"
              >
                {/* 아바타 */}
                <div className="relative shrink-0">
                  {avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={avatarUrl}
                      alt={`${displayName} 아바타`}
                      className="w-12 h-12 rounded-full object-cover ring-1 ring-white/10"
                    />
                  ) : (
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center text-sm font-bold ring-1 ring-white/10 ${isGroup ? 'bg-purple-500/20 text-purple-300' : 'bg-indigo-500/20 text-indigo-300'}`}>
                      {isGroup ? <Users className="w-5 h-5" /> : (displayName?.[0] || '?')}
                    </div>
                  )}
                  {/* 그룹 뱃지 */}
                  {isGroup && avatarUrl && (
                    <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-purple-500/80 flex items-center justify-center ring-2 ring-black">
                      <Users className="w-3 h-3 text-white" />
                    </div>
                  )}
                </div>

                {/* 콘텐츠 */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-bold truncate ${room.unreadCount > 0 ? 'text-white' : 'text-white/90'}`}>
                      {isSelfChat ? `${displayName} (나의 아바타)` : displayName}
                    </span>
                    {room.type === 'CS' && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 border border-amber-500/30 text-amber-300 font-bold select-none shrink-0">
                        고객문의
                      </span>
                    )}
                    {isGroup && (
                      <span className="text-[12px] text-white/85 shrink-0">
                        {room.participantCount}명
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <p className={`text-[12px] truncate flex-1 ${room.unreadCount > 0 ? 'text-white font-bold' : 'text-white/85'}`}>
                      {preview || '새로운 대화를 시작해보세요'}
                    </p>
                    {room.lastMessage?.createdAt && (
                      <span className="text-[12px] text-white/85 tabular-nums shrink-0">
                        {formatChatListTime(room.lastMessage.createdAt)}
                      </span>
                    )}
                  </div>
                </div>

                {/* 읽지 않은 메시지 뱃지 */}
                {room.unreadCount > 0 && (
                  <div className="shrink-0">
                    <span className="min-w-[20px] h-5 px-1.5 flex items-center justify-center bg-red-500 text-white text-[10px] font-bold rounded-full">
                      {room.unreadCount > 99 ? '99+' : room.unreadCount}
                    </span>
                  </div>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

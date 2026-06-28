'use client'

import React, { useState, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Search, Check, Users, Loader2, ArrowRight } from 'lucide-react'
import useSWR from 'swr'

import { dmService } from '@/shared/lib/dm/dmService'
import { useGalaxyStore } from '@/stores/galaxyStore'
import { useUserStore } from '@/entities/user/model/useUserStore'
import { useMoodColor } from '@/shared/hooks/useMoodColor'
import { FullScreenModal } from '@/shared/ui/FullScreenModal'
import { ModalButton } from '@/shared/ui/ModalButton'

// ══════════════════════════════════════════════════════════════
// CreateGroupModal — 그룹(별자리) 채팅 생성 플로우
// Step 1: 유저 검색/다중 선택
// Step 2: 별자리 이름 설정 → 생성 완료
// ══════════════════════════════════════════════════════════════

interface UserSearchResult {
  id: string
  display_name: string
  avatar_image_url: string | null
  pixel_id: string
}

interface CreateGroupModalProps {
  isOpen: boolean
  onClose: () => void
}

export function CreateGroupModal({ isOpen, onClose }: CreateGroupModalProps) {
  const userProfile = useUserStore(s => s.user)
  const setActiveDmRoomId = useGalaxyStore(s => s.setActiveDmRoomId)
  const { themeStyle } = useMoodColor(userProfile?.current_mood_id)

  const [activeTab, setActiveTab] = useState<'LIST' | 'CREATE'>('LIST')
  const [step, setStep] = useState<1 | 2>(1)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedUsers, setSelectedUsers] = useState<UserSearchResult[]>([])
  const [groupName, setGroupName] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 방 목록 API
  const { data: roomsData, isLoading: isRoomsLoading } = useSWR(
    isOpen && activeTab === 'LIST' ? '/api/dm/rooms' : null,
    (url: string) => fetch(url).then(r => r.json())
  )
  const rooms = useMemo(() => {
    const rawRooms = roomsData?.data?.rooms || []
    return rawRooms.filter((r: any) => r.type === 'GROUP')
  }, [roomsData])

  // 유저 검색 API
  const { data: searchResults, isLoading: isSearching } = useSWR<{ data: { users: UserSearchResult[] } }>(
    searchQuery.trim().length >= 2
      ? `/api/users/search?q=${encodeURIComponent(searchQuery.trim())}`
      : null,
    (url: string) => fetch(url).then(r => r.json()),
    { dedupingInterval: 300 }
  )

  const filteredResults = useMemo(() => {
    const users = searchResults?.data?.users || []
    // 자기 자신과 이미 선택된 유저 제외
    return users.filter(
      u => u.id !== userProfile?.id && !selectedUsers.some(s => s.id === u.id)
    )
  }, [searchResults, userProfile?.id, selectedUsers])

  const toggleUser = useCallback((user: UserSearchResult) => {
    setSelectedUsers(prev => {
      const exists = prev.some(u => u.id === user.id)
      if (exists) return prev.filter(u => u.id !== user.id)

      // 최대 9명 (본인 포함 10명)
      if (prev.length >= 9) return prev
      return [...prev, user]
    })
  }, [])

  const removeUser = useCallback((userId: string) => {
    setSelectedUsers(prev => prev.filter(u => u.id !== userId))
  }, [])

  const handleNext = () => {
    if (selectedUsers.length < 2) {
      setError('최소 2명을 선택해주세요 (본인 포함 3명)')
      return
    }
    setError(null)
    setStep(2)
  }

  const handleCreate = async () => {
    if (isCreating) return
    setIsCreating(true)
    setError(null)

    try {
      const result = await dmService.createGroupRoom({
        type: 'GROUP',
        targetUserIds: selectedUsers.map(u => u.id),
        name: groupName.trim() || undefined,
      })

      // 생성 완료 → 채팅방 열기
      setActiveDmRoomId(result.id)
      handleReset()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : '별자리 생성에 실패했습니다')
    } finally {
      setIsCreating(false)
    }
  }

  const handleReset = () => {
    setActiveTab('LIST')
    setStep(1)
    setSearchQuery('')
    setSelectedUsers([])
    setGroupName('')
    setError(null)
    setIsCreating(false)
  }

  const handleClose = () => {
    handleReset()
    onClose()
  }

  const defaultGroupName = useMemo(() => {
    const names = selectedUsers.map(u => u.display_name)
    if (names.length <= 3) return names.join(', ')
    return `${names.slice(0, 2).join(', ')} 외 ${names.length - 2}명`
  }, [selectedUsers])

  if (!isOpen) return null

  const footer = activeTab === 'LIST' ? null : (step === 1 ? (
    <div className="w-full space-y-2">
      {error && <p className="text-xs text-red-400">{error}</p>}
      <ModalButton
        onClick={handleNext}
        disabled={selectedUsers.length < 2}
        fullWidth
        rightIcon={<ArrowRight className="w-4 h-4" />}
      >
        다음
      </ModalButton>
    </div>
  ) : (
    <div className="w-full space-y-2">
      {error && <p className="text-xs text-red-400">{error}</p>}
      <div className="flex gap-2">
        <ModalButton
          variant="glass"
          onClick={() => { setStep(1); setError(null) }}
          className="flex-1"
        >
          이전
        </ModalButton>
        <ModalButton
          onClick={handleCreate}
          isLoading={isCreating}
          disabled={isCreating}
          className="flex-[2]"
          leftIcon={<Users className="w-4 h-4" />}
        >
          별자리 만들기
        </ModalButton>
      </div>
    </div>
  ))

  return (
    <div style={themeStyle} className="contents">
      <FullScreenModal style={themeStyle} isOpen={isOpen} onClose={handleClose} title="그룹 대화하기" bgColor="theme-panel-bg" footer={footer}>
        <div className="flex flex-col h-[60vh] sm:h-[500px]">
          {/* 상단 탭 */}
          <div className="flex border-b border-white/10 shrink-0">
            <button
              onClick={() => setActiveTab('LIST')}
              className={`flex-1 py-3 text-sm font-bold transition border-b-2 ${
                activeTab === 'LIST' ? 'text-white border-[rgb(var(--theme-rgb))]' : 'text-white/40 border-transparent hover:text-white/70'
              }`}
            >
              대화 목록
            </button>
            <button
              onClick={() => setActiveTab('CREATE')}
              className={`flex-1 py-3 text-sm font-bold transition border-b-2 ${
                activeTab === 'CREATE' ? 'text-white border-[rgb(var(--theme-rgb))]' : 'text-white/40 border-transparent hover:text-white/70'
              }`}
            >
              새로 만들기
            </button>
          </div>

          {/* 탭 내용: 목록 */}
          {activeTab === 'LIST' && (
            <div className="flex-1 overflow-y-auto px-4 py-2 custom-scrollbar">
              {isRoomsLoading && (
                <div className="flex justify-center py-10">
                  <Loader2 className="w-5 h-5 animate-spin text-white/30" />
                </div>
              )}
              {!isRoomsLoading && rooms.length === 0 && (
                <p className="text-center text-sm text-white/30 py-10">
                  참여 중인 대화가 없습니다.
                </p>
              )}
              {!isRoomsLoading && rooms.map((room: any) => {
                const isGroup = room.type === 'GROUP'
                const partner = room.partner
                const name = isGroup ? (room.name || '별자리 대화') : (partner?.display_name || '알 수 없음')
                
                return (
                  <button
                    key={room.id}
                    onClick={() => {
                      setActiveDmRoomId(room.id)
                      handleClose()
                    }}
                    className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-white/5 transition border-b border-white/5 last:border-0"
                  >
                    {isGroup ? (
                      room.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={room.avatarUrl} alt="" className="w-10 h-10 rounded-full object-cover shrink-0" />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center shrink-0">
                          <Users className="w-5 h-5 text-purple-300" />
                        </div>
                      )
                    ) : (
                      partner?.avatar_image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={partner.avatar_image_url} alt="" className="w-10 h-10 rounded-full object-cover shrink-0" />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-indigo-500/20 flex items-center justify-center font-bold text-indigo-300 text-sm shrink-0">
                          {name[0]}
                        </div>
                      )
                    )}
                    <div className="flex-1 text-left min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold text-white truncate">{name}</p>
                        {isGroup && (
                          <span className="text-[10px] text-white/40 bg-white/10 px-1.5 py-0.5 rounded-full shrink-0">
                            {room.participantCount}
                          </span>
                        )}
                      </div>
                      {room.lastMessage && (
                        <p className="text-[11px] text-white/50 truncate mt-0.5">
                            {room.lastMessage.type === 'IMAGE' ? '(사진)' : (room.lastMessage.displayContent || room.lastMessage.content)}
                        </p>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          )}

          {/* 탭 내용: 생성 */}
          {activeTab === 'CREATE' && step === 1 && (
            <>
              {/* 안내 문구 */}
              <div className="px-5 pt-4">
                <p className="text-[13px] text-white/60 leading-relaxed break-keep">
                  새로운 그룹 대화를 만들기 위해 함께할 픽셀리어를 <strong className="text-white/90 font-medium">최소 2명 이상</strong> 초대해 주세요. <br />
                  <span className="text-[11px] text-white/40 mt-1 block">{"* 1:1 대화는 패널 하단의 '대화하기' 버튼을 이용해 주세요."}</span>
                </p>
              </div>
              {/* 선택된 유저 칩 */}
              {selectedUsers.length > 0 && (
                <div className="flex flex-wrap gap-1.5 px-5 pt-3">
                  {selectedUsers.map(u => (
                    <button
                      key={u.id}
                      onClick={() => removeUser(u.id)}
                      className="theme-btn-glass !px-2.5 !py-1 text-white text-xs font-medium group"
                    >
                      <span>{u.display_name}</span>
                      <X className="w-3 h-3 opacity-60 group-hover:opacity-100" />
                    </button>
                  ))}
                  <span className="text-[10px] text-white/30 self-center ml-1">
                    {selectedUsers.length}명 선택
                  </span>
                </div>
              )}

              {/* 검색 */}
              <div className="px-5 py-3">
                <div className="flex items-center gap-2 bg-black/20 border border-white/10 rounded-xl px-3 py-2 theme-ring-focus transition focus-within:border-white/40">
                  <Search className="w-4 h-4 text-white/30 shrink-0" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="닉네임 또는 ID로 검색..."
                    className="flex-1 bg-transparent text-sm text-white placeholder-white/30 focus:outline-none"
                    autoFocus
                  />
                </div>
              </div>

              {/* 검색 결과 */}
              <div className="flex-1 overflow-y-auto px-3 min-h-0 custom-scrollbar">
                {isSearching && (
                  <div className="flex justify-center py-8">
                    <Loader2 className="w-5 h-5 animate-spin text-white/30" />
                  </div>
                )}

                {!isSearching && searchQuery.trim().length >= 2 && filteredResults.length === 0 && (
                  <p className="text-center text-sm text-white/30 py-8">
                    검색 결과가 없습니다
                  </p>
                )}

                {!isSearching && searchQuery.trim().length < 2 && selectedUsers.length === 0 && (
                  <p className="text-center text-sm text-white/30 py-8">
                    2글자 이상 입력하여 검색하세요
                  </p>
                )}

                {filteredResults.map(user => (
                  <button
                    key={user.id}
                    onClick={() => toggleUser(user)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/5 transition"
                  >
                    {user.avatar_image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={user.avatar_image_url} alt="" className="w-9 h-9 rounded-full object-cover" />
                    ) : (
                      <div className="w-9 h-9 rounded-full bg-indigo-500/20 flex items-center justify-center font-bold text-indigo-300 text-sm">
                        {user.display_name[0]}
                      </div>
                    )}
                    <div className="flex-1 text-left">
                      <p className="text-sm font-medium text-white">{user.display_name}</p>
                      <p className="text-[11px] text-white/30">@{user.pixel_id}</p>
                    </div>
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition ${
                      selectedUsers.some(s => s.id === user.id)
                        ? 'bg-[rgb(var(--theme-rgb))] border-[rgb(var(--theme-rgb))]'
                        : 'border-white/20'
                    }`}>
                      {selectedUsers.some(s => s.id === user.id) && (
                        <Check className="w-3 h-3 text-white" />
                      )}
                    </div>
                  </button>
                ))}
              </div>

            </>
          )}

          {/* Step 2: 별자리 이름 설정 */}
          {step === 2 && (
            <>
              <div className="flex-1 px-5 py-6 space-y-6">
                {/* 이름 입력 */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-white/50 uppercase tracking-wider">
                    별자리 이름 (선택)
                  </label>
                  <input
                    type="text"
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                    placeholder={defaultGroupName}
                    maxLength={50}
                    className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/30 theme-ring-focus transition"
                    autoFocus
                  />
                  <p className="text-[10px] text-white/30">
                    비워두면 &quot;{defaultGroupName}&quot;(으)로 설정됩니다
                  </p>
                </div>

                {/* 참여자 미리보기 */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-white/50 uppercase tracking-wider">
                    참여자 ({selectedUsers.length + 1}명)
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {/* 본인 */}
                    <div className="flex items-center gap-1.5 px-2.5 py-1 bg-[rgba(var(--theme-rgb),0.1)] rounded-full">
                      <span className="text-xs text-[rgb(var(--theme-rgb))] font-medium">나 (지킴이)</span>
                    </div>
                    {selectedUsers.map(u => (
                      <div key={u.id} className="flex items-center gap-1.5 px-2.5 py-1 bg-white/5 rounded-full">
                        <span className="text-xs text-white/70">{u.display_name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

            </>
          )}
        </div>
      </FullScreenModal>
    </div>
  )
}

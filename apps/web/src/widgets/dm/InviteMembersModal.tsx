'use client'

import React, { useState, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Search, Check, Users, Loader2 } from 'lucide-react'
import useSWR from 'swr'

import { dmService } from '@/shared/lib/dm/dmService'
import { useUserStore } from '@/entities/user/model/useUserStore'
import { useMoodColor } from '@/shared/hooks/useMoodColor'
import { FullScreenModal } from '@/shared/ui/FullScreenModal'
import { ModalButton } from '@/shared/ui/ModalButton'

interface UserSearchResult {
  id: string
  display_name: string
  avatar_image_url: string | null
  pixel_id: string
}

interface RoomDetailParticipant {
  userId: string
  role?: string
  user?: {
    id: string
    display_name: string
    avatar_image_url: string | null
  }
}

interface InviteMembersModalProps {
  isOpen: boolean
  onClose: () => void
  roomId: string
  currentParticipants: RoomDetailParticipant[]
  onSuccess?: () => void
}

export function InviteMembersModal({
  isOpen,
  onClose,
  roomId,
  currentParticipants,
  onSuccess,
}: InviteMembersModalProps) {
  const userProfile = useUserStore(s => s.user)
  const { themeStyle } = useMoodColor(userProfile?.current_mood_id)

  const [searchQuery, setSearchQuery] = useState('')
  const [selectedUsers, setSelectedUsers] = useState<UserSearchResult[]>([])
  const [isInviting, setIsInviting] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
    // 나 자신, 이미 선택된 유저, 그리고 이미 룸에 있는 멤버 제외
    return users.filter(
      u =>
        u.id !== userProfile?.id &&
        !selectedUsers.some(s => s.id === u.id) &&
        !currentParticipants.some(p => p.userId === u.id)
    )
  }, [searchResults, userProfile?.id, selectedUsers, currentParticipants])

  const toggleUser = useCallback((user: UserSearchResult) => {
    setSelectedUsers(prev => {
      const exists = prev.some(u => u.id === user.id)
      if (exists) return prev.filter(u => u.id !== user.id)

      // 본인 포함 최대 10명 (이미 참여 중인 인원 + 선택한 인원 >= 10)
      if (currentParticipants.length + prev.length >= 10) {
        setError(`별자리 대화는 최대 10명까지 참여할 수 있습니다 (현재 ${currentParticipants.length}명)`)
        return prev
      }
      setError(null)
      return [...prev, user]
    })
  }, [currentParticipants])

  const removeUser = useCallback((userId: string) => {
    setSelectedUsers(prev => prev.filter(u => u.id !== userId))
    setError(null)
  }, [])

  const handleInvite = async () => {
    if (selectedUsers.length === 0 || isInviting) return
    setIsInviting(true)
    setError(null)

    try {
      await dmService.inviteMembers(roomId, {
        userIds: selectedUsers.map(u => u.id),
      })
      if (onSuccess) onSuccess()
      handleReset()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : '초대에 실패했습니다')
    } finally {
      setIsInviting(false)
    }
  }

  const handleReset = () => {
    setSearchQuery('')
    setSelectedUsers([])
    setError(null)
    setIsInviting(false)
  }

  const handleClose = () => {
    handleReset()
    onClose()
  }

  if (!isOpen) return null

  const footer = (
    <div className="w-full space-y-2">
      {error && <p className="text-xs text-red-400">{error}</p>}
      <ModalButton
        onClick={handleInvite}
        disabled={selectedUsers.length === 0 || isInviting}
        isLoading={isInviting}
        fullWidth
        leftIcon={<Users className="w-4 h-4" />}
      >
        초대하기 ({selectedUsers.length}명)
      </ModalButton>
    </div>
  )

  return (
    <div style={themeStyle} className="contents">
      <FullScreenModal
        style={themeStyle}
        isOpen={isOpen}
        onClose={handleClose}
        title="멤버 초대"
        bgColor="theme-panel-bg"
        footer={footer}
      >
        <div className="flex flex-col h-[60vh] sm:h-[500px]">
          {/* 안내 문구 */}
          <div className="px-5 pt-4">
            <p className="text-[13px] text-white/60 leading-relaxed break-keep">
              이 별자리에 함께할 새로운 픽셀리어를 초대해 주세요. <br />
              <span className="text-[11px] text-white/40 mt-1 block">
                {`* 현재 멤버: ${currentParticipants.length}명 / 최대 10명까지 초대 가능합니다.`}
              </span>
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
            </div>
          )}

          {/* 검색 입력 */}
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
                검색 결과가 없거나 이미 참여 중인 멤버입니다
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
                <div
                  className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition ${
                    selectedUsers.some(s => s.id === user.id)
                      ? 'bg-[rgb(var(--theme-rgb))] border-[rgb(var(--theme-rgb))]'
                      : 'border-white/20'
                  }`}
                >
                  {selectedUsers.some(s => s.id === user.id) && <Check className="w-3 h-3 text-white" />}
                </div>
              </button>
            ))}
          </div>
        </div>
      </FullScreenModal>
    </div>
  )
}

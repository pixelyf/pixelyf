'use client'

import React, { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X, ChevronLeft, Edit3, LogOut, Loader2, Bell, BellOff, Users,
} from 'lucide-react'
import useSWR, { mutate } from 'swr'

import { dmService } from '@/shared/lib/dm/dmService'
import { useUserStore } from '@/entities/user/model/useUserStore'
import { useGalaxyStore } from '@/stores/galaxyStore'
import { MemberListItem, InviteButtonRow } from './MemberListItem'
import type { DmParticipantRole, DmGroupParticipantData } from '@/shared/lib/dm/types'

// ══════════════════════════════════════════════════════════════
// GroupSettingsDrawer — 별자리 설정 드로어
// 멤버 목록, 초대/강퇴, 이름 변경, 음소거, 나가기
// ══════════════════════════════════════════════════════════════

interface GroupSettingsDrawerProps {
  roomId: string
  isOpen: boolean
  onClose: () => void
  onInvite: () => void
}

interface RoomDetailResponse {
  id: string
  type: string
  name: string | null
  avatarUrl: string | null
  maxParticipants: number
  participants: DmGroupParticipantData[]
}

export function GroupSettingsDrawer({
  roomId,
  isOpen,
  onClose,
  onInvite,
}: GroupSettingsDrawerProps) {
  const userProfile = useUserStore(s => s.user)
  const setActiveDmRoomId = useGalaxyStore(s => s.setActiveDmRoomId)

  const [isEditingName, setIsEditingName] = useState(false)
  const [nameInput, setNameInput] = useState('')
  const [isSavingName, setIsSavingName] = useState(false)
  const [isLeaving, setIsLeaving] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const { data: roomData, isLoading, mutate: mutateRoom } = useSWR<{ data: { room: RoomDetailResponse } }>(
    isOpen ? `/api/dm/rooms/${roomId}` : null,
    (url: string) => fetch(url).then(r => r.json())
  )

  const room = roomData?.data?.room
  const participants = room?.participants || []
  const myParticipation = participants.find(p => p.userId === userProfile?.id)
  const isKeeper = myParticipation?.role === 'KEEPER'
  const isMuted = myParticipation?.muteUntil
    ? new Date(myParticipation.muteUntil) > new Date()
    : false

  // ── 이름 변경 ──
  const handleStartEditName = () => {
    setNameInput(room?.name || '')
    setIsEditingName(true)
    setActionError(null)
  }

  const handleSaveName = async () => {
    if (!nameInput.trim() || isSavingName) return
    setIsSavingName(true)
    setActionError(null)

    try {
      await dmService.updateGroupSettings(roomId, { name: nameInput.trim() })
      await mutateRoom()
      setIsEditingName(false)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : '이름 변경 실패')
    } finally {
      setIsSavingName(false)
    }
  }

  // ── 역할 변경 ──
  const handleChangeRole = useCallback(async (userId: string, newRole: DmParticipantRole) => {
    setActionError(null)
    try {
      await dmService.changeRole(roomId, userId, { role: newRole })
      await mutateRoom()
      // 채팅방 캐시도 갱신
      mutate(`/api/dm/rooms/${roomId}`)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : '역할 변경 실패')
    }
  }, [roomId, mutateRoom])

  // ── 멤버 강퇴 ──
  const handleRemoveMember = useCallback(async (userId: string) => {
    const target = participants.find(p => p.userId === userId)
    if (!confirm(`${target?.user?.display_name || '이 멤버'}님을 정말 내보내시겠습니까?`)) return

    setActionError(null)
    try {
      await dmService.removeMember(roomId, userId)
      await mutateRoom()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : '멤버 내보내기 실패')
    }
  }, [roomId, participants, mutateRoom])

  // ── 음소거 토글 ──
  const handleToggleMute = async () => {
    setActionError(null)
    try {
      if (isMuted) {
        await dmService.muteRoom(roomId, { muteUntil: null })
      } else {
        // 기본: 7일 음소거
        const until = new Date()
        until.setDate(until.getDate() + 7)
        await dmService.muteRoom(roomId, { muteUntil: until.toISOString() })
      }
      await mutateRoom()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : '음소거 설정 실패')
    }
  }

  // ── 나가기 ──
  const handleLeave = async () => {
    if (!confirm('정말 이 별자리를 떠나시겠습니까?')) return
    setIsLeaving(true)
    setActionError(null)

    try {
      await dmService.leaveRoom(roomId)
      setActiveDmRoomId(null)
      onClose()
      // 방 목록 갱신
      mutate('/api/dm/rooms')
    } catch (err) {
      setActionError(err instanceof Error ? err.message : '나가기 실패')
    } finally {
      setIsLeaving(false)
    }
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', damping: 25, stiffness: 200 }}
          className="absolute inset-0 bg-[#0b0f10] z-20 flex flex-col"
        >
          {/* Header */}
          <div className="h-15 flex items-center px-4 border-b border-white/10 shrink-0 bg-white/2 gap-2">
            <button
              onClick={onClose}
              className="p-2 -ml-2 text-white/50 hover:text-white transition rounded-full hover:bg-white/5"
              aria-label="뒤로"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <span className="font-bold text-white text-sm">별자리 설정</span>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-white/30" />
              </div>
            ) : (
              <div className="divide-y divide-white/5">
                {/* 그룹 정보 섹션 */}
                <div className="px-4 py-5 space-y-4">
                  {/* 별자리 이름 */}
                  <div className="flex items-center justify-between">
                    {isEditingName ? (
                      <div className="flex items-center gap-2 flex-1">
                        <input
                          type="text"
                          value={nameInput}
                          onChange={(e) => setNameInput(e.target.value)}
                          maxLength={50}
                          className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500/50 transition"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveName()
                            if (e.key === 'Escape') setIsEditingName(false)
                          }}
                        />
                        <button
                          onClick={handleSaveName}
                          disabled={isSavingName || !nameInput.trim()}
                          className="px-3 py-2 bg-purple-500 text-white text-xs font-bold rounded-lg hover:bg-purple-600 transition disabled:opacity-50"
                        >
                          {isSavingName ? <Loader2 className="w-3 h-3 animate-spin" /> : '저장'}
                        </button>
                        <button
                          onClick={() => setIsEditingName(false)}
                          className="px-3 py-2 bg-white/5 text-white/50 text-xs rounded-lg hover:bg-white/10 transition"
                        >
                          취소
                        </button>
                      </div>
                    ) : (
                      <>
                        <div>
                          <p className="text-xs text-white/40 mb-0.5">별자리 이름</p>
                          <p className="text-sm font-bold text-white">{room?.name || '별자리 대화'}</p>
                        </div>
                        {isKeeper && (
                          <button
                            onClick={handleStartEditName}
                            className="p-2 text-white/30 hover:text-white/60 transition rounded-full hover:bg-white/5"
                            aria-label="이름 변경"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* 멤버 목록 섹션 */}
                <div className="py-3">
                  <div className="flex items-center justify-between px-4 mb-2">
                    <div className="flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-white/40" />
                      <span className="text-xs font-bold text-white/40 uppercase tracking-wider">
                        멤버 ({participants.length}명)
                      </span>
                    </div>
                  </div>

                  {/* 본인 먼저, KEEPER 먼저 정렬 */}
                  {[...participants]
                    .sort((a, b) => {
                      if (a.userId === userProfile?.id) return -1
                      if (b.userId === userProfile?.id) return 1
                      if (a.role === 'KEEPER' && b.role !== 'KEEPER') return -1
                      if (a.role !== 'KEEPER' && b.role === 'KEEPER') return 1
                      return 0
                    })
                    .map(member => (
                      <MemberListItem
                        key={member.userId}
                        member={{
                          userId: member.userId,
                          role: member.role,
                          user: member.user,
                        }}
                        isCurrentUser={member.userId === userProfile?.id}
                        isCurrentUserKeeper={isKeeper}
                        onChangeRole={handleChangeRole}
                        onRemoveMember={handleRemoveMember}
                      />
                    ))}

                  {/* 초대 버튼 (KEEPER만) */}
                  {isKeeper && <InviteButtonRow onClick={onInvite} />}
                </div>

                {/* 설정 섹션 */}
                <div className="py-3 px-4 space-y-1">
                  {/* 음소거 토글 */}
                  <button
                    onClick={handleToggleMute}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/5 transition text-left"
                  >
                    {isMuted ? (
                      <BellOff className="w-4 h-4 text-white/40" />
                    ) : (
                      <Bell className="w-4 h-4 text-white/40" />
                    )}
                    <span className="text-sm text-white/70">
                      {isMuted ? '알림 켜기' : '7일간 알림 끄기'}
                    </span>
                  </button>

                  {/* 나가기 */}
                  <button
                    onClick={handleLeave}
                    disabled={isLeaving}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-red-500/10 transition text-left"
                  >
                    <LogOut className="w-4 h-4 text-red-400" />
                    <span className="text-sm text-red-400 font-medium">
                      {isLeaving ? '처리 중...' : '별자리 떠나기'}
                    </span>
                  </button>
                </div>

                {/* 에러 표시 */}
                {actionError && (
                  <div className="px-4 py-3">
                    <p className="text-xs text-red-400 bg-red-500/10 px-3 py-2 rounded-lg">
                      {actionError}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

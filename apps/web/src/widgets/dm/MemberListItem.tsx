'use client'

import React from 'react'
import { Crown, MoreHorizontal, UserMinus, ShieldCheck, Shield, UserPlus } from 'lucide-react'
import type { DmParticipantRole } from '@/shared/lib/dm/types'

// ══════════════════════════════════════════════════════════════
// MemberListItem — 그룹 채팅 멤버 행 컴포넌트
// KEEPER 배지, 더보기 메뉴(역할 변경, 강퇴)
// ══════════════════════════════════════════════════════════════

export interface MemberListItemData {
  userId: string
  role: DmParticipantRole
  user: {
    id: string
    display_name: string
    avatar_image_url: string | null
    current_aura?: string
  }
}

interface MemberListItemProps {
  member: MemberListItemData
  isCurrentUser: boolean
  isCurrentUserKeeper: boolean
  onChangeRole?: (userId: string, newRole: DmParticipantRole) => void
  onRemoveMember?: (userId: string) => void
}

export function MemberListItem({
  member,
  isCurrentUser,
  isCurrentUserKeeper,
  onChangeRole,
  onRemoveMember,
}: MemberListItemProps) {
  const [showMenu, setShowMenu] = React.useState(false)
  const menuRef = React.useRef<HTMLDivElement>(null)

  // 외부 클릭 시 메뉴 닫기
  React.useEffect(() => {
    if (!showMenu) return
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showMenu])

  const isKeeper = member.role === 'KEEPER'

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 hover:bg-white/3 transition rounded-lg group relative">
      {/* 아바타 */}
      {member.user.avatar_image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={member.user.avatar_image_url}
          alt={`${member.user.display_name} 아바타`}
          className="w-9 h-9 rounded-full object-cover shrink-0"
        />
      ) : (
        <div className="w-9 h-9 rounded-full bg-indigo-500/20 flex items-center justify-center font-bold text-indigo-300 text-sm shrink-0">
          {member.user.display_name[0]}
        </div>
      )}

      {/* 이름 + 역할 */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium text-white truncate">
            {member.user.display_name}
          </span>
          {isCurrentUser && (
            <span className="text-[10px] text-white/30">(나)</span>
          )}
          {isKeeper && (
            <span className="flex items-center gap-0.5 px-1.5 py-0.5 bg-amber-500/15 rounded text-[10px] font-bold text-amber-400">
              <Crown className="w-2.5 h-2.5" />
              지킴이
            </span>
          )}
        </div>
      </div>

      {/* 더보기 메뉴 (KEEPER만, 자기 자신 제외) */}
      {isCurrentUserKeeper && !isCurrentUser && (
        <div className="relative" ref={menuRef}>
          <button
            onClick={(e) => {
              e.stopPropagation()
              setShowMenu(!showMenu)
            }}
            className="p-1.5 text-white/30 hover:text-white/60 transition rounded-full hover:bg-white/5 opacity-0 group-hover:opacity-100"
            aria-label="멤버 관리"
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>

          {showMenu && (
            <div className="absolute right-0 top-full mt-1 w-44 bg-[#1a1f2e] border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50">
              {/* 역할 변경 */}
              <button
                onClick={() => {
                  setShowMenu(false)
                  const newRole = isKeeper ? 'MEMBER' : 'KEEPER'
                  onChangeRole?.(member.userId, newRole)
                }}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-white/80 hover:bg-white/5 transition text-left"
              >
                {isKeeper ? (
                  <>
                    <Shield className="w-4 h-4 text-white/40" />
                    <span>구성원으로 변경</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4 text-amber-400" />
                    <span>지킴이로 임명</span>
                  </>
                )}
              </button>

              {/* 강퇴 */}
              <button
                onClick={() => {
                  setShowMenu(false)
                  onRemoveMember?.(member.userId)
                }}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-400 hover:bg-red-500/10 transition text-left border-t border-white/5"
              >
                <UserMinus className="w-4 h-4" />
                <span>내보내기</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── 초대 버튼 행 (멤버 목록 하단) ──
interface InviteButtonRowProps {
  onClick: () => void
}

export function InviteButtonRow({ onClick }: InviteButtonRowProps) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-white/5 transition rounded-lg text-left"
    >
      <div className="w-9 h-9 rounded-full border-2 border-dashed border-white/20 flex items-center justify-center">
        <UserPlus className="w-4 h-4 text-white/40" />
      </div>
      <span className="text-sm text-white/50 font-medium">멤버 초대</span>
    </button>
  )
}

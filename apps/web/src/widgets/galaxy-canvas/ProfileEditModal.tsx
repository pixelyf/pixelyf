'use client'

import { useState, useEffect } from 'react'
import { Loader2, Camera, UserCircle, RotateCcw } from 'lucide-react'
import { FullScreenModal } from '@/shared/ui/FullScreenModal'
import { ModalButton } from '@/shared/ui/ModalButton'
import { useUserStore } from '@/entities/user/model/useUserStore'
import { useToastStore } from '@/stores/toastStore'
import { useImageUpload } from '@/shared/hooks/useImageUpload'
import { findBlockedWord } from '@/shared/constants/blockedWords'
import { useGalaxySystem } from '@/shared/hooks/useGalaxySystem'
import { useMoodColor } from '@/shared/hooks/useMoodColor'

export function ProfileEditModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean
  onClose: () => void
}) {
  const currentUser = useUserStore((s) => s.user)
  const setUser = useUserStore((s) => s.setUser)
  const addToast = useToastStore((s) => s.addToast)

  const [displayName, setDisplayName] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [statusMessage, setStatusMessage] = useState('')
  const [activeTab, setActiveTab] = useState<string>('GLOBAL')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { isUploading, uploadImages } = useImageUpload({ folder: 'avatars', maxSizeMB: 5, maxFiles: 1 })
  const { themeStyle } = useMoodColor(currentUser?.current_mood_id)

  const { galaxies } = useGalaxySystem()

  // Available tabs: GLOBAL + joined galaxies (sorted by DB sort_order)
  const userCoordinates = currentUser?.coordinates || {}
  const joinedGalaxies = Object.keys(userCoordinates)
    .filter(key => galaxies.some(g => g.key === key))
    .sort((a, b) => {
      const ga = galaxies.find(g => g.key === a)
      const gb = galaxies.find(g => g.key === b)
      return (ga?.sortOrder ?? 99) - (gb?.sortOrder ?? 99)
    })
  const tabs = ['GLOBAL', ...joinedGalaxies]

  const getTabLabel = (key: string) => {
    if (key === 'GLOBAL') return '공통 (Global)'
    const g = galaxies.find(g => g.key === key)
    return g ? g.name : key
  }

  // Hydrate initial state
  useEffect(() => {
    if (isOpen && currentUser) {
      if (activeTab === 'GLOBAL') {
        setDisplayName(currentUser.display_name || '')
        setAvatarUrl(currentUser.avatar_url || '')
        setStatusMessage(currentUser.status_message || '')
      } else {
        const coord = currentUser.coordinates?.[activeTab]
        setDisplayName(coord?.display_name || currentUser.display_name || '')
        setAvatarUrl(coord?.avatar_url || currentUser.avatar_url || '')
        setStatusMessage(coord?.status_message || '')
      }
    }
  }, [isOpen, currentUser, activeTab])

  if (!isOpen || !currentUser) return null

  const handleUploadAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    try {
      const uploaded = await uploadImages(files)
      if (uploaded && uploaded.length > 0) {
        setAvatarUrl(uploaded[0].url)
        addToast({ title: '이미지가 업로드되었습니다.', type: 'success' })
      }
    } catch (err: unknown) {
      addToast({ title: '업로드 실패', message: err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.', type: 'error' })
    }
  }

  const handleSubmit = async () => {
    if (!displayName.trim()) {
      addToast({ title: '이름을 입력해주세요.', type: 'error' })
      return
    }

    setIsSubmitting(true)
    try {
      const res = await fetch('/api/users/me', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          display_name: displayName,
          avatar_url: avatarUrl,
          status_message: statusMessage,
          galaxy_key: activeTab
        }),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => null)
        throw new Error(errData?.error || 'API update failed')
      }

      // Update local store
      const updatedUser = { ...currentUser }
      if (activeTab === 'GLOBAL') {
        updatedUser.display_name = displayName
        updatedUser.avatar_url = avatarUrl
        updatedUser.status_message = statusMessage
      } else {
        updatedUser.coordinates = { ...(updatedUser.coordinates || {}) }
        updatedUser.coordinates[activeTab] = {
          ...updatedUser.coordinates[activeTab],
          x: updatedUser.coordinates[activeTab]?.x || 0,
          y: updatedUser.coordinates[activeTab]?.y || 0,
          display_name: displayName,
          avatar_url: avatarUrl,
          status_message: statusMessage,
        }
      }
      setUser(updatedUser)

      // [REALTIME] 패널 프로필 실시간 동기화 이벤트
      window.dispatchEvent(new CustomEvent('profile-updated', {
        detail: {
          pixelId: currentUser.id,
          displayName,
          avatarUrl,
          statusMessage,
        }
      }))

      addToast({
        title: '프로필이 수정되었습니다.',
        type: 'success',
      })
      onClose()
    } catch (error) {
      console.error(error)
      addToast({
        title: '프로필 수정 실패',
        message: error instanceof Error ? error.message : '잠시 후 다시 시도해주세요.',
        type: 'error',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  // ── 하단 고정 제출 버튼 ──
  const submitFooter = (
    <ModalButton
      onClick={handleSubmit}
      disabled={
        isSubmitting || 
        !displayName.trim() ||
        !!findBlockedWord(displayName) ||
        !!findBlockedWord(statusMessage)
      }
      isLoading={isSubmitting}
      fullWidth
    >
      저장하기
    </ModalButton>
  )

  return (
    <div style={themeStyle} className="contents">
      <FullScreenModal style={themeStyle} isOpen={isOpen} onClose={onClose} title="프로필 편집" footer={submitFooter} bgColor="theme-panel-bg">
      {/* Galaxy Tabs */}
      {tabs.length > 1 && (
        <div className="flex gap-2 mt-5 mb-6 overflow-x-auto pb-2 scrollbar-hide">
          {tabs.map(tab => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-colors ${
                activeTab === tab
                  ? 'theme-btn-solid'
                  : 'theme-btn-glass opacity-60 hover:opacity-100'
              }`}
            >
              {getTabLabel(tab)}
            </button>
          ))}
        </div>
      )}

      <div className="space-y-5">
        {/* Avatar Section */}
        <div className="flex flex-col items-center gap-3">
          <label className="relative w-24 h-24 rounded-full bg-white/5 border-2 border-white/10 flex items-center justify-center overflow-hidden group cursor-pointer shadow-xl">
            <input type="file" accept="image/*" className="hidden" onChange={handleUploadAvatar} disabled={isUploading || isSubmitting} />
            {avatarUrl ? (
              <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
            ) : (
              <UserCircle size={40} className="text-slate-500" />
            )}
            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
              <Camera size={24} className="text-white" />
            </div>
            {isUploading && (
              <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center opacity-100 transition-opacity">
                <Loader2 size={24} className="text-white animate-spin mb-1" />
                <span className="text-[10px] text-white font-bold">업로드 중...</span>
              </div>
            )}
          </label>
          <p className="text-sm text-white/60 font-medium">클릭하여 이미지 변경 (최대 5MB)</p>
          {avatarUrl && (
            <button
              type="button"
              onClick={() => setAvatarUrl('')}
              className="theme-btn-glass !rounded-lg text-xs"
            >
              <RotateCcw className="w-3 h-3" />
              기본 이미지로 되돌리기
            </button>
          )}
        </div>

        <div className="space-y-2">
          <label className="text-xs font-bold text-white uppercase tracking-wider block ml-1">
            닉네임
          </label>
          <input 
            type="text"
            value={displayName}
            onChange={e => setDisplayName(e.target.value)}
            maxLength={20}
            placeholder="자신을 표현할 이름을 알려주세요"
            className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/30 resize-none font-normal theme-ring-focus"
          />
          {findBlockedWord(displayName) && (
            <p className="text-xs text-red-400 font-medium ml-1 mt-1">사용할 수 없는 표현이 포함되어 있습니다.</p>
          )}
        </div>

        <div className="space-y-2">
          <label className="text-xs font-bold text-white uppercase tracking-wider block ml-1">
            은하 한 줄 평 (상태메시지)
          </label>
          <input 
            type="text"
            value={statusMessage}
            onChange={e => setStatusMessage(e.target.value)}
            maxLength={50}
            placeholder="지나가는 픽셀리어들에게 건넬 말을 적어보세요"
            className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/30 resize-none font-normal theme-ring-focus"
          />
          {findBlockedWord(statusMessage) && (
            <p className="text-xs text-red-400 font-medium ml-1 mt-1">상태메시지에 사용할 수 없는 표현이 포함되어 있습니다.</p>
          )}
        </div>
      </div>
    </FullScreenModal>
    </div>
  )
}

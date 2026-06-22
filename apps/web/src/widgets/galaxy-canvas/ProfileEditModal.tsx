'use client'

import { useState, useEffect } from 'react'
import { Loader2, Camera, UserCircle, RotateCcw, Plus, Trash2, Image as ImageIcon } from 'lucide-react'
import { FullScreenModal } from '@/shared/ui/FullScreenModal'
import { ModalButton } from '@/shared/ui/ModalButton'
import { useUserStore } from '@/entities/user/model/useUserStore'
import { useToastStore } from '@/stores/toastStore'
import { useImageUpload } from '@/shared/hooks/useImageUpload'
import { findBlockedWord } from '@/shared/constants/blockedWords'
import { useGalaxySystem } from '@/shared/hooks/useGalaxySystem'
import { useMoodColor } from '@/shared/hooks/useMoodColor'

const DAYS = [
  { key: 'mon', label: '월요일' },
  { key: 'tue', label: '화요일' },
  { key: 'wed', label: '수요일' },
  { key: 'thu', label: '목요일' },
  { key: 'fri', label: '금요일' },
  { key: 'sat', label: '토요일' },
  { key: 'sun', label: '일요일' },
]

const DEFAULT_HOURS = {
  mon: { isClosed: false, openTime: '09:00', closeTime: '22:00' },
  tue: { isClosed: false, openTime: '09:00', closeTime: '22:00' },
  wed: { isClosed: false, openTime: '09:00', closeTime: '22:00' },
  thu: { isClosed: false, openTime: '09:00', closeTime: '22:00' },
  fri: { isClosed: false, openTime: '09:00', closeTime: '22:00' },
  sat: { isClosed: false, openTime: '09:00', closeTime: '22:00' },
  sun: { isClosed: true, openTime: '09:00', closeTime: '22:00' },
}

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

  // Store Detail States
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [googlePlaceId, setGooglePlaceId] = useState('')
  const [latitude, setLatitude] = useState<number | ''>('')
  const [longitude, setLongitude] = useState<number | ''>('')
  const [businessHours, setBusinessHours] = useState<any>(null)
  const [menuInfo, setMenuInfo] = useState<any[]>([])
  const [galleryPhotos, setGalleryPhotos] = useState<string[]>([])
  const [description, setDescription] = useState('')

  // Uploaders
  const { isUploading: isAvatarUploading, uploadImages: uploadAvatar } = useImageUpload({ folder: 'avatars', maxSizeMB: 5, maxFiles: 1 })
  const { isUploading: isMenuUploading, uploadImages: uploadMenu } = useImageUpload({ folder: 'menus', maxSizeMB: 5, maxFiles: 1 })
  const { isUploading: isGalleryUploading, uploadImages: uploadGallery } = useImageUpload({ folder: 'gallery', maxSizeMB: 10, maxFiles: 10 })

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
    if (key === 'GLOBAL') return '기본 매장 정보 (Global)'
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

        // Hydrate Store Detail
        const store = currentUser.store_detail || {}
        setPhone(store.phone || '')
        setAddress(store.address || '')
        setGooglePlaceId(store.google_place_id || '')
        setLatitude(store.latitude !== undefined && store.latitude !== null ? store.latitude : '')
        setLongitude(store.longitude !== undefined && store.longitude !== null ? store.longitude : '')
        setBusinessHours(store.business_hours || { ...DEFAULT_HOURS })
        setMenuInfo(store.menu_info || [])
        setGalleryPhotos(store.gallery_photos || [])
        setDescription(store.description || '')
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
      const uploaded = await uploadAvatar(files)
      if (uploaded && uploaded.length > 0) {
        setAvatarUrl(uploaded[0].url)
        addToast({ title: '이미지가 업로드되었습니다.', type: 'success' })
      }
    } catch (err: unknown) {
      addToast({ title: '업로드 실패', message: err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.', type: 'error' })
    }
  }

  // Menu photo upload helper
  const handleUploadMenuImage = async (e: React.ChangeEvent<HTMLInputElement>, index: number) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    try {
      const uploaded = await uploadMenu(files)
      if (uploaded && uploaded.length > 0) {
        const updated = [...menuInfo]
        updated[index] = { ...updated[index], image: uploaded[0].url }
        setMenuInfo(updated)
        addToast({ title: '메뉴 이미지가 업로드되었습니다.', type: 'success' })
      }
    } catch (err: unknown) {
      addToast({ title: '업로드 실패', message: err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.', type: 'error' })
    }
  }

  // Gallery photos upload helper
  const handleUploadGalleryPhotos = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    try {
      const uploaded = await uploadGallery(files)
      if (uploaded && uploaded.length > 0) {
        const urls = uploaded.map(img => img.url)
        setGalleryPhotos(prev => [...prev, ...urls])
        addToast({ title: `${uploaded.length}개의 사진이 추가되었습니다.`, type: 'success' })
      }
    } catch (err: unknown) {
      addToast({ title: '업로드 실패', message: err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.', type: 'error' })
    }
  }

  const handleAddMenuItem = () => {
    setMenuInfo(prev => [...prev, { name: '', price: '', description: '', image: '' }])
  }

  const handleRemoveMenuItem = (index: number) => {
    setMenuInfo(prev => prev.filter((_, i) => i !== index))
  }

  const handleUpdateMenuItem = (index: number, field: string, value: string) => {
    const updated = [...menuInfo]
    updated[index] = { ...updated[index], [field]: value }
    setMenuInfo(updated)
  }

  const handleRemoveGalleryPhoto = (index: number) => {
    setGalleryPhotos(prev => prev.filter((_, i) => i !== index))
  }

  const handleHourChange = (dayKey: string, field: string, value: any) => {
    setBusinessHours((prev: any) => {
      const dayData = prev ? prev[dayKey] : { isClosed: false, openTime: '09:00', closeTime: '22:00' }
      return {
        ...prev,
        [dayKey]: {
          ...dayData,
          [field]: value
        }
      }
    })
  }

  const handleSubmit = async () => {
    if (!displayName.trim()) {
      addToast({ title: '이름을 입력해주세요.', type: 'error' })
      return
    }

    setIsSubmitting(true)
    try {
      const patchBody: any = {
        display_name: displayName,
        avatar_url: avatarUrl,
        status_message: statusMessage,
        galaxy_key: activeTab
      }

      if (activeTab === 'GLOBAL') {
        patchBody.phone = phone || null
        patchBody.address = address || null
        patchBody.google_place_id = googlePlaceId || null
        patchBody.latitude = latitude !== '' ? Number(latitude) : null
        patchBody.longitude = longitude !== '' ? Number(longitude) : null
        patchBody.business_hours = businessHours
        patchBody.menu_info = menuInfo
        patchBody.gallery_photos = galleryPhotos
        patchBody.description = description || null
      }

      const res = await fetch('/api/users/me', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(patchBody),
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
        updatedUser.store_detail = {
          phone: phone || undefined,
          address: address || undefined,
          google_place_id: googlePlaceId || undefined,
          latitude: latitude !== '' ? Number(latitude) : undefined,
          longitude: longitude !== '' ? Number(longitude) : undefined,
          business_hours: businessHours,
          menu_info: menuInfo,
          gallery_photos: galleryPhotos,
          description: description || undefined,
        }
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
        isAvatarUploading ||
        isMenuUploading ||
        isGalleryUploading ||
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
      <FullScreenModal style={themeStyle} isOpen={isOpen} onClose={onClose} title="매장 프로필 편집" footer={submitFooter} bgColor="theme-panel-bg">
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

      <div className="space-y-6 pb-12">
        {/* Avatar Section */}
        <div className="flex flex-col items-center gap-3">
          <label className="relative w-24 h-24 rounded-full bg-white/5 border-2 border-white/10 flex items-center justify-center overflow-hidden group cursor-pointer shadow-xl">
            <input type="file" accept="image/*" className="hidden" onChange={handleUploadAvatar} disabled={isAvatarUploading || isSubmitting} />
            {avatarUrl ? (
              <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
            ) : (
              <UserCircle size={40} className="text-slate-500" />
            )}
            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
              <Camera size={24} className="text-white" />
            </div>
            {isAvatarUploading && (
              <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center opacity-100 transition-opacity">
                <Loader2 size={24} className="text-white animate-spin mb-1" />
                <span className="text-[10px] text-white font-bold">업로드 중...</span>
              </div>
            )}
          </label>
          <p className="text-sm text-white/60 font-medium">대표 매장 로고/사진 변경 (최대 5MB)</p>
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

        {/* Basic Fields */}
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-bold text-white uppercase tracking-wider block ml-1">
              매장 이름
            </label>
            <input 
              type="text"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              maxLength={20}
              placeholder="매장 이름을 적어주세요"
              className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/30 resize-none font-normal theme-ring-focus"
            />
            {findBlockedWord(displayName) && (
              <p className="text-xs text-red-400 font-medium ml-1 mt-1">사용할 수 없는 표현이 포함되어 있습니다.</p>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-white uppercase tracking-wider block ml-1">
              매장 한 줄 소개
            </label>
            <input 
              type="text"
              value={statusMessage}
              onChange={e => setStatusMessage(e.target.value)}
              maxLength={50}
              placeholder="고객들에게 보여줄 한 줄 소개를 적어보세요"
              className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/30 resize-none font-normal theme-ring-focus"
            />
            {findBlockedWord(statusMessage) && (
              <p className="text-xs text-red-400 font-medium ml-1 mt-1">사용할 수 없는 표현이 포함되어 있습니다.</p>
            )}
          </div>
        </div>

        {/* Store Detail Sub-section (Only when Global tab is active) */}
        {activeTab === 'GLOBAL' && (
          <div className="space-y-6 pt-4 border-t border-white/5">
            <h3 className="text-sm font-extrabold text-purple-400 block tracking-wider uppercase">매장 상세 영업 정보</h3>

            {/* Phone & Address */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-white uppercase tracking-wider block ml-1">
                  대표 전화번호
                </label>
                <input 
                  type="text"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="예: 02-123-4567"
                  className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/30 font-normal theme-ring-focus"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-white uppercase tracking-wider block ml-1">
                  매장 위치 (주소)
                </label>
                <input 
                  type="text"
                  value={address}
                  onChange={e => setAddress(e.target.value)}
                  placeholder="예: 서울시 강남구 테헤란로 123"
                  className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/30 font-normal theme-ring-focus"
                />
              </div>
            </div>

            {/* Location coordinates & Google Place ID */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-white uppercase tracking-wider block ml-1">
                  구글맵 Place ID
                </label>
                <input 
                  type="text"
                  value={googlePlaceId}
                  onChange={e => setGooglePlaceId(e.target.value)}
                  placeholder="Google Place ID"
                  className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/30 font-normal theme-ring-focus"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-white uppercase tracking-wider block ml-1">
                  위도 (Latitude)
                </label>
                <input 
                  type="number"
                  step="any"
                  value={latitude}
                  onChange={e => setLatitude(e.target.value !== '' ? Number(e.target.value) : '')}
                  placeholder="37.123456"
                  className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/30 font-normal theme-ring-focus"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-white uppercase tracking-wider block ml-1">
                  경도 (Longitude)
                </label>
                <input 
                  type="number"
                  step="any"
                  value={longitude}
                  onChange={e => setLongitude(e.target.value !== '' ? Number(e.target.value) : '')}
                  placeholder="127.123456"
                  className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/30 font-normal theme-ring-focus"
                />
              </div>
            </div>

            {/* Long Description */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-white uppercase tracking-wider block ml-1">
                매장 상세 소개글
              </label>
              <textarea 
                value={description}
                onChange={e => setDescription(e.target.value)}
                maxLength={500}
                rows={4}
                placeholder="매장의 히스토리, 가치관, 차별화 포인트를 상세히 적어주세요. AI 챗봇이 이 내용을 학습하여 손님들에게 안내합니다."
                className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/30 font-normal theme-ring-focus resize-none"
              />
            </div>

            {/* Business Hours Editor */}
            <div className="space-y-3">
              <label className="text-xs font-bold text-white uppercase tracking-wider block ml-1">
                영업시간 설정
              </label>
              <div className="bg-black/10 border border-white/5 rounded-2xl p-4 space-y-3">
                {DAYS.map(day => {
                  const dayHours = businessHours?.[day.key] || { isClosed: false, openTime: '09:00', closeTime: '22:00' }
                  return (
                    <div key={day.key} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-white/5 last:pb-0 last:border-b-0">
                      <span className="text-sm font-semibold text-white/80 w-20">{day.label}</span>
                      <div className="flex items-center gap-4">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input 
                            type="checkbox" 
                            checked={!dayHours.isClosed} 
                            onChange={e => handleHourChange(day.key, 'isClosed', !e.target.checked)}
                            className="rounded border-white/20 bg-black/40 text-purple-600 focus:ring-purple-500 w-4 h-4"
                          />
                          <span className="text-xs text-white/60">영업함</span>
                        </label>
                        {!dayHours.isClosed ? (
                          <div className="flex items-center gap-2">
                            <input 
                              type="text" 
                              maxLength={5}
                              value={dayHours.openTime || '09:00'} 
                              onChange={e => handleHourChange(day.key, 'openTime', e.target.value)}
                              className="w-16 bg-black/30 border border-white/10 rounded-lg px-2 py-1 text-xs text-white text-center"
                            />
                            <span className="text-xs text-white/40">~</span>
                            <input 
                              type="text" 
                              maxLength={5}
                              value={dayHours.closeTime || '22:00'} 
                              onChange={e => handleHourChange(day.key, 'closeTime', e.target.value)}
                              className="w-16 bg-black/30 border border-white/10 rounded-lg px-2 py-1 text-xs text-white text-center"
                            />
                          </div>
                        ) : (
                          <span className="text-xs text-red-400 font-bold px-2 py-1 bg-red-500/10 rounded-lg">정기 휴무</span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Gallery Photos Editor */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-white uppercase tracking-wider block ml-1">
                  매장 사진 갤러리 ({galleryPhotos.length}장)
                </label>
                <label className="theme-btn-glass px-3 py-1.5 !rounded-xl text-xs flex items-center gap-1.5 cursor-pointer hover:bg-white/10">
                  <input type="file" accept="image/*" multiple className="hidden" onChange={handleUploadGalleryPhotos} disabled={isGalleryUploading} />
                  {isGalleryUploading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Plus className="w-3.5 h-3.5" />
                  )}
                  사진 추가
                </label>
              </div>
              {galleryPhotos.length > 0 ? (
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
                  {galleryPhotos.map((url, idx) => (
                    <div key={idx} className="relative aspect-square rounded-xl overflow-hidden group border border-white/10 shadow-lg">
                      <img src={url} alt={`Gallery ${idx}`} className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => handleRemoveGalleryPhoto(idx)}
                        className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 flex items-center justify-center text-red-400 hover:text-red-300 hover:bg-black/80 transition-colors shadow-md"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="bg-black/10 border border-dashed border-white/10 rounded-2xl py-8 flex flex-col items-center justify-center text-white/40">
                  <Plus className="w-6 h-6 mb-2" />
                  <span className="text-xs">매장 사진을 업로드해주세요 (전경, 음식 등)</span>
                </div>
              )}
            </div>

            {/* Menu Management */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-white uppercase tracking-wider block ml-1">
                  매장 메뉴판 관리
                </label>
                <button
                  type="button"
                  onClick={handleAddMenuItem}
                  className="theme-btn-glass px-3 py-1.5 !rounded-xl text-xs flex items-center gap-1.5 hover:bg-white/10"
                >
                  <Plus className="w-3.5 h-3.5" />
                  메뉴 추가
                </button>
              </div>

              {menuInfo.length > 0 ? (
                <div className="space-y-4">
                  {menuInfo.map((menu, idx) => (
                    <div key={idx} className="bg-black/10 border border-white/5 rounded-2xl p-4 space-y-3 relative">
                      <button
                        type="button"
                        onClick={() => handleRemoveMenuItem(idx)}
                        className="absolute top-3 right-3 text-white/40 hover:text-red-400 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>

                      <div className="flex flex-col sm:flex-row gap-4">
                        {/* Menu Image Upload */}
                        <div className="flex flex-col items-center justify-center">
                          <label className="relative w-20 h-20 bg-black/30 border border-white/10 rounded-xl flex items-center justify-center overflow-hidden cursor-pointer group hover:border-white/20 transition-colors">
                            <input type="file" accept="image/*" className="hidden" onChange={e => handleUploadMenuImage(e, idx)} disabled={isMenuUploading} />
                            {menu.image ? (
                              <img src={menu.image} alt={menu.name || 'Menu'} className="w-full h-full object-cover" />
                            ) : (
                              <div className="flex flex-col items-center justify-center text-white/30 text-[10px] font-bold">
                                <Plus className="w-4 h-4 mb-1" />
                                사진 등록
                              </div>
                            )}
                            {isMenuUploading && (
                              <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                                <Loader2 className="w-5 h-5 text-white animate-spin" />
                              </div>
                            )}
                          </label>
                        </div>

                        {/* Menu Input Details */}
                        <div className="flex-1 space-y-3">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <input
                              type="text"
                              value={menu.name || ''}
                              onChange={e => handleUpdateMenuItem(idx, 'name', e.target.value)}
                              placeholder="메뉴 이름"
                              className="bg-black/20 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white placeholder-white/30 w-full"
                            />
                            <input
                              type="text"
                              value={menu.price || ''}
                              onChange={e => handleUpdateMenuItem(idx, 'price', e.target.value)}
                              placeholder="가격 (예: 12,000원)"
                              className="bg-black/20 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white placeholder-white/30 w-full"
                            />
                          </div>
                          <input
                            type="text"
                            value={menu.description || ''}
                            onChange={e => handleUpdateMenuItem(idx, 'description', e.target.value)}
                            placeholder="메뉴에 대한 짧은 소개를 적어주세요."
                            className="bg-black/20 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white placeholder-white/30 w-full"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="bg-black/10 border border-dashed border-white/10 rounded-2xl py-8 flex flex-col items-center justify-center text-white/40">
                  <Plus className="w-6 h-6 mb-2" />
                  <span className="text-xs">메뉴가 비어있습니다. 메뉴를 추가해주세요.</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </FullScreenModal>
    </div>
  )
}

'use client'

import { useState, useMemo, useEffect } from 'react'
import { Plus, X, UploadCloud, Loader2, Lock, Youtube, BookOpen, KeyRound, AlertCircle } from 'lucide-react'
import { useGalaxyStore } from '@/stores/galaxyStore'
import { useUserStore } from '@/entities/user/model/useUserStore'
import { usePulseStore } from '@/stores/pulseStore'
import { useImageUpload } from '@/shared/hooks/useImageUpload'
import { useGalaxySystem } from '@/shared/hooks/useGalaxySystem'
import { FullScreenModal } from '@/shared/ui/FullScreenModal'
import { ModalButton } from '@/shared/ui/ModalButton'
import { useTranslations } from 'next-intl'
import { useMoodColor } from '@/shared/hooks/useMoodColor'
import { extractYouTubeId } from '@/shared/utils/youtube'

export function MomentModal({ isOpen, onClose, bgColor }: { isOpen: boolean; onClose: () => void; bgColor?: string }) {
  const t = useTranslations('Moment')
  const tTG = useTranslations('ThoughtGraph')
  const [content, setContent] = useState('')
  const [selectedGalaxy, setSelectedGalaxy] = useState<string>('')
  const [selectedCategory, setSelectedCategory] = useState<string>('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [previewUrls, setPreviewUrls] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [youtubeUrl, setYoutubeUrl] = useState('')
  // [단골 관리] 단골 전용 모드
  const [isSubOnly, setIsSubOnly] = useState(false)
  const [hasSubscribers, setHasSubscribers] = useState(false)

  const preConnectedThought = useGalaxyStore(s => s.preConnectedThought)
  const setPreConnectedThought = useGalaxyStore(s => s.setPreConnectedThought)
  const synthesizedDraft = useGalaxyStore(s => s.synthesizedDraft)
  const setSynthesizedDraft = useGalaxyStore(s => s.setSynthesizedDraft)
  const reviewTargetPixelId = useGalaxyStore(s => s.reviewTargetPixelId)
  const setReviewTargetPixelId = useGalaxyStore(s => s.setReviewTargetPixelId)
  const [connectedMoments, setConnectedMoments] = useState<any[]>([])
  const [isConnectPanelOpen, setIsConnectPanelOpen] = useState(false)
  const [recommendedMoments, setRecommendedMoments] = useState<any[]>([])
  const [isRecommending, setIsRecommending] = useState(false)
  const [recommendError, setRecommendError] = useState(false)
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null) // null = 로딩 중

  // 태그 및 카테고리 콤보박스 상태 추가
  const [tagInput, setTagInput] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false)

  const youtubeId = youtubeUrl ? extractYouTubeId(youtubeUrl) : null
  
  const currentMoodId = useGalaxyStore(s => s.currentMoodId)
  const { themeStyle } = useMoodColor(currentMoodId)
  const galaxyKeyFromStore = useGalaxyStore(s => s.galaxyKey)
  const userInitialize = useUserStore(s => s.initialize)
  const userProfile = useUserStore(s => s.user)
  const spatialGrid = useGalaxyStore(s => s.spatialGrid)

  const { uploadImages } = useImageUpload({ folder: 'moments', maxSizeMB: 5, maxFiles: 10 })
  const { galaxies, getCategoriesByGalaxy } = useGalaxySystem()

  // 은하 초기값 설정
  useEffect(() => {
    if (isOpen && galaxies.length > 0) {
      const initialGalaxy = galaxies.find(g => g.key === galaxyKeyFromStore)?.key || galaxies[0].key
      setSelectedGalaxy(initialGalaxy)
    }
  }, [isOpen, galaxies, galaxyKeyFromStore])

  // 은하 변경 시 카테고리 초기값 설정
  useEffect(() => {
    if (selectedGalaxy) {
      const categories = getCategoriesByGalaxy(selectedGalaxy)
      setSelectedCategory(categories.length > 0 ? categories[0].key : '')
    }
  }, [selectedGalaxy, getCategoriesByGalaxy])

  const isCreatorAuthed = userProfile?.role === 'SUPER_ADMIN' || userProfile?.role === 'CONTENT_ADMIN' || userProfile?.supernova_tier === 'MASTER'

  // [단골 관리] 내 단골손님 보유 여부 확인 + [기록그래프] API 키 보유 여부 확인 (모달 열릴 때 1회 병렬)
  useEffect(() => {
    if (!isOpen) return
    Promise.all([
      fetch('/api/subscriptions').then(r => r.json()).then(data => setHasSubscribers((data.subscribers?.length || 0) > 0)).catch(() => setHasSubscribers(false)),
      fetch('/api/ai/providers').then(r => r.json()).then(data => setHasApiKey((data.keys || []).some((k: any) => k.isActive))).catch(() => setHasApiKey(false)),
    ])
  }, [isOpen])

  // [기록그래프] preConnectedThought 수신 이펙트
  useEffect(() => {
    if (isOpen && preConnectedThought) {
      setConnectedMoments(prev => {
        if (prev.some(m => m.id === preConnectedThought.id)) return prev
        return [
          ...prev,
          {
            id: preConnectedThought.id,
            content: preConnectedThought.content,
            relationType: preConnectedThought.relationType,
            isPreset: true
          }
        ]
      })
      setIsConnectPanelOpen(true)
    }
  }, [isOpen, preConnectedThought])

  // [기록그래프] synthesizedDraft 수집 및 입력창 연동
  useEffect(() => {
    if (isOpen && synthesizedDraft) {
      setContent(synthesizedDraft)
      // 바로 스토어 임시 상태 청소하여 유저 수동 타이핑 도중 재덮어쓰기 방지
      setSynthesizedDraft(null)
    }
  }, [isOpen, synthesizedDraft, setSynthesizedDraft])

  // [기록그래프] 1초 디바운스 실시간 RAG 추천 이펙트 (API 키 보유 시에만 호출)
  useEffect(() => {
    if (!isOpen || !content.trim() || !selectedGalaxy || !hasApiKey) {
      setRecommendedMoments([])
      setRecommendError(false)
      return
    }

    const timer = setTimeout(async () => {
      setIsRecommending(true)
      setRecommendError(false)
      try {
        const res = await fetch(`/api/thought-graph/recommend?content=${encodeURIComponent(content)}&galaxyKey=${selectedGalaxy}`)
        if (res.ok) {
          const data = await res.json()
          setRecommendedMoments(data.recommendations || [])
        } else {
          setRecommendError(true)
          setRecommendedMoments([])
        }
      } catch (err) {
        console.error('[MomentModal:Recommend] 추천 실패:', err)
        setRecommendError(true)
        setRecommendedMoments([])
      } finally {
        setIsRecommending(false)
      }
    }, 1000)

    return () => clearTimeout(timer)
  }, [content, selectedGalaxy, isOpen, hasApiKey])

  // [CLEANUP] 모달 닫기 — blob URL 해제 + state 초기화
  const handleClose = () => {
    previewUrls.forEach(url => URL.revokeObjectURL(url))
    setPendingFiles([])
    setPreviewUrls([])
    setContent('')
    setYoutubeUrl('')
    setIsSubOnly(false)
    setError(null)
    setConnectedMoments([])
    setRecommendedMoments([])
    setRecommendError(false)
    setIsConnectPanelOpen(false)
    setPreConnectedThought(null)
    setSynthesizedDraft(null)
    setReviewTargetPixelId(null)
    setTags([])
    setTagInput('')
    setIsCategoryDropdownOpen(false)
    onClose()
  }

  // [DEFERRED UPLOAD] 파일 선택 → 로컬 보관 + blob URL 미리보기 (서버 접근 없음)
  const handleSelectFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    const MAX_SIZE = 5 * 1024 * 1024 // 5MB
    const validFiles: File[] = []
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) {
        setError(t('errNotImage', { name: file.name }))
        return
      }
      if (file.size > MAX_SIZE) {
        setError(t('errTooLarge', { name: file.name }))
        return
      }
      validFiles.push(file)
    }

    setError(null)
    const remaining = 10 - pendingFiles.length
    const filesToAdd = validFiles.slice(0, Math.max(0, remaining))
    if (filesToAdd.length === 0) return

    const newUrls = filesToAdd.map(f => URL.createObjectURL(f))
    setPendingFiles(prev => [...prev, ...filesToAdd])
    setPreviewUrls(prev => [...prev, ...newUrls])
    e.target.value = ''
  }

  const removeImage = (index: number) => {
    URL.revokeObjectURL(previewUrls[index])
    setPendingFiles(prev => prev.filter((_, i) => i !== index))
    setPreviewUrls(prev => prev.filter((_, i) => i !== index))
  }

  const handleSubmit = async () => {
    const trimmed = content.trim()
    if (!trimmed && pendingFiles.length === 0 && !youtubeUrl.trim()) {
      setError(t('errNoContent'))
      return
    }

    if (!selectedGalaxy || !selectedCategory) {
      setError(t('errSelectGalaxy'))
      return
    }

    setIsSubmitting(true)
    setError(null)
    try {
      // [DEFERRED UPLOAD] 등록 시에만 서버 업로드 실행
      let images: any[] = []
      if (pendingFiles.length > 0) {
        images = await uploadImages(pendingFiles)
      }
      const res = await fetch('/api/moments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: trimmed,
          images, 
          galaxy: selectedGalaxy,
          category: selectedCategory,
          contentCategory: selectedCategory,
          contentTags: tags,
          moodId: currentMoodId,
          youtubeUrl: youtubeUrl.trim() || null,
          isSubscriberOnly: isSubOnly,
          relationships: connectedMoments.map(m => ({
            targetId: m.id,
            relationType: m.relationType
          })),
          targetPixelId: reviewTargetPixelId || null
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to post moment')
      }

      const resData = await res.json()

      if (resData.moment && userProfile) {
        const userPixel = spatialGrid?.getPixel(userProfile.id)
        
        // targetPixelId가 존재할 시 Pulse 좌표를 대상 매장 좌표로 주입 (Null 방어 가드 적용)
        let pulseX = userPixel?.coordX || 0
        let pulseY = userPixel?.coordY || 0
        if (reviewTargetPixelId) {
          const targetPixel = spatialGrid?.getPixel(reviewTargetPixelId)
          if (targetPixel && targetPixel.coordX !== undefined && targetPixel.coordY !== undefined) {
            pulseX = targetPixel.coordX
            pulseY = targetPixel.coordY
          }
        }

        usePulseStore.getState().addPulse({
          id: resData.moment.id,
          content: trimmed,
          created_at: new Date().toISOString(),
          user_id: userProfile.id,
          images: resData.moment.images || null,
          mood_id: currentMoodId, 
          aura_at_post: resData.moment.aura_at_post || 'GLOW',
          user: {
            display_name: userProfile.display_name || t('anonymousPixeler'),
            avatar_svg_id: (userProfile as any).avatar_url || '01',
            current_mood_id: currentMoodId,
          },
          coord: {
            x: pulseX,
            y: pulseY,
          }
        })

        // [STATE SYNC] 전역 상태 즉시 동기화 이벤트 발행
        window.dispatchEvent(new CustomEvent('moment-posted', {
          detail: {
            pixelId: userProfile.id,
            targetPixelId: reviewTargetPixelId || null,
            momentId: resData.moment.id,
            content: trimmed,
            thumbnailUrl: resData.moment.images?.[0]?.thumbnailUrl || null,
            images: resData.moment.images || null,
            youtubeUrl: resData.moment.youtubeUrl || null,
            galaxy: selectedGalaxy,
            category: selectedCategory,
            contentCategory: selectedCategory,
            contentTags: tags,
            createdAt: new Date().toISOString(),
            pingCount: 0,
            pingTypeCounts: {},
            authorDisplayName: userProfile.display_name,
            authorAvatarUrl: userProfile.avatar_url,
          }
        }))
      }

      // 우주 전파 (Broadcast)
      try {
        const { createClient } = await import('@/shared/lib/supabase/browser')
        const supabase = createClient()
        const userPixel = spatialGrid?.getPixel(userProfile?.id || '')

        let pulseX = userPixel?.coordX || 0
        let pulseY = userPixel?.coordY || 0
        if (reviewTargetPixelId) {
          const targetPixel = spatialGrid?.getPixel(reviewTargetPixelId)
          if (targetPixel && targetPixel.coordX !== undefined && targetPixel.coordY !== undefined) {
            pulseX = targetPixel.coordX
            pulseY = targetPixel.coordY
          }
        }

        if (resData.moment && userProfile) {
          const channel = supabase.channel('galaxy-pulse')
          await channel.subscribe(async (status: 'SUBSCRIBED' | 'TIMED_OUT' | 'CLOSED' | 'CHANNEL_ERROR') => {
            if (status === 'SUBSCRIBED') {
              await channel.send({
                type: 'broadcast',
                event: 'new-moment',
                payload: {
                  id: resData.moment.id,
                  content: trimmed,
                  created_at: new Date().toISOString(),
                  user_id: userProfile.id,
                  images: resData.moment.images || null,
                  youtubeUrl: resData.moment.youtubeUrl || null,
                  mood_id: currentMoodId,
                  galaxy: selectedGalaxy,
                  category: selectedCategory,
                  contentCategory: selectedCategory,
                  contentTags: tags,
                  is_subscriber_only: isSubOnly, // [단골 관리] 코어 라이트 트리거용
                  user: {
                    display_name: userProfile.display_name,
                    avatar_svg_id: (userProfile as any).avatar_url,
                    current_mood_id: currentMoodId,
                    supernova_tier: userProfile.supernova_tier || null,
                  },
                  aura_at_post: 'GLOW',
                  coord: {
                    x: pulseX,
                    y: pulseY,
                  }
                }
              })
            }
          })
        }
      } catch (broadcastError) {
        console.error('Broadcast failed:', broadcastError)
      }

      await userInitialize()
      
      // 모달 초기화 + blob URL 해제
      previewUrls.forEach(url => URL.revokeObjectURL(url))
      onClose()
      setContent('')
      setYoutubeUrl('')
      setPendingFiles([])
      setPreviewUrls([])
      setError(null)
      setConnectedMoments([])
      setRecommendedMoments([])
      setRecommendError(false)
      setIsConnectPanelOpen(false)
      setPreConnectedThought(null)
      setTags([])
      setTagInput('')
    } catch (error: any) {
      console.error(error)
      setError(error.message || t('errBroadcast'))
    } finally {
      setIsSubmitting(false)
    }
  }

  const submitFooter = (
    <ModalButton
      onClick={handleSubmit}
      disabled={isSubmitting}
      isLoading={isSubmitting}
      fullWidth
      className="!bg-white !text-slate-900 font-bold shadow-[0_8px_30px_rgba(255,255,255,0.15)] hover:shadow-[0_12px_40px_rgba(255,255,255,0.3)] hover:bg-slate-100"
    >
      {isSubmitting ? t('submitting') : t('submitBtn')}
    </ModalButton>
  )

  return (
    <div className="contents">
      <FullScreenModal style={themeStyle} isOpen={isOpen} onClose={handleClose} title={t('titleRecord')} footer={submitFooter} bgColor={bgColor || 'theme-panel-bg'}>
        {error && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-xs text-red-400 animate-in shake duration-300">
          {error}
        </div>
      )}

      <div className="space-y-6 pt-5">
        {/* 1. 은하 선택 — 단일 은하(PIXELYF)인 경우 UI 숨김, 자동 선택 유지 */}
        {galaxies.length > 1 && (
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-white/80">{t('selectGalaxy')}</h3>
              <div className="flex flex-wrap gap-2 py-1 px-1 -mx-1">
                {galaxies.map((galaxy) => {
                  const isSelected = selectedGalaxy === galaxy.key
                  return (
                    <button
                      key={galaxy.key}
                      onClick={() => setSelectedGalaxy(galaxy.key)}
                      className={`px-4 py-2.5 rounded-xl text-sm font-bold transition-all border ${
                        isSelected 
                          ? 'bg-indigo-500 text-white border-indigo-500 shadow-lg shadow-indigo-500/20' 
                          : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700 hover:text-white'
                      }`}
                    >
                      {galaxy.name}
                    </button>
                  )
                })}
              </div>
          </div>
        )}

          {/* 2. 카테고리 선택 (글래스모피즘 드롭다운 콤보박스) */}
          {selectedGalaxy && getCategoriesByGalaxy(selectedGalaxy).length > 0 && (
            <div className="space-y-3 relative">
              <h3 className="text-sm font-bold text-white/80">{t('detailCategory')}</h3>
              <div className="relative">
                <button
                  key="category-combo-trigger"
                  type="button"
                  onClick={() => setIsCategoryDropdownOpen(v => !v)}
                  className="w-full h-12 bg-slate-950/50 hover:bg-slate-950/70 border border-slate-800 rounded-xl flex items-center justify-between px-4 text-left text-sm text-slate-300 transition-all"
                >
                  <div className="flex items-center gap-2.5">
                    {/* 카테고리 고유 컬러 닷 */}
                    <span 
                      className="w-2.5 h-2.5 rounded-full shadow-[0_0_10px_rgba(255,255,255,0.1)]" 
                      style={{ backgroundColor: getCategoriesByGalaxy(selectedGalaxy).find(c => c.key === selectedCategory)?.color || '#A855F7' }}
                    />
                    <span className="font-bold text-white">
                      {getCategoriesByGalaxy(selectedGalaxy).find(c => c.key === selectedCategory)?.name || t('detailCategory')}
                    </span>
                  </div>
                  <svg
                    className={`w-4 h-4 text-slate-500 transition-transform duration-300 ${isCategoryDropdownOpen ? 'rotate-180' : ''}`}
                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {isCategoryDropdownOpen && (
                  <>
                    {/* 바깥 클릭 시 닫히는 백드롭 레이어 */}
                    <div key="category-combo-backdrop" className="fixed inset-0 z-40" onClick={() => setIsCategoryDropdownOpen(false)} />
                    
                    <div key="category-combo-dropdown" className="absolute left-0 right-0 mt-1.5 z-50 max-h-60 overflow-y-auto bg-[#0b0f19]/95 backdrop-blur-lg border border-white/10 rounded-xl shadow-2xl py-1 animate-in fade-in slide-in-from-top-1.5 duration-200 scrollbar-hide">
                      {getCategoriesByGalaxy(selectedGalaxy).map((cat) => {
                        const isSelected = selectedCategory === cat.key
                        return (
                          <button
                            key={cat.key}
                            type="button"
                            onClick={() => {
                              setSelectedCategory(cat.key)
                              setIsCategoryDropdownOpen(false)
                            }}
                            className={`w-full flex items-center gap-2.5 px-4 py-3 text-left transition-colors ${
                              isSelected 
                                ? 'bg-indigo-500/15 text-indigo-300 font-bold' 
                                : 'text-slate-400 hover:bg-slate-900 hover:text-slate-300'
                            }`}
                          >
                            <span 
                              className="w-2 h-2 rounded-full" 
                              style={{ backgroundColor: cat.color || '#A855F7' }}
                            />
                            <span className="text-sm">{cat.name}</span>
                          </button>
                        )
                      })}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* 2.5. 단골 전용 토글 */}
          {hasSubscribers && (
            <div className="pt-1">
              <button
                type="button"
                onClick={() => setIsSubOnly(v => !v)}
                className={`w-full flex items-center justify-between p-4 rounded-2xl border transition-all duration-300 ${
                  isSubOnly
                    ? 'bg-amber-500/10 border-amber-500/30 shadow-[0_0_20px_rgba(245,158,11,0.08)]'
                    : 'bg-slate-950/50 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-xl transition-all duration-300 ${
                    isSubOnly ? 'bg-amber-500/20' : 'bg-slate-800'
                  }`}>
                    {isSubOnly ? (
                      <Lock className="w-4 h-4 text-amber-400" />
                    ) : (
                      <BookOpen className="w-4 h-4 text-slate-400" />
                    )}
                  </div>
                  <div className="text-left">
                    <p className={`text-sm font-bold transition-colors duration-300 ${
                      isSubOnly ? 'text-amber-300' : 'text-slate-300'
                    }`}>
                      {isSubOnly ? t('subOnlyRecord') : t('publicRecord')}
                    </p>
                    {isSubOnly && (
                      <p className="text-[10px] text-amber-400/70 mt-0.5">
                        {t('subOnlyDesc')}
                      </p>
                    )}
                  </div>
                </div>
                {/* 토글 스위치 */}
                <div className={`relative w-11 h-6 rounded-full transition-all duration-300 ${
                  isSubOnly ? 'bg-amber-500' : 'bg-slate-700'
                }`}>
                  <div className={`absolute top-0.5 w-5 h-5 rounded-full transition-all duration-300 ${
                    isSubOnly
                      ? 'left-[22px] bg-white shadow-[0_0_12px_rgba(245,158,11,0.4)]'
                      : 'left-0.5 bg-slate-400'
                  }`} />
                </div>
              </button>
            </div>
          )}

          {/* 3. 본문 입력 */}
          <div className="space-y-4 pt-2">
            {previewUrls.length > 0 && (
              <div className="grid grid-cols-3 gap-2 mb-4 overflow-x-auto pb-2 scrollbar-hide">
                {previewUrls.map((url, idx) => (
                  <div key={idx} className="relative aspect-square rounded-xl overflow-hidden border border-slate-700 bg-slate-800 group">
                    <img src={url} className="w-full h-full object-cover" />
                    <button 
                      onClick={() => removeImage(idx)}
                      className="absolute top-1 right-1 p-1 bg-black/60 text-white rounded-full opacity-0 group-hover:opacity-100 transition shadow-lg"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
                {previewUrls.length < 10 && (
                  <label className="flex flex-col items-center justify-center aspect-square rounded-xl border-2 border-dashed border-slate-800 hover:border-indigo-500/50 hover:bg-indigo-500/5 transition cursor-pointer group">
                    <input type="file" multiple accept="image/*" className="hidden" onChange={handleSelectFiles} disabled={isSubmitting} />
                    <Plus size={20} className="text-slate-600 group-hover:text-indigo-400 transition" />
                  </label>
                )}
              </div>
            )}

            <div className="relative">
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value.slice(0, 140))}
                maxLength={140}
                placeholder={t('placeholder')}
                className="w-full h-32 bg-slate-950/50 border border-slate-800 rounded-2xl p-4 pb-8 text-[15px] leading-relaxed text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 resize-none transition-all"
                disabled={isSubmitting}
              />
              <div className={`absolute bottom-3 right-4 text-xs font-medium transition-colors ${content.length >= 140 ? 'text-red-400' : 'text-slate-500'}`}>
                {content.length} / 140
              </div>
            </div>

            {/* 3.5. 태그 입력 (선택) */}
            <div className="space-y-2.5 pt-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-white/60">{t('topicTagsLabel')}</h3>
                <span className="text-[10px] text-slate-500">{tags.length} / 5</span>
              </div>
              
              {/* 태그 칩 리스트 */}
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 py-0.5">
                  {tags.map((tag, idx) => (
                    <div 
                      key={idx} 
                      className="flex items-center gap-1 px-2.5 py-1 bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs font-bold rounded-lg shadow-sm"
                    >
                      <span>#{tag}</span>
                      <button
                        type="button"
                        onClick={() => setTags(prev => prev.filter((_, i) => i !== idx))}
                        className="text-indigo-400/70 hover:text-rose-400 transition"
                      >
                        <X size={12} strokeWidth={2.5} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="relative flex items-center">
                <span className="absolute left-3 text-slate-500 font-bold text-sm">#</span>
                <input
                  type="text"
                  value={tagInput}
                  onChange={(e) => {
                    // 10자 제한
                    if (e.target.value.length <= 10) {
                      setTagInput(e.target.value)
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.nativeEvent.isComposing) return;
                    if (e.key === 'Enter' || e.key === ',' || e.key === ' ') {
                      e.preventDefault()
                      const cleanTag = tagInput.trim().replace(/[#, ]/g, '')
                      if (!cleanTag) return
                      
                      if (tags.length >= 5) {
                        setError(t('topicTagsLimit'))
                        return
                      }
                      
                      if (tags.includes(cleanTag)) {
                        setTagInput('')
                        return
                      }
                      
                      setError(null)
                      setTags(prev => [...prev, cleanTag])
                      setTagInput('')
                    }
                  }}
                  placeholder={tags.length >= 5 ? t('topicTagsLimit') : t('topicTagsPlaceholder')}
                  disabled={isSubmitting || tags.length >= 5}
                  className="w-full pl-7 pr-4 py-2.5 bg-slate-950/50 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all disabled:opacity-50"
                />
              </div>
            </div>

            {/* 기록 연결 패널 */}
            <div className="space-y-3 pt-2">
              <button
                type="button"
                onClick={() => setIsConnectPanelOpen(v => !v)}
                className={`w-full flex items-center justify-between p-3.5 rounded-xl border transition-all duration-300 ${
                  isConnectPanelOpen
                    ? 'bg-indigo-500/10 border-indigo-500/30'
                    : 'bg-slate-950/50 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-slate-300">🔗 {tTG('connectMyThought')}</span>
                  {connectedMoments.length > 0 && (
                    <span className="px-2 py-0.5 bg-indigo-500 text-white text-[10px] font-bold rounded-full">
                      {connectedMoments.length}
                    </span>
                  )}
                </div>
                <span className="text-xs text-slate-500">
                  {isConnectPanelOpen ? tTG('collapse') : tTG('expand')}
                </span>
              </button>

              {isConnectPanelOpen && (
                <div className="p-4 bg-slate-950/40 border border-slate-800/80 rounded-2xl space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                  {/* API 키 미등록 시 안내 UI */}
                  {hasApiKey === false ? (
                    <div className="flex flex-col items-center gap-3 py-4">
                      <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
                        <KeyRound size={20} className="text-amber-400" />
                      </div>
                      <div className="text-center space-y-1">
                        <p className="text-sm font-bold text-slate-300">{tTG('noApiKeyTitle')}</p>
                        <p className="text-[11px] text-slate-500 leading-relaxed">{tTG('noApiKeyDesc')}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          handleClose()
                          window.dispatchEvent(new CustomEvent('open-settings', { detail: { tab: 'ai' } }))
                        }}
                        className="px-4 py-2 bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-bold rounded-xl hover:bg-amber-500/20 transition"
                      >
                        {tTG('goToSettings')}
                      </button>
                    </div>
                  ) : (
                    <>
                      {/* 1. 수동으로 연결된 기록 리스트 */}
                      {connectedMoments.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-[11px] font-bold text-indigo-400">{tTG('connectedListTitle')}</p>
                          <div className="space-y-1.5">
                            {connectedMoments.map((m) => (
                              <div key={m.id} className="flex items-center justify-between p-2.5 bg-slate-900 border border-slate-800 rounded-xl text-xs">
                                <div className="flex-1 min-w-0 pr-2">
                                  <p className="text-slate-300 truncate font-medium">
                                    {m.content || '기록'}
                                  </p>
                                  <div className="text-[10px] text-slate-500 mt-0.5 flex items-center gap-1.5">
                                    <span>{tTG('relationTypeLabel')}</span>
                                    <span className={`font-bold ${
                                      m.relationType === 'extends' ? 'text-blue-400' :
                                      m.relationType === 'supports' ? 'text-emerald-400' : 'text-rose-400'
                                    }`}>
                                      {m.relationType === 'extends' ? `📖 ${tTG('extendsMini')}` :
                                       m.relationType === 'supports' ? `🤝 ${tTG('supportsMini')}` : `⚡ ${tTG('contradictsMini')}`}
                                    </span>
                                    {m.isPreset && <span className="px-1.5 py-0.5 bg-indigo-500/20 text-indigo-300 text-[9px] rounded font-bold">{tTG('presetBadge')}</span>}
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => setConnectedMoments(prev => prev.filter(x => x.id !== m.id))}
                                  className="p-1 text-slate-500 hover:text-rose-400 transition"
                                >
                                  <X size={14} />
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* 2. RAG 기반 실시간 과거 기록 추천 목록 */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-[11px] font-bold text-slate-400">{tTG('recommendTitle')}</p>
                          {isRecommending && <Loader2 size={12} className="animate-spin text-slate-500" />}
                        </div>

                        {recommendError ? (
                          <div className="flex items-start gap-2 p-2.5 bg-rose-500/10 border border-rose-500/20 rounded-xl">
                            <AlertCircle size={14} className="text-rose-400 shrink-0 mt-0.5" />
                            <p className="text-[11px] text-rose-300/80 leading-relaxed">{tTG('recommendError')}</p>
                          </div>
                        ) : recommendedMoments.length === 0 ? (
                          <p className="text-[11px] text-slate-500 py-2">
                            {content.trim() ? tTG('recommendEmpty') : tTG('recommendPlaceholder')}
                          </p>
                        ) : (
                          <div className="grid gap-2 grid-cols-1">
                            {recommendedMoments.map((m) => {
                              const isConnected = connectedMoments.some(x => x.id === m.id)
                              return (
                                <div key={m.id} className="p-3 bg-slate-900/60 border border-slate-800 rounded-xl space-y-2">
                                  <p className="text-xs text-slate-300 font-medium leading-relaxed">
                                    {m.content}
                                  </p>
                                  {!isConnected ? (
                                    <div className="flex gap-1">
                                      {(['extends', 'supports', 'contradicts'] as const).map((type) => (
                                        <button
                                          key={type}
                                          type="button"
                                          onClick={() => setConnectedMoments(prev => [
                                            ...prev,
                                            { id: m.id, content: m.content, relationType: type }
                                          ])}
                                          className="flex-1 py-1 rounded bg-slate-800 hover:bg-indigo-500/20 text-[10px] text-slate-400 hover:text-indigo-300 font-bold transition border border-slate-700/50"
                                        >
                                          {type === 'extends' ? `📖 ${tTG('extendsMini')}` :
                                           type === 'supports' ? `🤝 ${tTG('supportsMini')}` : `⚡ ${tTG('contradictsMini')}`}
                                        </button>
                                      ))}
                                    </div>
                                  ) : (
                                    <div className="flex justify-between items-center bg-indigo-500/10 border border-indigo-500/20 px-2 py-1 rounded">
                                      <span className="text-[10px] text-indigo-400 font-bold">✓ {tTG('alreadyConnected')}</span>
                                      <button
                                        type="button"
                                        onClick={() => setConnectedMoments(prev => prev.filter(x => x.id !== m.id))}
                                        className="text-[10px] text-slate-500 hover:text-rose-400 font-bold"
                                      >
                                        {tTG('disconnectLabel')}
                                      </button>
                                    </div>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
            
          <div className="flex justify-between items-center pt-2">
            <label className="flex items-center gap-2 text-sm text-slate-400 cursor-pointer hover:text-white transition group">
              <input type="file" multiple accept="image/*" className="hidden" onChange={handleSelectFiles} disabled={isSubmitting} />
              <div className="p-2.5 bg-slate-800 group-hover:bg-slate-700 rounded-xl transition shadow-lg">
                <UploadCloud size={20} />
              </div>
              <span className="text-xs">{pendingFiles.length > 0 ? t('addImage') : t('addMedia')}</span>
            </label>
          </div>

          {/* YouTube URL 입력 */}
          <div className="space-y-2 pt-1">
            <div className="flex items-center gap-2 relative">
              <Youtube size={16} className="absolute left-3 text-red-400 pointer-events-none" />
              <input
                type="url"
                value={youtubeUrl}
                onChange={(e) => setYoutubeUrl(e.target.value)}
                placeholder={t('youtubeUrl')}
                className="w-full pl-8 pr-4 py-2.5 bg-slate-950/50 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-red-500/50 focus:ring-1 focus:ring-red-500/30 transition-all"
                disabled={isSubmitting}
              />
              {youtubeUrl && (
                <button
                  onClick={() => setYoutubeUrl('')}
                  className="absolute right-2 text-slate-500 hover:text-white transition"
                >
                  <X size={14} />
                </button>
              )}
            </div>
            {/* YouTube 썸네일 미리보기 */}
            {youtubeId && (
              <div className="relative rounded-xl overflow-hidden border border-red-500/20 bg-slate-900/50">
                <img
                  src={`https://img.youtube.com/vi/${youtubeId}/mqdefault.jpg`}
                  alt="YouTube preview"
                  className="w-full aspect-video object-cover opacity-80"
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="bg-red-600/90 rounded-full p-2">
                    <Youtube size={20} className="text-white" />
                  </div>
                </div>
                <p className="absolute bottom-1 left-2 text-[10px] text-white/60 font-mono">{youtubeId}</p>
              </div>
            )}
          </div>

        </div>
      </div>
    </FullScreenModal>
  </div>
  )
}

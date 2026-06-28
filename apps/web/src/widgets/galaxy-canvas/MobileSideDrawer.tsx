'use client'

import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X, Check, LogOut, ChevronDown, ChevronRight, Settings, Star,
  Brain, Sparkles, Zap, Gem,
} from 'lucide-react'
import { useRouter } from '@/i18n/navigation'
import { useGalaxyStore } from '@/stores/galaxyStore'
import { useUserStore } from '@/entities/user/model/useUserStore'
import { useGalaxySystem } from '@/shared/hooks/useGalaxySystem'
import { useGalaxyNavigation } from '@/shared/hooks/useGalaxyNavigation'
import { logout as serverLogout } from '@/shared/lib/auth/actions'
import { createClient } from '@/shared/lib/supabase/browser'
import { galaxyConfirm } from '@/stores/dialogStore'
import type { GalaxyKey } from '@/shared/constants/galaxySystem'
import * as LucideIcons from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Logo } from '@/shared/ui/Logo'
import { LogoText } from '@/shared/ui/LogoText'
import { isNativeApp } from '@/shared/utils/isNativeApp'
import { requestHideTabBar, requestShowTabBar, sendToNative } from '@/shared/lib/bridge'
import { MOODS } from '@/shared/constants/moods'
import { SUPERNOVA_TIERS } from '@/shared/constants/supernova'
import { PERSONA_MAP } from '@/shared/constants/personas'
import { useTranslations } from 'next-intl'

const LUCIDE_MAP: Record<string, LucideIcon> = {
  Rocket: LucideIcons.Rocket, BookOpen: LucideIcons.BookOpen, Brain: LucideIcons.Brain,
  Star: LucideIcons.Star, Tornado: LucideIcons.Tornado, Orbit: LucideIcons.Orbit,
  Infinity: LucideIcons.Infinity, Lightbulb: LucideIcons.Lightbulb, Globe: LucideIcons.Globe,
  Activity: LucideIcons.Activity, Compass: LucideIcons.Compass, PenTool: LucideIcons.PenTool,
  Circle: LucideIcons.Circle,
}

interface MobileSideDrawerProps {
  isOpen: boolean
  onClose: () => void
  currentViewMode?: 'feed' | 'canvas'
}

export function MobileSideDrawer({ isOpen, onClose, currentViewMode }: MobileSideDrawerProps) {
  const t = useTranslations('Galaxy')
  const router = useRouter()
  const [openGalaxies, setOpenGalaxies] = useState<Record<string, boolean>>({})

  const toggleGalaxy = (key: string) => {
    setOpenGalaxies(prev => ({
      ...prev,
      [key]: !prev[key]
    }))
  }

  const isNative = isNativeApp()
  const hasRegistered = useRef(false)

  // ── 네이티브 탭바 숨김/표시 브릿지 ──
  useEffect(() => {
    if (!isNative) return

    if (isOpen && !hasRegistered.current) {
      hasRegistered.current = true
      requestHideTabBar()
    } else if (!isOpen && hasRegistered.current) {
      hasRegistered.current = false
      requestShowTabBar()
    }
  }, [isOpen, isNative])

  // 언마운트 시 안전 복구 (Fail-safe)
  useEffect(() => {
    return () => {
      if (hasRegistered.current && isNative) {
        hasRegistered.current = false
        requestShowTabBar()
      }
    }
  }, [isNative])

  const { galaxies, categoryMap } = useGalaxySystem()
  const { navigateToGalaxy } = useGalaxyNavigation()
  const galaxyKey = useGalaxyStore(s => s.galaxyKey)
  const activeCategory = useGalaxyStore(s => s.activeCategory)
  const user = useUserStore(s => s.user)
  const userLogout = useUserStore(s => s.logout)
  const backdropRef = useRef<HTMLDivElement>(null)

  // 현재 은하의 카테고리 목록
  const currentCategories = [...(categoryMap[galaxyKey] || [])].sort((a, b) => a.sortOrder - b.sortOrder)

  // ── 유저 지표 데이터 가공 ──
  const currentMood = user?.current_mood_id
    ? MOODS.find(m => m.id === user.current_mood_id) || null
    : null

  const supernovaTier = user?.supernova_tier
    ? SUPERNOVA_TIERS.find(t => t.id === user.supernova_tier) || null
    : null

  const personaConfig = user?.persona_code && user.persona_code !== 'STARTER'
    ? PERSONA_MAP[user.persona_code] || null
    : null

  const handleLogout = async () => {
    onClose()
    const ok = await galaxyConfirm({
      title: t('logoutTitle'),
      message: t('logoutMsg'),
      variant: 'warning',
      confirmText: t('logoutBtn'),
      confirmButtonClass: 'bg-white hover:bg-slate-100 text-slate-950 border border-slate-200 shadow-sm',
    })
    if (!ok) return
    try {
      // [FIX] 브라우저 쿠키(sb-pixelyf-auth.*)를 직접 삭제하여 OAuth 재로그인 시 잔여 쿠키 충돌 방지
      const supabase = createClient()
      await supabase.auth.signOut()
      userLogout()
      await serverLogout()
    } catch (e) {
      console.error('[SideDrawer] Logout error:', e)
    }
    // 네이티브 앱: 서버 세션 종료 후 네이티브 로그인 화면으로 전환
    if (isNativeApp()) {
      sendToNative({ type: 'SHOW_LOGIN' })
    }
  }

  const handleNavigate = (path: string) => {
    // 네이티브 앱에서 로그인 페이지 진입 시 → 네이티브 로그인 화면으로 전환
    if (path === '/auth/login' && isNativeApp()) {
      sendToNative({ type: 'SHOW_LOGIN' })
      return
    }
    router.push(path)
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* 백드롭 */}
          <motion.div
            ref={backdropRef}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm"
          />

          {/* 사이드 패널 */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed top-0 right-0 bottom-0 w-[300px] z-[110] bg-[#0b0f10]/95 backdrop-blur-xl border-l border-white/10 flex flex-col shadow-[-10px_0_40px_rgba(0,0,0,0.5)]"
            style={{ paddingBottom: isNative ? 45 : 0 }}
          >
            {/* 헤더 */}
            <div className="flex items-center justify-between px-4 h-14 border-b border-white/10 shrink-0">
              <div className="flex items-center gap-3">
                <Logo size="sm" />
                <LogoText size="sm" />
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg hover:bg-white/10 text-white/40 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 스크롤 영역 */}
            <div className="flex-1 overflow-y-auto">

              {/* ═══════════ ZONE 1: 프로필 카드 ═══════════ */}
              {user ? (
                <div className="p-4 pb-3">
                  {/* 아바타 + 닉네임 */}
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-11 h-11 rounded-full flex items-center justify-center shrink-0 border"
                      style={{
                        background: personaConfig
                          ? `linear-gradient(135deg, ${personaConfig.glowColorPrimary}33, ${personaConfig.glowColorSecondary}33)`
                          : 'rgba(99,102,241,0.15)',
                        borderColor: personaConfig
                          ? `${personaConfig.glowColorPrimary}55`
                          : 'rgba(99,102,241,0.3)',
                      }}
                    >
                      <span className="text-base font-black"
                        style={{ color: personaConfig?.glowColorPrimary || '#818CF8' }}
                      >
                        {(user.display_name || 'U')[0]}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-[#f8f9f9] truncate">{user.display_name || t('sideDefaultName')}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {/* 페르소나 뱃지 */}
                        {personaConfig && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-black tracking-wider"
                            style={{
                              background: `${personaConfig.glowColorPrimary}22`,
                              color: personaConfig.glowColorPrimary,
                              border: `1px solid ${personaConfig.glowColorPrimary}33`,
                            }}
                          >
                            {user.persona_code}
                          </span>
                        )}
                        {/* 초신성 등급 뱃지 */}
                        {supernovaTier && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-black"
                            style={{
                              background: `${supernovaTier.color}22`,
                              color: supernovaTier.color,
                              border: `1px solid ${supernovaTier.color}33`,
                            }}
                          >
                            <Sparkles className="w-2.5 h-2.5" />
                            {supernovaTier.label.split(' ')[0]}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                /* ── 비로그인: CTA 배너 ── */
                <div className="p-4 pb-3">
                  <button
                    onClick={() => handleNavigate('/auth/login')}
                    className="w-full p-4 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20 transition-all text-center"
                  >
                    <p className="text-sm font-bold text-[#f8f9f9]">로그인 하기</p>
                    <p className="text-[10px] text-white/40 mt-1">{t('sideJoinDesc')}</p>
                  </button>
                </div>
              )}

              {/* 구분선 */}
              <div className="mx-4 border-t border-white/5" />

              {/* ═══════════ ZONE 2: 우주 탐색 (트리 구조 아코디언) ═══════════ */}
              <div className="p-4 pb-2">
                <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest mb-3">{t('sideExplore')}</p>
                <div className="space-y-1">
                  {galaxies.map(galaxy => {
                    const key = galaxy.key as GalaxyKey
                    const isGalaxyActive = galaxyKey === key
                    const isOpenState = openGalaxies[key] || false
                    const IconComp = (galaxy.icon && LUCIDE_MAP[galaxy.icon]) || LucideIcons.Circle
                    const cats = categoryMap[key] || []

                    return (
                      <div key={key} className="flex flex-col gap-0.5">
                        {/* 부모 노드: 은하 토글 버튼 */}
                        <button
                          onClick={() => toggleGalaxy(key)}
                          className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-all ${
                            isGalaxyActive && !isOpenState
                              ? 'bg-[var(--color-hot-magenta)]/10 border border-[var(--color-hot-magenta)]/20 text-white'
                              : 'text-white/70 hover:bg-white/5 border border-transparent'
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            {galaxy.icon === 'Rocket' ? (
                              <Logo size="xs" animate={false} />
                            ) : (
                              <IconComp className={`w-4 h-4 ${isGalaxyActive ? 'text-[var(--color-hot-magenta)]' : 'text-white/50'}`} />
                            )}
                            <span className="text-sm font-bold text-white">{galaxy.name}</span>
                          </div>
                          {isOpenState ? <ChevronDown className="w-4 h-4 text-white/30" /> : <ChevronRight className="w-4 h-4 text-white/30" />}
                        </button>

                        {/* 자식 노드: 카테고리 (아코디언 애니메이션) */}
                        <AnimatePresence initial={false}>
                          {isOpenState && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.2 }}
                              className="overflow-hidden"
                            >
                              <div className="pl-6 pr-1 py-1 flex flex-col gap-0.5">
                                {/* 카테고리: 전체 */}
                                <button
                                  onClick={() => {
                                    navigateToGalaxy(key, null)
                                    onClose()
                                  }}
                                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-sm font-medium transition-all ${
                                    isGalaxyActive && activeCategory === null
                                      ? 'bg-[var(--color-hot-magenta)]/15 text-[var(--color-hot-magenta)]'
                                      : 'text-white/40 hover:bg-white/5 hover:text-white/60'
                                  }`}
                                >
                                  <span>{t('allCategory')}</span>
                                  {isGalaxyActive && activeCategory === null && <Check className="w-3 h-3 text-[var(--color-hot-magenta)]" />}
                                </button>

                                {/* 카테고리: 개별 목록 */}
                                {[...cats].sort((a, b) => a.sortOrder - b.sortOrder).map(cat => (
                                  <button
                                    key={cat.key}
                                    onClick={() => {
                                      navigateToGalaxy(key, cat.key)
                                      onClose()
                                    }}
                                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-sm font-medium transition-all ${
                                      isGalaxyActive && activeCategory === cat.key
                                        ? 'bg-[var(--color-hot-magenta)]/15 text-[var(--color-hot-magenta)]'
                                        : 'text-white/40 hover:bg-white/5 hover:text-white/60'
                                    }`}
                                  >
                                    <span>{cat.name}</span>
                                    {isGalaxyActive && activeCategory === cat.key && <Check className="w-3 h-3 text-[var(--color-hot-magenta)]" />}
                                  </button>
                                ))}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* 구분선 */}
              <div className="mx-4 border-t border-white/5" />

              {/* ═══════════ ZONE 3: 내 활동 ═══════════ */}
              {user && (
                <div className="p-4 pb-2 space-y-1">
                  <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest mb-3">{t('sideMyActivity')}</p>

                  {/* 설정 */}
                  <button
                    onClick={() => {
                      onClose()
                      router.push('/settings')
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium text-white/70 hover:bg-white/5 hover:text-white transition-all group"
                  >
                    <LucideIcons.Settings className="w-4 h-4 text-white/70 group-hover:text-white transition-colors" />
                    <span>{t('sideSettings')}</span>
                  </button>

                  {/* 알림 센터 */}
                  <button
                    onClick={() => {
                      onClose()
                      setTimeout(() => {
                        window.dispatchEvent(new CustomEvent('OPEN_NOTIFICATION_PANEL'))
                      }, 50)
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium text-white/70 hover:bg-white/5 hover:text-white transition-all group"
                  >
                    <LucideIcons.Bell className="w-4 h-4 text-white/70 group-hover:text-white transition-colors" />
                    <span>알림 센터</span>
                  </button>

                  {/* 캔버스 / 피드 전환 */}
                  {currentViewMode === 'canvas' ? (
                    <button
                      onClick={() => {
                        onClose()
                        setTimeout(() => {
                          window.dispatchEvent(new CustomEvent('NAVIGATE_TAB', { detail: 'feed' }))
                        }, 50)
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium text-white/70 hover:bg-white/5 hover:text-white transition-all group"
                    >
                      <LucideIcons.BookOpen className="w-4 h-4 text-white/70 group-hover:text-white transition-colors" />
                      <span>생각 피드로 이동</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        onClose()
                        setTimeout(() => {
                          window.dispatchEvent(new CustomEvent('NAVIGATE_TAB', { detail: 'canvas' }))
                        }, 50)
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium text-white/70 hover:bg-white/5 hover:text-white transition-all group"
                    >
                      <LucideIcons.Compass className="w-4 h-4 text-white/70 group-hover:text-white transition-colors" />
                      <span>캔버스 지도로 이동</span>
                    </button>
                  )}
                </div>
              )}

              {/* 구분선 */}
              <div className="mx-4 border-t border-white/5" />

              {/* ═══════════ ZONE 4: 시스템 ═══════════ */}
              <div className="p-4 pb-12 space-y-1">
                <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest mb-3">{t('sideSystem')}</p>

                {/* 브랜드 스토리 */}
                <button
                  onClick={() => handleNavigate('/about')}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium text-white/70 hover:bg-white/5 hover:text-white transition-all group"
                >
                  <Star className="w-4 h-4 text-white/70 group-hover:text-white transition-colors" />
                  <span>{t('sideBrandStory')}</span>
                </button>

                {/* 관리자 대시보드 */}
                {user?.role === 'admin' && (
                  <button
                    onClick={() => handleNavigate('/admin')}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium text-white/70 hover:bg-white/5 hover:text-white transition-all group"
                  >
                    <Settings className="w-4 h-4 text-white/70 group-hover:text-white transition-colors" />
                    <span>{t('sideAdminDashboard')}</span>
                  </button>
                )}

                {/* 로그아웃 / 로그인 */}
                {user ? (
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium text-red-400/70 hover:bg-red-500/10 hover:text-red-400 transition-all mt-2 group"
                  >
                    <LogOut className="w-4 h-4 text-red-400/70 group-hover:text-red-400 transition-colors" />
                    <span>{t('sideLogout')}</span>
                  </button>
                ) : (
                  <button
                    onClick={() => handleNavigate('/auth/login')}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium text-white/70 hover:bg-white/5 hover:text-white transition-all mt-2 group"
                  >
                    <LucideIcons.LogIn className="w-4 h-4 text-white/70 group-hover:text-white transition-colors" />
                    <span>{t('sideLogin')}</span>
                  </button>
                )}
              </div>
            </div>

            {/* 하단 이메일 표시 */}
            {user && (
              <div className="px-4 py-3 border-t border-white/5 shrink-0">
                <p className="text-[10px] text-white/20 truncate text-center">{user.email || ''}</p>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

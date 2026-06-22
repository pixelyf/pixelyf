'use client'

import { Link, useRouter, usePathname } from '@/i18n/navigation'
import { useState, useRef, useEffect, useMemo, useCallback, useTransition } from 'react'
import { Rocket, BookOpen, Brain, ChevronDown, Check, Languages, LogOut, PenTool, Star, Tornado, Orbit, Infinity, Lightbulb, Globe, Activity, Compass, Circle, Menu, Search, Plus, Zap, TrendingUp, Target, Coffee, Heart, Users, Bell, User, Hand, MessageCircle, Megaphone, Mail, Pin } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useGalaxyStore } from '@/stores/galaxyStore'
import { useUserStore } from '@/entities/user/model/useUserStore'
import { logout as serverLogout } from '@/shared/lib/auth/actions'
import { createClient } from '@/shared/lib/supabase/browser'
import { galaxyConfirm, galaxyAlert } from '@/stores/dialogStore'
import { VISUAL_SCALE } from '@/shared/constants/personas'
import { CAMERA_ZOOM } from '@/shared/constants/camera'
import type { GalaxyKey } from '@/shared/constants/galaxySystem'
import { AiOnboardingModal } from '@/widgets/ai-onboarding/AiOnboardingModal'
import { useGalaxySystem } from '@/shared/hooks/useGalaxySystem'
import { useGalaxyNavigation } from '@/shared/hooks/useGalaxyNavigation'
import { useMediaQuery } from '@/shared/hooks/useMediaQuery'
import { Logo } from '@/shared/ui/Logo'
import { LogoText } from '@/shared/ui/LogoText'
import { LogoSpinner } from '@/shared/ui/LogoSpinner'
import { useTranslations, useLocale } from 'next-intl'
import { SUPPORTED_LOCALES, LANGUAGE_LABELS, Locale } from '@/i18n/routing'
import { useNotificationCount } from '@/shared/hooks/useNotificationCount'
import { stripLocalePrefix } from '@/shared/lib/i18n/stripLocalePrefix'

interface NotificationItem {
  id: string
  type: string
  title: string
  body: string
  link?: string | null
  is_read: boolean
  created_at: string
}

// DB 아이콘명 → Lucide 컴포넌트 매핑
const LUCIDE_ICON_MAP: Record<string, LucideIcon> = {
  Rocket, BookOpen, Brain, Star, Tornado, Orbit, Infinity, Lightbulb, Globe, Activity, Compass, PenTool, Circle, Zap, TrendingUp, Target, Coffee, Heart, Users
}
function resolveLucideIcon(iconName: string | null): LucideIcon {
  return (iconName && LUCIDE_ICON_MAP[iconName]) || Circle
}



interface GalaxyHeaderProps {
  onSearch?: (query: string) => void
  title?: string
  hideSwitcher?: boolean
  onMenuOpen?: () => void
  onSearchOpen?: () => void
}

export function GalaxyHeader({ onSearch, title, hideSwitcher, onMenuOpen, onSearchOpen }: GalaxyHeaderProps) {
  const isMobile = useMediaQuery('(max-width: 767px)')
  const { galaxies: dynamicGalaxies } = useGalaxySystem()
  const { navigateToGalaxy } = useGalaxyNavigation()
  const galaxyKey = useGalaxyStore((s) => s.galaxyKey)
  const activeCategory = useGalaxyStore((s) => s.activeCategory)
  const { unreadCount, refreshCount } = useNotificationCount()
  const setGalaxyKey = useGalaxyStore((s) => s.setGalaxyKey)
  const setActiveCategory = useGalaxyStore((s) => s.setActiveCategory)
  const user = useUserStore((s) => s.user)
  const isUserLoading = useUserStore((s) => s.isLoading)
  const userInitialize = useUserStore((s) => s.initialize)
  const userLogout = useUserStore((s) => s.logout)
  const setIsMomentModalOpen = useGalaxyStore((s) => s.setIsMomentModalOpen)
  const router = useRouter()
  const pathname = usePathname()
  const locale = useLocale()
  const [isPending, startTransition] = useTransition()
  const [lang, setLang] = useState<Locale>((locale as Locale) || 'ko')
  const [isLangOpen, setIsLangOpen] = useState(false)
  const [isCategoryOpen, setIsCategoryOpen] = useState(false)
  const [isAiOnboardingOpen, setIsAiOnboardingOpen] = useState(false)
  const langRef = useRef<HTMLDivElement>(null)
  const categoryRef = useRef<HTMLDivElement>(null)
  const notifRef = useRef<HTMLDivElement>(null)
  const [isNotifOpen, setIsNotifOpen] = useState(false)
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [notifLoading, setNotifLoading] = useState(false)
  const [notifFilter, setNotifFilter] = useState<string>('ALL')

  // [알림 인터랙션] 벨 흔들림 애니메이션 트리거
  const [animateBell, setAnimateBell] = useState(false)
  const prevUnreadCountRef = useRef(unreadCount)
  const setActiveDmRoomId = useGalaxyStore(s => s.setActiveDmRoomId)

  useEffect(() => {
    if (unreadCount > prevUnreadCountRef.current) {
      setAnimateBell(true)
      const timer = setTimeout(() => setAnimateBell(false), 1000)
      return () => clearTimeout(timer)
    }
    prevUnreadCountRef.current = unreadCount
  }, [unreadCount])

  // [RESPONSIVE HEADER] 컨테이너 너비 기반 반응형 처리 (판넬 오픈 대응)
  const [headerWidth, setHeaderWidth] = useState(10000) // 초기 깜빡임 방지
  const resizeObserverRef = useRef<ResizeObserver | null>(null)

  const headerRef = useCallback((node: HTMLElement | null) => {
    if (resizeObserverRef.current) {
      resizeObserverRef.current.disconnect()
    }
    if (node) {
      resizeObserverRef.current = new ResizeObserver((entries) => {
        if (entries[0]) {
          setHeaderWidth(entries[0].contentRect.width)
        }
      })
      resizeObserverRef.current.observe(node)
    }
  }, [])

  const isCompactMobile = isMobile || headerWidth <= 750
  const isCompactText = headerWidth <= 920

  const fetchNotifications = useCallback(async () => {
    setNotifLoading(true)
    try {
      const res = await fetch('/api/notifications')
      if (res.ok) {
        const data = await res.json()
        setNotifications(data.notifications || [])
      }
    } catch (e) {
      console.error('[Notif] fetch error:', e)
    } finally {
      setNotifLoading(false)
    }
  }, [])

  const handleNotifToggle = useCallback(() => {
    const next = !isNotifOpen
    setIsNotifOpen(next)
    if (next) fetchNotifications()
  }, [isNotifOpen, fetchNotifications])

  const handleMarkAsRead = useCallback(async (id: string) => {
    await fetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notificationId: id }),
    })
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n))
    refreshCount()
  }, [refreshCount])

  const handleMarkAllAsRead = useCallback(async () => {
    await fetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ markAll: true }),
    })
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
    refreshCount()
  }, [refreshCount])

  useEffect(() => {
    if (!user) userInitialize()
  }, [user, userInitialize])

  // [ARCHITECTURE REFACTOR] 렌더링 엔진(spatialGrid)의 Viewport 종속성을 제거하고 전역 상태(useUserStore)에서 바로 가져옴
  const currentCoord = user?.coordinates?.[galaxyKey] || user?.coordinates?.[galaxyKey?.toUpperCase()] || user?.coordinates?.[galaxyKey?.toLowerCase()]
  const t = useTranslations('Galaxy')
  const displayName = currentCoord?.display_name || user?.display_name || t('defaultPixelName')
  const avatarUrl = currentCoord?.avatar_url || user?.avatar_url

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (langRef.current && !langRef.current.contains(e.target as Node)) {
        setIsLangOpen(false)
      }
      if (categoryRef.current && !categoryRef.current.contains(e.target as Node)) {
        setIsCategoryOpen(false)
      }
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setIsNotifOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // [AI 은하] open-ai-onboarding 커스텀 이벤트 수신 → AiOnboardingModal 열기
  useEffect(() => {
    const handler = () => setIsAiOnboardingOpen(true)
    window.addEventListener('open-ai-onboarding', handler)
    return () => window.removeEventListener('open-ai-onboarding', handler)
  }, [])

  const handleLogout = async () => {
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
      console.error('[Header] Logout error:', e)
    }
  }

  // ── 모바일: 간소화 헤더 ──
  if (isCompactMobile) {
    const currentGalaxy = dynamicGalaxies.find(g => g.key === galaxyKey)
    const galaxyName = currentGalaxy?.name || galaxyKey

    return (
      <>
      <header ref={headerRef} className="pointer-events-auto w-full shrink-0 z-[40] flex items-center justify-between px-4 h-14 backdrop-blur-md" style={{ backgroundColor: 'var(--color-midnight-ink)', borderBottom: '1px solid var(--color-slate-edge)' }}>
        {/* 좌측: 로고 + 이름 */}
        <div className="flex items-center gap-[5px]">
          <Logo size="sm" animate={false} />
          <LogoText size="sm" />
        </div>

        {/* 우측: 🔍 + 👤 + ☰ */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={onSearchOpen}
            className="p-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-all active:scale-90"
          >
            <Search className="w-6 h-6" />
          </button>

          {isUserLoading ? (
            <LogoSpinner size={20} variant="white" />
          ) : user ? (
            <button
              onClick={async () => {
                const store = useGalaxyStore.getState()
                // [UX 개선] 생각그래프 상태라면 픽셀리어 모드로 복귀
                if (store.viewMode === 'thoughtGraph') {
                  store.setViewMode('pixelyer')
                }
                store.setPreloadedPixelData({
                  pixelId: user.id,
                  coordX: 0,
                  coordY: 0,
                  displayName: displayName,
                  country: (user as any).country,
                  personaCode: user.persona_code,
                  supernovaTier: user.supernova_tier || undefined,
                  glowColorPrimary: '#818CF8',
                  glowColorSecondary: '#C084FC',
                })
                store.selectPixel(user.id)
              }}
              className="flex items-center justify-center w-8 h-8 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 transition-all active:scale-90 overflow-hidden"
            >
              {avatarUrl ? (
                <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                <span className="text-xs text-indigo-300 font-bold">{displayName[0] || 'U'}</span>
              )}
            </button>
          ) : (
            <Link
              href="/auth/login"
              className="p-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-all active:scale-90"
            >
              <User className="w-6 h-6" />
            </Link>
          )}

          {/* 햄버거 메뉴 (우측으로 이동) */}
          <button
            onClick={onMenuOpen}
            className="p-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-all active:scale-90"
          >
            <Menu className="w-6 h-6" />
          </button>
        </div>
      </header>

      <AiOnboardingModal
        isOpen={isAiOnboardingOpen}
        onClose={() => setIsAiOnboardingOpen(false)}
      />
      </>
    )
  }

  // ── 데스크탑: 기존 헤더 ──
  return (
    <>
    <header ref={headerRef} className="pointer-events-auto relative w-full shrink-0 z-[40] flex items-center justify-between px-4 h-14 bg-midnight-ink/80 backdrop-blur-md border-b border-slate-edge">
      {/* ── 좌측: 로고 (클릭 → 현재 은하 중심으로 카메라 이동) ── */}
      <button
        data-tour="logo"
        onClick={() => {
          const currentGalaxy = dynamicGalaxies.find(g => g.key === galaxyKey)
          const center = currentGalaxy ? { x: currentGalaxy.centerX, y: currentGalaxy.centerY } : { x: 0, y: 0 }
          useGalaxyStore.getState().focusOnPosition(
            center.x * VISUAL_SCALE,
            center.y * VISUAL_SCALE,
            CAMERA_ZOOM.GALAXY_OVERVIEW
          )
          // [FIX] SEO URL 정리: pixel/feed 등 쿼리 파라미터 제거
          const cleanUrl = window.location.pathname // locale prefix 포함되어도 안전 (쿼리 파라미터만 제거)
          window.history.replaceState({}, '', cleanUrl)
          // 선택된 픽셀 해제 (사이드 패널 닫기)
          useGalaxyStore.getState().selectPixel(null)
        }}
        className="flex items-center gap-3 shrink-0 group cursor-pointer"
      >
        <Logo size="sm" className="group-hover:scale-110 transition-transform" />
        <LogoText size="sm" />
        {title && (
          <div className="flex items-center gap-2 fade-in">
            <div className="h-4 w-[1.5px] bg-white/20 mx-1" />
            <span className="text-sm font-bold text-white/70 tracking-tight whitespace-nowrap bg-white/5 px-2 py-0.5 rounded-md border border-white/10 uppercase">
              {title}
            </span>
          </div>
        )}
      </button>

      {/* ── 중앙: 은하 이동 메뉴 (동적 DB 기반) ── */}
      <nav data-tour="galaxy-nav" className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center">
        <div className="flex items-center gap-1">
          {dynamicGalaxies.map((galaxy) => {
            const key = galaxy.key as GalaxyKey
            const Icon = resolveLucideIcon(galaxy.icon)
            const isActive = galaxyKey === key
            const hasCategoryDropdown = galaxy.categories.length > 0
            return (
              <div key={key} className="relative" ref={isActive && hasCategoryDropdown ? categoryRef : undefined}>
                <button
                  onClick={() => {
                    if (isActive && hasCategoryDropdown) {
                      setIsCategoryOpen(!isCategoryOpen)
                      return
                    }
                    if (isActive) return
                    setIsCategoryOpen(false)
                    navigateToGalaxy(key)
                  }}
                  className={`relative flex items-center gap-1.5 px-3 py-2 text-sm font-bold transition-all duration-200 ${
                    isActive
                      ? 'text-white'
                      : 'text-white/60 hover:text-white'
                  }`}
                >
                  {galaxy.icon === 'Rocket' ? (
                    <Logo size="xs" animate={false} />
                  ) : (
                    <Icon className={`w-4 h-4 ${isActive ? 'text-hot-magenta' : ''}`} />
                  )}
                  <span className={isCompactText ? 'hidden' : 'hidden lg:inline'}>{galaxy.name}</span>
                  {isActive && hasCategoryDropdown && (
                    <ChevronDown className={`w-3 h-3 opacity-50 transition-transform duration-200 ${isCategoryOpen ? 'rotate-180' : ''}`} />
                  )}
                </button>
                {/* 카테고리 드롭다운 (DB 동적) */}
                {isActive && isCategoryOpen && hasCategoryDropdown && (
                  <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-44 bg-deep-space rounded-2xl p-2 border border-slate-edge animate-in fade-in zoom-in duration-200 z-50">
                    <button
                      onClick={() => { navigateToGalaxy(key, null); setIsCategoryOpen(false) }}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-lg transition-all text-sm font-bold ${
                        activeCategory === null ? 'bg-white text-slate-950 shadow-sm' : 'hover:bg-white/5 text-white/50 hover:text-white'
                      }`}
                    >
                      <span>{t('allCategory')}</span>
                      {activeCategory === null && <Check className="w-3.5 h-3.5 text-slate-950" />}
                    </button>
                    {galaxy.categories.map((cat) => (
                      <button
                        key={cat.key}
                        onClick={() => { navigateToGalaxy(key, cat.key); setIsCategoryOpen(false) }}
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-lg transition-all text-sm font-bold ${
                          activeCategory === cat.key ? 'bg-white text-slate-950 shadow-sm' : 'hover:bg-white/5 text-white/50 hover:text-white'
                        }`}
                      >
                        <span>{cat.name}</span>
                        {activeCategory === cat.key && <Check className="w-3.5 h-3.5 text-slate-950" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </nav>

      {/* ── 우측: 언어 → 기록 → 유저 ── */}
      <div className="flex items-center gap-2 shrink-0">
        {/* 언어 선택기 */}
        <div data-tour="lang-selector" className="relative" ref={langRef}>
          <button
            onClick={() => setIsLangOpen(!isLangOpen)}
            className="h-9 flex items-center gap-1.5 px-3 rounded-lg border border-white/20 bg-white/10 hover:bg-white/15 text-white/75 hover:text-white transition-all active:scale-95"
          >
            <Languages className="w-4 h-4" />
            <span className="text-sm font-normal whitespace-nowrap hidden sm:inline">
              {LANGUAGE_LABELS[lang]}
            </span>
            <ChevronDown className={`w-3 h-3 opacity-60 transition-transform duration-300 ${isLangOpen ? 'rotate-180' : ''}`} />
          </button>

          {isLangOpen && (
            <div className="absolute top-full right-0 mt-3 w-40 bg-deep-space rounded-2xl p-2 border border-slate-edge animate-in fade-in zoom-in duration-200">
              <div className="space-y-1">
                {SUPPORTED_LOCALES.map((l) => (
                  <button
                    key={l}
                    disabled={isPending}
                    onClick={() => {
                      setLang(l)
                      setIsLangOpen(false)
                      startTransition(() => {
                        router.replace(pathname, { locale: l })
                      })
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg transition-all text-sm font-medium ${
                      lang === l ? 'bg-white text-slate-950 font-bold shadow-sm' : 'hover:bg-white/5 text-white/50 hover:text-white'
                    }`}
                  >
                    <span>{LANGUAGE_LABELS[l]}</span>
                    {lang === l && <Check className="w-3 h-3" />}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 도움말 (투어 가이드) 버튼 */}
        <button
          onClick={() => {
            const store = useGalaxyStore.getState()
            if (!store.isSearchFeedOpen) {
              store.setIsSearchFeedOpen(true)
            }
            if (store.selectedPixelId) {
              store.selectPixel(null)
            }
            store.setIsTourOpen(true)
          }}
          className="hidden lg:flex h-9 w-9 items-center justify-center rounded-lg border border-white/20 bg-white/10 hover:bg-white/15 text-white/75 hover:text-white transition-all active:scale-95 group"
          aria-label="Help"
          title="Help"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-4.5 h-4.5 text-white/75 group-hover:text-white transition-colors"
          >
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </button>

        {/* 생각 기록하기 아이콘 */}
        {user && (
          <button
            data-tour="btn-record"
            onClick={() => {
              useGalaxyStore.getState().setReviewTargetPixelId(null)
              setIsMomentModalOpen(true)
            }}
            className="h-9 w-9 flex items-center justify-center rounded-lg border border-white/20 bg-white/10 hover:bg-white/15 text-white/75 hover:text-white transition-all active:scale-95 group"
            aria-label={t('record')}
            title={t('record')}
          >
            <Plus className="w-4 h-4 text-white/75 group-hover:text-white transition-colors" />
          </button>
        )}

        {/* 알림 아이콘 + 드롭다운 */}
        {user && (
          <div data-tour="btn-notification" className="relative" ref={notifRef}>
            <button
              onClick={handleNotifToggle}
              className="relative h-9 w-9 flex items-center justify-center rounded-lg border border-white/20 bg-white/10 hover:bg-white/15 text-white/75 hover:text-white transition-all active:scale-95"
              aria-label={t('notification')}
              title={t('notification')}
            >
              <Bell className={`w-4 h-4 ${animateBell ? 'animate-bell-shake' : ''}`} />
              {unreadCount > 0 && (
                <span className={`absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 flex items-center justify-center bg-red-500 text-white text-xs font-bold rounded-full ring-2 ring-slate-950 ${animateBell ? 'animate-badge-pulse' : ''}`}>
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>

            {isNotifOpen && (
              <div className="absolute top-full right-0 mt-3 w-96 bg-deep-space rounded-none border border-slate-edge animate-in fade-in zoom-in duration-200 z-50 overflow-hidden">
                {/* 헤더 */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-edge">
                  <span className="text-sm font-bold text-white">{t('notification')}</span>
                  {unreadCount > 0 && (
                    <button
                      onClick={handleMarkAllAsRead}
                      className="text-sm text-hot-magenta hover:text-hot-magenta/80 font-medium transition-colors"
                    >
                      {t('markAllRead')}
                    </button>
                  )}
                </div>

                {/* 카테고리 필터 탭 */}
                <div className="flex gap-1 px-3 py-2 border-b border-slate-edge">
                  {[
                    { key: 'ALL', labelKey: 'filterAll' as const },
                    { key: 'INTERACTION', labelKey: 'filterInteraction' as const },
                    { key: 'SOCIAL', labelKey: 'filterSocial' as const },
                    { key: 'SUBSCRIPTION', labelKey: 'filterSubscription' as const },
                  ].map(({ key, labelKey }) => (
                    <button
                      key={key}
                      onClick={() => setNotifFilter(key)}
                      className={`px-2.5 py-1.5 rounded-full text-sm transition-all ${
                        notifFilter === key
                          ? 'bg-hot-magenta text-white font-bold'
                          : 'text-white hover:text-white hover:bg-white/10'
                      }`}
                    >
                      {t(labelKey)}
                    </button>
                  ))}
                </div>

                {/* 알림 목록 */}
                <div className="max-h-80 overflow-y-auto custom-scrollbar">
                  {notifLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <LogoSpinner size={20} />
                    </div>
                  ) : (() => {
                    const NOTIF_FILTER_MAP: Record<string, string[]> = {
                      INTERACTION: ['TOUCH', 'PING'],
                      SOCIAL: ['COMMENT', 'BOND'],
                      SUBSCRIPTION: ['SUBSCRIPTION'],
                    }
                    const TYPE_ICON_MAP: Record<string, LucideIcon> = {
                      TOUCH: Hand, PING: Zap, COMMENT: MessageCircle, BOND: Users,
                      SYSTEM: Megaphone, SUBSCRIPTION: BookOpen, DM: Mail,
                    }
                    const filtered = notifFilter === 'ALL'
                      ? notifications
                      : notifications.filter(n => NOTIF_FILTER_MAP[notifFilter]?.includes(n.type))
                    
                    return filtered.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-10 text-slate-500">
                        <Bell className="w-8 h-8 mb-2 opacity-30" />
                        <span className="text-sm">{t('noNotifications')}</span>
                      </div>
                    ) : (
                      filtered.map((n) => {
                        const TypeIcon = TYPE_ICON_MAP[n.type] || Pin
                        return (
                        <div
                          key={n.id}
                          onClick={async () => {
                            if (!n.is_read) handleMarkAsRead(n.id)
                            if (n.link) {
                              setIsNotifOpen(false)
                              
                              try {
                                const url = new URL(n.link, window.location.origin)
                                const dmId = url.searchParams.get('dm')
                                const pixelId = url.searchParams.get('pixel')
                                const feedId = url.searchParams.get('feed')
                                
                                // 1. DM 알림 인라인 처리
                                if (dmId) {
                                  setActiveDmRoomId(dmId)
                                  return
                                }
                                
                                // 2. 픽셀 또는 피드 알림 인라인 처리
                                if (pixelId) {
                                  // 2-1. 은하 도메인(Key) 판별 및 shallow routing 전환
                                  const cleanPath = stripLocalePrefix(url.pathname)
                                  const segment = cleanPath.split('/')[1] || ''
                                  let targetGalaxy = dynamicGalaxies.find(g => g.partnerCode?.toLowerCase() === segment.toLowerCase())
                                  if (!targetGalaxy && !segment) {
                                    targetGalaxy = dynamicGalaxies.find(g => g.isRoot)
                                  }
                                  const targetGalaxyKey = targetGalaxy?.key || 'PIXELYF'
                                  
                                  // 목표 은하가 현재 활성 은하와 다르면 shallow routing으로 은하 전환
                                  if (targetGalaxyKey !== galaxyKey) {
                                    await navigateToGalaxy(targetGalaxyKey)
                                  }
                                  
                                  // 2-2. 픽셀 좌표 획득 및 카메라 워프
                                  const store = useGalaxyStore.getState()
                                  
                                  // 생각그래프 상태라면 픽셀리어 모드로 복구
                                  if (store.viewMode === 'thoughtGraph') {
                                    store.setViewMode('pixelyer')
                                  }
                                  
                                  const pixel = store.spatialGrid?.getPixel(pixelId)
                                  let targetX: number | null = null
                                  let targetY: number | null = null
                                  
                                  if (pixel && pixel.coordX != null && pixel.coordY != null) {
                                    targetX = pixel.coordX
                                    targetY = pixel.coordY
                                  } else {
                                    // SpatialGrid에 없거나 미로딩 상태라면 좌표 API 조회
                                    try {
                                      const res = await fetch(`/api/users/${pixelId}/coordinates`)
                                      if (res.ok) {
                                        const data = await res.json()
                                        const galaxyCoord = data.coordinates?.[targetGalaxyKey] || data.coordinates?.[targetGalaxyKey?.toUpperCase()] || data.coordinates?.[targetGalaxyKey?.toLowerCase()]
                                        if (galaxyCoord) {
                                          targetX = galaxyCoord.coordX * VISUAL_SCALE
                                          targetY = galaxyCoord.coordY * VISUAL_SCALE
                                        }
                                      }
                                    } catch (e) {
                                      console.warn('[Header] 알림 대상 좌표 API 조회 실패:', e)
                                    }
                                  }
                                  
                                  // 2-3. 카메라 이동 및 픽셀 선택, 피드 타겟 지정
                                  if (targetX != null && targetY != null) {
                                    store.focusOnPosition(targetX, targetY, CAMERA_ZOOM.PIXEL_FOCUS, true)
                                  }
                                  
                                  // 피드/댓글 알림인 경우 피드 상세 spotlight 설정
                                  if (feedId) {
                                    store.setTargetFeedItem({ id: pixelId, momentId: feedId })
                                  } else {
                                    store.setTargetFeedItem(null)
                                  }
                                  
                                  store.selectPixel(pixelId)
                                  return
                                }
                              } catch (err) {
                                console.error('[Header] 알림 인라인 내비게이션 에러:', err)
                              }
                              
                              // fallback
                              window.location.href = n.link
                            }
                          }}
                          className={`group w-full text-left px-4 py-3 border-b border-slate-edge last:border-b-0 hover:bg-white/10 transition-colors cursor-pointer flex items-start gap-2 justify-between ${
                            n.is_read ? 'opacity-50' : ''
                          }`}
                        >
                          <div className="flex items-start gap-2 flex-1 min-w-0">
                            {/* 타입 아이콘 */}
                            <TypeIcon className="w-4 h-4 text-white/40 mt-0.5 shrink-0" />
                            
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold text-white leading-snug">{n.title}</p>
                              <p className="text-sm text-slate-200 mt-1 leading-relaxed">{n.body}</p>
                              <p className="text-sm text-slate-400 mt-1.5">
                                {new Date(n.created_at).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                              </p>
                            </div>
                          </div>

                          {/* 삭제 버튼 (hover 시 노출, 이벤트 버블링 차단) */}
                          <button
                            onClick={async (e) => {
                              e.stopPropagation()
                              try {
                                await fetch('/api/notifications', {
                                  method: 'DELETE',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ notificationId: n.id }),
                                })
                                setNotifications(prev => prev.filter(item => item.id !== n.id))
                                refreshCount()
                              } catch (err) {
                                console.error('[GalaxyHeader] Delete notification error:', err)
                              }
                            }}
                            className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-500/10 transition-all shrink-0 ml-2 self-start"
                            title={t('deleteNotif')}
                          >
                            <span className="text-sm text-white/20 hover:text-red-400">✕</span>
                          </button>
                        </div>
                      )
                      })
                    )
                  })()}
                </div>

                {/* 전체 보기 버튼 */}
                <button
                  onClick={() => {
                    setIsNotifOpen(false)
                    useGalaxyStore.getState().setIsSettingsOpen(true)
                    setTimeout(() => {
                      window.dispatchEvent(new CustomEvent('OPEN_SETTINGS_TAB', { detail: 'notifications' }))
                    }, 50)
                  }}
                  className="w-full px-4 py-2.5 text-sm text-white/40 hover:text-white/60 hover:bg-white/5 transition-colors text-center border-t border-slate-edge"
                >
                  {t('viewAll')}
                </button>
              </div>
            )}
          </div>
        )}

        {/* 유저 / 로그인 */}
        {isUserLoading ? (
          <LogoSpinner size={20} variant="white" />
        ) : user ? (
          <button
            data-tour="user-profile"
            onClick={async () => {
              const store = useGalaxyStore.getState()
              // [UX 개선] 생각그래프 상태라면 픽셀리어 모드로 복귀
              if (store.viewMode === 'thoughtGraph') {
                store.setViewMode('pixelyer')
              }
              const pixel = store.spatialGrid?.getPixel(user.id)
              
              if (pixel && pixel.coordX != null && pixel.coordY != null) {
                // [REFACTOR] 단일 진입점(focusOnPosition)으로 카메라 이동
                useGalaxyStore.getState().focusOnPosition(
                  pixel.coordX, pixel.coordY, CAMERA_ZOOM.PIXEL_FOCUS, true
                )
                store.selectPixel(user.id)
              } else {
                // [FIX] SpatialGrid에 내 픽셀이 없을 때 → DB API로 현재 은하의 좌표를 직접 조회
                try {
                  const res = await fetch(`/api/users/${user.id}/coordinates`)
                  if (res.ok) {
                    const data = await res.json()
                    const currentDomain = store.galaxyDomain
                    const galaxyCoord = data.coordinates?.[currentDomain]
                    if (galaxyCoord) {
                      useGalaxyStore.getState().focusOnPosition(
                        galaxyCoord.coordX * VISUAL_SCALE,
                        galaxyCoord.coordY * VISUAL_SCALE,
                        CAMERA_ZOOM.PIXEL_FOCUS,
                        true
                      )
                      store.selectPixel(user.id)
                      return
                    }
                  }
                } catch (e) {
                  console.warn('[Header] 좌표 API 조회 실패:', e)
                }
                await galaxyAlert({ title: t('pixelNotFound'), message: t('pixelNotFoundMsg'), variant: 'warning' })
              }
            }}
            className="shrink-0 flex items-center justify-center w-9 h-9 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 active:scale-95 transition-all group overflow-hidden"
          >
            {avatarUrl ? (
              <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
            ) : (
              <span className="text-[13px] text-indigo-300 font-bold group-hover:text-indigo-200 transition-colors">{displayName[0] || 'U'}</span>
            )}
          </button>
        ) : (
          <Link
            href="/auth/login"
            className="shrink-0 h-9 flex items-center gap-2 px-3 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 transition-all text-sm text-white font-medium"
          >
            <span className="hidden sm:inline">{t('login')}</span>
          </Link>
        )}

        {!isUserLoading && user && (
          <button
            onClick={handleLogout}
            title="Logout"
            className="h-9 w-9 flex items-center justify-center rounded-lg border border-white/20 bg-white/10 hover:bg-white/15 text-white/75 hover:text-white transition-all active:scale-95"
          >
            <LogOut className="w-4 h-4" />
          </button>
        )}
      </div>
    </header>

    {/* AI 온보딩 모달 */}
    <AiOnboardingModal
      isOpen={isAiOnboardingOpen}
      onClose={() => setIsAiOnboardingOpen(false)}
    />
    </>
  )
}

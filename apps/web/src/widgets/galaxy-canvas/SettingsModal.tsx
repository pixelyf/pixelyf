'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X, UserCircle, Activity, Users, BookOpen, Bell, MessageCircle,
  Settings2, Wallet, Sparkles, ChevronRight, Globe, Star, Languages, KeyRound
} from 'lucide-react'
import { useUserStore } from '@/entities/user/model/useUserStore'
import { useGalaxyStore } from '@/stores/galaxyStore'
import dynamic from 'next/dynamic'

const SettingsAccountView = dynamic(() => import('./settings-views/SettingsAccountView').then(m => m.SettingsAccountView), { ssr: false })
const SettingsPingView = dynamic(() => import('./settings-views/SettingsPingView').then(m => m.SettingsPingView), { ssr: false })
const SettingsWalletView = dynamic(() => import('./settings-views/SettingsWalletView').then(m => m.SettingsWalletView), { ssr: false })
const SettingsSocialView = dynamic(() => import('./settings-views/SettingsSocialView').then(m => m.SettingsSocialView), { ssr: false })
const SettingsSubscriptionView = dynamic(() => import('./settings-views/SettingsSubscriptionView').then(m => m.SettingsSubscriptionView), { ssr: false })
const SettingsAvatarView = dynamic(() => import('./settings-views/SettingsAvatarView').then(m => m.SettingsAvatarView), { ssr: false })
const SettingsDangerView = dynamic(() => import('./settings-views/SettingsDangerView').then(m => m.SettingsDangerView), { ssr: false })
const SettingsNotificationView = dynamic(() => import('./settings-views/SettingsNotificationView').then(m => m.SettingsNotificationView), { ssr: false })
const SettingsTranslationView = dynamic(() => import('./settings-views/SettingsTranslationView').then(m => m.SettingsTranslationView), { ssr: false })
const SettingsAiKeyView = dynamic(() => import('./settings-views/SettingsAiKeyView').then(m => m.SettingsAiKeyView), { ssr: false })
const SettingsMessagesView = dynamic(() => import('./settings-views/SettingsMessagesView').then(m => m.SettingsMessagesView), { ssr: false })
import { useMediaQuery } from '@/shared/hooks/useMediaQuery'
import { useMoodColor } from '@/shared/hooks/useMoodColor'
import { useTranslations } from 'next-intl'
import { requestHideTabBar, requestShowTabBar, syncNativeTab } from '@/shared/lib/bridge'

type SettingsTab = 'account' | 'avatar' | 'aikey' | 'translation' | 'messages' | 'pings' | 'wallet' | 'social' | 'subscription' | 'notifications' | 'danger'

// ── 탭 카테고리 분류 (은하 독립성 기반) ──────────────────────
const COMMON_TABS = [
  { id: 'account', labelKey: 'tabAccount', icon: UserCircle, descKey: 'tabAccountDesc' },
  { id: 'avatar', labelKey: 'tabAvatar', icon: Sparkles, descKey: 'tabAvatarDesc' },
  { id: 'aikey', labelKey: 'tabAiKey', icon: KeyRound, descKey: 'tabAiKeyDesc' },
  { id: 'translation', labelKey: 'tabTranslation', icon: Languages, descKey: 'tabTranslationDesc' },
  { id: 'messages', labelKey: 'tabMessages', icon: MessageCircle, descKey: 'tabMessagesDesc' },
  { id: 'notifications', labelKey: 'tabNotifications', icon: Bell, descKey: 'tabNotificationsDesc' },
  { id: 'wallet', labelKey: 'tabWallet', icon: Wallet, descKey: 'tabWalletDesc' },
  { id: 'subscription', labelKey: 'tabSubscription', icon: BookOpen, descKey: 'tabSubscriptionDesc' },
] as const

const GALAXY_TABS = [
  { id: 'pings', labelKey: 'tabPings', icon: Activity, descKey: 'tabPingsDesc' },
  { id: 'social', labelKey: 'tabSocial', icon: Users, descKey: 'tabSocialDesc' },
] as const

const ACCOUNT_TABS = [
  { id: 'danger', labelKey: 'tabDanger', icon: Settings2, descKey: 'tabDangerDesc' },
] as const

export function SettingsModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean
  onClose: () => void
}) {
  const userProfile = useUserStore(s => s.user)
  const galaxyKey = useGalaxyStore(s => s.galaxyKey)
  const [activeTab, setActiveTab] = useState<SettingsTab>('account')
  const isMobile = useMediaQuery('(max-width: 767px)')
  const [avatarFooter, setAvatarFooter] = useState<React.ReactNode | null>(null)
  const { themeStyle, primaryHex, secondaryHex } = useMoodColor(userProfile?.current_mood_id)
  const t = useTranslations('Settings')

  const handleFooterChange = useCallback((node: React.ReactNode | null) => {
    setAvatarFooter(node)
  }, [])

  // 모달이 열릴 때 최상단 탭으로 초기화
  useEffect(() => {
    if (isOpen) setActiveTab('account')
  }, [isOpen])

  // [알림 센터] 외부에서 설정 특정 탭으로 직접 이동
  useEffect(() => {
    const handler = (e: Event) => {
      const tab = (e as CustomEvent).detail as SettingsTab
      if (tab) setActiveTab(tab)
    }
    window.addEventListener('OPEN_SETTINGS_TAB', handler)
    return () => window.removeEventListener('OPEN_SETTINGS_TAB', handler)
  }, [])

  // 배경 스크롤 잠금
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [isOpen])

  // 네이티브 하단 탭바 제어 (모바일 설정 화면이 풀 화면일 때 감추기)
  useEffect(() => {
    if (isOpen && isMobile) {
      requestHideTabBar()
      return () => {
        requestShowTabBar()
        // 설정이 닫힐 때 네이티브 탭바 활성 상태를 이전 활성 탭으로 정밀 복구
        syncNativeTab('restore')
      }
    }
  }, [isOpen, isMobile])

  if (!isOpen || !userProfile) return null

  const allTabs = [...COMMON_TABS, ...GALAXY_TABS, ...ACCOUNT_TABS]
  const activeTabDef = allTabs.find(t => t.id === activeTab)
  const isGalaxyTab = GALAXY_TABS.some(t => t.id === activeTab)

  // 탭 메뉴 아이템 렌더러
  const renderNavItem = (tab: { id: string; labelKey: string; icon: any; descKey: string }) => {
    const Icon = tab.icon
    const isActive = activeTab === tab.id
    const label = t(tab.labelKey as any)
    const desc = t(tab.descKey as any)

    return (
      <button
        key={tab.id}
        onClick={() => setActiveTab(tab.id as SettingsTab)}
        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all group relative ${
          isActive
            ? 'bg-white shadow-[0_4px_20px_rgba(255,255,255,0.15)] font-black text-black'
            : 'text-white hover:bg-white/5 hover:text-white'
        }`}
        style={isActive ? { color: '#000000' } : undefined}
      >
        {/* 활성 인디케이터 */}
        {isActive && (
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r-full" style={{ backgroundColor: primaryHex }} />
        )}
        <Icon className="w-4 h-4 shrink-0 transition-transform group-hover:scale-110" style={isActive ? { color: '#000000' } : undefined} />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold truncate">{label}</div>
          <div className="text-xs truncate" style={isActive ? { color: '#000000', opacity: 0.85 } : { color: 'rgba(255,255,255,0.85)' }}>{desc}</div>
        </div>
        {isActive && <ChevronRight className="w-3 h-3 shrink-0" style={{ color: '#000000' }} />}
      </button>
    )
  }

  // 은하별 프로필 닉네임 / 아바타 처리
  const currentCoord = userProfile?.coordinates?.[galaxyKey] || userProfile?.coordinates?.[galaxyKey?.toUpperCase()] || userProfile?.coordinates?.[galaxyKey?.toLowerCase()]
  const finalDisplayName = currentCoord?.display_name || userProfile?.display_name
  const finalAvatarUrl = currentCoord?.avatar_url || userProfile?.avatar_url

  // ── 사이드바 네비게이션 ───────────────────────────────────
  const Sidebar = () => (
    <div className="flex flex-col h-full">
      {/* 헤더 */}
      <div className="flex items-center px-4 py-4 border-b border-white/5 shrink-0">
        <div className="flex items-center gap-2">
          <Settings2 className="w-4 h-4 text-white/60" />
          <span className="text-sm font-black text-white tracking-tight">{t('title')}</span>
        </div>
      </div>

      {/* 스크롤 가능 메뉴 */}
      <nav className="flex-1 overflow-y-auto p-3 space-y-4 custom-scrollbar">

        {/* 공통 섹션 */}
        <div>
          <div className="flex items-center gap-1.5 px-3 mb-1.5">
            <Globe className="w-3 h-3 text-white/40" />
            <span className="text-[12px] font-black text-white/50 uppercase tracking-widest">{t('sectionCommon')}</span>
          </div>
          <div className="space-y-0.5">
            {COMMON_TABS.map(tab => renderNavItem(tab))}
          </div>
        </div>

        {/* 이 은하 섹션 */}
        <div>
          <div className="flex items-center gap-1.5 px-3 mb-1.5">
            <Star className="w-3 h-3 text-white/40" />
            <span className="text-[12px] font-black text-white/50 uppercase tracking-widest">{t('sectionGalaxy')}</span>
            {galaxyKey && (
              <span className="ml-auto text-[12px] font-black px-1.5 py-0.5 rounded-full bg-white/5 border border-white/10 text-white/60 uppercase">
                {galaxyKey}
              </span>
            )}
          </div>
          <div className="space-y-0.5">
            {GALAXY_TABS.map(tab => renderNavItem(tab))}
          </div>
        </div>

        {/* 계정 섹션 */}
        <div className="pt-2 border-t border-white/5">
          <div className="space-y-0.5">
            {ACCOUNT_TABS.map(tab => renderNavItem(tab))}
          </div>
        </div>
      </nav>

      {/* 바텀: 유저 프로필 미니 */}
      <div className="p-3 border-t border-white/5 shrink-0">
        <div className="flex items-center gap-2.5 px-2 py-2">
          <div
            className="w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-[12px] font-black text-white overflow-hidden"
            style={{ background: `linear-gradient(135deg, ${primaryHex}, ${secondaryHex})` }}
          >
            {finalAvatarUrl ? (
              <img src={finalAvatarUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              (finalDisplayName || '?')[0]
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-bold text-white/80 truncate">{finalDisplayName || t('unknownUser')}</div>
            <div className="text-[12px] text-white/60 truncate">{userProfile.email || ''}</div>
          </div>
        </div>
        <div className="mt-1 px-2 text-[10px] text-white/30 font-mono select-none">
          Version 1.0.0
        </div>
      </div>
    </div>
  )

  // ── 콘텐츠 영역 헤더 ─────────────────────────────────────
  const ContentHeader = () => (
    <div className="px-6 py-4 border-b border-white/5 shrink-0 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        {activeTabDef && (
          <>
            <activeTabDef.icon className="w-4 h-4 shrink-0 text-white/60" />
            <div className="flex-1 min-w-0">
              <h2 className="text-[16px] font-black text-white">{t(activeTabDef.labelKey as any)}</h2>
              {isGalaxyTab && galaxyKey && (
                <div className="flex items-center gap-1 mt-0.5">
                  <Star className="w-2.5 h-2.5 text-white/40" />
                  <span className="text-xs text-white/60 font-bold">{t('galaxyData', { key: galaxyKey })}</span>
                </div>
              )}
            </div>
          </>
        )}
      </div>
      
      {/* 닫기 버튼: 화면 우측 끝에 배치 */}
      <button
        onClick={onClose}
        className="w-8 h-8 flex items-center justify-center rounded-full bg-white/5 hover:bg-white/10 text-white/50 hover:text-white transition-colors shrink-0"
        aria-label={t('closeSettings')}
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  )

  // ── 데스크탑: 우측 슬라이드인 사이드시트 ─────────────────
  if (!isMobile) {
    return (
      <div style={themeStyle} className="contents">
        <AnimatePresence>
          {isOpen && (
            <>
              {/* 백드롱 오버레이 — 오버레이 클릭으로 닫히지 않음 (X 버튼 사용) */}
              <motion.div
                key="settings-backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="fixed inset-0 bg-black/80 z-[95] pointer-events-auto"
                onPointerMove={e => e.stopPropagation()}
                onPointerDown={e => e.stopPropagation()}
                onPointerUp={e => e.stopPropagation()}
                onWheel={e => e.stopPropagation()}
              />

              {/* 우측 슬라이드인 패널 — PixelDetailDrawer와 동일한 패턴 */}
              <motion.div
                key="settings-panel"
                initial={{ x: '100%', opacity: 1 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: '100%', opacity: 1 }}
                transition={{ type: 'spring', damping: 28, stiffness: 220 }}
                className="fixed top-0 right-0 bottom-0 z-[100] flex theme-panel-bg shadow-2xl border-l border-white/10 pointer-events-auto"
                style={{ width: 960 }}
                onPointerMove={e => e.stopPropagation()}
                onPointerDown={e => e.stopPropagation()}
                onPointerUp={e => e.stopPropagation()}
              >
                {/* 좌측 사이드바 (240px 0.5패널) */}
                <div className="w-[240px] shrink-0 border-r border-white/5 bg-black/10">
                  <Sidebar />
                </div>

                {/* 우측 콘텐츠 영역 */}
                <div className="flex-1 flex flex-col min-w-0">
                  <ContentHeader />
                  <div className="flex-1 overflow-y-auto custom-scrollbar" style={{ overscrollBehavior: 'contain' }}>
                    <div className="p-6 max-w-2xl">
                      <>
                          {activeTab === 'account' && <SettingsAccountView userProfile={userProfile} />}
                          {activeTab === 'avatar' && <SettingsAvatarView userProfile={userProfile} />}
                          {activeTab === 'notifications' && <SettingsNotificationView />}
                          {activeTab === 'aikey' && <SettingsAiKeyView />}
                          {activeTab === 'messages' && <SettingsMessagesView />}
                          {activeTab === 'translation' && <SettingsTranslationView />}
                          {activeTab === 'pings' && <SettingsPingView galaxyKey={galaxyKey} />}
                          {activeTab === 'wallet' && <SettingsWalletView userProfile={userProfile} />}
                          {activeTab === 'social' && <SettingsSocialView galaxyKey={galaxyKey} />}
                          {activeTab === 'subscription' && <SettingsSubscriptionView />}
                          {activeTab === 'danger' && <SettingsDangerView />}
                      </>
                    </div>
                  </div>
                  {/* 아바타 뷰 전용 푸터 */}
                  {activeTab === 'avatar' && avatarFooter && (
                    <div className="p-4 border-t border-white/5 shrink-0">{avatarFooter}</div>
                  )}
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>
    )
  }

  // ── 모바일: 풀 화면 모달 ────────────────────────────────
  return (
    <div style={themeStyle} className="contents">
      <AnimatePresence>
        {isOpen && (
          <>
            {/* 풀 화면 패널 */}
            <motion.div
              key="settings-sheet-mobile"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 250 }}
              className="fixed inset-0 z-[95] theme-panel-bg shadow-2xl flex flex-col pointer-events-auto w-full h-full"
              onPointerMove={e => e.stopPropagation()}
              onPointerDown={e => e.stopPropagation()}
              onPointerUp={e => e.stopPropagation()}
            >
              {/* 헤더 (노치 Safe Area 대응) */}
              <div className="flex items-center justify-between px-5 pt-safe pb-3 border-b border-white/5 shrink-0">
                <div className="flex items-center gap-2 pt-3">
                  <Settings2 className="w-4 h-4 text-white/60" />
                  <span className="text-sm font-black text-white">{t('title')}</span>
                  <span className="text-[10px] text-white/30 font-mono self-end mb-[2px] select-none">v1.0.0</span>
                </div>
                <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full bg-white/5 text-white/50 hover:text-white transition mt-3">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* 수평 탭 스크롤 (통일 스타일) */}
              <div className="shrink-0 overflow-x-auto no-scrollbar">
                <div className="flex gap-1.5 px-4 py-3 border-b border-white/5 min-w-max">
                  {/* 공통 */}
                  {COMMON_TABS.map(tab => {
                    const Icon = tab.icon
                    const isActive = activeTab === tab.id
                    return (
                      <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as SettingsTab)}
                        className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all shrink-0 ${
                          isActive ? 'bg-white/10 text-white' : 'bg-white/5 text-white/50'
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5" />
                        {t(tab.labelKey as any)}
                      </button>
                    )
                  })}
                  {/* 구분선 */}
                  <div className="w-px h-7 self-center bg-white/10 mx-1 shrink-0" />
                  {GALAXY_TABS.map(tab => {
                    const Icon = tab.icon
                    const isActive = activeTab === tab.id
                    return (
                      <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as SettingsTab)}
                        className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all shrink-0 ${
                          isActive ? 'bg-white/10 text-white' : 'bg-white/5 text-white/50'
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5" />
                        {t(tab.labelKey as any)}
                      </button>
                    )
                  })}
                  {/* 구분선 */}
                  <div className="w-px h-7 self-center bg-white/10 mx-1 shrink-0" />
                  {ACCOUNT_TABS.map(tab => {
                    const Icon = tab.icon
                    const isActive = activeTab === tab.id
                    return (
                      <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as SettingsTab)}
                        className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all shrink-0 ${
                          isActive ? 'bg-white/10 text-white' : 'bg-white/5 text-white/50'
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5" />
                        {t(tab.labelKey as any)}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* 콘텐츠 */}
              <div className="flex-1 overflow-y-auto custom-scrollbar pb-safe" style={{ overscrollBehavior: 'contain' }}>
                <div className="p-5 pb-8">
                  {isGalaxyTab && galaxyKey && (
                    <div className="flex items-center gap-1.5 mb-4 px-3 py-2 rounded-xl bg-white/5 border border-white/10">
                      <Star className="w-3 h-3 text-white/40" />
                      <span className="text-[12px] text-white/60 font-bold">{t('galaxyData', { key: galaxyKey })}</span>
                    </div>
                  )}
                  <>
                      {activeTab === 'account' && <SettingsAccountView userProfile={userProfile} />}
                      {activeTab === 'avatar' && <SettingsAvatarView userProfile={userProfile} hideInlineFooter={true} onFooterChange={handleFooterChange} />}
                      {activeTab === 'notifications' && <SettingsNotificationView />}
                      {activeTab === 'aikey' && <SettingsAiKeyView />}
                      {activeTab === 'messages' && <SettingsMessagesView />}
                      {activeTab === 'translation' && <SettingsTranslationView />}
                      {activeTab === 'pings' && <SettingsPingView galaxyKey={galaxyKey} />}
                      {activeTab === 'wallet' && <SettingsWalletView userProfile={userProfile} />}
                      {activeTab === 'social' && <SettingsSocialView galaxyKey={galaxyKey} />}
                      {activeTab === 'subscription' && <SettingsSubscriptionView />}
                      {activeTab === 'danger' && <SettingsDangerView />}
                  </>
                </div>
              </div>
              {activeTab === 'avatar' && avatarFooter && (
                <div className="p-4 border-t border-white/5 shrink-0 pb-safe">{avatarFooter}</div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}

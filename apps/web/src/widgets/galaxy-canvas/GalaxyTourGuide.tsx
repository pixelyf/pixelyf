'use client'

/**
 * [GalaxyTourGuide v2]
 *
 * 레퍼런스(PlayPhrase.me) 기반으로 전면 재설계된 말풍선 가이드.
 *
 * 핵심 설계 원칙:
 * 1. requestAnimationFrame 기반 좌표 계산 (setTimeout 지연 제거)
 * 2. CSS ::before tail 삼각형으로 실제 말풍선 꼬리 표현
 * 3. placement 자동 결정 (타겟 위치 → viewport 여백 계산)
 * 4. viewMode 조건부: pixelyer 전용 vs thoughtGraph 전용 steps 분기
 * 5. SearchFeedDrawer 열림 여부에 따라 드로어 steps 포함/제외
 * 6. MutationObserver + ResizeObserver로 DOM 변화 감지 후 좌표 재계산
 */

import React, { useEffect, useState, useRef, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { useGalaxyStore } from '@/stores/galaxyStore'
import { useUserStore } from '@/entities/user/model/useUserStore'
import {
  X, Move, Compass, Search, Plus, User, MapPin,
  Layers, Brain, Globe, ShieldAlert, CalendarDays,
  ZoomIn, Home, Sparkles, MessageSquare, Activity,
  Pencil, Settings, MessagesSquare, Bell
} from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// 타입 정의
// ─────────────────────────────────────────────────────────────────────────────

type Placement = 'top' | 'bottom' | 'left' | 'right'

interface TourStep {
  key: string
  targetSelector: string
  titleKey: string
  descKey: string
  icon: React.ElementType
  /** 우선 배치 방향 (auto 계산 전 힌트) */
  preferredPlacement?: Placement
  /** 이 step이 표시될 조건 (undefined = 항상) */
  condition?: 'pixelyer' | 'thoughtGraph' | 'drawer-open' | 'panel-only' | 'panel-owner' | 'panel-non-owner'
  /** 배치 방향 강제 지정 */
  forcePlacement?: Placement
  /** 오프셋 좌표 보정 (x, y) */
  offset?: { x: number; y: number }
  /** 번역 네임스페이스 지정 (예: 'Galaxy') */
  ns?: string
  /** 번역 키 부재 시 대체 타이틀 */
  fallbackTitle?: string
  /** 번역 키 부재 시 대체 설명 */
  fallbackDesc?: string
  /** 타겟 도트 정렬 방향 */
  targetAlign?: 'center' | 'left' | 'right'
  /** 타겟 도트 좌표 추가 오프셋 보정 */
  targetOffset?: { x: number; y: number }
}

interface ResolvedBubble {
  key: string
  step: TourStep
  /** 말풍선 fixed 좌표 */
  bubbleLeft: number
  bubbleTop: number
  bubbleHeight: number
  /** 실제 적용된 배치 방향 */
  placement: Placement
  /** 타겟 중심 좌표 (도트 표시용) */
  targetCX: number
  targetCY: number
  title: string
  desc: string
}

// ─────────────────────────────────────────────────────────────────────────────
// 상수
// ─────────────────────────────────────────────────────────────────────────────

const BUBBLE_WIDTH = 240   // px
const BUBBLE_MAX_HEIGHT = 130  // 예상 최대 높이
const GAP = 32             // 말풍선 ↔ 타겟 간격 (px) (점선 표시를 위해 간격 넓힘)
const VIEWPORT_PAD = 10   // 뷰포트 경계 안전 여백

// ─────────────────────────────────────────────────────────────────────────────
// 모든 투어 스텝 정의
// ─────────────────────────────────────────────────────────────────────────────

const ALL_STEPS: TourStep[] = [
  // ── 헤더 그룹 ──
  {
    key: 'logo',
    targetSelector: '[data-tour="logo"]',
    titleKey: 'logoTitle',
    descKey: 'logoDesc',
    icon: Compass,
    forcePlacement: 'right',
    offset: { x: 280, y: 0 },
    targetAlign: 'right',
    targetOffset: { x: 30, y: 0 },
  },
  {
    key: 'galaxy-nav',
    targetSelector: '[data-tour="galaxy-nav"]',
    titleKey: 'navTitle',
    descKey: 'navDesc',
    icon: Move,
    forcePlacement: 'bottom',
    offset: { x: 0, y: 45 },
  },
  {
    key: 'lang-selector',
    targetSelector: '[data-tour="lang-selector"]',
    titleKey: 'langTitle',
    descKey: 'langDesc',
    icon: Globe,
    forcePlacement: 'bottom',
    offset: { x: 0, y: 15 },
  },
  {
    key: 'btn-record',
    targetSelector: '[data-tour="btn-record"]',
    titleKey: 'recordTitle',
    descKey: 'recordDesc',
    icon: Plus,
    condition: 'pixelyer',
    forcePlacement: 'bottom',
    offset: { x: 0, y: 15 },
  },
  {
    key: 'btn-notification',
    targetSelector: '[data-tour="btn-notification"]',
    titleKey: 'notificationTitle',
    descKey: 'notificationDesc',
    icon: Bell,
    forcePlacement: 'bottom',
    offset: { x: 0, y: 15 },
  },
  {
    key: 'user-profile',
    targetSelector: '[data-tour="user-profile"]',
    titleKey: 'profileTitle',
    descKey: 'profileDesc',
    icon: User,
    forcePlacement: 'bottom',
    offset: { x: 0, y: 15 },
  },

  // ── 뷰 스위처 ──
  {
    key: 'view-switcher',
    targetSelector: '[data-tour="view-switcher"]',
    titleKey: 'viewSwitcherTitle',
    descKey: 'viewSwitcherDesc',
    icon: Layers,
    forcePlacement: 'bottom',
    offset: { x: -80, y: 20 },
  },
  {
    key: 'mood-explore',
    targetSelector: '[data-tour="mood-explore"]',
    titleKey: 'moodExploreLabel',
    descKey: 'moodExploreDesc',
    ns: 'Galaxy',
    fallbackTitle: '감정별 픽셀 탐색',
    fallbackDesc: '픽셀리어들이 등록한 현재 기분/감정 상태(12종)별로 필터링하여 원하는 성향의 이웃을 탐색합니다.',
    icon: Sparkles,
    forcePlacement: 'bottom',
    offset: { x: 0, y: 15 },
  },
  {
    key: 'constellation-explore',
    targetSelector: '[data-tour="constellation-explore"]',
    titleKey: 'constellationExplore',
    descKey: 'constellationDesc',
    ns: 'Galaxy',
    icon: Compass,
    forcePlacement: 'bottom',
    offset: { x: 0, y: 15 },
  },
  {
    key: 'canvas-center',
    targetSelector: '[data-tour="canvas-center"]',
    titleKey: 'canvasCenterTitle',
    descKey: 'canvasCenterDesc',
    fallbackTitle: '은하 중심의 픽셀',
    fallbackDesc: '은하의 정중앙에는 오늘 하루 활동(Moments, Pings 등)이 가장 활발한 픽셀이 우선 배치되는 핵심 중심핵 구역입니다.',
    icon: Compass,
    condition: 'pixelyer',
    forcePlacement: 'top',
    offset: { x: 0, y: -15 },
  },
  {
    key: 'viewport-pixel-count',
    targetSelector: '[data-tour="viewport-pixel-count"]',
    titleKey: 'viewportPixelTitle',
    descKey: 'viewportPixelDesc',
    fallbackTitle: '뷰포트 픽셀 계수기',
    fallbackDesc: '현재 화면상에 렌더링되어 관측 가능한 픽셀들의 실시간 개수를 표시합니다.',
    icon: MapPin,
    condition: 'pixelyer',
    forcePlacement: 'right',
    offset: { x: 15, y: -40 },
  },

  // ── 픽셀리어 모드 전용 ──
  {
    key: 'minimap-radar',
    targetSelector: '[data-tour="minimap-radar"]',
    titleKey: 'minimapRadarTitle',
    descKey: 'minimapRadarDesc',
    icon: MapPin,
    condition: 'pixelyer',
    forcePlacement: 'left',
    offset: { x: 0, y: -330 },
  },
  {
    key: 'minimap-zoom',
    targetSelector: '[data-tour="minimap-zoom"]',
    titleKey: 'minimapZoomTitle',
    descKey: 'minimapZoomDesc',
    icon: ZoomIn,
    condition: 'pixelyer',
    forcePlacement: 'left',
    offset: { x: 0, y: -315 },
  },
  {
    key: 'minimap-my-location',
    targetSelector: '[data-tour="minimap-my-location"]',
    titleKey: 'minimapMyLocationTitle',
    descKey: 'minimapMyLocationDesc',
    icon: Home,
    condition: 'pixelyer',
    forcePlacement: 'left',
    offset: { x: 0, y: -185 },
  },
  {
    key: 'minimap-center',
    targetSelector: '[data-tour="minimap-center"]',
    titleKey: 'minimapCenterTitle',
    descKey: 'minimapCenterDesc',
    icon: Compass,
    condition: 'pixelyer',
    forcePlacement: 'left',
    offset: { x: 0, y: -55 },
  },
  {
    key: 'aura-capsule',
    targetSelector: '[data-tour="aura-capsule"]',
    titleKey: 'auraCapsuleTitle',
    descKey: 'auraCapsuleDesc',
    icon: ShieldAlert,
    condition: 'pixelyer',
    forcePlacement: 'top',
    offset: { x: 0, y: -15 },
  },
  {
    key: 'btn-mood-history',
    targetSelector: '[data-tour="btn-mood-history"]',
    titleKey: 'moodHistoryTitle',
    descKey: 'moodHistoryDesc',
    icon: CalendarDays,
    condition: 'pixelyer',
    forcePlacement: 'top',
    offset: { x: 0, y: -15 },
  },
  {
    key: 'btn-create-moment',
    targetSelector: '[data-tour="btn-create-moment"]',
    titleKey: 'btnCreateMomentTitle',
    descKey: 'btnCreateMomentDesc',
    icon: Plus,
    condition: 'pixelyer',
    forcePlacement: 'top',
    offset: { x: 0, y: -15 },
  },
  {
    key: 'panel-header',
    targetSelector: '[data-tour="panel-header"]',
    titleKey: 'todayMoodStatus',
    descKey: 'todayMoodStatusDesc',
    fallbackTitle: '오늘의 활동 상태',
    fallbackDesc: '픽셀리아가 남겨놓은 오늘 하루의 지배적인 감정/활동 상태를 나타내며, 상태에 따라 헤더 색상이 변경됩니다.',
    icon: Compass,
    condition: 'panel-only',
    forcePlacement: 'left',
    offset: { x: -10, y: 0 },
    targetAlign: 'left',
    targetOffset: { x: 0, y: 0 },
  },
  {
    key: 'panel-profile',
    targetSelector: '[data-tour="panel-profile"]',
    titleKey: 'panelProfileTitle',
    descKey: 'panelProfileDesc',
    fallbackTitle: '프로필 정보',
    fallbackDesc: '픽셀리아의 대표 이름, 뱃지, 실시간 아바타 및 고유 글로우 링을 표시합니다.',
    icon: User,
    condition: 'panel-only',
    forcePlacement: 'left',
    offset: { x: -10, y: 0 },
    targetAlign: 'left',
    targetOffset: { x: 0, y: 0 },
  },
  {
    key: 'panel-status',
    targetSelector: '[data-tour="panel-status"]',
    titleKey: 'panelStatusTitle',
    descKey: 'panelStatusDesc',
    fallbackTitle: '상태 메시지',
    fallbackDesc: '해당 픽셀리아가 남겨놓은 오늘 하루의 한 줄 기분 및 표현 메시지입니다.',
    icon: MessageSquare,
    condition: 'panel-only',
    forcePlacement: 'left',
    offset: { x: -10, y: 0 },
    targetAlign: 'left',
    targetOffset: { x: 0, y: 0 },
  },
  {
    key: 'pixel-touch',
    targetSelector: '[data-tour="pixel-touch"]',
    titleKey: 'tooltipTouch',
    descKey: 'touchGuideDesc',
    fallbackTitle: '터치 교류',
    fallbackDesc: '이웃의 픽셀 별을 터치하여 관심을 보내고 소통의 파동을 일으킵니다.',
    icon: Sparkles,
    condition: 'panel-non-owner',
    forcePlacement: 'left',
    offset: { x: -10, y: 0 },
  },
  {
    key: 'pixel-bond',
    targetSelector: '[data-tour="pixel-bond"]',
    titleKey: 'tooltipBond',
    descKey: 'bondGuideDesc',
    fallbackTitle: '별자리 연결',
    fallbackDesc: '궤도를 이어 별자리를 형성하고 서로의 우주적 인연을 맺습니다.',
    icon: Compass,
    condition: 'panel-only',
    forcePlacement: 'left',
    offset: { x: -10, y: 0 },
  },
  {
    key: 'pixel-dm',
    targetSelector: '[data-tour="pixel-dm"]',
    titleKey: 'messageLabel',
    descKey: 'dmGuideDesc',
    fallbackTitle: '메시지 전송',
    fallbackDesc: '이웃 픽셀리어 또는 인공지능 아바타 에이전트와 실시간 대화를 시작합니다.',
    icon: MessageSquare,
    condition: 'panel-only',
    forcePlacement: 'left',
    offset: { x: -10, y: 0 },
  },
  {
    key: 'pixel-insight',
    targetSelector: '[data-tour="pixel-insight"]',
    titleKey: 'insight',
    descKey: 'insightGuideDesc',
    fallbackTitle: '픽셀 인사이트',
    fallbackDesc: '이 픽셀이 축적한 활동 점수와 상호작용 통계 지표를 상세히 열람합니다.',
    icon: Activity,
    condition: 'panel-only',
    forcePlacement: 'left',
    offset: { x: -10, y: 0 },
  },
  {
    key: 'pixel-edit',
    targetSelector: '[data-tour="pixel-edit"]',
    titleKey: 'editProfile',
    descKey: 'editProfileDesc',
    fallbackTitle: '프로필 편집',
    fallbackDesc: '내 픽셀의 대표 닉네임, 아바타 캐릭터 장착, 기분 메시지 등을 직접 커스텀하고 편집합니다.',
    icon: Pencil,
    condition: 'panel-owner',
    forcePlacement: 'left',
    offset: { x: -10, y: 0 },
  },
  {
    key: 'pixel-settings',
    targetSelector: '[data-tour="pixel-settings"]',
    titleKey: 'settings',
    descKey: 'settingsDesc',
    fallbackTitle: '설정',
    fallbackDesc: '지갑 관리, 스타더스트 통계, 계정 보안 설정을 종합 관리합니다.',
    icon: Settings,
    condition: 'panel-owner',
    forcePlacement: 'left',
    offset: { x: -10, y: 0 },
  },
  {
    key: 'pixel-group-chat',
    targetSelector: '[data-tour="pixel-group-chat"]',
    titleKey: 'groupChat',
    descKey: 'groupChatDesc',
    fallbackTitle: '그룹 대화',
    fallbackDesc: '연결된 이웃들을 한곳에 초대해 소통하는 다자간 별자리 그룹 방을 개설합니다.',
    icon: MessagesSquare,
    condition: 'panel-owner',
    forcePlacement: 'left',
    offset: { x: -10, y: 0 },
  },
  {
    key: 'panel-bonds',
    targetSelector: '[data-tour="panel-bonds"]',
    titleKey: 'panelBondsTitle',
    descKey: 'panelBondsDesc',
    fallbackTitle: '별자리 이웃 목록',
    fallbackDesc: '이 픽셀과 상호 궤도를 공유하며 우주적으로 연결된 모든 인접 이웃들입니다.',
    icon: Compass,
    condition: 'panel-only',
    forcePlacement: 'left',
    offset: { x: -10, y: 0 },
  },
  {
    key: 'panel-feed',
    targetSelector: '[data-tour="panel-feed"]',
    titleKey: 'panelFeedTitle',
    descKey: 'panelFeedDesc',
    fallbackTitle: '기록 피드',
    fallbackDesc: '오늘 하루 해당 픽셀에 기록된 감정별 모먼트 및 순간의 기록 타임라인입니다.',
    icon: Activity,
    condition: 'panel-only',
    forcePlacement: 'left',
    offset: { x: -10, y: 0 },
  },

  // ── 드로어 그룹 (드로어가 열려 있을 때만) ──
  {
    key: 'drawer-scope-select',
    targetSelector: '[data-tour="drawer-scope-select"]',
    titleKey: 'drawerScopeSelectTitle',
    descKey: 'drawerScopeSelectDesc',
    icon: Search,
    condition: 'drawer-open',
    forcePlacement: 'right',
    offset: { x: 10, y: 0 },
    targetAlign: 'left',
  },
  {
    key: 'drawer-search',
    targetSelector: '[data-tour="drawer-search"]',
    titleKey: 'drawerSearchTitle',
    descKey: 'drawerSearchDesc',
    icon: Search,
    condition: 'drawer-open',
    forcePlacement: 'right',
    offset: { x: 10, y: 0 },
    targetAlign: 'left',
  },
  {
    key: 'drawer-tabs',
    targetSelector: '[data-tour="drawer-tabs"]',
    titleKey: 'drawerTabsTitle',
    descKey: 'drawerTabsDesc',
    icon: Layers,
    condition: 'drawer-open',
    forcePlacement: 'right',
    offset: { x: 10, y: 0 },
    targetAlign: 'left',
  },
  {
    key: 'drawer-categories',
    targetSelector: '[data-tour="drawer-categories"]',
    titleKey: 'drawerCategoriesTitle',
    descKey: 'drawerCategoriesDesc',
    icon: Globe,
    condition: 'drawer-open',
    forcePlacement: 'right',
    offset: { x: 10, y: 0 },
    targetAlign: 'left',
  },

  // ── 생각그래프 전용 ──
  {
    key: 'thought-graph-scope',
    targetSelector: '[data-tour="thought-graph-scope"]',
    titleKey: 'thoughtScopeTitle',
    descKey: 'thoughtScopeDesc',
    icon: Brain,
    condition: 'thoughtGraph',
  },
]

// ─────────────────────────────────────────────────────────────────────────────
// 핵심 배치 알고리즘
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 타겟 엘리먼트의 DOMRect와 뷰포트 크기를 기반으로
 * 말풍선 위치와 placement를 자동 결정합니다.
 */
function resolvePlacement(
  rect: DOMRect,
  bubbleH: number,
  wW: number,
  wH: number,
  preferred?: Placement
): Placement {
  const spaceTop = rect.top
  const spaceBottom = wH - rect.bottom
  const spaceLeft = rect.left
  const spaceRight = wW - rect.right

  const needed = {
    top: bubbleH + GAP,
    bottom: bubbleH + GAP,
    left: BUBBLE_WIDTH + GAP,
    right: BUBBLE_WIDTH + GAP,
  }

  // 선호 방향이 있고 공간이 충분하면 우선 사용
  if (preferred && (preferred === 'top' ? spaceTop : preferred === 'bottom' ? spaceBottom : preferred === 'left' ? spaceLeft : spaceRight) >= needed[preferred]) {
    return preferred
  }

  // 공간이 가장 넉넉한 방향 선택
  const scores: Record<Placement, number> = {
    top: spaceTop - needed.top,
    bottom: spaceBottom - needed.bottom,
    left: spaceLeft - needed.left,
    right: spaceRight - needed.right,
  }

  return (Object.entries(scores).sort((a, b) => b[1] - a[1])[0][0]) as Placement
}

/**
 * placement에 따라 말풍선의 fixed 좌표를 계산합니다.
 * 반환값은 화면 경계(VIEWPORT_PAD) 내로 클램핑됩니다.
 */
function calcBubblePos(
  rect: DOMRect,
  placement: Placement,
  bubbleH: number,
  wW: number,
  wH: number
): { left: number; top: number } {
  const cx = rect.left + rect.width / 2
  const cy = rect.top + rect.height / 2

  let left = 0
  let top = 0

  switch (placement) {
    case 'bottom':
      left = cx - BUBBLE_WIDTH / 2
      top = rect.bottom + GAP
      break
    case 'top':
      left = cx - BUBBLE_WIDTH / 2
      top = rect.top - bubbleH - GAP
      break
    case 'right':
      left = rect.right + GAP
      top = cy - bubbleH / 2
      break
    case 'left':
      left = rect.left - BUBBLE_WIDTH - GAP
      top = cy - bubbleH / 2
      break
  }

  // 뷰포트 경계 클램핑
  left = Math.max(VIEWPORT_PAD, Math.min(left, wW - BUBBLE_WIDTH - VIEWPORT_PAD))
  top = Math.max(VIEWPORT_PAD, Math.min(top, wH - bubbleH - VIEWPORT_PAD))

  return { left, top }
}

// ─────────────────────────────────────────────────────────────────────────────
// 메인 컴포넌트
// ─────────────────────────────────────────────────────────────────────────────

export function GalaxyTourGuide() {
  const t = useTranslations('TourGuide')
  const tGalaxy = useTranslations('Galaxy')
  const tPixel = useTranslations('Pixel')
  const isTourOpen = useGalaxyStore((s) => s.isTourOpen)
  const setIsTourOpen = useGalaxyStore((s) => s.setIsTourOpen)
  const viewMode = useGalaxyStore((s) => s.viewMode)
  const selectedPixelId = useGalaxyStore((s) => s.selectedPixelId)
  const pixelPanelWidth = useGalaxyStore((s) => s.pixelPanelWidth)
  const user = useUserStore((s) => s.user)

  const [isDesktop, setIsDesktop] = useState(false)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const checkDesktop = () => {
        setIsDesktop(window.innerWidth >= 1024)
      }
      checkDesktop()
      window.addEventListener('resize', checkDesktop)
      return () => window.removeEventListener('resize', checkDesktop)
    }
  }, [])

  const [bubbles, setBubbles] = useState<ResolvedBubble[]>([])
  // 각 말풍선 ref (실제 렌더 후 높이 측정)
  const bubbleRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const rafRef = useRef<number | null>(null)
  const timerRef = useRef<any>(null)
  const resizeObserverRef = useRef<ResizeObserver | null>(null)

  // ── 마운트 딜레이 및 레이스 컨디션 감지용 재시도 Refs ──
  const retryTimerRef = useRef<any>(null)
  const retryCountRef = useRef(0)

  // ── 최초 방문 자동 오픈 ──
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const hasSeen = localStorage.getItem('hasSeenGalaxyTour')
      if (!hasSeen) {
        // DOM이 완전히 그려진 뒤 오픈 (헤더, 미니맵 등 요소들이 마운트된 후)
        const timer = setTimeout(() => setIsTourOpen(true), 800)
        return () => clearTimeout(timer)
      }
    }
  }, [setIsTourOpen])

/**
 * 1D 수직 공간 상에서 말풍선 스택을 겹치지 않고 뷰포트 내에 고르게 배치합니다.
 */
function adjustVerticalStack(group: ResolvedBubble[], wH: number, margin: number) {
  if (group.length === 0) return

  // 1. 타겟 Y축 높이(targetCY) 기준으로 오름차순 정렬하여 말풍선 물리적 배치 순서 고정
  group.sort((a, b) => a.targetCY - b.targetCY)

  // 2. 위에서 아래로 밀어내기 (뷰포트 상단 한계 준수)
  for (let i = 0; i < group.length; i++) {
    const cur = group[i]
    if (i === 0) {
      cur.bubbleTop = Math.max(VIEWPORT_PAD, cur.bubbleTop)
    } else {
      const prev = group[i - 1]
      const prevBottom = prev.bubbleTop + prev.bubbleHeight + margin
      if (cur.bubbleTop < prevBottom) {
        cur.bubbleTop = prevBottom
      }
    }
  }

  // 3. 아래에서 위로 밀어올리기 (최하단이 뷰포트 하단을 벗어난 경우)
  const lastIdx = group.length - 1
  const last = group[lastIdx]
  const maxBottom = wH - VIEWPORT_PAD
  if (last.bubbleTop + last.bubbleHeight > maxBottom) {
    last.bubbleTop = maxBottom - last.bubbleHeight
    for (let i = lastIdx - 1; i >= 0; i--) {
      const cur = group[i]
      const next = group[i + 1]
      const nextTop = next.bubbleTop - margin - cur.bubbleHeight
      if (cur.bubbleTop > nextTop) {
        cur.bubbleTop = nextTop
      }
    }
  }

  // 4. 최종 상단 보정 (위로 밀려 올라갔을 때 상단을 뚫고 나가지 않도록 다시 아래로 재조정)
  if (group[0].bubbleTop < VIEWPORT_PAD) {
    group[0].bubbleTop = VIEWPORT_PAD
    for (let i = 1; i < group.length; i++) {
      const cur = group[i]
      const prev = group[i - 1]
      const prevBottom = prev.bubbleTop + prev.bubbleHeight + margin
      if (cur.bubbleTop < prevBottom) {
        cur.bubbleTop = prevBottom
      }
    }
  }
}

/**
 * 하단 말풍선들을 아래에서 위로(Y축 역순) 밀어올려 겹치지 않게 쌓아 올립니다.
 */
function adjustVerticalStackUp(group: ResolvedBubble[], wH: number, margin: number) {
  if (group.length === 0) return

  // 돔 선언 순서대로 아래에서 위로 차곡차곡 쌓아 올립니다.
  // 첫 번째 말풍선(aura-capsule)이 맨 아래에 있고, 그 위로 쌓이게 됩니다.
  for (let i = 0; i < group.length; i++) {
    const cur = group[i]
    if (i === 0) {
      cur.bubbleTop = Math.min(wH - cur.bubbleHeight - VIEWPORT_PAD, cur.bubbleTop)
    } else {
      const prev = group[i - 1]
      const prevTop = prev.bubbleTop - margin - cur.bubbleHeight
      if (cur.bubbleTop > prevTop) {
        cur.bubbleTop = prevTop
      }
    }
  }
}

  // ── 좌표 계산 ──
  const calculateBubbles = useCallback(() => {
    if (!isTourOpen) return

    try {
      const wW = window.innerWidth
      const wH = window.innerHeight

      // 드로어 열림 여부 감지
      const drawerEl = document.querySelector('[data-tour="feed-drawer"]')
      const drawerOpen = !!drawerEl

      const tourMode = useGalaxyStore.getState().tourMode
      const selectedPixelId = useGalaxyStore.getState().selectedPixelId
      const isOwner = !!(user && selectedPixelId && user.id === selectedPixelId)

      // 현재 viewMode 및 드로어 조건에 맞는 steps 필터
      const activeSteps = ALL_STEPS.filter((step) => {
        // 1. 패널 가이드 전용 모드인 경우
        if (tourMode === 'panel') {
          // 인증 여부(isOwner)에 따른 동적 필터
          if (step.condition === 'panel-owner' && !isOwner) return false
          if (step.condition === 'panel-non-owner' && isOwner) return false

          return [
            'panel-header', 'panel-profile', 'panel-status',
            'pixel-touch', 'pixel-bond', 'pixel-dm', 'pixel-insight',
            'pixel-edit', 'pixel-settings', 'pixel-group-chat',
            'panel-bonds', 'panel-feed'
          ].includes(step.key) || step.condition === 'panel-owner' || step.condition === 'panel-non-owner'
        }

        // 2. 전체 가이드 모드인 경우 (판넬 관련 조건부 스텝들은 일괄 차단)
        if (step.condition && (step.condition.startsWith('panel-') || step.condition === 'panel-only')) return false

        // 기존 필터링 조건
        if (!step.condition) return true
        if (step.condition === 'pixelyer') return viewMode === 'pixelyer'
        if (step.condition === 'thoughtGraph') return viewMode === 'thoughtGraph'
        if (step.condition === 'drawer-open') return drawerOpen && viewMode === 'pixelyer'
        return true
      })

      const resolved: ResolvedBubble[] = []

      for (const step of activeSteps) {
        const targetEl = document.querySelector(step.targetSelector)
        if (!targetEl) {
          // 로딩 중이거나 조건부 노출 상태일 때 DOM이 없을 수 있으므로, 경고 로그를 출력하지 않고 스킵합니다.
          continue
        }

        const rect = targetEl.getBoundingClientRect()
        // 화면 밖 엘리먼트 스킵 (1차적인 크기 없음만 스킵, 뷰포트 밖 스킵 제거하여 캔버스 외곽에 걸려도 항상 렌더링되게 개선)
        if (rect.width === 0 && rect.height === 0) {
          continue
        }

        // 실제 렌더된 높이를 우선 사용, 없으면 예상값
        const bubbleEl = bubbleRefs.current[step.key]
        const bubbleH = bubbleEl ? bubbleEl.offsetHeight : BUBBLE_MAX_HEIGHT

        const placement = step.forcePlacement || resolvePlacement(rect, bubbleH, wW, wH, step.preferredPlacement)
        let { left, top } = calcBubblePos(rect, placement, bubbleH, wW, wH)

        if (step.offset) {
          left += step.offset.x
          top += step.offset.y
        }

        let targetCX = rect.left + rect.width / 2
        if (step.targetAlign === 'right') {
          targetCX = rect.right - 12
        } else if (step.targetAlign === 'left') {
          targetCX = rect.left + 12
        }
        let targetCY = rect.top + rect.height / 2

        if (step.targetOffset) {
          targetCX += step.targetOffset.x
          targetCY += step.targetOffset.y
        }

        // ── 우측 판넬에 의한 카메라 좌측 이동 보정 (은하 중앙 가이드 스텝 전용) ──
        if (step.key === 'canvas-center') {
          const contentArea = document.getElementById('galaxy-content-area')
          if (contentArea) {
            const cameraOffset = (window.innerWidth - contentArea.clientWidth) / 2
            left -= cameraOffset
            targetCX -= cameraOffset
          }
        }

        let titleRaw = step.titleKey
        let descRaw = step.descKey

        try {
          if (step.ns === 'Galaxy') {
            titleRaw = tGalaxy(step.titleKey)
          } else if (step.ns === 'Pixel') {
            titleRaw = tPixel(step.titleKey)
          } else {
            titleRaw = t(step.titleKey)
          }
        } catch (e) {
          // 번역 키 누락 방어
        }

        try {
          if (step.ns === 'Galaxy') {
            descRaw = tGalaxy(step.descKey)
          } else if (step.ns === 'Pixel') {
            descRaw = tPixel(step.descKey)
          } else {
            descRaw = t(step.descKey)
          }
        } catch (e) {
          // 번역 키 누락 방어
        }

        const title = (titleRaw === step.titleKey || !titleRaw || titleRaw.startsWith('MISSING_MESSAGE'))
          ? (step.fallbackTitle || titleRaw)
          : titleRaw

        const desc = (descRaw === step.descKey || !descRaw || descRaw.startsWith('MISSING_MESSAGE'))
          ? (step.fallbackDesc || descRaw)
          : descRaw

        resolved.push({
          key: step.key,
          step,
          bubbleLeft: left,
          bubbleTop: top,
          bubbleHeight: bubbleH,
          placement,
          targetCX,
          targetCY,
          title,
          desc,
        })
      }

      // 미니맵 전체 엘리먼트를 찾아서 X축 정렬 기준으로 사용 (4개 모두 동일한 수직선상으로 정렬)
      const minimapEl = document.querySelector('[data-tour="minimap"]')
      if (minimapEl) {
        const minimapRect = minimapEl.getBoundingClientRect()
        const targetLeft = minimapRect.left - BUBBLE_WIDTH - GAP - 50
        for (const b of resolved) {
          if (b.key.startsWith('minimap-')) {
            b.bubbleLeft = targetLeft
          }
        }
      }

      // 픽셀 판넬 엘리먼트를 찾아서 X축 정렬 기준으로 사용 (판넬 가이드 말풍선들을 모두 동일한 수직선상으로 정렬)
      const panelEl = document.querySelector('[data-tour="pixel-detail-panel"]')
      if (panelEl) {
        const panelRect = panelEl.getBoundingClientRect()
        const targetLeft = panelRect.left - BUBBLE_WIDTH - GAP
        for (const b of resolved) {
          if (
            [
              'panel-header', 'panel-profile', 'panel-status',
              'pixel-touch', 'pixel-bond', 'pixel-dm', 'pixel-insight',
              'pixel-edit', 'pixel-settings', 'pixel-group-chat',
              'panel-bonds', 'panel-feed'
            ].includes(b.key)
          ) {
            b.bubbleLeft = targetLeft
          }
        }
      }

      // ── 그룹별 겹침 방지 처리 ──
      const MARGIN = 12

      // 1. 미니맵 그룹 밀어내기 (미니맵은 수직 일렬 배치)
      const minimapBubbles = resolved.filter(b => b.key.startsWith('minimap-'))
      adjustVerticalStack(minimapBubbles, wH, MARGIN)

      // 2. 판넬 그룹 밀어내기 (판넬은 수직 일렬 배치)
      const panelSteps = [
        'panel-header', 'panel-profile', 'panel-status',
        'pixel-touch', 'pixel-bond', 'pixel-dm', 'pixel-insight',
        'pixel-edit', 'pixel-settings', 'pixel-group-chat',
        'panel-bonds', 'panel-feed'
      ]
      const panelBubbles = resolved.filter(b => panelSteps.includes(b.key))
      adjustVerticalStack(panelBubbles, wH, MARGIN)

      // 3. 하단 그룹 밀어올리기 (나의 감정 역사, 오늘의 순간 기록, 아우라 설정)
      const bottomSteps = ['aura-capsule', 'btn-mood-history', 'btn-create-moment']
      const bottomBubbles = resolved.filter(b => bottomSteps.includes(b.key))
      adjustVerticalStackUp(bottomBubbles, wH, MARGIN)

      // 3. 드로어 그룹 세로 중앙 정렬 (화면 우측 끝 세로 정중앙에 고르게 배치)
      const drawerSteps = ['drawer-scope-select', 'drawer-search', 'drawer-tabs', 'drawer-categories']
      const drawerBubbles = resolved.filter(b => drawerSteps.includes(b.key))
      if (drawerBubbles.length > 0) {
        drawerBubbles.sort((a, b) => {
          const order = ['drawer-scope-select', 'drawer-search', 'drawer-tabs', 'drawer-categories']
          return order.indexOf(a.key) - order.indexOf(b.key)
        })
        const totalHeight = drawerBubbles.reduce((sum, b, idx) => {
          return sum + b.bubbleHeight + (idx > 0 ? MARGIN : 0)
        }, 0)
        let currentTop = (wH - totalHeight) / 2
        for (const b of drawerBubbles) {
          b.bubbleTop = currentTop
          b.bubbleLeft = wW - BUBBLE_WIDTH - 30
          currentTop += b.bubbleHeight + MARGIN
        }
      }

      // 4. 그 외 스텝들은 2D 겹침 회피 (헤더 밀림 현상 복구)
      const otherBubbles = resolved.filter(b => (
        !b.key.startsWith('minimap-') && 
        !panelSteps.includes(b.key) && 
        !drawerSteps.includes(b.key) && 
        !bottomSteps.includes(b.key)
      ))
      const isOverlapping = (
        r1: { left: number; top: number; right: number; bottom: number },
        r2: { left: number; top: number; right: number; bottom: number }
      ) => {
        return !(
          r1.right < r2.left ||
          r1.left > r2.right ||
          r1.bottom < r2.top ||
          r1.top > r2.bottom
        )
      }

      for (let i = 0; i < otherBubbles.length; i++) {
        let current = otherBubbles[i]
        let hasConflict = true
        let attempts = 0
        while (hasConflict && attempts < 5) {
          hasConflict = false
          const curRect = {
            left: current.bubbleLeft,
            top: current.bubbleTop,
            right: current.bubbleLeft + BUBBLE_WIDTH,
            bottom: current.bubbleTop + current.bubbleHeight,
          }
          for (let j = 0; j < i; j++) {
            const prev = otherBubbles[j]
            const prevRect = {
              left: prev.bubbleLeft,
              top: prev.bubbleTop,
              right: prev.bubbleLeft + BUBBLE_WIDTH,
              bottom: prev.bubbleTop + prev.bubbleHeight,
            }
            if (isOverlapping(curRect, prevRect)) {
              current.bubbleTop = prevRect.bottom + MARGIN
              hasConflict = true
              break
            }
          }
          attempts++
        }
        if (current.bubbleTop + current.bubbleHeight > wH - VIEWPORT_PAD) {
          current.bubbleTop = wH - current.bubbleHeight - VIEWPORT_PAD
        }
      }

      setBubbles(resolved)
    } catch (error) {
      // Silently catch layout resolver errors to prevent console spam
    }
  }, [isTourOpen, viewMode, user, tGalaxy, selectedPixelId, pixelPanelWidth])

  // ── RAF 기반 디바운싱 계산 ──
  const scheduleCalculate = useCallback(() => {
    if (rafRef.current) return
    rafRef.current = requestAnimationFrame(() => {
      calculateBubbles()
      rafRef.current = null
    })
  }, [calculateBubbles])

  useEffect(() => {
    if (!isTourOpen) {
      setBubbles([])
      return
    }

    // 마운트 시 즉시 실행
    scheduleCalculate()

    // 창 크기 변경 대응
    window.addEventListener('resize', scheduleCalculate)

    return () => {
      window.removeEventListener('resize', scheduleCalculate)
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
  }, [isTourOpen, scheduleCalculate])

  // ── 스크롤 감지 시 가이드 자동 종료 ──
  useEffect(() => {
    if (!isTourOpen) return

    const handleScroll = () => {
      setIsTourOpen(false)
    }

    // 1. 전역 window 스크롤 감지
    window.addEventListener('scroll', handleScroll, { capture: true })

    // 2. 픽셀 상세 패널 내부 스크롤 감지
    const panelScrollEl = document.querySelector('.custom-scrollbar')
    if (panelScrollEl) {
      panelScrollEl.addEventListener('scroll', handleScroll)
    }

    return () => {
      window.removeEventListener('scroll', handleScroll, { capture: true })
      if (panelScrollEl) {
        panelScrollEl.removeEventListener('scroll', handleScroll)
      }
    }
  }, [isTourOpen, setIsTourOpen])

  // ── 바탕 또는 모든 기능 버튼 클릭 시 가이드 자동 닫기 ──
  useEffect(() => {
    if (!isTourOpen) return

    const handleGlobalClick = () => {
      handleClose()
    }

    const timer = setTimeout(() => {
      window.addEventListener('click', handleGlobalClick)
    }, 100)

    return () => {
      clearTimeout(timer)
      window.removeEventListener('click', handleGlobalClick)
    }
  }, [isTourOpen])

  const handleClose = () => {
    setIsTourOpen(false)
    localStorage.setItem('hasSeenGalaxyTour', 'true')
  }

  if (!isDesktop || !isTourOpen) return null

  return (
    <>
      {/* ── SVG 연결선 레이어 (PlayPhrase.me 스타일 라운드 점선) ── */}
      <svg className="fixed inset-0 z-[9001] pointer-events-none w-full h-full">
        {bubbles.map((bubble, idx) => {
          const bH = bubble.bubbleHeight || BUBBLE_MAX_HEIGHT
          let startX = 0
          let startY = 0
          let cp1x = 0
          let cp1y = 0
          let cp2x = 0
          let cp2y = 0

          const targetCX = bubble.targetCX
          const targetCY = bubble.targetCY

          const dx = Math.abs(bubble.bubbleLeft + BUBBLE_WIDTH / 2 - targetCX)
          const dy = Math.abs(bubble.bubbleTop + bH / 2 - targetCY)

          switch (bubble.placement) {
            case 'bottom':
              startX = bubble.bubbleLeft + BUBBLE_WIDTH / 2
              startY = bubble.bubbleTop
              cp1x = startX
              cp1y = startY - dy * 0.5
              cp2x = targetCX
              cp2y = targetCY + dy * 0.5
              break
            case 'top':
              startX = bubble.bubbleLeft + BUBBLE_WIDTH / 2
              startY = bubble.bubbleTop + bH
              cp1x = startX
              cp1y = startY + dy * 0.5
              cp2x = targetCX
              cp2y = targetCY - dy * 0.5
              break
            case 'right':
              startX = bubble.bubbleLeft
              startY = bubble.bubbleTop + bH / 2
              cp1x = startX - dx * 0.5
              cp1y = startY
              cp2x = targetCX + dx * 0.5
              cp2y = targetCY
              break
            case 'left':
              startX = bubble.bubbleLeft + BUBBLE_WIDTH
              startY = bubble.bubbleTop + bH / 2
              cp1x = startX + dx * 0.5
              cp1y = startY
              cp2x = targetCX - dx * 0.5
              cp2y = targetCY
              break
          }

          const pathD = `M ${startX} ${startY} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${targetCX} ${targetCY}`

          return (
            <path
              key={`line-${bubble.key}`}
              d={pathD}
              fill="none"
              stroke="#fbbf24" // yellow-400
              strokeWidth="3.5"
              strokeDasharray="0 8"
              strokeLinecap="round"
              className="opacity-75 animate-in fade-in duration-300"
              style={{
                animationDelay: `${idx * 60}ms`,
                animationFillMode: 'both',
              }}
            />
          )
        })}
      </svg>

      {/* ── 말풍선 레이어 ── */}
      {bubbles.map((bubble, idx) => {
        const StepIcon = bubble.step.icon
        return (
          <BubbleCard
            key={bubble.key}
            bubble={bubble}
            idx={idx}
            StepIcon={StepIcon}
            ref={(el) => { bubbleRefs.current[bubble.key] = el }}
          />
        )
      })}
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 말풍선 카드 (분리 컴포넌트)
// ─────────────────────────────────────────────────────────────────────────────

interface BubbleCardProps {
  bubble: ResolvedBubble
  idx: number
  StepIcon: React.ElementType
  ref: React.Ref<HTMLDivElement>
}

const BubbleCard = React.forwardRef<HTMLDivElement, Omit<BubbleCardProps, 'ref'>>(
  function BubbleCard({ bubble, idx, StepIcon }, ref) {
    const { bubbleLeft, bubbleTop } = bubble
    const [isHovered, setIsHovered] = React.useState(false)

    return (
      <>
        {/* 타겟 하이라이트 도트 */}
        <div
          className="tour-highlight-dot fixed z-[9001] pointer-events-none"
          style={{
            left: bubble.targetCX - 5,
            top: bubble.targetCY - 5,
          }}
        >
          <div className="w-2.5 h-2.5 rounded-full bg-yellow-400 shadow-[0_0_0_4px_rgba(251,191,36,0.3),0_0_0_8px_rgba(251,191,36,0.1)] animate-pulse" />
        </div>

        {/* 말풍선 본체 */}
        <div
          ref={ref}
          className="tour-bubble fixed z-[9002] pointer-events-auto select-none transition-all duration-150"
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          style={{
            left: bubbleLeft,
            top: bubbleTop,
            width: BUBBLE_WIDTH,
            animationDelay: `${idx * 60}ms`,
            animationFillMode: 'both',
            zIndex: isHovered ? 9010 : undefined,
            transform: isHovered ? 'scale(1.02)' : 'scale(1)',
          }}
        >
          {/* 상단: 아이콘 + 번호 + 제목 */}
          <div className="flex items-center gap-2 mb-1.5">
            <div className="flex items-center justify-center w-6 h-6 rounded-lg bg-yellow-400/15 text-yellow-400 shrink-0">
              <StepIcon className="w-3.5 h-3.5" />
            </div>
            <span className="text-[10px] font-bold text-yellow-400/70 tabular-nums">
              {String(idx + 1).padStart(2, '0')}
            </span>
            <h4 className="text-xs font-black text-white tracking-tight leading-snug line-clamp-1">
              {bubble.title}
            </h4>
          </div>

          {/* 설명 텍스트 */}
          <p className="text-[11px] leading-relaxed text-slate-300/90 font-medium">
            {bubble.desc}
          </p>
        </div>
      </>
    )
  }
)


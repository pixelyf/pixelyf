"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { LogoSpinner } from "@/shared/ui/LogoSpinner";
import { motion } from "framer-motion";
import {
  ChevronLeft,
  ChevronRight,
  Search,
  X,
  Clock,
  Flame,
  Award,
  Image,
  Languages,
  Brain,
  Users,
  ChevronDown,
  Globe,
  Lock,
  Sparkles,
  BookOpen,
  Youtube,
  MessageCircle,
  HandHelping,
  Droplets,
  Umbrella,
  Moon,
  Heart,
  Zap,
  HandMetal,
  Star,
  Wand2,
  Share2,
  Telescope,
  Check,
} from "lucide-react";

import { useGalaxyStore } from "@/stores/galaxyStore";
import { useUserStore } from "@/entities/user/model/useUserStore";

import { PING_TYPES, PING_ICON_MAP } from "@/shared/constants/pings";
import { PERSONA_MAP } from "@/shared/constants/personas";
import { PersonaBadge } from "@/entities/user/ui/PersonaBadge";
import { usePanelResizable } from "@/shared/hooks/usePanelResizable";
import { relativeTime } from "@/shared/utils/relativeTime";
import { ImageLightbox } from "./ImageLightbox";

import { useGalaxyNavigation } from "@/shared/hooks/useGalaxyNavigation";
import { useSearchFeed } from "./useSearchFeed";
import { useGalaxySystem } from "@/shared/hooks/useGalaxySystem";
import { useMediaQuery } from "@/shared/hooks/useMediaQuery";
import { useBabelStore } from "@/stores/babelStore";
import { isNativeApp } from "@/shared/utils/isNativeApp";
import { getMoodColors } from "@/shared/constants/moods";
import { useTranslations, useLocale } from "next-intl";
import { useMoodColor } from "@/shared/hooks/useMoodColor";
import { MomentBabelSwitcher } from "./MomentBabelSwitcher";

// [DB 동적화] 은하/카테고리 라벨은 useGalaxySystem 기반 동적 생성
// 레거시 호환: SearchFeedDrawer 외부에서 GALAXY_LABEL_MAP을 import하는 곳 대응
// (PixelDetailDrawer 등 — 향후 동적화 완료 시 제거 예정)
export const GALAXY_LABEL_MAP: Record<string, string> = {};

type SearchMode = "content" | "nickname";

export interface FeedImage {
  url: string;
  mediumUrl?: string;
  thumbnailUrl?: string;
  youtubeUrl?: string;
}

export interface FeedItem {
  id: string;
  momentId?: string;
  author: string;
  badge: string | null;
  country?: string;
  personaCode?: string;
  days: number;
  galaxyLabel: string;
  categoryId: string;
  galaxyId?: string;
  content: string;
  pings: number;
  ping_count?: number;
  pingTypeCounts: Record<string, number>;
  ping_type_counts?: Record<string, number>;
  moodId?: string;
  commentCount: number;
  comment_count?: number;
  coord: { x: number; y: number; z: number };
  momentContent?: string;
  avatarUrl?: string;
  glowPrimary?: string;
  glowSecondary?: string;
  createdAt?: string;
  created_at?: string;
  images?: FeedImage[];
  my_ping_type?: string;
  // Babel Protocol
  authorType?: string;
  authorProfile?: {
    displayName?: string | null;
    avatarUrl?: string | null;
  } | null;
  originalLanguage?: string | null;
  targetLanguage?: string | null;
  ownerTranslation?: string | null;
  youtubeUrl?: string | null;
  // [생각 구독] 블러 판정용
  isSubscriberOnly?: boolean;
  isBlurred?: boolean;
  blurredUserId?: string | null;
  // [Babel Feed - Human] 인간 피드 번역
  isTranslated?: boolean;
  originalContent?: string | null;
  targetPixelId?: string | null;
  targetPixelCoord?: { x: number; y: number; z?: number } | null;
  isStore?: boolean;
  storeRating?: number;
  reviewCount?: number;
  contentTags?: string[];
  content_tags?: string[];
}

/**
 * 검색어 하이라이팅 순수 함수
 * - 컴포넌트 외부 모듈 레벨 선언 → 리렌더 시 재생성 없음
 * - capture group split: 홀수 인덱스(i % 2 === 1)는 항상 매칭된 부분
 * - 검색어에 포함된 정규식 특수문자는 escape 처리
 */
function highlightText(
  content: string,
  term: string,
  maxLen = 80,
): React.ReactNode {
  const truncated =
    content.length > maxLen ? `${content.substring(0, maxLen)}...` : content;
  if (!term.trim()) return truncated;

  const escaped = term.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(${escaped})`, "gi");
  const parts = truncated.split(regex);

  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <mark
        key={i}
        className="bg-indigo-500/40 text-indigo-100 rounded px-0.5 not-italic font-bold"
      >
        {part}
      </mark>
    ) : (
      part
    ),
  );
}

export type FeedTab = "latest" | "hot" | "top_pixelyear" | "gallery";

// [UTIL] YouTube ID 추출 — 공통 유틸에서 re-export (외부 import 호환성 유지)
export { extractYouTubeId } from "@/shared/utils/youtube";

const FEED_TABS: { key: FeedTab; labelKey: string; icon: React.ReactNode }[] = [
  {
    key: "latest",
    labelKey: "tabLatest",
    icon: <Clock className="w-3.5 h-3.5" />,
  },
  { key: "hot", labelKey: "tabHot", icon: <Flame className="w-3.5 h-3.5" /> },
  {
    key: "top_pixelyear",
    labelKey: "tabTopPixeler",
    icon: <Award className="w-3.5 h-3.5" />,
  },
  {
    key: "gallery",
    labelKey: "tabGallery",
    icon: <Image className="w-3.5 h-3.5" />,
  },
];

// ── Babel Protocol UI 컴포넌트 ──────────────────────────────

/** 전역 원문/번역 토글 버튼 */
function BabelToggleButton() {
  const { babelMode, toggleBabelMode } = useBabelStore();
  const tS = useTranslations("Search");
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        toggleBabelMode();
      }}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-bold border transition-all ${
        babelMode === "owner"
          ? "bg-violet-500/20 border-violet-500/50 text-violet-300"
          : "bg-white/10 border-theme text-theme-secondary hover:text-theme-primary"
      }`}
      title={
        babelMode === "owner"
          ? tS("babelSwitchOriginal")
          : tS("babelSwitchOwner")
      }
    >
      <Languages className="w-3.5 h-3.5" />
      {babelMode === "owner" ? tS("babelOwner") : tS("babelOriginal")}
    </button>
  );
}

/** Babel 콘텐츠 렌더러 — ownerTranslation이 있을 때 토글 가능, 인간 피드 번역도 처리 */
/** Babel 콘텐츠 렌더러 — 원문/번역 통합형 컴팩트 뱃지 제공 및 글로우 모션 이식 */
function BabelContent({
  feed,
  searchMode,
  debouncedSearchTerm,
  isMobile,
}: {
  feed: FeedItem;
  searchMode: SearchMode;
  debouncedSearchTerm: string;
  isMobile: boolean;
}) {
  const babelMode = useBabelStore((s) => s.babelMode);
  const tS = useTranslations("Search");
  const tSettings = useTranslations("Settings");
  const currentMoodId = useGalaxyStore((s) => s.currentMoodId);
  const moodColor = useMoodColor(currentMoodId);

  // 사용자의 실시간 원문 보기 로컬 상태
  const [isOriginalView, setIsOriginalView] = useState(false);

  // AI 은하 Babel 여부
  const hasAiTranslation = !!feed.ownerTranslation;
  // 인간 피드 Babel 여부
  const hasHumanTranslation = !!feed.isTranslated;

  // 번역 가용 여부
  const hasTranslation = hasAiTranslation || hasHumanTranslation;

  // 실시간 번역 적용 여부 결정
  const isShowingTranslation = React.useMemo(() => {
    if (isOriginalView) return false;
    if (babelMode === "owner" && hasAiTranslation) return true;
    return hasHumanTranslation;
  }, [isOriginalView, babelMode, hasAiTranslation, hasHumanTranslation]);

  // 표시할 최종 콘텐츠 계산
  const displayContent = React.useMemo(() => {
    if (isOriginalView && feed.originalContent) {
      return feed.originalContent;
    }
    if (isShowingTranslation) {
      return feed.ownerTranslation || feed.content;
    }
    return feed.originalContent || feed.content;
  }, [
    isOriginalView,
    isShowingTranslation,
    feed.originalContent,
    feed.ownerTranslation,
    feed.content,
  ]);

  // 검색어 매칭 하이라이트 연산
  const renderedContent = React.useMemo(() => {
    // 원본보기 상태(isOriginalView) 활성화 시 말줄임 처리 완전 배제 및 전체 출력
    if (isOriginalView) {
      if (searchMode === "content") {
        return highlightText(displayContent, debouncedSearchTerm, Infinity);
      }
      return displayContent;
    }

    if (searchMode === "content") {
      return highlightText(displayContent, debouncedSearchTerm);
    }
    return displayContent.length > 80
      ? `${displayContent.substring(0, 80)}...`
      : displayContent;
  }, [displayContent, searchMode, debouncedSearchTerm, isOriginalView]);

  const toggleOriginalView = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOriginalView((prev) => !prev);
  };

  return (
    <div
      className={`font-medium leading-relaxed group-hover:text-theme-primary transition-colors text-theme-secondary ${isMobile ? "text-[16px] mb-1.5" : "text-[16px] mb-2"}`}
    >
      <motion.div
        key={isShowingTranslation ? "translation" : "original"}
        initial={{ opacity: 0.7, y: 1 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="inline"
      >
        <span>{renderedContent}</span>
      </motion.div>

      {/* 프리미엄 일원화 번역 스위처 뱃지 */}
      {hasTranslation && (
        <MomentBabelSwitcher
          isShowingTranslation={isShowingTranslation}
          onToggle={toggleOriginalView}
          primaryHex={moodColor.primaryHex}
          viewOriginalLabel={tSettings("viewOriginal")}
          translatedLabel="번역됨"
        />
      )}
    </div>
  );
}

interface FeedCardProps {
  feed: FeedItem;
  searchMode: SearchMode;
  debouncedSearchTerm: string;
  isMobile: boolean;
  userProfile: any;
  currentMoodId: string;
  hoveredPixelId: string | null;
  selectedPixelId: string | null;
  setHoveredPixelId: (id: string | null) => void;
  handleFeedClick: (feed: FeedItem) => void;
  setLightboxImages: (images: FeedImage[]) => void;
  setLightboxIndex: (idx: number) => void;
  setIsLightboxOpen: (open: boolean) => void;
  isAiGalaxy?: boolean;
}

const FeedCard = React.memo(function FeedCard({
  feed,
  searchMode,
  debouncedSearchTerm,
  isMobile,
  userProfile,
  currentMoodId,
  hoveredPixelId,
  selectedPixelId,
  setHoveredPixelId,
  handleFeedClick,
  setLightboxImages,
  setLightboxIndex,
  setIsLightboxOpen,
  isAiGalaxy,
}: FeedCardProps) {
  const tS = useTranslations("Search");
  const tM = useTranslations("Moment");
  const isMe = userProfile && feed.id === userProfile.id;
  // 내 글이면 전역 스토어의 최신 무드를 실시간 강제 적용, 타인 글이면 feed 객체의 상태 사용
  const activeMoodId = isMe ? currentMoodId : feed.moodId || "neutral";
  const cardColor = feed.glowPrimary || getMoodColors(activeMoodId).primary;
  const isHoveredOrSelected =
    selectedPixelId === feed.id || hoveredPixelId === feed.id;

  return (
    <div
      onClick={() => handleFeedClick(feed)}
      onMouseEnter={() => setHoveredPixelId(feed.id)}
      onMouseLeave={() => setHoveredPixelId(null)}
      role="button"
      tabIndex={0}
      className={`w-full text-left transition-all duration-300 group cursor-pointer ${
        isMobile
          ? "px-4 py-3.5 active:bg-white/[0.03]"
          : "p-4 rounded-2xl border border-theme"
      }`}
      style={
        isMobile
          ? {
              borderBottom:
                "1px solid var(--theme-border, rgba(255,255,255,0.1))",
            }
          : {
              backgroundColor: isHoveredOrSelected
                ? `${cardColor}1A`
                : `${cardColor}0D`,
              borderColor: isHoveredOrSelected
                ? `${cardColor}33`
                : `var(--theme-border, ${cardColor}1A)`,
              boxShadow: isHoveredOrSelected
                ? `0 8px 30px ${cardColor}15`
                : "none",
              transform: isHoveredOrSelected ? "translateY(-2px)" : "none",
            }
      }
    >
      <div className={`flex items-center gap-3 mb-2`}>
        {/* 아바타 인디케이터 */}
        <div
          className={`shrink-0 rounded-full flex items-center justify-center font-black text-white/90 overflow-hidden ${isMobile ? "w-[52px] h-[52px] text-[16px]" : "w-[42px] h-[42px] text-[14px]"}`}
          style={{
            background: feed.avatarUrl ? "transparent" : cardColor,
            border: feed.avatarUrl ? `1.5px solid ${cardColor}60` : "none",
            boxShadow: `0 0 10px ${cardColor}40`,
          }}
          aria-hidden="true"
        >
          {feed.avatarUrl ? (
            <img
              src={feed.avatarUrl}
              alt=""
              className="w-full h-full object-cover"
            />
          ) : (
            (feed.author || "?")[0]
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 overflow-hidden">
            <span className="truncate text-[14px] font-black text-theme-primary flex items-center gap-1.5">
              {searchMode === "nickname"
                ? highlightText(feed.author, debouncedSearchTerm, 30)
                : feed.author}
              <PersonaBadge
                isStore={feed.isStore}
                storeRating={feed.storeRating}
                reviewCount={feed.reviewCount}
                personaCode={feed.personaCode}
                size="sm"
              />
              {!isAiGalaxy && feed.badge && (
                <span className="text-amber-400 text-[11px] font-bold">
                  {feed.badge}
                </span>
              )}
              {feed.authorType === "ai" && (
                <span className="text-violet-400 text-[11px] px-1.5 py-0.5 rounded bg-violet-500/15 border border-violet-500/30 font-bold">
                  AI
                </span>
              )}
            </span>
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            {feed.country && (
              <img
                src={`/flags/${feed.country.toLowerCase()}.svg`}
                alt={feed.country}
                className="w-3.5 h-3.5 shrink-0 rounded-sm"
              />
            )}
            <span
              className={`font-medium text-theme-secondary text-[12px] ${isMobile ? "" : "font-bold"}`}
              title={
                feed.createdAt
                  ? new Date(feed.createdAt).toLocaleString("ko-KR")
                  : ""
              }
            >
              {feed.createdAt
                ? relativeTime(feed.createdAt, tM)
                : feed.days === 0
                  ? tS("today")
                  : tS("daysAgo", { days: feed.days })}{" "}
              · {feed.galaxyLabel}
            </span>
          </div>
        </div>
      </div>

      {/* [생각 구독] 비구독자 블러 오버레이 */}
      {feed.isBlurred && (
        <div className="relative">
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-xl overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-slate-900/50 to-slate-900/90 backdrop-blur-sm" />
            <div className="relative z-20 flex flex-col items-center text-center py-3">
              <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 mb-2">
                <Lock className="w-2.5 h-2.5 text-amber-400" />
                <span className="text-[9px] font-bold text-amber-400">
                  {tS("subscriberOnly")}
                </span>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (feed.blurredUserId) {
                    handleFeedClick(feed);
                  }
                }}
                className="px-4 py-1.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-lg text-[10px] font-bold shadow-[0_4px_15px_rgba(245,158,11,0.3)] hover:shadow-[0_8px_25px_rgba(245,158,11,0.5)] transition-all duration-300 flex items-center gap-1.5"
              >
                <Sparkles className="w-3 h-3" />
                {tS("subViewFull")}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* [생각 구독] 구독자 전용 뱃지 (블러 아닌 상태) */}
      {feed.isSubscriberOnly && !feed.isBlurred && (
        <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 mb-1.5">
          <BookOpen className="w-2.5 h-2.5 text-amber-400" />
          <span className="text-[9px] font-bold text-amber-400">
            {tS("subscriberOnly")}
          </span>
        </div>
      )}
      <BabelContent
        feed={feed}
        searchMode={searchMode}
        debouncedSearchTerm={debouncedSearchTerm}
        isMobile={isMobile}
      />
      {/* 이미지 썸네일 */}
      {feed.images && Array.isArray(feed.images) && feed.images.length > 0 && (
        <div className="flex gap-1.5 mb-2 overflow-x-auto pb-1 custom-scrollbar">
          {(feed.images || []).map((img: FeedImage, idx: number) => (
            <button
              key={idx}
              onClick={(e) => {
                e.stopPropagation();
                setLightboxImages(feed.images || []);
                setLightboxIndex(idx);
                setIsLightboxOpen(true);
              }}
              className="shrink-0 relative overflow-hidden rounded-lg hover:brightness-110 transition flex items-center justify-center bg-black"
            >
              <img
                src={img.thumbnailUrl || img.mediumUrl || img.url}
                alt=""
                className={`object-cover ${isMobile ? "w-16 h-16 rounded-md" : "w-14 h-14"}`}
                loading="lazy"
              />
              {img.youtubeUrl && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                  <Youtube className="w-6 h-6 text-red-500 drop-shadow-md" />
                </div>
              )}
            </button>
          ))}
        </div>
      )}
      <div
        className={`flex items-center gap-2 flex-wrap w-full ${isMobile ? "" : "min-h-[14px]"}`}
      >
        {/* 핑 뱃지 그룹 (좌측 정렬) */}
        <div className="flex items-center gap-2 flex-wrap">
          {PING_TYPES.filter((pt) => (feed.pingTypeCounts?.[pt.id] || 0) > 0)
            .sort(
              (a, b) =>
                (feed.pingTypeCounts?.[b.id] || 0) -
                (feed.pingTypeCounts?.[a.id] || 0),
            )
            .slice(0, 6)
            .map((pt) => {
              const IconComp = PING_ICON_MAP[pt.icon];
              const count = feed.pingTypeCounts[pt.id];
              return (
                <span
                  key={pt.id}
                  className={`relative flex items-center gap-1 px-1.5 py-0.5 rounded-lg border border-white/20 cursor-default group/pingtip transition-all`}
                >
                  {IconComp && (
                    <IconComp className={`w-3 h-3 ${pt.iconColorClass}`} />
                  )}
                  <span className="text-[11px] font-bold tabular-nums text-white/70">
                    {count}
                  </span>
                  {/* 구종말 툴팁 */}
                  <span
                    className="
                      absolute bottom-full left-0 mb-2.5 z-50
                      w-52 p-3 rounded-2xl pointer-events-none
                      bg-slate-900/95 border border-white/10 shadow-2xl
                      opacity-0 group-hover/pingtip:opacity-100
                      transition-opacity duration-200
                      after:content-[''] after:absolute after:top-full after:left-3
                      after:border-[5px] after:border-transparent after:border-t-slate-900
                    "
                  >
                    <div className="flex items-center gap-1.5 mb-2">
                      {IconComp && (
                        <IconComp className="w-3.5 h-3.5 text-white/50" />
                      )}
                      <span className="text-[11px] font-black text-white">
                        {pt.label}
                      </span>
                      <span
                        className="ml-auto text-[10px] font-bold tabular-nums"
                        style={{ color: cardColor }}
                      >
                        {tS("countUnit", { count })}
                      </span>
                    </div>
                    <p className="text-[9px] text-white/50 leading-relaxed font-medium">
                      {pt.emotionalMessage}
                    </p>
                  </span>
                </span>
              );
            })}
        </div>

        {/* 댓글 뱃지 (우측 정렬) */}
        {feed.commentCount > 0 && (
          <span
            className="ml-auto flex items-center gap-1 px-1.5 py-0.5 rounded-lg border bg-slate-800/30 border-white/10"
            style={{ color: cardColor }}
          >
            <MessageCircle className="w-3 h-3" />
            <span className="text-[11px] font-bold tabular-nums">
              {feed.commentCount}
            </span>
          </span>
        )}
      </div>
    </div>
  );
});

export function SearchFeedDrawer() {
  const currentMoodId = useGalaxyStore((s) => s.currentMoodId);
  const moodColor = useMoodColor(currentMoodId);
  const tS = useTranslations("Search");
  const t = useTranslations("Pixel");
  const locale = useLocale();

  // 우주 공통 다크블루 테마 (Deep Midnight Dark Blue) 척추 스타일링 정의
  const midnightThemeStyle = React.useMemo(
    () =>
      ({
        "--theme-rgb": moodColor.themeRgb,
        "--theme-rgb-deep": "11, 15, 16", // #0b0f10 계열 RGB
        "--theme-rgb-light": moodColor.themeRgbLight,
        "--theme-bg": "#0b0f10", // Deep Midnight Dark Blue
        "--theme-text-primary": "rgba(255, 255, 255, 0.95)",
        "--theme-text-secondary": "rgba(255, 255, 255, 0.65)",
        "--theme-text-muted": "rgba(255, 255, 255, 0.45)",
        "--theme-border": "rgba(255, 255, 255, 0.08)",
        "--theme-card-bg": "rgba(255, 255, 255, 0.03)",
        "--theme-card-bg-hover": "rgba(255, 255, 255, 0.06)",
        "--theme-card-bg-active": "rgba(255, 255, 255, 0.09)",
        "--theme-btn-solid-bg": "rgba(255, 255, 255, 0.95)",
        "--theme-btn-solid-text": "black",
      }) as React.CSSProperties,
    [moodColor],
  );
  const isMobile = useMediaQuery("(max-width: 767px)");
  const isNative = isNativeApp();
  const { navigateToGalaxy } = useGalaxyNavigation();
  const { galaxies, categoryMap, getGalaxyByKey } = useGalaxySystem();

  // [DB 동적화] 은하/카테고리 라벨 맵 동적 생성
  const dynamicLabelMap = React.useMemo(() => {
    const map: Record<string, string> = {};
    for (const g of galaxies) {
      map[g.key] = g.name;
      for (const c of g.categories) {
        map[c.key] = c.name;
      }
    }
    // 레거시 모듈 변수 동기화 (PixelDetailDrawer 등에서 참조)
    Object.assign(GALAXY_LABEL_MAP, map);
    return map;
  }, [galaxies]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isSearchInputFocused, setIsSearchInputFocused] = useState(false);
  const [searchMode, setSearchMode] = useState<SearchMode>("content");

  // ── [MOBILE] Pull-to-Refresh 터치 엔진 상태 변수 ──
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const touchStartY = useRef(0);
  const isPullingRef = useRef(false);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (!isMobile || selectedPixelId) return;

    // 모바일 웹/앱 통합 자체 스크롤 대신 window.scrollY 기반으로 판정
    const isTop = window.scrollY === 0;

    if (isTop) {
      touchStartY.current = e.touches[0].clientY;
      isPullingRef.current = true;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isMobile || !isPullingRef.current || isRefreshing || selectedPixelId)
      return;
    const currentY = e.touches[0].clientY;
    const deltaY = currentY - touchStartY.current;

    // 아래 방향 드래그 시 거리 트래킹 (e.preventDefault()를 절대로 쓰지 않아 네이티브 Elastic Bounce 100% 보존!)
    if (deltaY > 0) {
      const newDistance = Math.min(100, deltaY * 0.35);
      setPullDistance(newDistance);
    }
  };

  const handleTouchEnd = async () => {
    if (!isMobile || !isPullingRef.current || selectedPixelId) return;
    isPullingRef.current = false;

    // 70px 이상 드래그 시 새로고침 가동
    if (pullDistance >= 70) {
      setIsRefreshing(true);
      setPullDistance(0); // 당김 상태값은 즉시 0으로 밀어내어 네이티브 바운스 복귀 방해 안 함
      try {
        // 업계 표준: 검색 상태(현재 검색어/카테고리)를 그대로 유지한 채 최신 피드 리로드
        await fetchFeeds(0, true, debouncedSearchTerm);
      } catch (err) {
        console.error("Pull to refresh revalidate failed:", err);
      } finally {
        setIsRefreshing(false);
      }
    } else {
      setPullDistance(0);
    }
  };
  const [isResizeHovered, setIsResizeHovered] = useState(false);
  const [isResizeActive, setIsResizeActive] = useState(false);
  const userProfile = useUserStore((s) => s.user);
  const galaxyKey = useGalaxyStore((s) => s.galaxyKey);
  const activeCategory = useGalaxyStore((s) => s.activeCategory);
  const setActiveCategory = useGalaxyStore((s) => s.setActiveCategory);
  const [activeTab, setActiveTab] = useState<FeedTab>("latest");
  const [feedScope, setFeedScope] = useState<"global" | "bonds">("global");
  const [feedType, setFeedType] = useState<"moment" | "community">("moment");
  const [isScopeDropdownOpen, setIsScopeDropdownOpen] = useState(false);
  const [slideDirection, setSlideDirection] = useState<"left" | "right">(
    "left",
  );
  const isSearchFeedOpen = useGalaxyStore((s) => s.isSearchFeedOpen);
  const setIsSearchFeedOpen = useGalaxyStore((s) => s.setIsSearchFeedOpen);
  const isCollapsed = !isSearchFeedOpen;
  const setIsCollapsed = useCallback(
    (collapsed: boolean | ((prev: boolean) => boolean)) => {
      if (typeof collapsed === "function") {
        setIsSearchFeedOpen(
          !collapsed(!useGalaxyStore.getState().isSearchFeedOpen),
        );
      } else {
        setIsSearchFeedOpen(!collapsed);
      }
    },
    [setIsSearchFeedOpen],
  );
  const [panelWidth, setPanelWidth] = useState(520);
  const { panelRef, handleResizeStart } = usePanelResizable({
    currentWidth: panelWidth,
    onWidthChange: setPanelWidth,
    direction: "left",
  });
  const lastScrollTime = useRef(0);

  // [LIGHTBOX] 이미지 상세보기 모달 상태
  const [lightboxImages, setLightboxImages] = useState<FeedImage[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const hoveredPixelId = useGalaxyStore((s) => s.hoveredPixelId);
  const setHoveredPixelId = useGalaxyStore((s) => s.setHoveredPixelId);

  // [Babel Feed] 원본보기 모달 상태
  const [feedImageIndex, setFeedImageIndex] = useState<number>(0);
  const tSettings = useTranslations("Settings");

  const selectedPixelId = useGalaxyStore((s) => s.selectedPixelId);

  // Desktop-only category horizontal scroll logic
  const categoryScrollRef = useRef<HTMLDivElement>(null);
  const mobileScrollRef = useRef<HTMLDivElement>(null);
  const [showLeftScrollBtn, setShowLeftScrollBtn] = useState(false);
  const [showRightScrollBtn, setShowRightScrollBtn] = useState(false);

  const updateCategoryScrollButtons = () => {
    const container = categoryScrollRef.current;
    if (!container || isMobile) {
      setShowLeftScrollBtn(false);
      setShowRightScrollBtn(false);
      return;
    }
    const { scrollLeft, scrollWidth, clientWidth } = container;

    // Hysteresis Dead-Zone (임계치 완충지대) 도입 및 elastic scroll 바운스 음수 방어
    setShowLeftScrollBtn((prev) => {
      if (scrollLeft <= 1) return false; // Mac 바운스 등으로 1px 이하로 떨어지면 즉시 끈다.
      if (prev) {
        return scrollLeft > 4; // 끄는 기준: 4px 이하
      } else {
        return scrollLeft > 12; // 켜는 기준: 12px 이상
      }
    });

    setShowRightScrollBtn((prev) => {
      const remainingScroll = scrollWidth - (scrollLeft + clientWidth);
      if (remainingScroll <= 1) return false; // 바운스로 인해 한계를 넘거나 거의 다다르면 즉시 끈다.
      if (prev) {
        return remainingScroll > 4; // 끄는 기준: 4px 이하
      } else {
        return remainingScroll > 12; // 켜는 기준: 12px 이상
      }
    });
  };

  useEffect(() => {
    const container = categoryScrollRef.current;
    if (!container || isMobile) return;

    updateCategoryScrollButtons();

    const handleScrollEvent = () => {
      updateCategoryScrollButtons();
    };

    const resizeObserver = new ResizeObserver(() => {
      updateCategoryScrollButtons();
    });
    resizeObserver.observe(container);

    const handleWheelEvent = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) > 0) {
        return;
      }

      if (Math.abs(e.deltaY) > 0) {
        e.preventDefault();
        container.scrollLeft += e.deltaY;
      }
    };

    container.addEventListener("scroll", handleScrollEvent, { passive: true });
    container.addEventListener("wheel", handleWheelEvent, { passive: false });
    return () => {
      resizeObserver.disconnect();
      container.removeEventListener("scroll", handleScrollEvent);
      container.removeEventListener("wheel", handleWheelEvent);
    };
  }, [galaxyKey, categoryMap, isMobile]);

  const scrollCategory = (direction: "left" | "right") => {
    const container = categoryScrollRef.current;
    if (!container) return;
    const scrollAmount = container.clientWidth * 0.6;
    container.scrollBy({
      left: direction === "left" ? -scrollAmount : scrollAmount,
      behavior: "smooth",
    });
  };

  // ── 스크롤 방향 감지 로직 (Smooth Transition 방식) ──
  const [isHeaderVisible, setIsHeaderVisible] = useState(true);
  const lastScrollY = useRef(0);

  useEffect(() => {
    if (!isMobile || selectedPixelId) return;

    const handleWindowScroll = () => {
      const currentScrollY = window.scrollY;
      const deltaY = currentScrollY - lastScrollY.current;

      const now = Date.now();
      if (now - lastScrollTime.current < 80) return;
      lastScrollTime.current = now;

      // 스크롤 편차 임계값을 25px로 넓혀 Jitter 방지
      if (Math.abs(deltaY) < 25 && currentScrollY > 56) return;

      lastScrollY.current = currentScrollY;

      if (currentScrollY < 56) {
        setIsHeaderVisible(true);
        window.dispatchEvent(
          new CustomEvent("mobile-header-visibility", {
            detail: { visible: true },
          }),
        );
      } else if (deltaY > 0) {
        // Scrolling down
        setIsHeaderVisible(false);
        window.dispatchEvent(
          new CustomEvent("mobile-header-visibility", {
            detail: { visible: false },
          }),
        );
      } else if (deltaY < 0) {
        // Scrolling up
        setIsHeaderVisible(true);
        window.dispatchEvent(
          new CustomEvent("mobile-header-visibility", {
            detail: { visible: true },
          }),
        );
      }
    };

    window.addEventListener("scroll", handleWindowScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleWindowScroll);
  }, [isMobile, selectedPixelId]);

  // [P1] 검색어 디바운스 상태
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState(searchTerm);

  // ── 스코프 드롭다운 외부 클릭 감지 및 닫기 ──
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (isScopeDropdownOpen && !target.closest(".scope-dropdown-container")) {
        setIsScopeDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isScopeDropdownOpen]);

  // ── 외부 스코프 전환 이벤트 수신 (네이티브 브릿지 대응) ──
  useEffect(() => {
    const handler = (e: Event) => {
      const scope = (e as CustomEvent).detail as "global" | "bonds";
      setFeedScope(scope);
    };
    window.addEventListener("SWITCH_FEED_SCOPE", handler);
    return () => window.removeEventListener("SWITCH_FEED_SCOPE", handler);
  }, []);

  // 검색어 입력 시 400ms 지연 후 디바운스 적용
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // [MOBILE] 모바일 검색 오버레이에서 보낸 검색어/모드 수신
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.searchTerm !== undefined) setSearchTerm(detail.searchTerm);
      if (detail?.searchMode) setSearchMode(detail.searchMode);
    };
    window.addEventListener("mobile-search-update", handler);
    return () => window.removeEventListener("mobile-search-update", handler);
  }, []);

  // ── [MOBILE APP] 하단 탭 재클릭으로 피드 검색 초기화 브릿지 연동 ──
  useEffect(() => {
    const handleReset = () => {
      console.log(
        "[SearchFeedDrawer] Resetting feed search from native bridge event",
      );
      setSearchTerm("");

      // 스크롤 최상단 원상 복구
      if (mobileScrollRef.current) {
        mobileScrollRef.current.scrollTo({ top: 0, behavior: "smooth" });
      }
      window.scrollTo({ top: 0, behavior: "smooth" });
    };

    window.addEventListener("RESET_FEED_SEARCH", handleReset);
    return () => window.removeEventListener("RESET_FEED_SEARCH", handleReset);
  }, []);

  // ── [HOOK] 피드 로딩/이벤트/네비게이션 → useSearchFeed ──
  const {
    feeds,
    setFeeds,
    loading,
    hasMore,
    sentinelRef,
    fetchFeeds,
    handleFeedClick,
  } = useSearchFeed({
    activeTab,
    feedScope,
    searchMode,
    debouncedSearchTerm,
    isCollapsed,
    dynamicLabelMap,
    feedType,
  });

  // [LAYOUT] Flex 컨테이너 내부 블록이므로 width 전환으로 개폐 처리
  const effectiveWidth = isCollapsed ? 0 : panelWidth;

  // ── 공유 패널 내부 컨텐츠 ──
  const panelContent = (
    <>
      {/* ── 상단 고정 영역 (검색 바 + 카테고리 + 탭) ── */}
      <div
        id="mobile-tab-wrapper"
        className={
          isMobile ? "sticky top-[56px] z-40" : "shrink-0 flex flex-col"
        }
      >
        {/* CSS Transition 래퍼 */}
        <div
          className={`w-full flex flex-col transition-transform duration-300 ease-in-out ${
            isMobile
              ? isHeaderVisible
                ? "translate-y-0 bg-[#0b0f10]"
                : "-translate-y-[56px] bg-[#0b0f10]"
              : ""
          }`}
        >
          {/* 데스크탑 타이틀 */}
          {!isMobile && (
            <div
              data-tour="drawer-search"
              className="p-5 border-b flex flex-col gap-3 border-theme"
            >
              {/* ── 일반 은하: 기존 검색 + 스코프 헤더 ── */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="relative z-50 scope-dropdown-container">
                    <button
                      data-tour="drawer-scope-select"
                      onClick={() => {
                        if (userProfile)
                          setIsScopeDropdownOpen(!isScopeDropdownOpen);
                      }}
                      className={`flex items-center gap-1.5 hover:bg-white/5 px-2 py-1 -ml-2 rounded-lg transition-colors ${!userProfile ? "cursor-default" : ""}`}
                    >
                      <h2 className="text-white font-bold text-base flex items-center gap-1.5">
                        {feedScope === "bonds" ? (
                          <Users
                            className="w-4 h-4"
                            style={{ color: moodColor.primaryHex }}
                          />
                        ) : (
                          <Search
                            className="w-3.5 h-3.5"
                            style={{ color: moodColor.primaryHex }}
                          />
                        )}
                        {feedScope === "bonds"
                          ? tS("myBonds")
                          : dynamicLabelMap[galaxyKey] || galaxyKey}{" "}
                        {tS("feedSearch")}
                      </h2>
                      {userProfile && (
                        <ChevronDown
                          className={`w-4 h-4 text-white/50 transition-transform ${isScopeDropdownOpen ? "rotate-180" : ""}`}
                        />
                      )}
                    </button>

                    {/* 드롭다운 메뉴 (수정 삭제 팝업과 같이 완벽한 화이트 배경 고대비 스타일 전환) */}
                    {isScopeDropdownOpen && (
                      <div className="absolute top-full left-0 mt-2 w-56 bg-deep-space border border-slate-edge rounded-2xl p-1.5 shadow-xl animate-in fade-in zoom-in duration-200 z-50">
                        <button
                          onClick={() => {
                            setFeedScope("global");
                            setIsScopeDropdownOpen(false);
                          }}
                          className={`w-full text-left px-3 py-2 flex items-start gap-2.5 rounded-xl transition-all duration-200 no-theme-hover ${
                            feedScope === "global"
                              ? "bg-white text-slate-950 shadow-sm font-extrabold"
                              : "hover:bg-white/5 text-white/50 hover:text-white"
                          }`}
                        >
                          <Globe
                            className="w-3.5 h-3.5 shrink-0 mt-0.5"
                            style={
                              feedScope === "global"
                                ? { color: "#0f172a" }
                                : { color: "rgba(255, 255, 255, 0.4)" }
                            }
                          />
                          <div className="flex flex-col">
                            <span className="text-xs font-bold leading-none">
                              {tS("exploreAll")}
                            </span>
                            <span
                              className={`text-[10px] mt-1 font-medium leading-normal ${
                                feedScope === "global"
                                  ? "text-slate-500"
                                  : "text-white/30"
                              }`}
                            >
                              {tS("exploreAllDesc")}
                            </span>
                          </div>
                          {feedScope === "global" && (
                            <Check className="w-3.5 h-3.5 text-slate-950 ml-auto shrink-0 self-center" />
                          )}
                        </button>
                        <button
                          onClick={() => {
                            setFeedScope("bonds");
                            setIsScopeDropdownOpen(false);
                          }}
                          className={`w-full text-left px-3 py-2 mt-1 flex items-start gap-2.5 rounded-xl transition-all duration-200 no-theme-hover ${
                            feedScope === "bonds"
                              ? "bg-white text-slate-950 shadow-sm font-extrabold"
                              : "hover:bg-white/5 text-white/50 hover:text-white"
                          }`}
                        >
                          <Users
                            className="w-3.5 h-3.5 shrink-0 mt-0.5"
                            style={
                              feedScope === "bonds"
                                ? { color: "#0f172a" }
                                : { color: "rgba(255, 255, 255, 0.4)" }
                            }
                          />
                          <div className="flex flex-col">
                            <span className="text-xs font-bold leading-none">
                              {tS("myBondPixelers")}
                            </span>
                            <span
                              className={`text-[10px] mt-1 font-medium leading-normal ${
                                feedScope === "bonds"
                                  ? "text-slate-500"
                                  : "text-white/30"
                              }`}
                            >
                              {tS("myBondPixelersDesc")}
                            </span>
                          </div>
                          {feedScope === "bonds" && (
                            <Check className="w-3.5 h-3.5 text-slate-950 ml-auto shrink-0 self-center" />
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                {/* 검색 모드 (타이틀 우측 인라인) */}
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setSearchMode("content")}
                    className={`px-3 py-1.5 rounded-full text-[12px] font-bold border transition-all ${
                      searchMode === "content"
                        ? "bg-white border-white shadow-sm text-black font-black"
                        : "bg-white/10 border-theme text-theme-secondary hover:text-theme-primary"
                    }`}
                  >
                    {tS("contentMode")}
                  </button>
                  <button
                    onClick={() => setSearchMode("nickname")}
                    className={`px-3 py-1.5 rounded-full text-[12px] font-bold border transition-all ${
                      searchMode === "nickname"
                        ? "bg-white border-white shadow-sm text-black font-black"
                        : "bg-white/10 border-theme text-theme-secondary hover:text-theme-primary"
                    }`}
                  >
                    {tS("nicknameMode")}
                  </button>
                </div>
              </div>

              <div className="relative">
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onFocus={() => setIsSearchInputFocused(true)}
                  onBlur={() => setIsSearchInputFocused(false)}
                  placeholder={
                    searchMode === "nickname"
                      ? tS("searchNickname")
                      : tS("searchContent")
                  }
                  className="w-full bg-slate-900/50 border border-slate-700/50 rounded-xl px-4 py-2.5 pr-10 text-sm text-white placeholder-white/30 focus:outline-none focus:bg-slate-800 transition-all font-medium"
                  style={
                    isSearchInputFocused
                      ? {
                          borderColor: moodColor.primaryHex,
                          boxShadow: `0 0 0 1px ${moodColor.primaryHex}50`,
                        }
                      : undefined
                  }
                />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/70 transition"
                    title={tS("clearSearch")}
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ── [모먼트] / [리뷰] 2단 탭 ── */}
          <div
            data-tour="drawer-tabs"
            className={`flex border-b border-theme shrink-0 ${isMobile ? "px-3 pt-2 bg-[#0b0f10]" : "px-5 py-2.5 bg-white/[0.01]"}`}
          >
            <button
              onClick={() => setFeedType("moment")}
              className={`flex-1 py-2 text-center text-sm font-bold transition-all relative no-theme-hover ${
                feedType === "moment"
                  ? "text-white"
                  : "text-white/40 hover:text-white"
              }`}
            >
              <span>{t("feed")}</span>
              {feedType === "moment" && (
                <motion.div
                  layoutId={
                    pullDistance > 0 || isRefreshing
                      ? undefined
                      : "searchFeedTypeUnderline"
                  }
                  className="absolute bottom-0 left-0 right-0 h-[2px] rounded-full"
                  style={{ backgroundColor: moodColor.primaryHex }}
                  transition={{ type: "spring", damping: 30, stiffness: 280 }}
                />
              )}
            </button>
            <button
              onClick={() => setFeedType("community")}
              className={`flex-1 py-2 text-center text-sm font-bold transition-all relative no-theme-hover ${
                feedType === "community"
                  ? "text-white"
                  : "text-white/40 hover:text-white"
              }`}
            >
              <span>{t("community")}</span>
              {feedType === "community" && (
                <motion.div
                  layoutId={
                    pullDistance > 0 || isRefreshing
                      ? undefined
                      : "searchFeedTypeUnderline"
                  }
                  className="absolute bottom-0 left-0 right-0 h-[2px] rounded-full"
                  style={{ backgroundColor: moodColor.primaryHex }}
                  transition={{ type: "spring", damping: 30, stiffness: 280 }}
                />
              )}
            </button>
          </div>

          {/* 모바일 전용 검색/카테고리 래퍼 */}
          {feedType === "moment" && (
            <div
              data-tour="drawer-categories"
              className={`shrink-0 z-10 border-b border-theme relative group/catbar ${isMobile ? "pt-3 pb-2 px-3" : "pt-4 pb-3 px-5 bg-white/[0.03] backdrop-blur-md"}`}
            >
              {/* 좌측 스크롤 버튼 + 그라데이션 블러 (데스크탑 전용) */}
              {!isMobile && (
                <div
                  className={`absolute left-0 top-0 bottom-0 z-10 flex items-center pr-8 bg-gradient-to-r from-[var(--theme-bg)] via-[var(--theme-bg)]/80 to-transparent pointer-events-none transition-opacity duration-300 ${
                    showLeftScrollBtn ? "opacity-100" : "opacity-0"
                  }`}
                >
                  <button
                    onClick={() => scrollCategory("left")}
                    className={`w-7 h-7 flex items-center justify-center rounded-full bg-white/10 border border-white/10 text-white hover:bg-white/20 transition-all backdrop-blur-md shadow-md active:scale-95 ml-2 ${
                      showLeftScrollBtn
                        ? "pointer-events-auto"
                        : "pointer-events-none"
                    }`}
                    aria-label="Scroll left"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              <div
                ref={categoryScrollRef}
                className={`flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1 scroll-smooth ${isMobile ? "-mx-3 px-3" : "-mx-5 px-5"}`}
              >
                <button
                  onClick={(e) => {
                    navigateToGalaxy(galaxyKey, null);
                    e.currentTarget.scrollIntoView({
                      behavior: "smooth",
                      block: "nearest",
                      inline: "center",
                    });
                  }}
                  className={`shrink-0 px-3.5 py-1.5 rounded-full text-[14px] font-bold border transition-all ${
                    activeCategory === null
                      ? "bg-white border-white shadow-sm text-black font-black"
                      : "bg-white/10 border-theme text-theme-secondary hover:text-theme-primary"
                  }`}
                >
                  {tS("allTab")}
                </button>
                {/* 현재 은하의 카테고리 칩 (DB 동적) */}
                {(categoryMap[galaxyKey] || []).map((cat) => {
                  const isActive = activeCategory === cat.key;
                  return (
                    <button
                      key={cat.key}
                      onClick={(e) => {
                        navigateToGalaxy(
                          galaxyKey,
                          activeCategory === cat.key ? null : cat.key,
                        );
                        e.currentTarget.scrollIntoView({
                          behavior: "smooth",
                          block: "nearest",
                          inline: "center",
                        });
                      }}
                      className={`shrink-0 px-3.5 py-1.5 rounded-full text-[14px] font-bold border transition-all ${
                        isActive
                          ? "bg-white border-white shadow-sm text-black font-black"
                          : "bg-white/10 border-theme text-theme-secondary hover:text-theme-primary"
                      }`}
                    >
                      {cat.name}
                    </button>
                  );
                })}
              </div>

              {/* 우측 스크롤 버튼 + 그라데이션 블러 (데스크탑 전용) */}
              {!isMobile && (
                <div
                  className={`absolute right-0 top-0 bottom-0 z-10 flex items-center pl-8 bg-gradient-to-l from-[var(--theme-bg)] via-[var(--theme-bg)]/80 to-transparent pointer-events-none transition-opacity duration-300 ${
                    showRightScrollBtn ? "opacity-100" : "opacity-0"
                  }`}
                >
                  <button
                    onClick={() => scrollCategory("right")}
                    className={`w-7 h-7 flex items-center justify-center rounded-full bg-white/10 border border-white/10 text-white hover:bg-white/20 transition-all backdrop-blur-md shadow-md active:scale-95 mr-2 ${
                      showRightScrollBtn
                        ? "pointer-events-auto"
                        : "pointer-events-none"
                    }`}
                    aria-label="Scroll right"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── 탭 스트립 (최신/인기/탑/갤러리) ── */}
          {feedType === "moment" && (
            <div
              className={`flex items-center px-2 ${isMobile ? "" : "border-b border-white/5 bg-slate-950/60"}`}
              style={
                isMobile
                  ? {
                      backgroundColor: "#0b0f10",
                      borderBottom: "1px solid #1a1a1a",
                    }
                  : undefined
              }
            >
              {FEED_TABS.map((tab, idx) => {
                const currentIdx = FEED_TABS.findIndex(
                  (t) => t.key === activeTab,
                );
                return (
                  <button
                    key={tab.key}
                    onClick={() => {
                      setSlideDirection(idx > currentIdx ? "left" : "right");
                      setActiveTab(tab.key);
                    }}
                    className={`flex-1 flex items-center justify-center gap-1 py-2.5 text-xs font-bold transition-all relative ${
                      activeTab === tab.key
                        ? "text-white"
                        : "text-white/60 hover:text-white/80"
                    }`}
                    style={
                      activeTab === tab.key
                        ? { color: moodColor.primaryHex }
                        : undefined
                    }
                  >
                    <span>{tab.icon}</span>
                    <span>{tS(tab.labelKey)}</span>
                    {activeTab === tab.key && (
                      <div
                        className="absolute bottom-0 left-1/4 right-1/4 h-[2px] rounded-full"
                        style={{ backgroundColor: moodColor.primaryHex }}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>{" "}
        {/* CSS Transition 래퍼 닫기 */}
      </div>

      {/* 피드 리스트 (슬라이드 애니메이션 & UX 피드백) */}
      <div
        data-tour="drawer-list"
        className={`flex-1 transition-opacity duration-200 ${isMobile ? "flex flex-col px-0 py-0" : "overflow-y-auto overflow-x-hidden custom-scrollbar py-5 pl-4 pr-3 space-y-2.5"} ${searchTerm !== debouncedSearchTerm ? "opacity-40 pointer-events-none" : "opacity-100"}`}
        key={activeTab}
        style={{
          animation: `slide-in-${slideDirection} 0.2s ease-out`,
        }}
      >
        {/* [MOBILE ONLY] 업계 표준 검색 취소 칩 배너 */}
        {isMobile && searchTerm && (
          <div className="px-4 pt-3 pb-1 shrink-0 animate-in fade-in duration-300">
            <div className="flex items-center justify-between bg-white/5 border border-white/10 rounded-full px-3.5 py-1.5 shadow-sm">
              <div className="flex items-center gap-2 min-w-0">
                <Search className="w-3.5 h-3.5 shrink-0 text-white/40" />
                <span className="text-[12px] font-bold text-white/80 truncate">
                  '{searchTerm}' 검색 결과
                </span>
              </div>
              <button
                onClick={() => setSearchTerm("")}
                className="w-5 h-5 flex items-center justify-center rounded-full bg-white/10 text-white/60 hover:text-white transition active:scale-95 ml-2 shrink-0"
                title={tS("clearSearch")}
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          </div>
        )}
        {/* 스켈레톤 로딩 (초기 로딩 시) */}
        {loading && feeds.length === 0 && (
          <div className="flex flex-col gap-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={`skel-${i}`}
                className="w-full p-4 rounded-xl bg-theme-card border border-theme animate-pulse"
              >
                <div className="flex items-center gap-2 mb-3">
                  <div className="h-6 w-6 rounded-full bg-white/10" />
                  <div className="space-y-1">
                    <div className="h-2.5 w-16 rounded bg-white/10" />
                    <div className="h-2 w-12 rounded bg-white/5" />
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="h-3.5 w-2/3 rounded bg-white/10" />
                </div>
                <div className="flex gap-2 mt-3">
                  <div className="h-6 w-14 rounded-lg bg-white/5" />
                  <div className="h-6 w-14 rounded-lg bg-white/5" />
                </div>
              </div>
            ))}
          </div>
        )}
        {feeds.map((feed, index) => (
          <FeedCard
            key={`${feed.id}-${index}`}
            feed={feed}
            searchMode={searchMode}
            debouncedSearchTerm={debouncedSearchTerm}
            isMobile={isMobile}
            userProfile={userProfile}
            currentMoodId={currentMoodId}
            hoveredPixelId={hoveredPixelId}
            selectedPixelId={selectedPixelId}
            setHoveredPixelId={setHoveredPixelId}
            handleFeedClick={handleFeedClick}
            setLightboxImages={setLightboxImages}
            setLightboxIndex={setLightboxIndex}
            setIsLightboxOpen={setIsLightboxOpen}
            isAiGalaxy={false}
          />
        ))}
        {/* 빈 상태 UI */}
        {feeds.length === 0 && !loading && (
          <div className="flex flex-col items-center gap-4 py-16">
            <div className="relative">
              <div
                className="w-16 h-16 rounded-full border flex items-center justify-center"
                style={{
                  backgroundColor: `${moodColor.primaryHex}1A`,
                  borderColor: `${moodColor.primaryHex}33`,
                }}
              >
                <Sparkles
                  className="w-7 h-7"
                  style={{ color: `${moodColor.primaryHex}66` }}
                />
              </div>
              <div
                className="absolute -top-1 -right-1 w-3 h-3 rounded-full animate-pulse"
                style={{ backgroundColor: `${moodColor.primaryHex}4D` }}
              />
            </div>
            <div className="text-center space-y-1.5">
              <p className="text-sm font-bold text-white/40">
                {debouncedSearchTerm
                  ? tS("noResultsFor", { term: debouncedSearchTerm })
                  : tS("noRecords")}
              </p>
              <p className="text-[11px] text-white/20 leading-relaxed whitespace-pre-line">
                {debouncedSearchTerm
                  ? searchMode === "nickname"
                    ? tS("tryOtherNickname")
                    : tS("tryOtherKeyword")
                  : tS("firstRecord")}
              </p>
            </div>
          </div>
        )}

        {/* 무한 스크롤 감지 포인트 */}
        <div ref={sentinelRef} className="h-4" />

        {loading && feeds.length > 0 && (
          <div className="flex items-center justify-center py-8">
            <LogoSpinner size={16} variant="white" />
            <span className="text-[10px] text-white/30 font-medium ml-2">
              {tS("loadingMore")}
            </span>
          </div>
        )}

        {!hasMore && feeds.length > 0 && (
          <p className="text-[10px] text-white/15 text-center py-2 font-medium">
            {tS("allRecordsShown")}
          </p>
        )}
      </div>
    </>
  );

  // ── 라이트박스 (모바일/데스크탑 공통) ──
  const lightbox = (
    <ImageLightbox
      images={lightboxImages}
      initialIndex={lightboxIndex}
      isOpen={isLightboxOpen}
      onClose={() => setIsLightboxOpen(false)}
    />
  );

  // ── [MOBILE] 모바일: 풀스크런 래퍼 ──
  if (isMobile) {
    const pullToRefreshHeader = (
      <div
        className="w-full flex items-center justify-center overflow-hidden pointer-events-none shrink-0"
        style={{
          height: isRefreshing ? 80 : pullDistance,
          opacity: isRefreshing ? 1 : Math.min(1, pullDistance / 40),
          transition: isPullingRef.current
            ? "none"
            : "height 0.3s, opacity 0.3s",
          backgroundColor: "#0b0f10",
        }}
      >
        {(isRefreshing || pullDistance >= 40) && <LogoSpinner size={56} />}
      </div>
    );

    // ── [MOBILE] 모바일 웹/앱 통합 자체 스크롤 컨테이너 구조로 단일화 ──
    return (
      <>
        <div
          ref={mobileScrollRef}
          className="theme-panel-bg text-theme-primary w-full h-auto overflow-x-clip"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          style={{
            pointerEvents: selectedPixelId ? "none" : "auto",
            ...midnightThemeStyle,
          }}
        >
          {/* 헤더 공간 확보 (Scroll-Linked Animation 용) */}
          <div style={{ height: 56 }} className="w-full shrink-0" />
          {pullToRefreshHeader}
          {panelContent}
        </div>
        {lightbox}
      </>
    );
  }

  // ── [DESKTOP] 데스크탑: 기존 사이드 패널 래퍼 ──
  return (
    <>
      <motion.div
        ref={panelRef}
        data-tour="feed-drawer"
        animate={{ width: effectiveWidth }}
        transition={{ type: "spring", damping: 28, stiffness: 260 }}
        style={{
          position: "relative",
          height: "100%",
          flexShrink: 0,
          overflow: "visible",
          pointerEvents: "auto",
          width: effectiveWidth,
          zIndex: 60,
          ...midnightThemeStyle,
        }}
        className="flex"
      >
        {/* ── 토글 버튼 ── */}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="absolute -left-9 top-1/2 -translate-y-1/2 w-9 h-12 flex items-center justify-center bg-slate-900/80 backdrop-blur-md border border-theme border-r-0 rounded-l-full text-white/60 hover:text-white hover:bg-slate-800/80 transition-all z-[60] shadow-lg"
          title={isCollapsed ? tS("openSearchPanel") : tS("closeSearchPanel")}
        >
          {isCollapsed ? (
            <ChevronLeft className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
        </button>

        {/* ── 좌측 리사이즈 핸들 ── */}
        <div
          onPointerDown={(e) => {
            setIsResizeActive(true);
            handleResizeStart(e);
            const upHandler = () => {
              setIsResizeActive(false);
              window.removeEventListener("pointerup", upHandler);
            };
            window.addEventListener("pointerup", upHandler);
          }}
          onMouseEnter={() => setIsResizeHovered(true)}
          onMouseLeave={() => {
            setIsResizeHovered(false);
            setIsResizeActive(false);
          }}
          className="absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize transition-colors z-[61]"
          style={
            isResizeActive
              ? { backgroundColor: "rgba(99, 102, 241, 0.5)" } // 50%
              : isResizeHovered
                ? { backgroundColor: "rgba(99, 102, 241, 0.3)" } // 30%
                : undefined
          }
        />

        {/* ── 메인 패널 ── */}
        <div className="theme-panel-bg text-theme-primary flex-1 backdrop-blur-3xl border-l border-theme flex flex-col shadow-2xl overflow-hidden">
          {/* [UX FIX] 슬라이드 애니메이션 중 가로 찌그러짐 방지 이너 래퍼 */}
          <div
            style={
              isMobile
                ? undefined
                : {
                    width: panelWidth,
                    minWidth: panelWidth,
                    height: "100%",
                    display: "flex",
                    flexDirection: "column",
                  }
            }
          >
            {panelContent}
          </div>
        </div>
      </motion.div>
      {lightbox}
    </>
  );
}

/* eslint-disable @next/next/no-img-element */
"use client";

import { MobileFullPopupWrapper } from "@/shared/ui/MobileFullPopupWrapper";

import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  ReactNode,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Lock,
  UserCircle,
  Settings,
  Sparkles,
  Link2,
  BookOpen,
  Hand,
  MoreVertical,
  Pencil,
  PencilLine,
  Trash2,
  MessageSquare,
  Plus,
  Star,
  MessageSquarePlus,
  BarChart2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Youtube,
  HandHelping,
  Droplets,
  Umbrella,
  Moon,
  Heart,
  Zap,
  HandMetal,
  Wand2,
  Share2,
  Telescope,
  Send,
  Users,
  MessagesSquare,
  ArrowLeft,
  Activity,
  Phone,
  MapPin,
  Clock,
  Camera,
  Utensils,
  HelpCircle,
} from "lucide-react";
import { LogoSpinner } from "@/shared/ui/LogoSpinner";

import { useGalaxyStore } from "@/stores/galaxyStore";
import { useUserStore } from "@/entities/user/model/useUserStore";
import { usePingStore } from "@/stores/pingStore";
import { useToastStore } from "@/stores/toastStore";
import { PING_TYPES, PING_ICON_MAP } from "@/shared/constants/pings";
import { PERSONA_MAP } from "@/shared/constants/personas";
import { CAMERA_ZOOM } from "@/shared/constants/camera";
import { relativeTime } from "@/shared/utils/relativeTime";
import { ProfileEditModal } from "./ProfileEditModal";
import { CreateGroupModal } from "../dm/CreateGroupModal";
import { SupernovaModal } from "./SupernovaModal";
import { MomentCommentAccordion } from "./MomentCommentAccordion";
import { MomentKebabMenu } from "./MomentKebabMenu";
import { MomentBabelSwitcher } from "./MomentBabelSwitcher";
import { useMediaQuery } from "@/shared/hooks/useMediaQuery";
import { PixelAnalyticsPanel } from "./PixelAnalyticsPanel";
import { ImageLightbox } from "./ImageLightbox";
import { useMoodColor } from "@/shared/hooks/useMoodColor";
import { FeedImage, FeedItem } from "./SearchFeedDrawer";
import { extractYouTubeId, getYouTubeThumbnail } from "@/shared/utils/youtube";
import { Logo } from "@/shared/ui/Logo";
import { useGalaxySystem } from "@/shared/hooks/useGalaxySystem";
import { useGalaxyNavigation } from "@/shared/hooks/useGalaxyNavigation";
import { useRouter } from "@/i18n/navigation";
import { useBabelStore } from "@/stores/babelStore";
import { dmService } from "@/shared/lib/dm/dmService";

import { useTranslations, useLocale } from "next-intl";
import { ActionConfirmModal } from "./ActionConfirmModal";
import { usePixelData } from "./usePixelData";
import { usePixelFeed } from "./usePixelFeed";
import { usePixelInteractions } from "./usePixelInteractions";
import { PingPanel } from "./PingPanel";
import { PortalTooltip } from "@/shared/ui/PortalTooltip";
import { PersonaBadge } from "@/entities/user/ui/PersonaBadge";

export interface PixelData {
  id?: string;
  pixelId?: string;
  displayName?: string;
  avatarUrl?: string;
  statusMessage?: string;
  supernovaTier?: string;
  galaxyDomain?: string;
  coordX?: number;
  coordY?: number;
  pingCount?: number;
  momentContent?: string;
  country?: string;
  personaCode?: string;
  currentMoodId?: string | null;
  isStore?: boolean;
  storeRating?: number;
  reviewCount?: number;
  [key: string]: unknown;
}

export interface VisitStats {
  visits?: {
    today_visits: number;
    yesterday_visits: number;
  };
  pings: {
    type: string;
    count: number;
  }[];
}

interface MomentCardProps {
  moment: any;
  isOwner: boolean;
  userProfile: any;
  isLockedContent: boolean;
  editingMomentId: string | null;
  setEditingMomentId: (id: string | null) => void;
  editContent: string;
  setEditContent: (content: string) => void;
  editPreviewUrls: string[];
  setEditPendingFiles: React.Dispatch<React.SetStateAction<File[]>>;
  setEditPreviewUrls: React.Dispatch<React.SetStateAction<string[]>>;
  editYoutubeUrl: string;
  setEditYoutubeUrl: (url: string) => void;
  editExistingImages: FeedImage[];
  setEditExistingImages: React.Dispatch<React.SetStateAction<FeedImage[]>>;
  editTags: string[];
  setEditTags: React.Dispatch<React.SetStateAction<string[]>>;
  kebabOpenId: string | null;
  setKebabOpenId: (id: string | null) => void;
  confirmDeleteId: string | null;
  setConfirmDeleteId: (id: string | null) => void;
  handleEditMoment: (momentId: string) => void;
  handleDeleteMoment: (momentId: string) => void;
  setFeedMoments: React.Dispatch<React.SetStateAction<any[]>>;
  openComments: Record<string, boolean>;
  toggleComments: (momentId: string) => void;
  viewOriginalIds: Record<string, boolean>;
  toggleOriginalView: (e: React.MouseEvent, momentId: string) => void;
  setLightboxImages: (images: FeedImage[]) => void;
  setLightboxIndex: (idx: number) => void;
  setIsLightboxOpen: (open: boolean) => void;
  handlePingButtonClick: (momentId: string) => void;
  momentIsPinging: Record<string, boolean>;
  momentPings: Record<string, string | null>;
  activePingMomentId: string | null;
  sentPingId: string | null;
  isSending: boolean;
  setIsSending: (isSending: boolean) => void;
  setSentPingId: (sentPingId: string | null) => void;
  handlePingSelect: (momentId: string, pingId: string) => void;
  handlePingCancel: (momentId: string) => void;
  selectedPixelId: string | null;
  pixel: PixelData | null;
  handleSubscribeClick: () => void;
  subscriptionStatus: "none" | "active" | "loading";
}

const MomentCard = React.memo(function MomentCard({
  moment,
  isOwner,
  userProfile,
  isLockedContent,
  editingMomentId,
  setEditingMomentId,
  editContent,
  setEditContent,
  editPreviewUrls,
  setEditPendingFiles,
  setEditPreviewUrls,
  editYoutubeUrl,
  setEditYoutubeUrl,
  editExistingImages,
  setEditExistingImages,
  editTags,
  setEditTags,
  kebabOpenId,
  setKebabOpenId,
  confirmDeleteId,
  setConfirmDeleteId,
  handleEditMoment,
  handleDeleteMoment,
  setFeedMoments,
  openComments,
  toggleComments,
  viewOriginalIds,
  toggleOriginalView,
  setLightboxImages,
  setLightboxIndex,
  setIsLightboxOpen,
  handlePingButtonClick,
  momentIsPinging,
  momentPings,
  activePingMomentId,
  sentPingId,
  isSending,
  setIsSending,
  setSentPingId,
  handlePingSelect,
  handlePingCancel,
  selectedPixelId,
  pixel,
  handleSubscribeClick,
  subscriptionStatus,
}: MomentCardProps) {
  const t = useTranslations("Pixel");
  const tM = useTranslations("Moment");
  const tSettings = useTranslations("Settings");
  const babelMode = useBabelStore((s) => s.babelMode);
  const currentMoodId = useGalaxyStore((s) => s.currentMoodId);
  const moodColor = useMoodColor(currentMoodId);

  const [isTextareaFocused, setIsTextareaFocused] = useState(false);
  const [isYoutubeFocused, setIsYoutubeFocused] = useState(false);
  const [editTagInput, setEditTagInput] = useState("");

  return (
    <div
      key={moment.momentId || moment.id}
      id={`moment-${moment.momentId || moment.id}`}
      className="group relative p-4 rounded-2xl bg-white text-black border border-slate-200 hover:border-slate-300 shadow-sm hover:shadow-md transition-all"
    >
      {/* [생각 구독] 비구독자 블러 오버레이 */}
      {(moment as any).isBlurred && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-2xl overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-slate-900/60 to-slate-900/95 backdrop-blur-md" />
          <div className="relative z-20 flex flex-col items-center p-6 text-center">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 mb-3">
              <Lock className="w-3 h-3 text-amber-400" />
              <span className="text-xs font-bold text-amber-400">
                {t("subscriberOnly")}
              </span>
            </div>
            <p className="text-xs text-theme-muted mb-4">
              {t("subOnlyViewDesc")}
            </p>
            <button
              onClick={handleSubscribeClick}
              className="px-6 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl text-xs font-bold shadow-[0_8px_30px_rgba(245,158,11,0.3)] hover:shadow-[0_12px_40px_rgba(245,158,11,0.5)] transition-all duration-300 flex items-center gap-2"
            >
              <Sparkles className="w-3.5 h-3.5" />
              {t("subViewFull")}
            </button>
            <p className="text-xs text-theme-secondary mt-2">{t("subPrice")}</p>
          </div>
        </div>
      )}
      {/* [생각 구독] 구독자 전용 뱃지 (블러 아닌 상태) */}
      {(moment as any).isSubscriberOnly && !(moment as any).isBlurred && (
        <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 mb-2">
          <BookOpen className="w-3 h-3 text-amber-400" />
          <span className="text-xs font-bold text-amber-400">
            {t("subscriberOnly")}
          </span>
        </div>
      )}
      {/* Lock 처리 (레거시) */}
      {isLockedContent && !(moment as any).isBlurred && (
        <div
          className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-slate-950/60 backdrop-blur-md rounded-2xl border p-6 text-center"
          style={{ borderColor: `${moodColor.primaryHex}30` }}
        >
          <Lock
            className="w-6 h-6 mb-2"
            style={{ color: moodColor.primaryHex }}
          />
          <h4 className="text-xs font-bold text-theme-primary mb-1">
            {t("premiumSpace")}
          </h4>
          <p className="text-xs text-theme-muted mb-3">{t("subOnlyAccess")}</p>
          <button
            className="px-4 py-2 text-white rounded-xl text-xs font-bold transition hover:brightness-110"
            style={{ backgroundColor: moodColor.primaryHex }}
          >
            {t("activateSub")}
          </button>
        </div>
      )}

      {/* 콘텐츠 또는 편집 모드 */}
      {editingMomentId === (moment.momentId || moment.id) ? (
        <div className="flex flex-col gap-3">
          <textarea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            maxLength={500}
            rows={3}
            onFocus={() => setIsTextareaFocused(true)}
            onBlur={() => setIsTextareaFocused(false)}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 placeholder-slate-400 focus:outline-none resize-none font-medium transition-all"
            style={
              isTextareaFocused
                ? {
                    borderColor: moodColor.primaryHex,
                    boxShadow: `0 0 0 1px ${moodColor.primaryHex}50`,
                  }
                : undefined
            }
            autoFocus
          />
          {/* 편집 모드: 이미지 미리보기 + 개별 삭제 + 추가 업로드 */}
          {(() => {
            const totalCount = editExistingImages.length + editPreviewUrls.length;
            return (
              <div className="flex gap-2 flex-wrap">
                {/* 기존 서버 이미지 */}
                {editExistingImages.map((img: FeedImage, idx: number) => (
                  <div key={`srv-${idx}`} className="relative group">
                    <img
                      src={img.thumbnailUrl || img.url}
                      alt=""
                      className="w-16 h-16 rounded-lg object-cover border border-slate-200"
                    />
                    {img.youtubeUrl && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/30 rounded-lg pointer-events-none">
                        <Youtube className="w-5 h-5 text-red-500 drop-shadow-md" />
                      </div>
                    )}
                    <button
                      onClick={() => {
                        const updated = editExistingImages.filter(
                          (_img: FeedImage, i: number) => i !== idx,
                        );
                        setEditExistingImages(updated);
                      }}
                      className="absolute -top-1.5 -right-1.5 p-0.5 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition shadow-lg"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                {/* 새로 추가한 로컬 파일 (blob URL) */}
                {editPreviewUrls.map((url, idx) => (
                  <div key={`new-${idx}`} className="relative group">
                    <img
                      src={url}
                      alt=""
                      className="w-16 h-16 rounded-lg object-cover border border-slate-200"
                    />
                    <button
                      onClick={() => {
                        URL.revokeObjectURL(url);
                        setEditPendingFiles((prev) =>
                          prev.filter((_, i) => i !== idx),
                        );
                        setEditPreviewUrls((prev) =>
                          prev.filter((_, i) => i !== idx),
                        );
                      }}
                      className="absolute -top-1.5 -right-1.5 p-0.5 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition shadow-lg"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                {/* 추가 버튼 (10장 미만일 때) */}
                {totalCount < 10 && (
                  <label className="flex flex-col items-center justify-center w-16 h-16 rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 hover:bg-slate-100 hover:border-slate-400 transition cursor-pointer group">
                    <input
                      type="file"
                      multiple
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const files = e.target.files;
                        if (!files || files.length === 0) return;
                        const maxAdd = 10 - totalCount;
                        const newFiles = Array.from(files).slice(0, maxAdd);
                        setEditPendingFiles((prev) => [...prev, ...newFiles]);
                        setEditPreviewUrls((prev) => [
                          ...prev,
                          ...newFiles.map((f) => URL.createObjectURL(f)),
                        ]);
                        e.target.value = "";
                      }}
                    />
                    <Plus className="w-4 h-4 text-slate-400 group-hover:text-slate-600 transition" />
                  </label>
                )}
              </div>
            );
          })()}
          {/* YouTube URL 입력 */}
          <div className="space-y-2 pt-1 mb-1">
            <div className="flex items-center gap-2 relative">
              <Youtube
                size={16}
                className="absolute left-3 text-red-400 pointer-events-none"
              />
              <input
                type="url"
                value={editYoutubeUrl}
                onChange={(e) => setEditYoutubeUrl(e.target.value)}
                onFocus={() => setIsYoutubeFocused(true)}
                onBlur={() => setIsYoutubeFocused(false)}
                placeholder={tM("youtubeUrl") || "YouTube URL 추가"}
                className="w-full pl-8 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none transition-all"
                style={
                  isYoutubeFocused
                    ? {
                        borderColor: moodColor.primaryHex,
                        boxShadow: `0 0 0 1px ${moodColor.primaryHex}50`,
                      }
                    : undefined
                }
              />
              {editYoutubeUrl && (
                <button
                  onClick={() => setEditYoutubeUrl("")}
                  className="absolute right-2 text-slate-400 hover:text-slate-600 transition"
                >
                  <X size={14} />
                </button>
              )}
            </div>
            {/* YouTube 썸네일 미리보기 (편집 모드) */}
            {(() => {
              const yId = extractYouTubeId(editYoutubeUrl);
              if (!yId) return null;
              return (
                <div className="relative rounded-xl overflow-hidden border border-slate-200 bg-slate-50 mb-2">
                  <img
                    src={getYouTubeThumbnail(yId)}
                    alt="YouTube preview"
                    className="w-full aspect-video object-cover opacity-80"
                  />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="bg-red-600/90 rounded-full p-2">
                      <Youtube size={20} className="text-white" />
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* 태그 입력 에디터 (수정 모드) */}
          <div className="space-y-2 pt-1 mb-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500">
                {tM("topicTagsLabel") || "토픽 태그"} ({editTags.length} / 5)
              </span>
            </div>
            {editTags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 py-0.5">
                {editTags.map((tag, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-1 px-2.5 py-1 bg-slate-100 border border-slate-200 text-black text-xs font-bold rounded-lg shadow-sm"
                  >
                    <span>#{tag}</span>
                    <button
                      type="button"
                      onClick={() => setEditTags(prev => prev.filter((_, i) => i !== idx))}
                      className="text-slate-400 hover:text-rose-500 transition"
                    >
                      <X size={12} strokeWidth={2.5} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="relative flex items-center">
              <span className="absolute left-3 text-slate-400 font-bold text-sm">#</span>
              <input
                type="text"
                value={editTagInput}
                onChange={(e) => {
                  if (e.target.value.length <= 10) {
                    setEditTagInput(e.target.value);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.nativeEvent.isComposing) return;
                  if (e.key === "Enter" || e.key === "," || e.key === " ") {
                    e.preventDefault();
                    const cleanTag = editTagInput.trim().replace(/[#, ]/g, "");
                    if (!cleanTag) return;
                    if (editTags.length >= 5) return;
                    if (editTags.includes(cleanTag)) {
                      setEditTagInput("");
                      return;
                    }
                    setEditTags(prev => [...prev, cleanTag]);
                    setEditTagInput("");
                  }
                }}
                placeholder={editTags.length >= 5 ? "태그는 최대 5개까지 가능합니다" : tM("topicTagsPlaceholder") || "태그 추가 (Enter)"}
                disabled={editTags.length >= 5}
                className="w-full pl-7 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500 transition-all disabled:opacity-50"
              />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 font-medium">
              {editContent.length}/500
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  // blob URL 해제 + 상태 초기화
                  editPreviewUrls.forEach((url) => URL.revokeObjectURL(url));
                  setEditPendingFiles([]);
                  setEditPreviewUrls([]);
                  setEditYoutubeUrl("");
                  setEditExistingImages([]);
                  setEditTags([]);
                  setEditTagInput("");
                  setEditingMomentId(null);
                  setEditContent("");
                }}
                className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-400 hover:text-slate-700 hover:bg-slate-100 no-theme-hover transition"
              >
                {t("cancelBtn")}
              </button>
              <button
                onClick={() => handleEditMoment(moment.id)}
                disabled={
                  !editContent.trim() || editContent.trim().length > 500
                }
                className="px-4 py-1.5 text-white rounded-lg text-xs font-bold disabled:opacity-50 disabled:cursor-not-allowed transition hover:brightness-110 active:scale-95"
                style={{ backgroundColor: moodColor.primaryHex }}
              >
                {t("saveBtn")}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* 헤더: 리뷰어 프로필 (있으면) 또는 날짜 + 오너 케밥 */}
          <div className="flex items-start justify-between mb-2">
            <div className="flex items-center gap-2">
              {moment.authorProfile ? (
                <>
                  <div className="w-6 h-6 rounded-full overflow-hidden border border-slate-200 shrink-0 bg-slate-100 flex items-center justify-center">
                    {moment.authorProfile.avatarUrl ? (
                      <img
                        src={moment.authorProfile.avatarUrl}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-[10px] font-black text-slate-500">
                        {(moment.authorProfile.displayName || "?")[0]}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-slate-800 leading-tight">
                      {moment.authorProfile.displayName}
                    </span>
                    <span
                      className="text-[10px] text-slate-500 leading-tight"
                      title={new Date(
                        (moment.created_at || moment.createdAt) as string,
                      ).toLocaleString("ko-KR")}
                    >
                      {relativeTime(
                        (moment.created_at || moment.createdAt) as string,
                        tM,
                      )}
                    </span>
                  </div>
                </>
              ) : (
                <>
                  {(moment.country || pixel?.country) && (
                    <img
                      src={`/flags/${(moment.country || pixel?.country).toLowerCase()}.svg`}
                      alt=""
                      className="w-3.5 h-3.5 shrink-0 rounded-sm"
                    />
                  )}
                  <span
                    className="text-xs text-slate-600 font-medium"
                    title={new Date(
                      (moment.created_at || moment.createdAt) as string,
                    ).toLocaleString("ko-KR")}
                  >
                    {relativeTime(
                      (moment.created_at || moment.createdAt) as string,
                      tM,
                    )}
                  </span>
                </>
              )}
            </div>
            {isOwner && (
              <MomentKebabMenu
                vertical
                editLabel={t("editBtn")}
                deleteLabel={t("deleteBtn")}
                cancelLabel={t("cancelBtn")}
                confirmLabel={tM("confirmBtn") || "확인"}
                confirmMessage={tM("confirmDelete")}
                onEdit={() => {
                  // 이전 편집의 pending 상태 초기화
                  editPreviewUrls.forEach((url) => URL.revokeObjectURL(url));
                  setEditPendingFiles([]);
                  setEditPreviewUrls([]);
                  setEditingMomentId(moment.id);
                  setEditContent(moment.content || "");
                  setEditYoutubeUrl((moment as any).youtubeUrl || "");
                  const existingImgs = (moment.images && Array.isArray(moment.images)
                    ? moment.images.filter((img: FeedImage) => !img.youtubeUrl)
                    : []) as FeedImage[];
                  setEditExistingImages(existingImgs);
                  setEditTags((moment.content_tags || moment.contentTags || []) as string[]);
                }}
                onDelete={() => handleDeleteMoment(moment.id)}
              />
            )}
          </div>

          {/* 본문 (Babel 대응) */}
          {(() => {
            const hasAiTranslation = !!moment.ownerTranslation;
            const hasHumanTranslation = !!(moment as any).isTranslated;
            const isOriginalView =
              viewOriginalIds[moment.momentId || moment.id];

            let displayContent = moment.content;

            // 번역본이 정상적으로 출력되고 있는 상태 정의
            const isShowingTranslation =
              !isOriginalView &&
              ((babelMode === "owner" && hasAiTranslation) ||
                hasHumanTranslation);

            if (isOriginalView && (moment as any).originalContent) {
              displayContent = (moment as any).originalContent;
            } else if (babelMode === "owner" && hasAiTranslation) {
              displayContent = moment.ownerTranslation!;
            }

            // 번역 가용 여부
            const hasTranslation = hasAiTranslation || hasHumanTranslation;

            return (
              <>
                {moment.authorType === "ai" && (
                  <span className="inline-block text-violet-400 text-xs px-1.5 py-0.5 rounded bg-violet-500/15 border border-violet-500/30 font-bold mb-1 mr-1">
                    AI
                  </span>
                )}
                <p
                  className={`text-[16px] font-medium text-black leading-relaxed whitespace-pre-wrap ${isLockedContent ? "blur-sm opacity-50 select-none" : ""}`}
                >
                  {displayContent as ReactNode}

                  {/* 프리미엄 일원화 번역 스위처 뱃지 */}
                  {hasTranslation && (
                    <MomentBabelSwitcher
                      isLight
                      isShowingTranslation={isShowingTranslation}
                      onToggle={(e) => toggleOriginalView(e, moment.id)}
                      primaryHex={moodColor.primaryHex}
                      viewOriginalLabel={tSettings("viewOriginal")}
                      translatedLabel="번역됨"
                    />
                  )}
                </p>

                {/* 해시태그 목록 출력 (블랙 텍스트 칩 스타일) */}
                {(() => {
                  const tags = (moment.content_tags || moment.contentTags || []) as string[];
                  if (!Array.isArray(tags) || tags.length === 0) return null;
                  return (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {tags.map((tag, idx) => (
                        <span
                          key={idx}
                          className="px-2 py-0.5 bg-slate-100 text-black text-xs font-semibold rounded-md border border-slate-200 shadow-sm"
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>
                  );
                })()}
              </>
            );
          })()}

          {/* 피드 이미지 */}
          {moment.images &&
            Array.isArray(moment.images) &&
            moment.images.length > 0 && (
              <div
                className={`mt-3 gap-1.5 rounded-xl overflow-hidden ${
                  moment.images.length === 1
                    ? "grid grid-cols-1"
                    : "grid grid-cols-2 grid-rows-none"
                }`}
              >
                {(() => {
                  const imagesList = (moment.images || []) as FeedImage[];
                  const displayImages = imagesList.slice(0, 4);
                  const hasMoreImages = imagesList.length > 4;
                  const remainingCount = imagesList.length - 3;

                  return displayImages.map((img: FeedImage, idx: number) => {
                    const isFourthAndHasMore = idx === 3 && hasMoreImages;
                    return (
                      <button
                        key={idx}
                        onClick={() => {
                          setLightboxImages(moment.images || []);
                          setLightboxIndex(idx);
                          setIsLightboxOpen(true);
                        }}
                        className="relative overflow-hidden rounded-lg hover:brightness-110 transition"
                      >
                        <img
                          src={img.thumbnailUrl || img.mediumUrl || img.url}
                          alt=""
                          className={`w-full object-cover ${
                            imagesList.length === 1
                              ? "max-h-72"
                              : "aspect-square"
                          }`}
                          loading="lazy"
                        />
                        {img.youtubeUrl && (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/20 pointer-events-none">
                            <Youtube className="w-8 h-8 text-red-500 drop-shadow-lg" />
                          </div>
                        )}
                        {isFourthAndHasMore && (
                          <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center text-white backdrop-blur-[2px] transition hover:bg-black/50">
                            <span className="text-lg font-black tracking-wider">+{remainingCount}</span>
                          </div>
                        )}
                      </button>
                    );
                  });
                })()}
              </div>
            )}

          {/* 하단: 핑 카운트 + 비오너 핑 버튼 */}
          <div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-100">
            <div className="flex items-center gap-2 flex-wrap min-h-[14px]">
              {PING_TYPES.filter(
                (pt) =>
                  (moment.ping_type_counts?.[pt.id] ||
                    moment.pingTypeCounts?.[pt.id] ||
                    0) > 0,
              )
                .sort(
                  (a, b) =>
                    (moment.ping_type_counts?.[b.id] ||
                      moment.pingTypeCounts?.[b.id] ||
                      0) -
                    (moment.ping_type_counts?.[a.id] ||
                      moment.pingTypeCounts?.[a.id] ||
                      0),
                )
                .slice(0, 6)
                .map((pt) => {
                  const IconComp = PING_ICON_MAP[pt.icon];
                  const count =
                    moment.ping_type_counts?.[pt.id] ||
                    moment.pingTypeCounts?.[pt.id] ||
                    0;
                  return (
                    <PortalTooltip
                      key={pt.id}
                      className="w-52 border-slate-800 p-3 rounded-2xl text-xs font-medium bg-slate-950/95"
                      content={
                        <>
                          <div className="flex items-center gap-1.5 mb-2">
                            {IconComp && (
                              <IconComp className="w-3.5 h-3.5 text-slate-400" />
                            )}
                            <span className="text-xs font-black text-slate-200">
                              {pt.label}
                            </span>
                            <span className="ml-auto text-xs font-bold text-[rgb(var(--theme-rgb))] tabular-nums">
                              {t("countUnit", { count })}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-400 leading-relaxed font-medium">
                            {pt.emotionalMessage}
                          </p>
                        </>
                      }
                    >
                      <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full border border-slate-200 bg-slate-50 cursor-default transition-all">
                        {IconComp && (
                          <IconComp
                            className={`w-3 h-3 ${pt.iconColorClass}`}
                          />
                        )}
                        <span className="text-[11px] font-bold tabular-nums text-slate-600">
                          {count}
                        </span>
                      </span>
                    </PortalTooltip>
                  );
                })}
            </div>
            <div className="flex items-center gap-1.5 ml-auto">
              <button
                onClick={() => toggleComments(moment.momentId || moment.id)}
                className="flex items-center gap-1.5 px-2.5 h-7 rounded-full bg-slate-50 border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-all hover:scale-105 active:scale-95"
                title={t("tooltipComment")}
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>{moment.comment_count || moment.commentCount || 0}</span>
              </button>
              {!isOwner &&
                userProfile &&
                (() => {
                  const momentTotalPings =
                    moment.ping_count ?? moment.pings ?? 0;
                  // moment.momentId와 moment.id를 병행 검사하여 상태 일관성을 확보합니다.
                  const targetKey = moment.momentId || moment.id;
                  const isPingingActive = !!(
                    momentPings[moment.id] ||
                    (moment.momentId && momentPings[moment.momentId])
                  );
                  const isMomentPinging = !!(
                    momentIsPinging[moment.id] ||
                    (moment.momentId && momentIsPinging[moment.momentId])
                  );

                  return (
                    <motion.button
                      onClick={() =>
                        isMomentPinging
                          ? null
                          : handlePingButtonClick(targetKey)
                      }
                      whileTap={isMomentPinging ? undefined : { scale: 0.95 }}
                      whileHover={isMomentPinging ? undefined : { scale: 1.05 }}
                      className={`flex items-center gap-1.5 px-2.5 h-7 rounded-full border transition-all text-xs font-bold
                      ${
                        isMomentPinging
                          ? "cursor-wait bg-slate-100 border-slate-200 text-slate-600"
                          : isPingingActive
                            ? "bg-[rgb(var(--theme-rgb-deep))] border-[rgb(var(--theme-rgb-deep))] text-white border-none shadow-sm"
                            : "bg-slate-50 border border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                      }`}
                      title={
                        isPingingActive
                          ? PING_TYPES.find(
                              (p) =>
                                p.id ===
                                (momentPings[moment.id] ||
                                  momentPings[moment.momentId || ""]),
                            )?.label || t("pingCancel")
                          : t("pingSend")
                      }
                    >
                      {isMomentPinging ? (
                        <LogoSpinner size={14} color={moodColor.primaryHex} />
                      ) : (
                        <Activity
                          className={`w-3.5 h-3.5 ${isPingingActive ? "text-white" : "text-slate-600"}`}
                        />
                      )}
                      <span>{momentTotalPings}</span>
                    </motion.button>
                  );
                })()}
            </div>
          </div>

          {/* 댓글 아코디언 컴포넌트 */}
          <AnimatePresence>
            {openComments[moment.momentId || moment.id] && (
              <MomentCommentAccordion
                momentId={moment.momentId || moment.id}
                onUpdateCount={(delta) => {
                  // 1. 로컬 피드 리스트 상태 동기화 (2중 케이스 필드 갱신)
                  setFeedMoments((prev) =>
                    prev.map((m) =>
                      (m.momentId || m.id) === (moment.momentId || moment.id)
                        ? {
                            ...m,
                            comment_count: Math.max(
                              0,
                              (m.comment_count || 0) + delta,
                            ),
                            commentCount: Math.max(
                              0,
                              (m.commentCount || 0) + delta,
                            ),
                          }
                        : m,
                    ),
                  );

                  // 2. 전역 Spotlight 스토어 targetFeedItem 2중 동기화 (Spotlight 피드 실시간 반영)
                  const targetFeedItem =
                    useGalaxyStore.getState().targetFeedItem;
                  const setTargetFeedItem =
                    useGalaxyStore.getState().setTargetFeedItem;

                  if (
                    targetFeedItem &&
                    (targetFeedItem.momentId || targetFeedItem.id) ===
                      (moment.momentId || moment.id)
                  ) {
                    setTargetFeedItem({
                      ...targetFeedItem,
                      comment_count: Math.max(
                        0,
                        (targetFeedItem.comment_count || 0) + delta,
                      ),
                      commentCount: Math.max(
                        0,
                        (targetFeedItem.commentCount || 0) + delta,
                      ),
                    });
                  }

                  // 3. 검색 판넬(SearchFeedDrawer) 피드 리스트 단일 통합 실시간 동기화용 이벤트 발행
                  if (typeof window !== "undefined") {
                    window.dispatchEvent(
                      new CustomEvent("optimistic-feed-update", {
                        detail: {
                          momentId: moment.momentId || moment.id,
                          field: "commentCount",
                          delta,
                        },
                      }),
                    );
                  }
                }}
              />
            )}
          </AnimatePresence>

          {/* 비오너: 핑 타입 선택 패널 */}
          <AnimatePresence>
            {!isOwner &&
              activePingMomentId === (moment.momentId || moment.id) && (
                <PingPanel
                  momentId={moment.momentId || moment.id}
                  sentPingId={sentPingId}
                  momentPings={momentPings}
                  isSending={isSending}
                  selectedPixelId={selectedPixelId}
                  onPingSelect={handlePingSelect}
                  onPingCancel={handlePingCancel}
                  onCrystalPingSent={() => {}}
                  setIsSending={setIsSending}
                  setSentPingId={setSentPingId}
                />
              )}
          </AnimatePresence>
        </>
      )}
    </div>
  );
});



export function PixelDetailDrawer() {
  const router = useRouter();
  const isMobile = useMediaQuery("(max-width: 767px)");
  const t = useTranslations("Pixel");
  const tM = useTranslations("Moment");
  const tSettings = useTranslations("Settings");
  const tMood = useTranslations("Moods");
  const locale = useLocale();
  const selectedPixelId = useGalaxyStore((s) => s.selectedPixelId);
  const galaxyKey = useGalaxyStore((s) => s.galaxyKey);
  const targetFeedItem = useGalaxyStore((s) => s.targetFeedItem);
  const setTargetFeedItem = useGalaxyStore((s) => s.setTargetFeedItem);
  const selectPixel = useGalaxyStore((s) => s.selectPixel);
  const activeCategory = useGalaxyStore((s) => s.activeCategory);
  // const setActiveCategory = useGalaxyStore(s => s.setActiveCategory)
  const userProfile = useUserStore((s) => s.user);
  const { categoryMap: dynamicCategoryMap } = useGalaxySystem();
  const { navigateToGalaxy } = useGalaxyNavigation();
  const babelMode = useBabelStore((s) => s.babelMode);
  const activeDmRoomId = useGalaxyStore((s) => s.activeDmRoomId);
  const setActiveDmRoomId = useGalaxyStore((s) => s.setActiveDmRoomId);
  const setActivePanelMoodId = useGalaxyStore((s) => s.setActivePanelMoodId);
  const isTourOpen = useGalaxyStore((s) => s.isTourOpen);

  // [ARCHITECTURE REFACTOR] usePixelData 훅에서 pixel, bonds, visitStats 관리
  const pixelData = usePixelData({ selectedPixelId });
  const {
    pixel: rawPixel,
    visitStats: rawVisitStats,
    bondsLoading,
    isBondsOpen,
    setIsBondsOpen,
    localConnectedPixels,
  } = pixelData;

  // ── [피드] / [방문글] 2단 탭 활성 상태 ──
  const [activeTab, setActiveTab] = useState<"moment" | "community">("moment");

  // ── Stale State Flash 방지를 위한 렌더 가드 (React 18 배칭 정석 대응) ──
  const isStale =
    rawPixel &&
    rawPixel.id !== selectedPixelId &&
    rawPixel.pixelId !== selectedPixelId;
  const pixel = isStale ? null : rawPixel;
  const visitStats = isStale ? null : rawVisitStats;

  const [isProfileEditOpen, setIsProfileEditOpen] = useState(false);
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
  const [isSupernovaOpen, setIsSupernovaOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const [storeDetail, setStoreDetail] = useState<any>(null);
  const [storeDetailLoading, setStoreDetailLoading] = useState(false);

  useEffect(() => {
    if (!selectedPixelId) {
      setStoreDetail(null);
      return;
    }
    setStoreDetailLoading(true);
    fetch(`/api/users/${selectedPixelId}/store-detail`)
      .then((res) => res.json())
      .then((data) => {
        setStoreDetail(data?.data || null);
      })
      .catch((err) => {
        console.error("Failed to fetch store details:", err);
        setStoreDetail(null);
      })
      .finally(() => {
        setStoreDetailLoading(false);
      });
  }, [selectedPixelId]);

  // [ARCHITECTURE REFACTOR] usePixelFeed 훅에서 피드 상태/로직 관리
  const feed = usePixelFeed({
    selectedPixelId,
    pixel,
    isStore: !!storeDetail,
    activeTab,
  });
  const {
    feedMoments: rawFeedMoments,
    setFeedMoments,
    feedLoading,
    feedHasMore,
    sentinelRef,
    editingMomentId,
    setEditingMomentId,
    editContent,
    setEditContent,
    editPendingFiles,
    setEditPendingFiles,
    editPreviewUrls,
    setEditPreviewUrls,
    editYoutubeUrl,
    setEditYoutubeUrl,
    editExistingImages,
    setEditExistingImages,
    editTags,
    setEditTags,
    kebabOpenId,
    setKebabOpenId,
    confirmDeleteId,
    setConfirmDeleteId,
    uploadImages,
    showToast,
    getGalaxyName,
    isMaster,
    handleEditMoment,
    handleDeleteMoment,
    fetchFeedPage,
    resetOnPixelChange: feedResetOnPixelChange,
  } = feed;

  const feedMoments =
    isStale || (feedLoading && rawFeedMoments.length === 0)
      ? []
      : rawFeedMoments;

  // [ARCHITECTURE REFACTOR] usePixelInteractions 훅에서 Touch/Ping 인터랙션 관리
  const interactions = usePixelInteractions({
    selectedPixelId,
    setFeedMoments,
    pixel,
  });
  const {
    touchCount,
    setTouchCount,
    isTouchSending,
    touchCooldown,
    touchSent,
    handleTouch,
    isPingPanelOpen,
    setIsPingPanelOpen,
    isSending,
    setIsSending,
    sentPingId,
    setSentPingId,
    handlePingSelect,
    handlePingCancel,
    handlePingButtonClick,
    momentPings,
    momentIsPinging,
    activePingMomentId,
    pingCooldown,
  } = interactions;
  // showToast는 usePixelFeed에서 이미 구조분해됨 — interactions.showToast와 동일 함수

  const checkAuthAndExecute = (action: () => void) => {
    if (!userProfile) {
      useToastStore.getState().addToast({
        title: t("loginRequired") || "로그인이 필요합니다",
        message:
          t("loginRequiredMsg") || "로그인 후 이 기능을 이용할 수 있습니다.",
        type: "error",
      });
      return;
    }
    action();
  };

  const [isDmLoading, setIsDmLoading] = useState(false);
  // [생각 구독] 구독 상태 관리
  const [subscriptionStatus, setSubscriptionStatus] = useState<
    "none" | "active" | "loading"
  >("loading");
  const [hasSubContent, setHasSubContent] = useState(false);
  const [lightboxImages, setLightboxImages] = useState<FeedImage[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);

  // Desktop-only category horizontal scroll logic for Pixel panel
  const categoryScrollRef = useRef<HTMLDivElement>(null);
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

    container.addEventListener("scroll", handleScrollEvent, { passive: true });
    return () => {
      resizeObserver.disconnect();
      container.removeEventListener("scroll", handleScrollEvent);
    };
  }, [
    galaxyKey,
    selectedPixelId,
    dynamicCategoryMap,
    isMobile,
    pixel,
    feedLoading,
  ]);

  const scrollCategory = (direction: "left" | "right") => {
    const container = categoryScrollRef.current;
    if (!container) return;
    const scrollAmount = container.clientWidth * 0.6;
    container.scrollBy({
      left: direction === "left" ? -scrollAmount : scrollAmount,
      behavior: "smooth",
    });
  };

  const handleCategoryWheel = (e: React.WheelEvent) => {
    if (isMobile) return;
    const container = categoryScrollRef.current;
    if (!container) return;

    // 트랙패드 제스처나 가로 스크롤 신호가 들어오면 네이티브 가로 스크롤에 권한을 양보하여 Jittering 완벽 방지
    if (Math.abs(e.deltaX) > 0) {
      return;
    }

    if (Math.abs(e.deltaY) > 0) {
      e.preventDefault();
      container.scrollLeft += e.deltaY;
    }
  };

  // [COMMENTS] 댓글 아코디언 토글 상태
  const [openComments, setOpenComments] = useState<Record<string, boolean>>({});

  // [BABEL] 원본 보기 토글 상태
  const [viewOriginalIds, setViewOriginalIds] = useState<
    Record<string, boolean>
  >({});

  const toggleOriginalView = (e: React.MouseEvent, momentId: string) => {
    e.stopPropagation();
    setViewOriginalIds((prev) => ({ ...prev, [momentId]: !prev[momentId] }));
  };

  const toggleComments = (momentId: string) => {
    setOpenComments((prev) => ({ ...prev, [momentId]: !prev[momentId] }));
  };

  const [isResizeHovered, setIsResizeHovered] = useState(false);

  // 자기 자신의 패널인지 판별
  const isOwner = !!(
    userProfile &&
    selectedPixelId &&
    userProfile.id === selectedPixelId
  );

  // [MOOD HEADER] 프로필 헤더에 표시할 생각 상태 컬러 계산
  const currentMoodIdForHeader = useGalaxyStore((s) => s.currentMoodId);
  const headerMoodId = (
    isOwner ? currentMoodIdForHeader : pixel?.moodId || "neutral"
  ) as string;
  const moodColor = useMoodColor(headerMoodId);

  // [NEW] 픽셀 판넬 생각 상태(headerMoodId)가 바뀔 때마다 전역 팝업 테마 락(Zustand) 동기화
  useEffect(() => {
    if (selectedPixelId && headerMoodId) {
      setActivePanelMoodId(headerMoodId);
    }
    return () => {
      setActivePanelMoodId(null);
    };
  }, [selectedPixelId, headerMoodId, setActivePanelMoodId]);

  // [ANALYTICS] 방문자 종합 통계 상태
  const isInsightOpen = useGalaxyStore((s) => s.isInsightOpen);
  const setIsInsightOpen = useGalaxyStore((s) => s.setIsInsightOpen);
  const [isConnectConfirmOpen, setIsConnectConfirmOpen] = useState(false);
  const [isSubscribeConfirmOpen, setIsSubscribeConfirmOpen] = useState(false);
  const [isUnsubConfirmOpen, setIsUnsubConfirmOpen] = useState(false);

  // [UX FIX: Stale State Flash] 렌더 가드로 이전 데이터 잔상 원천 격리 완료 (렌더 단계 setState 제거)

  const isAiGalaxy = false;

  // 은하(galaxyKey) 또는 카테고리(activeCategory) 변경 시 판넬 닫기 (초기화)
  // 단, 엔진이 준비 완료(isPixiReady)된 이후의 사용자 명시적 조작에만 동작하도록 제한하여 새로고침 진입 시의 무단 폐쇄 방지
  // [FIX] mount 시 첫 실행은 건너뛰고, 실제 galaxyKey나 activeCategory가 '변경'되었을 때만 닫기 동작을 처리하도록 Ref 활용
  const prevGalaxyKeyRef = useRef(galaxyKey);
  const prevActiveCategoryRef = useRef(activeCategory);

  useEffect(() => {
    const isPixiReady = useGalaxyStore.getState().isPixiReady;
    const hasGalaxyChanged = prevGalaxyKeyRef.current !== galaxyKey;
    const hasCategoryChanged = prevActiveCategoryRef.current !== activeCategory;

    // 레프 갱신
    prevGalaxyKeyRef.current = galaxyKey;
    prevActiveCategoryRef.current = activeCategory;

    console.log(
      "[DEBUG-Drawer] galaxyKey/activeCategory Changed Effect. Selected:",
      selectedPixelId,
      "isPixiReady:",
      isPixiReady,
      "galaxyKey:",
      galaxyKey,
      "category:",
      activeCategory,
      "hasGalaxyChanged:",
      hasGalaxyChanged,
      "hasCategoryChanged:",
      hasCategoryChanged,
    );
    if (
      selectedPixelId &&
      isPixiReady &&
      (hasGalaxyChanged || hasCategoryChanged)
    ) {
      console.log(
        "[DEBUG-Drawer] Ground logic met for selectPixel(null). Resetting selected pixel panel.",
      );
      selectPixel(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [galaxyKey, activeCategory]);

  // [PANEL CRUD] 피드 로딩/무한스크롤/모먼트이벤트/타곟피드 → usePixelFeed 훅으로 이동 완료

  // 데이터 권한 및 변환 매핑
  const isCreatorAuthed =
    userProfile?.role === "SUPER_ADMIN" ||
    userProfile?.role === "CONTENT_ADMIN" ||
    userProfile?.supernova_tier === "MASTER";
  const isLockedContent = isMaster && !isCreatorAuthed;

  // ── [ORCHESTRATOR] 픽셀 전환 시 통합 초기화 ──
  // usePixelData, usePixelFeed 각각의 내부 useEffect + 본체의 interaction 상태 리셋
  useEffect(() => {
    let abortController: AbortController | null = null;

    if (selectedPixelId) {
      // [FIX] pixel·feed 초기화는 usePixelData·usePixelFeed 훅 내부 useEffect가 자율 수행.
      // 여기서 setPixel(null)/pixelData.reset()을 중복 호출하면
      // 훅 내부의 setPixel(found) 복구를 덮어써 pixel이 영구 null → 무한 스피너 버그 발생.
      setTouchCount(0);
      setIsConnectConfirmOpen(false);
      setIsSubscribeConfirmOpen(false);
      setIsUnsubConfirmOpen(false);

      // Interaction 상태 리셋 → usePixelInteractions 훅
      setIsSupernovaOpen(false);
      interactions.resetInteractions();

      // 탭 전환 시 스크롤 최상단으로 리셋 (연결 영역 노출 보장)
      if (panelRef.current) {
        panelRef.current.scrollTop = 0;
      }

      // [usePixelFeed] 피드 리셋 → 훅 내부 resetOnPixelChange 호출
      setActiveTab("moment");
      feedResetOnPixelChange();

      // [Touch/Ping 2원 체계] Touch 카운트 lazy-load
      abortController = new AbortController();
      fetch(`/api/touches?userId=${selectedPixelId}`, {
        signal: abortController.signal,
      })
        .then((r) => r.json())
        .then((data) => setTouchCount(data.touchCount || 0))
        .catch((e) => {
          if (e.name !== "AbortError") setTouchCount(0);
        });
    }

    return () => {
      if (abortController) abortController.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPixelId, galaxyKey, activeCategory]);

  // [생각 구독] 구독 상태 조회 (픽셀 전환 시)
  useEffect(() => {
    if (!selectedPixelId || isOwner) {
      setSubscriptionStatus("none");
      setHasSubContent(false);
      return;
    }
    // [BUG-3 FIX] AbortController 추가 — 빠른 픽셀 전환 시 이전 응답이 현재 상태를 덮어쓰는 레이스 컨디션 방지
    const abortController = new AbortController();
    setSubscriptionStatus("loading");
    fetch(`/api/subscriptions/status?creatorId=${selectedPixelId}`, {
      signal: abortController.signal,
    })
      .then((r) => r.json())
      .then((data) => {
        setSubscriptionStatus(data.isSubscribed ? "active" : "none");
        setHasSubContent(data.hasSubscriberContent || false);
      })
      .catch((e) => {
        if (e.name !== "AbortError") setSubscriptionStatus("none");
      });
    return () => abortController.abort();
  }, [selectedPixelId, isOwner]);

  // 패널 외부 및 케밥/핑 팝업 외부 클릭 시 닫기
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as HTMLElement;

      // 1. 패널 외부 클릭 시 닫기
      if (panelRef.current && !panelRef.current.contains(target)) {
        setIsPingPanelOpen(false);
        usePingStore.getState().setActivePingMomentId(null);
      }

      // 2. 케밥 메뉴 외부 클릭 시 케밥 닫기 (.kebab-container 외부 클릭 감지)
      if (kebabOpenId && !target.closest(".kebab-container")) {
        setKebabOpenId(null);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [kebabOpenId]);

  // [Touch/Ping] 핸들러 → usePixelInteractions 훅으로 이동 완료

  const handleWriteReview = () => {
    if (!userProfile) {
      useToastStore.getState().addToast({
        title: "로그인이 필요합니다",
        message: "방문글을 남기려면 로그인이 필요합니다.",
        type: "error",
      });
      return;
    }
    useGalaxyStore.getState().setReviewTargetPixelId(selectedPixelId);
    useGalaxyStore.getState().setIsMomentModalOpen(true);
  };

  // [INTERACTION] 비오너 인터랙션: 픽셀리어 연결 요청
  const handleConnectClick = () => {
    if (!selectedPixelId || !userProfile) return;
    setIsConnectConfirmOpen(true);
  };

  const executeConnect = async () => {
    setIsConnectConfirmOpen(false);
    if (!selectedPixelId || !userProfile) return;
    try {
      const res = await fetch("/api/constellation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: selectedPixelId, galaxyKey }),
      });
      if (res.ok) {
        useToastStore
          .getState()
          .addToast({
            title: t("bondRequestSent"),
            message: t("bondRequestSentMsg"),
            type: "success",
          });
      } else {
        const err = await res.json();
        const isLimit = res.status === 403;
        const isDuplicate = res.status === 409;
        const isCooldown = res.status === 429;
        const title = isLimit
          ? t("bondLimitExceeded")
          : isDuplicate
            ? t("bondAlreadyRequested")
            : isCooldown
              ? t("bondCooldown")
              : t("bondRequestFailed");
        useToastStore
          .getState()
          .addToast({
            title,
            message: err?.error || t("bondRequestFailedMsg"),
            type: "error",
          });
      }
    } catch {
      showToast(t("networkError"));
    }
  };

  // [INTERACTION] 비오너 인터랙션: 구독 요청 (개선: 구독 상태 동기화 + 피드 새로고침)
  const handleSubscribeClick = () => {
    if (!selectedPixelId || !userProfile) return;
    // 이미 구독 중이면 해지 확인 모달 띄우기
    if (subscriptionStatus === "active") {
      setIsUnsubConfirmOpen(true);
      return;
    }
    setIsSubscribeConfirmOpen(true);
  };

  const executeUnsubscribe = () => {
    setIsUnsubConfirmOpen(false);
    showToast(t("unsubGuide"));
  };

  const executeSubscribe = async () => {
    setIsSubscribeConfirmOpen(false);
    if (!selectedPixelId || !userProfile) return;
    try {
      const res = await fetch("/api/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creatorId: selectedPixelId }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.newBalance !== undefined) {
          useUserStore
            .getState()
            .setUser({ ...userProfile!, stardust_balance: data.newBalance });
        }
        setSubscriptionStatus("active");
        showToast(t("subStarted"));
        // 피드 새로고침: 블러 해제 (feedPageRef는 usePixelFeed 내부에서 관리)
        fetchFeedPage(0, true);
      } else {
        const err = await res.json();
        if (res.status === 409) {
          setSubscriptionStatus("active");
          showToast(t("alreadySubscribed"));
        } else if (res.status === 400) {
          showToast(t("insufficientDust"));
        } else {
          showToast(err?.error || t("subRequestFailed"));
        }
      }
    } catch {
      showToast(t("networkError"));
    }
  };

  // [INTERACTION] 비오너 인터랙션: DM/CS 채팅 시작
  const handleDm = async (type: "DM" | "CS" = "DM") => {
    if (!selectedPixelId || !userProfile || isDmLoading) return;
    setIsDmLoading(true);
    try {
      const room = await dmService.createRoom(selectedPixelId, type);
      // Next.js 라우팅으로 방 이동 (모달 렌더링) -> 라우팅 히스토리 버그 회피를 위해 Zustand 상태 기반 오버레이 오픈으로 변경
      if (typeof window !== "undefined") {
        setActiveDmRoomId(room.id);
      }
    } catch (e) {
      console.error("[DM] Failed to create room:", e);
      showToast(t("networkError"));
    } finally {
      setIsDmLoading(false);
    }
  };

  const sentPingDef = sentPingId
    ? PING_TYPES.find((p) => p.id === sentPingId)
    : null;
  const dmTargetName = pixel?.displayName || t("unknownPixel");

  // 드래그 리사이즈 — store와 동기화
  const pixelPanelWidth = useGalaxyStore((s) => s.pixelPanelWidth);
  const setPixelPanelWidth = useGalaxyStore((s) => s.setPixelPanelWidth);
  const isResizing = useRef(false);
  const handleResizeStart = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      isResizing.current = true;
      const startX = e.clientX;
      const startW = pixelPanelWidth;
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      const onMove = (ev: PointerEvent) => {
        if (!isResizing.current) return;
        const delta = startX - ev.clientX;
        setPixelPanelWidth(Math.min(700, Math.max(380, startW + delta)));
      };
      const onUp = () => {
        isResizing.current = false;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [pixelPanelWidth, setPixelPanelWidth],
  );

  const resizeHandle = !isMobile && (
    <div
      onPointerDown={handleResizeStart}
      onMouseEnter={() => setIsResizeHovered(true)}
      onMouseLeave={() => setIsResizeHovered(false)}
      className="absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize transition-colors z-50"
      style={
        isResizeHovered
          ? { backgroundColor: `${moodColor.primaryHex}4D` }
          : undefined
      }
    />
  );

  return (
    <>
      <MobileFullPopupWrapper
        isOpen={!!selectedPixelId}
        onClose={() => selectPixel(null)}
        transitionType="slide-in"
        desktopWidth={pixelPanelWidth}
        desktopStyle={{
          overflow: "hidden",
          ...moodColor.themeStyle,
        }}
        desktopClassName="theme-panel-bg text-theme-primary border-l border-theme shrink-0 pointer-events-auto flex flex-col shadow-2xl"
        style={{
          ...moodColor.themeStyle,
        }}
        resizeHandle={resizeHandle}
      >
        {/* [UX FIX] 슬라이드 애니메이션 중 가로 찌그러짐 방지 이너 래퍼 */}
        <div
          data-tour="pixel-detail-panel"
          style={
            isMobile
              ? {
                  display: "flex",
                  flexDirection: "column",
                  height: "100%",
                  width: "100%",
                }
              : {
                  width: pixelPanelWidth,
                  minWidth: pixelPanelWidth,
                  height: "100%",
                  display: "flex",
                  flexDirection: "column",
                }
          }
        >
          {/* 패널 헤더 */}
          <div className="flex items-center justify-between px-3 h-9 border-b border-theme shrink-0">
            {/* 좌측: 리사이즈 스페이서 */}
            {!isMobile && <div className="w-7" />}

            {/* 중앙: 상태 정보 */}
            <div className="flex items-center gap-1.5 justify-center flex-1 min-w-0" data-tour="panel-header">
              <moodColor.mood.icon
                className="w-3 h-3 text-theme-primary shrink-0"
                style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.3))" }}
              />
              <span className="text-[14px] font-medium text-theme-secondary truncate">
                {t("moodDesc", {
                  name: pixel?.displayName || "Pixelier",
                  mood: "",
                })}{" "}
                <span className="font-bold text-theme-primary">
                  {tMood(moodColor.mood.id)}
                </span>
              </span>
            </div>

            {/* 우측: 닫기 버튼 */}
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={() => selectPixel(null)}
                className="w-7 h-7 flex items-center justify-center rounded-full bg-white/10 border border-white/10 text-white hover:bg-white/20 hover:text-white no-theme-hover transition shrink-0"
                title={t("closePanel")}
                aria-label={t("closePanel")}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div
            key={selectedPixelId || "empty"}
            className={`flex-1 overflow-y-auto overflow-x-hidden py-5 flex flex-col gap-6 ${isMobile ? "px-4 no-scrollbar" : "pl-4 pr-1.5 custom-scrollbar"}`}
            ref={panelRef}
          >
            <AnimatePresence mode="wait">
              <motion.div
                key={selectedPixelId || "empty-content"}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="flex-1 flex flex-col gap-3"
                style={{ overflow: "visible" }}
              >
                {!pixel ? (
                  /* 프리미엄 로딩 플레이스홀더 (네이티브 스무스 전환) */
                  <div className="flex-1 flex flex-col items-center justify-center gap-3 py-24">
                    <LogoSpinner size={32} />
                    <span className="text-xs text-theme-muted font-medium">
                      {t("pixelSyncing")}
                    </span>
                  </div>
                ) : (
                  <>
                    <div className="space-y-3 shrink-0 pb-5 border-b border-theme">
                      <div className="shrink-0">
                        <div className="space-y-2">
                          {/* 프로필 카드 */}
                          <div className="flex items-start gap-3">
                            {/* 아바타 (글로우 컬러 링) */}
                            <button
                              onClick={() => {
                                if (
                                  pixel.coordX !== undefined &&
                                  pixel.coordY !== undefined
                                ) {
                                  useGalaxyStore
                                    .getState()
                                    .focusOnPosition(
                                      pixel.coordX,
                                      pixel.coordY,
                                      CAMERA_ZOOM.PIXEL_FOCUS,
                                      true,
                                    );
                                }
                              }}
                              className="shrink-0 w-[66px] h-[66px] rounded-2xl flex items-center justify-center text-[11px] font-black text-white cursor-pointer overflow-hidden"
                              style={{
                                background: pixel.avatarUrl
                                  ? "transparent"
                                  : `linear-gradient(135deg, ${pixel.glowColorPrimary || "#6366F1"}, ${pixel.glowColorSecondary || "#A855F7"})`,
                                boxShadow: `0 0 16px ${pixel.glowColorPrimary || "#6366F1"}40`,
                                border: pixel.avatarUrl
                                  ? `2px solid ${pixel.glowColorPrimary || "#6366F1"}60`
                                  : "none",
                              }}
                              title={t("clickToMove")}
                              aria-label={t("moveToPixel", {
                                name: pixel.displayName || "",
                              })}
                            >
                              {pixel.avatarUrl ? (
                                <img
                                  src={pixel.avatarUrl}
                                  alt=""
                                  className="w-full h-full object-cover rounded-2xl"
                                />
                              ) : (
                                (pixel.displayName || "?")[0]
                              )}
                            </button>

                            {/* 닉네임 + 메타 정보 */}
                            <div className="flex-1 min-w-0" data-tour="panel-profile">
                              <div className="flex items-center gap-2">
                                <span className="text-[18px] font-black text-theme-primary truncate">
                                  {pixel.displayName || ""}
                                </span>

                                {/* 퍼소나/매장 뱃지 (닉네임 우측) */}
                                <PersonaBadge
                                  isStore={pixel.isStore}
                                  storeRating={pixel.storeRating}
                                  reviewCount={pixel.reviewCount}
                                  personaCode={pixel.personaCode}
                                  size="md"
                                />

                                {pixel.supernovaTier === "MASTER" && (
                                  <span className="shrink-0 px-1.5 py-0.5 rounded-md bg-amber-500/20 border border-amber-500/30 text-xs font-black text-amber-300">
                                    👑 MASTER
                                  </span>
                                )}
                              </div>

                              {/* 상태 메시지 (닉네임 하단으로 이동) */}
                              <div className="text-[14px] font-medium text-white/80 mt-1.5 break-words line-clamp-2" data-tour="panel-status">
                                {pixel?.statusMessage
                                  ? `"${pixel?.statusMessage}"`
                                  : t("pixelSyncing")}
                              </div>
                            </div>

                            {/* 우측 공간 스페이서 */}
                            <div className="w-2 shrink-0" />
                          </div>
                        </div>
                      </div>

                      {/* ═══════════════════════════════════════════════════════════ */}
                      {/* 가로형 통합 상호작용 버튼 바                                */}
                      {/* ═══════════════════════════════════════════════════════════ */}
                      {(isOwner || !isOwner) && (
                        <div className="shrink-0 w-full mt-[30px]">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {isOwner ? (
                              <>
                                {/* 1. 연결된 픽셀리어 리스트 토글 버튼 */}
                                <PortalTooltip
                                  className="border-[rgba(var(--theme-rgb),0.2)] text-[12px] font-bold px-2.5 py-1.5 rounded-xl whitespace-nowrap shadow-[0_10px_30px_rgba(0,0,0,0.5)]"
                                  content={t("connectedPixelers")}
                                >
                                  <motion.button
                                    data-tour="pixel-bond"
                                    onClick={() => setIsBondsOpen(!isBondsOpen)}
                                    whileHover={{ scale: 1.05 }}
                                    whileTap={{ scale: 0.95 }}
                                    className={`w-10 h-10 flex items-center justify-center rounded-full theme-btn-glass !p-0 shrink-0 relative transition-colors ${
                                      isBondsOpen
                                        ? "bg-white/20 border-white/30 text-white"
                                        : ""
                                    }`}
                                  >
                                    <Users className="w-5.5 h-5.5" />
                                    {!bondsLoading &&
                                      localConnectedPixels.length > 0 && (
                                        <span
                                          className="absolute -top-1.5 -right-1.5 flex items-center justify-center min-w-[15px] h-[15px] px-0.5 rounded-full text-[8px] font-black text-white leading-none shadow-[0_2px_5px_rgba(0,0,0,0.3)]"
                                          style={{
                                            backgroundColor:
                                              moodColor.primaryHex,
                                          }}
                                        >
                                          +{localConnectedPixels.length}
                                        </span>
                                      )}
                                  </motion.button>
                                </PortalTooltip>

                                {/* 2. 내 아바타와의 1:1 대화(DM) 버튼 */}
                                <PortalTooltip
                                  className="border-[rgba(var(--theme-rgb),0.2)] text-[12px] font-bold px-2.5 py-1.5 rounded-xl whitespace-nowrap shadow-[0_10px_30px_rgba(0,0,0,0.5)]"
                                  content="내 아바타와 대화"
                                >
                                  <motion.button
                                    data-tour="pixel-dm"
                                    onClick={() => handleDm("DM")}
                                    disabled={isDmLoading}
                                    whileHover={{ scale: 1.05 }}
                                    whileTap={{ scale: 0.95 }}
                                    className="theme-btn-glass text-xs w-10 h-10 !p-0 rounded-full flex items-center justify-center shrink-0"
                                  >
                                    {isDmLoading ? (
                                      <LogoSpinner size={22} />
                                    ) : (
                                      <MessageSquare className="w-5.5 h-5.5" />
                                    )}
                                  </motion.button>
                                </PortalTooltip>

                                {/* 3. 인사이트 버튼 */}
                                <PortalTooltip
                                  className="border-[rgba(var(--theme-rgb),0.2)] text-[12px] font-bold px-2.5 py-1.5 rounded-xl whitespace-nowrap shadow-[0_10px_30px_rgba(0,0,0,0.5)]"
                                  content={t("insight")}
                                >
                                  <motion.button
                                    data-tour="pixel-insight"
                                    onClick={() => {
                                      setIsInsightOpen(true);
                                      window.history.pushState(
                                        null,
                                        "",
                                        `/users/${selectedPixelId}/analytics`,
                                      );
                                    }}
                                    whileHover={{ scale: 1.05 }}
                                    whileTap={{ scale: 0.95 }}
                                    className="w-10 h-10 flex items-center justify-center rounded-full theme-btn-glass !p-0 shrink-0 relative transition-all"
                                  >
                                    <Activity className="w-5.5 h-5.5" />
                                    {pixel &&
                                      typeof pixel.pingCount === "number" &&
                                      pixel.pingCount > 0 && (
                                        <span
                                          className="absolute -top-1.5 -right-1.5 flex items-center justify-center min-w-[15px] h-[15px] px-0.5 rounded-full text-[8px] font-black text-white leading-none shadow-[0_2px_5px_rgba(0,0,0,0.3)]"
                                          style={{
                                            backgroundColor:
                                              moodColor.primaryHex,
                                          }}
                                        >
                                          +{pixel.pingCount}
                                        </span>
                                      )}
                                  </motion.button>
                                </PortalTooltip>

                                {/* 4. 프로필 편집 버튼 */}
                                <PortalTooltip
                                  className="border-[rgba(var(--theme-rgb),0.2)] text-[12px] font-bold px-2.5 py-1.5 rounded-xl whitespace-nowrap shadow-[0_10px_30px_rgba(0,0,0,0.5)]"
                                  content={t("editProfile") || "프로필 편집"}
                                >
                                  <motion.button
                                    data-tour="pixel-edit"
                                    onClick={() => setIsProfileEditOpen(true)}
                                    whileHover={{ scale: 1.05 }}
                                    whileTap={{ scale: 0.95 }}
                                    className="w-10 h-10 flex items-center justify-center rounded-full theme-btn-glass !p-0 shrink-0"
                                  >
                                    <Pencil className="w-5.5 h-5.5" />
                                  </motion.button>
                                </PortalTooltip>

                                {/* 5. 설정 버튼 */}
                                <PortalTooltip
                                  className="border-[rgba(var(--theme-rgb),0.2)] text-[12px] font-bold px-2.5 py-1.5 rounded-xl whitespace-nowrap shadow-[0_10px_30px_rgba(0,0,0,0.5)]"
                                  content={t("settings")}
                                >
                                  <motion.button
                                    data-tour="pixel-settings"
                                    onClick={() => {
                                      useGalaxyStore
                                        .getState()
                                        .setIsSettingsOpen(true);
                                      window.history.pushState(
                                        null,
                                        "",
                                        "/settings",
                                      );
                                    }}
                                    whileHover={{ scale: 1.05 }}
                                    whileTap={{ scale: 0.95 }}
                                    className="w-10 h-10 flex items-center justify-center rounded-full theme-btn-glass !p-0 shrink-0"
                                  >
                                    <Settings className="w-5.5 h-5.5" />
                                  </motion.button>
                                </PortalTooltip>

                                {/* 6. 그룹 대화 버튼 */}
                                {!isAiGalaxy && (
                                  <PortalTooltip
                                    className="border-[rgba(var(--theme-rgb),0.2)] text-[12px] font-bold px-2.5 py-1.5 rounded-xl whitespace-nowrap shadow-[0_10px_30px_rgba(0,0,0,0.5)]"
                                    content={t("groupChat") || "그룹 대화"}
                                  >
                                    <motion.button
                                      data-tour="pixel-group-chat"
                                      onClick={() => setIsCreateGroupOpen(true)}
                                      whileHover={{ scale: 1.05 }}
                                      whileTap={{ scale: 0.95 }}
                                      className="w-10 h-10 flex items-center justify-center rounded-full theme-btn-glass !p-0 shrink-0"
                                    >
                                      <MessagesSquare className="w-5.5 h-5.5" />
                                    </motion.button>
                                  </PortalTooltip>
                                )}
                              </>
                            ) : (
                              <>
                                {/* 1. 터치 버튼 */}
                                <PortalTooltip
                                  className="border-[rgba(var(--theme-rgb),0.2)] text-[12px] font-bold px-2.5 py-1.5 rounded-xl whitespace-nowrap shadow-[0_10px_30px_rgba(0,0,0,0.5)]"
                                  content={
                                    touchSent
                                      ? t("touchSent")
                                      : touchCooldown
                                        ? t("touchCooldown")
                                        : t("touchLabel", {
                                            count: touchCount.toLocaleString(),
                                          })
                                  }
                                >
                                  <div className="relative shrink-0">
                                    <motion.button
                                      data-tour="pixel-touch"
                                      onClick={() =>
                                        checkAuthAndExecute(handleTouch)
                                      }
                                      disabled={isTouchSending}
                                      whileHover={{ scale: 1.05 }}
                                      whileTap={{ scale: 0.95 }}
                                      animate={
                                        touchSent
                                          ? {
                                              scale: [1, 1.15, 1],
                                              boxShadow:
                                                "0 0 12px rgba(99,102,241,0.3)",
                                            }
                                          : {}
                                      }
                                      transition={{
                                        scale: { type: "tween", duration: 0.3 },
                                      }}
                                      className={`text-xs relative overflow-hidden w-10 h-10 !p-0 rounded-full flex items-center justify-center shrink-0 transition-all ${
                                        touchCooldown || touchSent
                                          ? "bg-white border border-white/40 shadow-sm"
                                          : "theme-btn-glass"
                                      }`}
                                    >
                                      <Hand
                                        className="w-5.5 h-5.5"
                                        style={
                                          touchCooldown || touchSent
                                            ? { color: moodColor.primaryHex }
                                            : undefined
                                        }
                                      />
                                      {touchSent && (
                                        <motion.span
                                          initial={{ scale: 0.3, opacity: 0.8 }}
                                          animate={{ scale: 2.2, opacity: 0 }}
                                          transition={{ duration: 0.4 }}
                                          className="absolute inset-0 rounded-full pointer-events-none"
                                          style={{
                                            backgroundColor: `${moodColor.primaryHex}4D`,
                                          }}
                                        />
                                      )}
                                    </motion.button>

                                    {/* overflow-hidden 마스킹 밖으로 승격된 카운트 뱃지 */}
                                    {touchCount > 0 && (
                                      <span
                                        className="absolute -top-1.5 -right-1.5 flex items-center justify-center min-w-[15px] h-[15px] px-0.5 rounded-full text-[8px] font-black text-white leading-none shadow-[0_2px_5px_rgba(0,0,0,0.3)] pointer-events-none z-10"
                                        style={{
                                          backgroundColor: moodColor.primaryHex,
                                        }}
                                      >
                                        +{touchCount}
                                      </span>
                                    )}
                                  </div>
                                </PortalTooltip>

                                {/* 2. 후원 버튼 (비활성화)
                                {!isAiGalaxy && (
                                  <PortalTooltip
                                    className="border-[rgba(var(--theme-rgb),0.2)] text-[12px] font-bold px-2.5 py-1.5 rounded-xl whitespace-nowrap shadow-[0_10px_30px_rgba(0,0,0,0.5)]"
                                    content={t("supportLabel")}
                                  >
                                    <motion.button
                                      onClick={() =>
                                        checkAuthAndExecute(() =>
                                          setIsSupernovaOpen(true),
                                        )
                                      }
                                      whileHover={{ scale: 1.05 }}
                                      whileTap={{ scale: 0.95 }}
                                      className="theme-btn-glass text-xs w-10 h-10 !p-0 rounded-full flex items-center justify-center shrink-0"
                                    >
                                      <svg
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2.5"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        className="w-5.5 h-5.5 text-white"
                                      >
                                        <circle
                                          cx="15"
                                          cy="9"
                                          r="7"
                                          className="fill-white/10 stroke-white/60"
                                        />
                                        <circle
                                          cx="9"
                                          cy="15"
                                          r="7"
                                          className="fill-white/30 stroke-white"
                                        />
                                        <circle
                                          cx="9"
                                          cy="15"
                                          r="2.5"
                                          className="fill-white/80 stroke-none"
                                        />
                                      </svg>
                                    </motion.button>
                                  </PortalTooltip>
                                )}
                                */}

                                {/* 3. 연결 신청 버튼 */}
                                {!isAiGalaxy && (
                                  <PortalTooltip
                                    className="border-[rgba(var(--theme-rgb),0.2)] text-[12px] font-bold px-2.5 py-1.5 rounded-xl whitespace-nowrap shadow-[0_10px_30px_rgba(0,0,0,0.5)]"
                                    content={t("bondLabel")}
                                  >
                                    <motion.button
                                      data-tour="pixel-bond"
                                      onClick={() =>
                                        checkAuthAndExecute(handleConnectClick)
                                      }
                                      whileHover={{ scale: 1.05 }}
                                      whileTap={{ scale: 0.95 }}
                                      className="theme-btn-glass text-xs w-10 h-10 !p-0 rounded-full flex items-center justify-center shrink-0"
                                    >
                                      <Link2 className="w-5.5 h-5.5" />
                                    </motion.button>
                                  </PortalTooltip>
                                )}

                                {/* 3-2. 연결된 픽셀리어 리스트 토글 버튼 (비오너용) */}
                                <PortalTooltip
                                  className="border-[rgba(var(--theme-rgb),0.2)] text-[12px] font-bold px-2.5 py-1.5 rounded-xl whitespace-nowrap shadow-[0_10px_30px_rgba(0,0,0,0.5)]"
                                  content={t("connectedPixelers")}
                                >
                                  <motion.button
                                    onClick={() => setIsBondsOpen(!isBondsOpen)}
                                    whileHover={{ scale: 1.05 }}
                                    whileTap={{ scale: 0.95 }}
                                    className={`w-10 h-10 flex items-center justify-center rounded-full theme-btn-glass !p-0 shrink-0 relative transition-colors ${
                                      isBondsOpen
                                        ? "bg-white/20 border-white/30 text-white"
                                        : ""
                                    }`}
                                  >
                                    <Users className="w-5.5 h-5.5" />
                                    {!bondsLoading &&
                                      localConnectedPixels.length > 0 && (
                                        <span
                                          className="absolute -top-1.5 -right-1.5 flex items-center justify-center min-w-[15px] h-[15px] px-0.5 rounded-full text-[8px] font-black text-white leading-none shadow-[0_2px_5px_rgba(0,0,0,0.3)]"
                                          style={{
                                            backgroundColor:
                                              moodColor.primaryHex,
                                          }}
                                        >
                                          +{localConnectedPixels.length}
                                        </span>
                                      )}
                                  </motion.button>
                                </PortalTooltip>

                                {/* 4. 생각 구독 버튼 (비활성화)
                                {!isAiGalaxy && (
                                  <PortalTooltip
                                    className="border-[rgba(var(--theme-rgb),0.2)] text-[12px] font-bold px-2.5 py-1.5 rounded-xl whitespace-nowrap shadow-[0_10px_30px_rgba(0,0,0,0.5)]"
                                    content={
                                      subscriptionStatus === "active"
                                        ? t("subscribing")
                                        : t("subscribeThought")
                                    }
                                  >
                                    <motion.button
                                      onClick={() =>
                                        checkAuthAndExecute(
                                          handleSubscribeClick,
                                        )
                                      }
                                      whileHover={{ scale: 1.05 }}
                                      whileTap={{ scale: 0.95 }}
                                      className={`text-xs w-10 h-10 !p-0 rounded-full flex items-center justify-center shrink-0 transition-all ${
                                        subscriptionStatus === "active"
                                          ? "bg-white border border-white/40 shadow-sm"
                                          : "theme-btn-glass"
                                      }`}
                                    >
                                      <BookOpen
                                        className="w-5.5 h-5.5"
                                        style={
                                          subscriptionStatus === "active"
                                            ? { color: moodColor.primaryHex }
                                            : undefined
                                        }
                                      />
                                    </motion.button>
                                  </PortalTooltip>
                                )}
                                */}

                                {/* 5-1. 비즈니스 상담 (AI Agent) 버튼 */}
                                {!isAiGalaxy && (
                                  <PortalTooltip
                                    className="border-[rgba(var(--theme-rgb),0.2)] text-[12px] font-bold px-2.5 py-1.5 rounded-xl whitespace-nowrap shadow-[0_10px_30px_rgba(0,0,0,0.5)]"
                                    content={`${dmTargetName}님의 아바타와 대화`}
                                  >
                                    <motion.button
                                      onClick={() =>
                                        checkAuthAndExecute(() =>
                                          handleDm("CS"),
                                        )
                                      }
                                      disabled={isDmLoading}
                                      whileHover={{ scale: 1.05 }}
                                      whileTap={{ scale: 0.95 }}
                                      className="theme-btn-glass text-xs w-10 h-10 !p-0 rounded-full flex items-center justify-center shrink-0"
                                    >
                                      {isDmLoading ? (
                                        <LogoSpinner size={22} />
                                      ) : (
                                        <MessageSquare className="w-5.5 h-5.5 text-amber-400" />
                                      )}
                                    </motion.button>
                                  </PortalTooltip>
                                )}

                                {/* 5-2. 메시지 (직접 DM) 버튼 */}
                                {!isAiGalaxy && (
                                  <PortalTooltip
                                    className="border-[rgba(var(--theme-rgb),0.2)] text-[12px] font-bold px-2.5 py-1.5 rounded-xl whitespace-nowrap shadow-[0_10px_30px_rgba(0,0,0,0.5)]"
                                    content={`${dmTargetName}님과 대화`}
                                  >
                                    <motion.button
                                      data-tour="pixel-dm"
                                      onClick={() =>
                                        checkAuthAndExecute(() =>
                                          handleDm("DM"),
                                        )
                                      }
                                      disabled={isDmLoading}
                                      whileHover={{ scale: 1.05 }}
                                      whileTap={{ scale: 0.95 }}
                                      className="theme-btn-glass text-xs w-10 h-10 !p-0 rounded-full flex items-center justify-center shrink-0"
                                    >
                                      {isDmLoading ? (
                                        <LogoSpinner size={22} />
                                      ) : (
                                        <Send className="w-5.5 h-5.5 text-white" />
                                      )}
                                    </motion.button>
                                  </PortalTooltip>
                                )}

                                {/* 6. 인사이트 버튼 */}
                                <PortalTooltip
                                  className="border-[rgba(var(--theme-rgb),0.2)] text-[12px] font-bold px-2.5 py-1.5 rounded-xl whitespace-nowrap shadow-[0_10px_30px_rgba(0,0,0,0.5)]"
                                  content={t("insight")}
                                >
                                  <div className="relative shrink-0">
                                    <motion.button
                                      data-tour="pixel-insight"
                                      onClick={() => {
                                        setIsInsightOpen(true);
                                        window.history.pushState(
                                          null,
                                          "",
                                          `/users/${selectedPixelId}/analytics`,
                                        );
                                      }}
                                      whileHover={{ scale: 1.05 }}
                                      whileTap={{ scale: 0.95 }}
                                      className="w-10 h-10 flex items-center justify-center rounded-full theme-btn-glass !p-0 shrink-0"
                                    >
                                      <Activity className="w-5.5 h-5.5" />
                                    </motion.button>
                                    {pixel &&
                                      typeof pixel.pingCount === "number" &&
                                      pixel.pingCount > 0 && (
                                        <span
                                          className="absolute -top-1.5 -right-1.5 flex items-center justify-center min-w-[15px] h-[15px] px-0.5 rounded-full text-[8px] font-black text-white leading-none shadow-[0_2px_5px_rgba(0,0,0,0.3)] pointer-events-none z-10"
                                          style={{
                                            backgroundColor:
                                              moodColor.primaryHex,
                                          }}
                                        >
                                          +{pixel.pingCount}
                                        </span>
                                      )}
                                  </div>
                                </PortalTooltip>
                              </>
                            )}

                            {/* 7. 픽셀 판넬 가이드 투어 버튼 */}
                            {!isMobile && (
                              <PortalTooltip
                                className="border-[rgba(var(--theme-rgb),0.2)] text-[12px] font-bold px-2.5 py-1.5 rounded-xl whitespace-nowrap shadow-[0_10px_30px_rgba(0,0,0,0.5)]"
                                content="가이드"
                              >
                                <motion.button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setIsBondsOpen(true);
                                    useGalaxyStore.getState().setTourMode("panel");
                                    useGalaxyStore.getState().setIsTourOpen(true);
                                  }}
                                  whileHover={{ scale: 1.05 }}
                                  whileTap={{ scale: 0.95 }}
                                  className="w-10 h-10 flex items-center justify-center rounded-full theme-btn-glass !p-0 shrink-0 text-white hover:text-yellow-400 transition-colors"
                                >
                                  <svg
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2.5"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    className="w-5.5 h-5.5"
                                  >
                                    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                                    <line x1="12" y1="17" x2="12.01" y2="17" />
                                  </svg>
                                </motion.button>
                              </PortalTooltip>
                            )}
                          </div>

                          {/* Ping sent confirmation */}
                          {!isOwner && sentPingDef && (
                            <motion.div
                              initial={{ opacity: 0, y: -5 }}
                              animate={{ opacity: 1, y: 0 }}
                              className="mt-2 shrink-0 w-full flex items-center justify-center gap-2 py-2 rounded-full bg-amber-500/10 border border-amber-500/30 text-xs font-bold text-amber-400 shadow-[0_0_12px_rgba(234,179,8,0.15)]"
                            >
                              <span>
                                {t("pingSentComplete", {
                                  label: sentPingDef.label,
                                  message: sentPingDef.emotionalMessage,
                                })}
                              </span>
                            </motion.div>
                          )}
                        </div>
                      )}

                      {/* 브랜드/공식 비즈니스 상세 정보 (Brand Profile) - 잠정 비노출 정책 */}
                      {false && storeDetail && (
                        <div className="mt-4 p-4 rounded-2xl bg-white/5 border border-white/10 space-y-4 backdrop-blur-md">
                          {/* 브랜드 소개글 */}
                          {storeDetail.description && (
                            <p className="text-xs text-white/90 leading-relaxed italic bg-black/20 p-3 rounded-xl border border-white/5">
                              "{storeDetail.description}"
                            </p>
                          )}

                          {/* 기본 정보 */}
                          <div className="grid grid-cols-1 gap-2.5 text-xs text-white/80">
                            {storeDetail.phone && (
                              <div className="flex items-center gap-2">
                                <Phone className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                                <span className="font-bold text-slate-300 w-16 shrink-0">
                                  연락처
                                </span>
                                <span className="text-white font-medium">
                                  {storeDetail.phone}
                                </span>
                              </div>
                            )}
                            {storeDetail.address && (
                              <div className="flex flex-col gap-1.5">
                                <div className="flex items-center gap-2">
                                  <MapPin className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                                  <span className="font-bold text-slate-300 w-16 shrink-0">
                                    글로벌 비즈니스 좌표
                                  </span>
                                  <span className="text-white font-medium flex-1">
                                    {storeDetail.address}
                                  </span>
                                </div>
                                {/* 구글 지도 임베드 */}
                                {storeDetail.latitude &&
                                  storeDetail.longitude && (
                                    <div className="w-full h-32 rounded-xl overflow-hidden border border-white/10 mt-1 relative group">
                                      <iframe
                                        title="store-map"
                                        className="w-full h-full border-0 grayscale opacity-85 hover:grayscale-0 hover:opacity-100 transition-all duration-300"
                                        src={`https://maps.google.com/maps?q=${storeDetail.latitude},${storeDetail.longitude}&t=&z=16&ie=UTF8&iwloc=&output=embed`}
                                        allowFullScreen
                                      />
                                    </div>
                                  )}
                              </div>
                            )}
                          </div>

                          {/* 운영 시간 */}
                          {storeDetail.business_hours && (
                            <div className="space-y-1.5">
                              <div className="flex items-center gap-1.5">
                                <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                                <span className="text-xs font-bold text-slate-300 block">
                                  운영시간
                                </span>
                              </div>
                              <div className="bg-black/10 border border-white/5 rounded-xl p-3 grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px] text-white/70">
                                {(() => {
                                  const daysMap: Record<string, string> = {
                                    mon: "월요일",
                                    tue: "화요일",
                                    wed: "수요일",
                                    thu: "목요일",
                                    fri: "금요일",
                                    sat: "토요일",
                                    sun: "일요일",
                                  };
                                  return Object.entries(
                                    storeDetail.business_hours,
                                  ).map(([key, value]: [string, any]) => {
                                    if (!daysMap[key]) return null;
                                    return (
                                      <div
                                        key={key}
                                        className="flex justify-between px-1.5 py-0.5 border-b border-white/5"
                                      >
                                        <span className="font-bold">
                                          {daysMap[key]}
                                        </span>
                                        {!value.isClosed ? (
                                          <span className="text-white">
                                            {value.openTime} - {value.closeTime}
                                          </span>
                                        ) : (
                                          <span className="text-red-400 font-bold">
                                            휴무
                                          </span>
                                        )}
                                      </div>
                                    );
                                  });
                                })()}
                              </div>
                            </div>
                          )}

                          {/* 브랜드 갤러리 */}
                          {storeDetail.gallery_photos &&
                            storeDetail.gallery_photos.length > 0 && (
                              <div className="space-y-2">
                                <div className="flex items-center gap-1.5">
                                  <Camera className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                                  <span className="text-xs font-bold text-slate-300 block">
                                    브랜드 갤러리
                                  </span>
                                </div>
                                <div className="flex gap-2 overflow-x-auto pb-1.5 no-scrollbar scroll-smooth">
                                  {storeDetail.gallery_photos.map(
                                    (photoUrl: string, idx: number) => {
                                      const resolvedUrl = photoUrl;
                                      return (
                                        <button
                                          key={idx}
                                          onClick={() => {
                                            setLightboxImages(
                                              storeDetail.gallery_photos.map(
                                                (url: string) => ({
                                                  url: url,
                                                }),
                                              ),
                                            );
                                            setLightboxIndex(idx);
                                            setIsLightboxOpen(true);
                                          }}
                                          className="w-20 h-20 rounded-xl overflow-hidden border border-white/10 shrink-0 hover:scale-105 transition-transform relative group shadow-md"
                                        >
                                          <img
                                            src={resolvedUrl}
                                            alt={`Gallery ${idx}`}
                                            className="w-full h-full object-cover"
                                          />
                                          <div className="absolute inset-0 bg-black/20 group-hover:bg-transparent transition-colors" />
                                        </button>
                                      );
                                    },
                                  )}
                                </div>
                              </div>
                            )}

                          {/* 제공 서비스/상품 */}
                          {storeDetail.menu_info &&
                            storeDetail.menu_info.length > 0 && (
                              <div className="space-y-2">
                                <div className="flex items-center gap-1.5">
                                  <Utensils className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                                  <span className="text-xs font-bold text-slate-300 block">
                                    제공 서비스/상품
                                  </span>
                                </div>
                                <div className="space-y-2 max-h-48 overflow-y-auto pr-1 custom-scrollbar">
                                  {storeDetail.menu_info.map(
                                    (menu: any, idx: number) => {
                                      const resolvedMenuImg = menu.image;
                                      return (
                                        <div
                                          key={idx}
                                          className="flex items-start gap-3 bg-black/10 border border-white/5 p-2.5 rounded-xl"
                                        >
                                          {menu.image && (
                                            <button
                                              onClick={() => {
                                                setLightboxImages([
                                                  { url: resolvedMenuImg },
                                                ]);
                                                setLightboxIndex(0);
                                                setIsLightboxOpen(true);
                                              }}
                                              className="w-12 h-12 rounded-lg overflow-hidden border border-white/10 shrink-0"
                                            >
                                              <img
                                                src={resolvedMenuImg}
                                                alt={menu.name}
                                                className="w-full h-full object-cover"
                                              />
                                            </button>
                                          )}
                                          <div className="flex-1 min-w-0">
                                            <div className="flex justify-between items-baseline">
                                              <span className="text-xs font-bold text-white truncate">
                                                {menu.name}
                                              </span>
                                              <span className="text-xs font-black text-amber-400 shrink-0 ml-2">
                                                {menu.price}
                                              </span>
                                            </div>
                                            {menu.description && (
                                              <p className="text-[10px] text-white/50 mt-0.5 line-clamp-2 leading-relaxed">
                                                {menu.description}
                                              </p>
                                            )}
                                          </div>
                                        </div>
                                      );
                                    },
                                  )}
                                </div>
                              </div>
                            )}
                        </div>
                      )}

                      {/* 하단 아코디언 영역 (픽셀리어 리스트) */}
                      <AnimatePresence>
                        {(isBondsOpen && (localConnectedPixels.length > 0 || isTourOpen)) && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="w-full shrink-0"
                            data-tour="panel-bonds"
                          >
                            <div className="py-3 min-h-[48px] border-t border-[rgba(var(--theme-rgb),0.1)]">
                              {bondsLoading ? (
                                <div className="flex justify-center items-center py-1">
                                  <Logo size="sm" animate={true} />
                                </div>
                              ) : (
                                <div className="grid grid-cols-4 gap-1.5">
                                  {localConnectedPixels.length > 0 ? (
                                    localConnectedPixels.map((cp, cpIdx) => {
                                      const personaInfo = cp.personaCode
                                        ? PERSONA_MAP[
                                            cp.personaCode as keyof typeof PERSONA_MAP
                                          ]
                                        : null;
                                      return (
                                        <div
                                          key={`${cp.id}-${cpIdx}`}
                                          className="relative"
                                        >
                                          <PortalTooltip
                                            className="w-48 p-2.5 rounded-2xl bg-slate-950/95 border border-[rgba(var(--theme-rgb),0.2)] shadow-[0_10px_30px_rgba(0,0,0,0.5),0_0_15px_rgba(99,102,241,0.15)]"
                                            delay={100}
                                            content={
                                              <>
                                                <div className="flex items-center gap-1.5 mb-1">
                                                  <span className="text-xs font-black text-white">
                                                    {cp.name}
                                                  </span>
                                                  <PersonaBadge
                                                    isStore={cp.isStore}
                                                    storeRating={cp.storeRating}
                                                    reviewCount={cp.reviewCount}
                                                    personaCode={cp.personaCode}
                                                    size="sm"
                                                    transparentBg={true}
                                                  />
                                                </div>
                                                <p className="text-xs text-theme-muted leading-relaxed font-medium break-all whitespace-pre-wrap">
                                                  {cp.statusMessage
                                                    ? `"${cp.statusMessage}"`
                                                    : t("pixelSyncing")}
                                                </p>
                                              </>
                                            }
                                          >
                                            <button
                                              onClick={() => {
                                                selectPixel(cp.id);
                                                if (
                                                  cp.coordX !== undefined &&
                                                  cp.coordY !== undefined
                                                ) {
                                                  useGalaxyStore
                                                    .getState()
                                                    .focusOnPosition(
                                                      cp.coordX,
                                                      cp.coordY,
                                                      CAMERA_ZOOM.PIXEL_FOCUS,
                                                      true,
                                                    );
                                                }
                                              }}
                                              className="theme-btn-glass !rounded-full !justify-start group w-full overflow-hidden flex items-center gap-2 h-8 px-2"
                                            >
                                              {/* 동그란 실시간 프로필 아바타 썸네일 */}
                                              <div
                                                className="w-5.5 h-5.5 rounded-full flex items-center justify-center text-[11px] font-black text-white shrink-0 overflow-hidden"
                                                style={{
                                                  background: cp.avatarUrl
                                                    ? "transparent"
                                                    : `linear-gradient(135deg, ${cp.glowColor || "#6366F1"}, ${cp.glowColor || "#A855F7"})`,
                                                  boxShadow: `0 0 6px ${cp.glowColor || "#6366F1"}50`,
                                                  border: `1.5px solid ${cp.glowColor || "#6366F1"}80`,
                                                }}
                                              >
                                                {cp.avatarUrl ? (
                                                  <img
                                                    src={cp.avatarUrl}
                                                    alt=""
                                                    className="w-full h-full object-cover"
                                                  />
                                                ) : (
                                                  (cp.name || "?")[0]
                                                )}
                                              </div>
                                              <span className="text-xs font-bold text-white group-hover:opacity-90 transition-opacity truncate text-left w-full min-w-0 font-medium">
                                                {cp.name}
                                              </span>
                                            </button>
                                          </PortalTooltip>
                                        </div>
                                      );
                                    })
                                  ) : (
                                    <div className="col-span-4 text-center py-4 text-xs text-white/50 font-medium">
                                      {t("noConnectedPixelers") || "연결된 이웃이 없습니다."}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    {/* ═══════════════════════════════════════════════════════════ */}
                    {/* [PANEL CRUD] 피드 타임라인                                  */}
                    {/* ═══════════════════════════════════════════════════════════ */}

                    {(() => {
                      const isSpotlight =
                        !!targetFeedItem &&
                        targetFeedItem.id === selectedPixelId;
                      if (isSpotlight) {
                        // 검색 피드 데이터(id = 유저ID, momentId = 진짜피드ID)와 일반 피드 카드 데이터(id = 진짜피드ID) 구조 통일
                        const spotlightMoment = {
                          ...targetFeedItem,
                          id: targetFeedItem.momentId || targetFeedItem.id,
                          userId: targetFeedItem.id,
                        } as any;

                        return (
                          <div className="flex flex-col gap-4 shrink-0">
                            {/* 단건 피드 카드 */}
                            <MomentCard
                              moment={spotlightMoment}
                              isOwner={isOwner}
                              userProfile={userProfile}
                              isLockedContent={isLockedContent}
                              editingMomentId={editingMomentId}
                              setEditingMomentId={setEditingMomentId}
                              editContent={editContent}
                              setEditContent={setEditContent}
                              editPreviewUrls={editPreviewUrls}
                              setEditPendingFiles={setEditPendingFiles}
                              setEditPreviewUrls={setEditPreviewUrls}
                              editYoutubeUrl={editYoutubeUrl}
                              setEditYoutubeUrl={setEditYoutubeUrl}
                              editExistingImages={editExistingImages}
                              setEditExistingImages={setEditExistingImages}
                              editTags={editTags}
                              setEditTags={setEditTags}
                              kebabOpenId={kebabOpenId}
                              setKebabOpenId={setKebabOpenId}
                              confirmDeleteId={confirmDeleteId}
                              setConfirmDeleteId={setConfirmDeleteId}
                              handleEditMoment={handleEditMoment}
                              handleDeleteMoment={handleDeleteMoment}
                              setFeedMoments={setFeedMoments}
                              // Spotlight 모드인 경우 해당 피드의 댓글 창을 강제로 펼침
                              openComments={{ [spotlightMoment.id]: true }}
                              toggleComments={toggleComments}
                              viewOriginalIds={viewOriginalIds}
                              toggleOriginalView={toggleOriginalView}
                              setLightboxImages={setLightboxImages}
                              setLightboxIndex={setLightboxIndex}
                              setIsLightboxOpen={setIsLightboxOpen}
                              handlePingButtonClick={handlePingButtonClick}
                              momentIsPinging={momentIsPinging}
                              momentPings={momentPings}
                              activePingMomentId={activePingMomentId}
                              sentPingId={sentPingId}
                              isSending={isSending}
                              setIsSending={setIsSending}
                              setSentPingId={setSentPingId}
                              handlePingSelect={handlePingSelect}
                              handlePingCancel={handlePingCancel}
                              selectedPixelId={selectedPixelId}
                              pixel={pixel}
                              handleSubscribeClick={handleSubscribeClick}
                              subscriptionStatus={subscriptionStatus}
                            />

                            {/* 하단 중앙 복귀 버튼 */}
                            <div className="flex justify-center mt-2 pb-6">
                              <button
                                onClick={() => setTargetFeedItem(null)}
                                className="px-6 py-2.5 rounded-full border border-white/10 bg-white/5 text-white/80 hover:text-white hover:bg-white/10 hover:border-white/20 transition-all font-bold text-[13.5px] cursor-pointer no-theme-hover shadow-sm"
                              >
                                <span>전체 보기</span>
                              </button>
                            </div>
                          </div>
                        );
                      }

                      return (
                        <>
                          {/* ── 피드 리스트 ── */}
                          <div className="flex flex-col gap-3 shrink-0" data-tour="panel-feed">
                            {/* 픽셀 상세 2단 탭 */}
                            {selectedPixelId && (
                              <div className="flex border-b border-white/10 mb-2 shrink-0">
                                <button
                                  onClick={() => setActiveTab("moment")}
                                  className={`flex-1 py-2 text-center text-sm font-bold transition-all relative no-theme-hover ${
                                    activeTab === "moment"
                                      ? "text-white"
                                      : "text-white/40 hover:text-white"
                                  }`}
                                >
                                  <span>{t("feed") || "피드"}</span>
                                  {activeTab === "moment" && (
                                    <motion.div
                                      layoutId="activeFeedTabUnderline"
                                      className="absolute bottom-0 left-0 right-0 h-[2px] bg-amber-500 rounded-full"
                                      transition={{
                                        type: "spring",
                                        damping: 30,
                                        stiffness: 280,
                                      }}
                                    />
                                  )}
                                </button>
                                <button
                                  onClick={() => setActiveTab("community")}
                                  className={`flex-1 py-2 text-center text-sm font-bold transition-all relative no-theme-hover ${
                                    activeTab === "community"
                                      ? "text-white"
                                      : "text-white/40 hover:text-white"
                                  }`}
                                >
                                  <span>{t("community")}</span>
                                  {activeTab === "community" && (
                                    <motion.div
                                      layoutId="activeFeedTabUnderline"
                                      className="absolute bottom-0 left-0 right-0 h-[2px] bg-amber-500 rounded-full"
                                      transition={{
                                        type: "spring",
                                        damping: 30,
                                        stiffness: 280,
                                      }}
                                    />
                                  )}
                                </button>
                              </div>
                            )}

                            {/* 은하 카테고리 필터 (유튜브 뮤직 스타일 프리미엄 언더라인 가로 탭) */}
                            {activeTab === "moment" && (
                              <div className="sticky -top-5 z-10 relative group/catbar border-b border-white/5 pt-2.5 pb-[1px] theme-panel-bg backdrop-blur-xl">
                                {/* 좌측 스크롤 버튼 + 그라데이션 블러 (데스크탑 전용) */}
                                {!isMobile && (
                                  <div
                                    className={`absolute -left-4 top-0 bottom-0 z-10 flex items-center pr-8 bg-gradient-to-r from-[var(--theme-bg)] via-[var(--theme-bg)]/80 to-transparent pointer-events-none transition-opacity duration-300 -translate-y-[5px] ${
                                      showLeftScrollBtn
                                        ? "opacity-100"
                                        : "opacity-0"
                                    }`}
                                  >
                                    <button
                                      onClick={() => scrollCategory("left")}
                                      onPointerDown={(e) => e.stopPropagation()}
                                      onMouseDown={(e) => e.stopPropagation()}
                                      onTouchStart={(e) => e.stopPropagation()}
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
                                  onWheel={handleCategoryWheel}
                                  className={`flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-[1px] scroll-smooth ${isMobile ? "-mx-4 px-4" : "ml-[-16px] mr-[-6px] pl-[16px] pr-[6px]"}`}
                                >
                                  {/* [전체] 탭 */}
                                  <button
                                    onClick={(e) => {
                                      navigateToGalaxy(galaxyKey, null);
                                      e.currentTarget.scrollIntoView({
                                        behavior: "smooth",
                                        block: "nearest",
                                        inline: "center",
                                      });
                                    }}
                                    className={`shrink-0 pb-2.5 px-3.5 text-[15px] transition-all relative cursor-pointer outline-none focus:outline-none focus-visible:outline-none hover:bg-transparent hover:shadow-none hover:border-transparent no-theme-hover ${
                                      activeCategory === null
                                        ? "text-white font-black"
                                        : "text-white/40 font-bold hover:text-white"
                                    }`}
                                  >
                                    <span>{t("allCategory")}</span>
                                    {activeCategory === null && (
                                      <motion.div
                                        layoutId="activeCategoryUnderline"
                                        className="absolute bottom-0 left-0 right-0 h-[2.5px] rounded-full"
                                        style={{
                                          backgroundColor: moodColor.primaryHex,
                                        }}
                                        transition={{
                                          type: "spring",
                                          damping: 30,
                                          stiffness: 280,
                                        }}
                                      />
                                    )}
                                  </button>

                                  {/* 현재 은하의 카테고리 탭 (DB 동적) */}
                                  {(dynamicCategoryMap[galaxyKey] || []).map(
                                    (cat) => {
                                      const isActive =
                                        activeCategory !== null &&
                                        activeCategory === cat.key;
                                      return (
                                        <button
                                          key={cat.key}
                                          onClick={(e) => {
                                            navigateToGalaxy(
                                              galaxyKey,
                                              activeCategory === cat.key
                                                ? null
                                                : cat.key,
                                            );
                                            e.currentTarget.scrollIntoView({
                                              behavior: "smooth",
                                              block: "nearest",
                                              inline: "center",
                                            });
                                          }}
                                          className={`shrink-0 pb-2.5 px-3.5 text-[15px] transition-all relative cursor-pointer outline-none focus:outline-none focus-visible:outline-none hover:bg-transparent hover:shadow-none hover:border-transparent no-theme-hover ${
                                            isActive
                                              ? "text-white font-black"
                                              : "text-white/40 font-bold hover:text-white"
                                          }`}
                                        >
                                          <span>{cat.name}</span>
                                          {isActive && (
                                            <motion.div
                                              layoutId="activeCategoryUnderline"
                                              className="absolute bottom-0 left-0 right-0 h-[2.5px] rounded-full"
                                              style={{
                                                backgroundColor:
                                                  moodColor.primaryHex,
                                              }}
                                              transition={{
                                                type: "spring",
                                                damping: 30,
                                                stiffness: 280,
                                              }}
                                            />
                                          )}
                                        </button>
                                      );
                                    },
                                  )}
                                </div>

                                {/* 우측 스크롤 버튼 + 그라데이션 블러 (데스크탑 전용) */}
                                {!isMobile && (
                                  <div
                                    className={`absolute -right-4 top-0 bottom-0 z-10 flex items-center pl-8 bg-gradient-to-l from-[var(--theme-bg)] via-[var(--theme-bg)]/80 to-transparent pointer-events-none transition-opacity duration-300 -translate-y-[5px] ${
                                      showRightScrollBtn
                                        ? "opacity-100"
                                        : "opacity-0"
                                    }`}
                                  >
                                    <button
                                       onClick={() => scrollCategory("right")}
                                       onPointerDown={(e) => e.stopPropagation()}
                                       onMouseDown={(e) => e.stopPropagation()}
                                       onTouchStart={(e) => e.stopPropagation()}
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

                            <div className="flex items-center justify-between w-full">
                              <p className="text-xs font-normal text-white/80 uppercase tracking-widest">
                                {tM("records", { count: feedMoments.length })}
                              </p>
                              {!isOwner && activeTab === "community" && (
                                <button
                                  onClick={handleWriteReview}
                                  className="h-7 px-3.5 flex items-center justify-center rounded-full bg-white text-black text-[11px] font-bold shadow-md hover:bg-white/90 active:scale-95 transition-all cursor-pointer no-theme-hover"
                                >
                                  <span>{t('writeCommunity')}</span>
                                </button>
                              )}
                            </div>

                            {/* 스켈레톤 로딩 (초기 피드 로딩 시) */}
                            {feedLoading && feedMoments.length === 0 && (
                              <div className="flex flex-col gap-3">
                                {Array.from({ length: 3 }).map((_, i) => (
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

                            {feedMoments.length === 0 && !feedLoading && (
                              <div className="flex flex-col items-center gap-3 py-8">
                                <div className="w-12 h-12 rounded-full bg-theme-card border border-theme flex items-center justify-center">
                                  <Sparkles className="w-5 h-5 text-theme-muted" />
                                </div>
                                <p className="text-sm font-medium text-theme-muted text-center leading-relaxed">
                                  {tM("noRecords")}
                                </p>
                                {!isOwner && !userProfile && (
                                  <p className="text-xs text-theme-muted font-medium">
                                    {tM("loginForPing")}
                                  </p>
                                )}
                              </div>
                            )}

                            {feedMoments.map((moment) => (
                              <MomentCard
                                key={moment.momentId || moment.id}
                                moment={moment}
                                isOwner={isOwner}
                                userProfile={userProfile}
                                isLockedContent={isLockedContent}
                                editingMomentId={editingMomentId}
                                setEditingMomentId={setEditingMomentId}
                                editContent={editContent}
                                setEditContent={setEditContent}
                                editPreviewUrls={editPreviewUrls}
                                setEditPendingFiles={setEditPendingFiles}
                                setEditPreviewUrls={setEditPreviewUrls}
                                editYoutubeUrl={editYoutubeUrl}
                                setEditYoutubeUrl={setEditYoutubeUrl}
                                editExistingImages={editExistingImages}
                                setEditExistingImages={setEditExistingImages}
                                editTags={editTags}
                                setEditTags={setEditTags}
                                kebabOpenId={kebabOpenId}
                                setKebabOpenId={setKebabOpenId}
                                confirmDeleteId={confirmDeleteId}
                                setConfirmDeleteId={setConfirmDeleteId}
                                handleEditMoment={handleEditMoment}
                                handleDeleteMoment={handleDeleteMoment}
                                setFeedMoments={setFeedMoments}
                                openComments={openComments}
                                toggleComments={toggleComments}
                                viewOriginalIds={viewOriginalIds}
                                toggleOriginalView={toggleOriginalView}
                                setLightboxImages={setLightboxImages}
                                setLightboxIndex={setLightboxIndex}
                                setIsLightboxOpen={setIsLightboxOpen}
                                handlePingButtonClick={handlePingButtonClick}
                                momentIsPinging={momentIsPinging}
                                momentPings={momentPings}
                                activePingMomentId={activePingMomentId}
                                sentPingId={sentPingId}
                                isSending={isSending}
                                setIsSending={setIsSending}
                                setSentPingId={setSentPingId}
                                handlePingSelect={handlePingSelect}
                                handlePingCancel={handlePingCancel}
                                selectedPixelId={selectedPixelId}
                                pixel={pixel}
                                handleSubscribeClick={handleSubscribeClick}
                                subscriptionStatus={subscriptionStatus}
                              />
                            ))}

                            {feedLoading && feedMoments.length > 0 && (
                              <div className="flex items-center justify-center py-4">
                                <LogoSpinner size={20} />
                                <span className="text-xs text-theme-muted font-medium ml-2">
                                  {tM("loadingRecords")}
                                </span>
                              </div>
                            )}

                            {!feedHasMore && feedMoments.length > 0 && (
                              <p className="text-xs text-theme-muted text-center py-2 font-medium">
                                {tM("allRecordsShown")}
                              </p>
                            )}
                          </div>
                        </>
                      );
                    })()}

                    {/* 무한 스크롤 옵저버가 어떤 조건 분기(Spotlight/Full)에서도 unmount 되지 않고 상시 레퍼런스를 보존하도록 고정 마운트 */}
                    <div
                      ref={sentinelRef}
                      className={
                        !!targetFeedItem &&
                        targetFeedItem.id === selectedPixelId
                          ? "h-0 opacity-0 pointer-events-none shrink-0"
                          : "h-4 shrink-0"
                      }
                    />
                  </>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>{" "}
        {/* [UX FIX] 이너 래퍼 닫기 */}
      </MobileFullPopupWrapper>

      {/* 새 별자리 대화 모달 */}
      {isCreateGroupOpen && (
        <CreateGroupModal
          isOpen={isCreateGroupOpen}
          onClose={() => setIsCreateGroupOpen(false)}
        />
      )}

      {/* 프로필 편집 모달 */}
      {isProfileEditOpen && (
        <ProfileEditModal
          key="profile-edit-modal"
          isOpen={isProfileEditOpen}
          onClose={() => setIsProfileEditOpen(false)}
        />
      )}

      {/* 초신성 후원 모달 (타인 패널) */}
      {!isOwner && pixel && isSupernovaOpen && (
        <SupernovaModal
          key="supernova-modal"
          isOpen={isSupernovaOpen}
          onClose={() => setIsSupernovaOpen(false)}
          receiverId={selectedPixelId!}
          receiverName={pixel.displayName || t("unknownPixel")}
        />
      )}

      {/* 방문자 인사이트 모달 */}
      {isInsightOpen && (
        <PixelAnalyticsPanel
          key="insight-panel"
          isOpen={isInsightOpen}
          onClose={() => {
            setIsInsightOpen(false);
            window.history.pushState(null, "", "/");
          }}
          userId={selectedPixelId!}
          pixelName={pixel?.displayName || t("unknownPixel")}
          moodId={headerMoodId}
        />
      )}

      {/* 이미지 라이트박스 — AnimatePresence 외부로 분리 (이벤트 전파 보장) */}
      <ImageLightbox
        images={lightboxImages}
        initialIndex={lightboxIndex}
        isOpen={isLightboxOpen}
        onClose={() => setIsLightboxOpen(false)}
      />

      {/* 연결 요청 확인 모달 */}
      {isConnectConfirmOpen && (
        <ActionConfirmModal
          isOpen={isConnectConfirmOpen}
          onClose={() => setIsConnectConfirmOpen(false)}
          title={t("bondLabel")}
          message={t("confirmConnectMsg", {
            name: pixel?.displayName || t("unknownPixel"),
          })}
          onConfirm={executeConnect}
          themeStyle={moodColor.themeStyle}
        />
      )}

      {/* 신규 구독 요청 확인 모달 */}
      {isSubscribeConfirmOpen && (
        <ActionConfirmModal
          isOpen={isSubscribeConfirmOpen}
          onClose={() => setIsSubscribeConfirmOpen(false)}
          title={t("subscribeThought")}
          message={t("confirmSubscribeMsg", {
            name: pixel?.displayName || t("unknownPixel"),
          })}
          onConfirm={executeSubscribe}
          themeStyle={moodColor.themeStyle}
        />
      )}

      {/* 구독 해지 안내 모달 */}
      {isUnsubConfirmOpen && (
        <ActionConfirmModal
          isOpen={isUnsubConfirmOpen}
          onClose={() => setIsUnsubConfirmOpen(false)}
          title={t("unsubConfirm")}
          message={t("unsubGuide")}
          onConfirm={executeUnsubscribe}
          themeStyle={moodColor.themeStyle}
        />
      )}
    </>
  );
}

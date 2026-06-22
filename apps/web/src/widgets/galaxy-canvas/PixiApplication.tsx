"use client";

/**
 * [Pixelyf Galaxy Engine — Clean Room v2]
 *
 * 검증된 알고리즘 기반 재구축:
 *   1. Atomic Render: ticker.stop() → 데이터 로딩 → 스프라이트 일괄 생성 → ticker.start()
 *   2. Lazy SpritePool: 사전 생성 없이 필요할 때 즉시 생성
 *   3. Epsilon 쓰로틀링: 매 프레임 Zustand 업데이트 방지
 */

import { useState, useEffect, useRef, useMemo } from "react";
import { useTranslations } from "next-intl";
import * as PIXI from "pixi.js";
import { PERSONA_MAP, VISUAL_SCALE } from "@/shared/constants/personas";
import { CAMERA_ZOOM } from "@/shared/constants/camera";
import { getLODLevel } from "@/shared/lib/pixi/lod";
import { SpritePool, updateVisibility } from "@/shared/lib/pixi/culling";
import { PixelSprite } from "@/entities/user/ui/PixelSprite";
import { SpatialGrid } from "@/shared/lib/pixi/spatialGrid";
import { useGalaxyStore, type PixelData } from "@/stores/galaxyStore";
import { GalaxyLoader } from "./GalaxyLoader";
import { GalaxyJoinModal } from "./GalaxyJoinModal";
import { createClient } from "@/shared/lib/supabase/browser";
import { type PersonaGroup } from "@/shared/lib/pixi/PixelySwimmer";
import { useUserStore } from "@/entities/user/model/useUserStore";
import { PulseManager } from "./lib/PulseManager";
import { Globe } from "lucide-react";
import {
  getWorldOffset,
  getGalaxyFromCoords,
  GALAXY_CENTERS,
  syncGalaxyCenters,
} from "@/shared/lib/pixi/coordinate";
import { initRenderer } from "./engine/initRenderer";
import { NebulaEffect } from "@/shared/lib/pixi/NebulaEffect";
import { initCamera } from "./engine/initCamera";
import { initMobileGestures } from "./engine/initMobileGestures";
import { initGuardians } from "./engine/initGuardians";
import { initDataSync } from "./engine/dataSync";
import { initStoreSync } from "./engine/storeSync";
import { initResizeHandler } from "./engine/initResizeHandler";
import { initDesktopInput } from "./engine/initDesktopInput";
import { initThoughtGraph } from "./engine/initThoughtGraph";
import { initTickerLoop } from "./engine/tickerLoop";
import { initGalaxyWarp } from "./engine/initGalaxyWarp";
import { useGalaxySystem } from "@/shared/hooks/useGalaxySystem";

// ── 생각그래프 ──
import { ThoughtGraphRenderer } from "@/shared/lib/thought-graph/ThoughtGraphRenderer";

interface PixiApplicationProps {
  initialExternalData?: PixelData[];
  partnerCode?: string;
}

export function PixiApplication({
  initialExternalData,
  partnerCode,
}: PixiApplicationProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const initStartedRef = useRef(false);

  const tThought = useTranslations("ThoughtGraph");
  const relationLabels = useMemo(() => ({
    'extends': tThought('extendsMini') || tThought('relationExtends') || '더하기',
    'supports': tThought('supportsMini') || tThought('relationSupports') || '공감',
    'contradicts': tThought('contradictsMini') || tThought('relationContradicts') || '반론',
    'refines': tThought('relationRefines') || '진화',
    'instantiates': tThought('relationInstantiates') || '기록',
    'requires': tThought('relationRequires') || '뿌리',
    'triggered-by': tThought('relationTriggeredBy') || '영감',
    'near-miss': tThought('relationNearMiss') || '통함',
  }), [tThought]);

  // ── 생각그래프 및 뷰 모드 ──
  const viewMode = useGalaxyStore((state) => state.viewMode);
  const thoughtRendererRef = useRef<ThoughtGraphRenderer | null>(null);
  const thoughtWorkerRef = useRef<Worker | null>(null);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [targetProgress, setTargetProgress] = useState(0);
  const [loadingStatus, setLoadingStatus] = useState("Initializing Engine...");
  const [isLoaderActive, setIsLoaderActive] = useState(true);
  const [isLoaderFadeOut, setIsLoaderFadeOut] = useState(false);

  // ─── 단방향 단조증가 진행 제어 (비동기 쿼리의 진행도 역행 방지) ───
  const handleSetTargetProgress = (val: number) => {
    setTargetProgress((prev) => {
      if (prev === 100 && val < 100) return prev;
      return val;
    });
  };

  // ─── 하이브리드 부드러운 가상 로딩 엔진 ───
  useEffect(() => {
    if (!isLoaderActive) return;

    let rafId: number;
    let current = 0;

    const update = () => {
      const diff = targetProgress - current;

      if (targetProgress === 100) {
        // 준비 완료 시에는 100%까지 빠르게 차오르도록 보간 비율 상승
        current += Math.max(0.5, diff * 0.12);
      } else {
        // 로딩 중에는 부드러운 속도로 상승
        current += diff * 0.04;
      }

      if (current >= 99.9 && targetProgress === 100) {
        current = 100;
        setLoadingProgress(100);

        // 100% 도달 후 250ms 대기 후 페이드 아웃 연출
        setTimeout(() => {
          setIsLoaderFadeOut(true);
          // 500ms 페이드 아웃 애니메이션 후 DOM 마운트 해제
          setTimeout(() => {
            setIsLoaderActive(false);
          }, 500);
        }, 250);
        return;
      }

      setLoadingProgress(current);
      rafId = requestAnimationFrame(update);
    };

    rafId = requestAnimationFrame(update);
    return () => cancelAnimationFrame(rafId);
  }, [targetProgress, isLoaderActive]);

  // HUD: DOM 직접 조작 (60fps에서 React 리렌더 방지)
  const hudCountRef = useRef<HTMLSpanElement>(null);
  const setVisiblePixels = (count: number) => {
    if (hudCountRef.current)
      hudCountRef.current.innerText = count.toLocaleString();
  };

  const { galaxies } = useGalaxySystem();
  if (galaxies?.length) {
    syncGalaxyCenters(galaxies);
  }

  // ─── 엔진 초기화 ───
  useEffect(() => {
    // [버그 수정] 동적 은하 메타데이터(좌표 등)가 도착하기 전에는 엔진 초기화를 대기합니다.
    if (!galaxies?.length) return;

    if (!containerRef.current || initStartedRef.current) return;
    initStartedRef.current = true;

    const canvas = document.createElement("canvas");
    canvas.className = "block touch-none outline-none";
    canvas.style.cssText =
      "width:100%;height:100%;position:absolute;top:0;left:0;outline:none;border:none;";
    containerRef.current.appendChild(canvas);

    let isCancelled = false;
    const isCancelledRef = { current: false };
    let cleanupFn: (() => void) | null = null;
    let cleanupGuardians = () => {};
    let activePixiApp: PIXI.Application | null = null;
    let activeCleanupGuardians: (() => void) | null = null;
    let isDestroyed = false;

    const safeDestroy = () => {
      if (isDestroyed) return;
      isDestroyed = true;
      if (activeCleanupGuardians) activeCleanupGuardians();
      if (activePixiApp) {
        try {
          activePixiApp.destroy(true, { children: true, texture: true });
        } catch (e) {
          console.warn("[PixiApplication] safeDestroy warning:", e);
        }
      }
      canvas.remove();
    };

    const init = async () => {
      // ── Phase 1: 렌더러 ──
      const cw = containerRef.current?.clientWidth || window.innerWidth || 390;
      const ch =
        containerRef.current?.clientHeight || window.innerHeight || 844;
      const renderer = await initRenderer(canvas, cw, ch);
      activePixiApp = renderer.pixiApp;
      if (isCancelled) {
        safeDestroy();
        return;
      }
      const {
        pixiApp,
        layers,
        worldContainer,
        starLayer,
        starSprites,
        bondContainer,
        subscriptionBondContainer,
        nebulaFx,
        constellationRenderer,
      } = renderer;
      const canvasSize = {
        current: {
          width: cw,
          height: ch,
        },
      };

      // ── Phase 2: 카메라 ──
      const currentUser = useUserStore.getState().user;
      let galaxyGroup: PersonaGroup = "NT";
      if (partnerCode === "pixelyf") galaxyGroup = "CONTEXT";
      else if (
        currentUser?.persona_code &&
        PERSONA_MAP[currentUser.persona_code]
      )
        galaxyGroup = PERSONA_MAP[currentUser.persona_code]
          .galaxyGroup as PersonaGroup;
      const { x: worldOffsetX, y: worldOffsetY } = getWorldOffset(galaxyGroup);

      const targetGalaxy =
        galaxies?.find((g) => g.partnerCode === partnerCode) ||
        galaxies?.find((g) => g.isRoot);
      const targetKey =
        targetGalaxy?.key ||
        (partnerCode && partnerCode !== "pixelyf"
          ? partnerCode.toUpperCase()
          : "PIXELYF");
      const targetCoord = GALAXY_CENTERS[targetKey] || { x: 0, y: 0 };
      const { camera, entranceTimeout: initialEntranceTimeout } = initCamera(
        worldContainer,
        partnerCode,
        currentUser,
        targetCoord,
      );
      const entranceRef = { current: initialEntranceTimeout };
      camera.setCanvasSize(canvasSize.current.width, canvasSize.current.height);

      // 초기 도메인 동기화
      const initialVp = camera.viewport;
      const resolvedDomain =
        partnerCode === "pixelyf" || !partnerCode
          ? getGalaxyFromCoords(
              initialVp.x,
              initialVp.y,
              worldOffsetX,
              worldOffsetY,
            )
          : targetKey;
      const initialDomain =
        resolvedDomain === "PIXELYF_CORE" ? "PIXELYF" : resolvedDomain;
      useGalaxyStore.setState({
        galaxyKey: initialDomain,
        galaxyDomain: initialDomain,
        lodLevel: getLODLevel(initialVp.zoom),
      });

      // ★★★ ATOMIC RENDER: 데이터 로딩 중 티커 정지 ★★★
      pixiApp.ticker.stop();

      // ── Phase 3: 데이터 로딩 (티커 정지 상태) ──
      const spatialGrid = new SpatialGrid<PixelData>(2000);
      useGalaxyStore.getState().setSpatialGrid(spatialGrid);
      const supabaseClient = createClient();
      const occupiedCells = new Set<string>();
      let swimmers: any[] = [];
      try {
        const guardiansRes = await initGuardians(
          layers.effect,
          partnerCode,
          galaxyGroup,
        );
        if (isCancelled) {
          if (guardiansRes && guardiansRes.cleanup) guardiansRes.cleanup();
          safeDestroy();
          return;
        }
        swimmers = guardiansRes.swimmers;
        cleanupGuardians = guardiansRes.cleanup;
        activeCleanupGuardians = guardiansRes.cleanup;
      } catch (err) {
        console.error("[DEBUG-Pixi] initGuardians failed:", err);
      }
      const pulseManager = new PulseManager(pixiApp, worldContainer);
      pulseManager.setSwimmers(swimmers); // [SWIMMER RESONANCE] 유영 캐릭터 공명 주입

      // ── Phase 8: 생각그래프 WebGL 렌더러 초기화 (펄스 매니저 결합) ──
      const thoughtGraphRenderer = new ThoughtGraphRenderer(
        worldContainer,
        pulseManager,
        relationLabels
      );
      thoughtRendererRef.current = thoughtGraphRenderer;

      const dataSync = initDataSync({
        supabaseClient,
        camera,
        spatialGrid,
        spritePool: null,
        worldContainer,
        occupiedCells,
        worldOffsetX,
        worldOffsetY,
        galaxyGroup,
        partnerCode,
        initialExternalData,
        swimmers,
        pulseManager,
        setLoadingStatus,
        setLoadingProgress: handleSetTargetProgress,
        setVisiblePixels,
        setIsLoaderActive: () => {},
        isCancelledRef,
      });

      try {
        if (initialExternalData?.length) {
          spatialGrid.insertMany(initialExternalData);
        } else {
          if (partnerCode === "pixelyf") {
            worldContainer.alpha = 0;
            dataSync.switchGalaxyDomain(initialDomain);
          } else {
            // [FIX] 파트너 은하: galaxyDomain을 해당 은하로 명시 전환
            dataSync.switchGalaxyDomain(targetKey);
          }
          console.log("[DEBUG-Pixi] Fetching pixels in bbox...");
          await dataSync.fetchPixelsInBBox(true);
          console.log("[DEBUG-Pixi] Fetch pixels in bbox completed.");
        }
      } catch (err) {
        console.error("[DEBUG-Pixi] Phase 3 data sync failed:", err);
      }
      if (isCancelled) {
        if (dataSync) dataSync.cleanup();
        safeDestroy();
        return;
      }

      // ── Phase 4: 스프라이트 일괄 생성 (티커 정지 상태) ──
      // [TECH DEBT Phase 2-B] PixelSprite 구체 구현체를 Factory로 주입 (엔진↔비즈니스 레이어 분리)
      const spriteFactory = () => new PixelSprite();
      const spritePool = new SpritePool(
        layers.pixel,
        spriteFactory,
        (data, sprite) => {
          sprite.playAuraWave(data.glowColorPrimary);
          useGalaxyStore.getState().selectPixel(data.pixelId);
          // [LAZY-FETCH] 클릭한 픽셀의 bond를 on-demand 로드 (캐시 우선)
          dataSync.fetchBondsForPixel(data.pixelId);
        },
      );
      dataSync.setSpritePool(spritePool);

      // 모든 스프라이트 한번에 생성 — 좌→우 쓸림 현상 원천 차단
      const lodLevel = getLODLevel(camera.viewport.zoom);
      const count = updateVisibility(
        spatialGrid,
        spritePool,
        camera,
        lodLevel,
        null,
        canvasSize.current.width,
        canvasSize.current.height,
      );
      setVisiblePixels(count);
      camera.applyTransform();
      pixiApp.renderer.render(pixiApp.stage);

      // ── Phase 5: 입력 핸들러 (모바일/데스크톱 분기) ──
      const isMobileDevice = /Mobi|Android|iPhone|iPad|iPod/i.test(
        navigator.userAgent,
      );
      let isMobilePinchActive = () => false;
      let cleanupMobileGestures: (() => void) | null = null;
      let desktopInput: {
        cleanup: () => void;
        isWheelActive: () => boolean;
      } | null = null;

      pixiApp.stage.eventMode = "static";
      pixiApp.stage.hitArea = new PIXI.Rectangle(
        -4000000,
        -4000000,
        8000000,
        8000000,
      );

      if (isMobileDevice) {
        // ── 모바일: PixiJS 포인터 이벤트 완전 비활성 ──
        // PixiJS가 touchstart를 pointer로 변환하면 커스텀 핀치줌/팬이 불가
        // 모든 터치 입력은 initMobileGestures가 전담
        pixiApp.stage.eventMode = "none";

        const mobileResult = initMobileGestures(canvas, {
          camera,
          spatialGrid,
          entranceRef,
          worldContainer,
        });
        cleanupMobileGestures = mobileResult.cleanup;
        isMobilePinchActive = mobileResult.isPinching; // 모바일 핀치 줌 바인딩
      } else {
        // ── 데스크탑: 모듈 추출된 입력 핸들러 ──
        desktopInput = initDesktopInput({
          canvas,
          pixiApp,
          camera,
          worldContainer,
          layers,
          entranceRef,
        });
      }

      const isWheelActive = () =>
        (desktopInput?.isWheelActive() ?? false) || isMobilePinchActive();

      // ── [Phase 3 Step 1] 공유 상태: forceUpdate 플래그 (리사이즈/카메라포커스/워프/Ticker 간 공유) ──
      const forceUpdateRef = { current: true };

      // ── 리사이즈 핸들러 (모듈 추출) ──
      const resizeHandler = initResizeHandler({
        pixiApp,
        camera,
        containerElement: containerRef.current!,
        canvasSize,
        layers,
        swimmers,
        dataSync,
        initialExternalData,
        forceUpdateRef,
      });

      // ── Phase 6: 실시간 채널 ──
      let channels: { pulseUnsub: any; coordUnsub: any } | null = null;
      if (!initialExternalData?.length) {
        channels = dataSync.subscribeChannels();
      }

      // ── Phase 7: 스토어 동기화 ──
      const storeSync = initStoreSync({
        camera,
        spritePool,
        swimmers,
        occupiedCells,
        worldOffsetX,
        worldOffsetY,
        initialExternalData,
        isWheelActive,
        fetchPixelsInBBox: dataSync.fetchPixelsInBBox,
        fetchGalaxyPixels: dataSync.fetchGalaxyPixels,
        switchGalaxyDomain: dataSync.switchGalaxyDomain,
        spatialGrid,
        partnerCode,
        bondContainer,
        subscriptionBondContainer,
      });

      // ── 생각그래프 viewMode 구독 + Worker 관리 (모듈 추출) ──
      const thoughtGraph = initThoughtGraph({
        camera,
        pixiApp,
        layers,
        bondContainer,
        subscriptionBondContainer,
        constellationRenderer,
        thoughtGraphRenderer,
        thoughtRendererRef,
        thoughtWorkerRef,
      });

      // [CRITICAL FIX] 모바일 지연 마운트 Race Condition 해결
      // GalaxyCanvas의 focusOnPosition이 init() 완료보다 먼저 실행되어 store.viewport를 이미 변경해 둔 경우,
      // initStoreSync는 변경을 감지하지 못해 GSAP 애니메이션이 발동하지 않고, 카메라는 (0,0)에 영원히 고정됩니다.
      // 이후 Ticker가 (0,0) 좌표를 기준으로 store를 덮어써버리는 치명적 버그를 방지하기 위해 Ticker 시작 전 카메라를 강제 동기화합니다.
      const initialStoreVp = useGalaxyStore.getState().viewport;
      const isStoreUnmodified =
        initialStoreVp.x === 0 &&
        initialStoreVp.y === 0 &&
        initialStoreVp.zoom === 0.05;

      console.log(
        "[DEBUG-Pixi] initialStoreVp:",
        initialStoreVp,
        "isStoreUnmodified:",
        isStoreUnmodified,
      );
      console.log("[DEBUG-Pixi] cameraViewport:", {
        x: camera.viewport.x,
        y: camera.viewport.y,
        zoom: camera.viewport.zoom,
      });

      const vpDist = Math.hypot(
        initialStoreVp.x - camera.viewport.x,
        initialStoreVp.y - camera.viewport.y,
      );
      console.log(
        "[DEBUG-Pixi] vpDist:",
        vpDist,
        "zoomDiff:",
        Math.abs(initialStoreVp.zoom - camera.viewport.zoom),
      );
      if (
        vpDist > 1 ||
        Math.abs(initialStoreVp.zoom - camera.viewport.zoom) > 0.01
      ) {
        if (isStoreUnmodified) {
          console.log(
            "[DEBUG-Pixi] Store is unmodified. Syncing camera coordinates to store.",
          );
          // [새로고침 버그 수정] 스토어가 아직 초기값(0,0)이면 카메라 좌표를 스토어에 동기화
          useGalaxyStore.getState().setViewport({
            x: camera.viewport.x,
            y: camera.viewport.y,
            zoom: camera.viewport.zoom,
          });
        } else {
          console.log(
            "[DEBUG-Pixi] Store has modified viewport! Warping camera to store coordinates.",
          );
          // 외부 이벤트(피드 클릭 등)로 스토어 좌표가 이미 변경된 경우: 카메라를 스토어로 워프
          camera.warpTo(initialStoreVp.x, initialStoreVp.y);
          camera.zoomTo(initialStoreVp.zoom, 0);
          camera.applyTransform();
          swimmers.forEach((s) =>
            s.relocate(initialStoreVp.x, initialStoreVp.y, initialStoreVp.zoom),
          );
          if (!initialExternalData?.length) dataSync.debouncedFetch();
        }
      }

      // ★★★ 모든 데이터/상태 동기화 완료 후 티커 시작 ★★★
      pixiApp.ticker.start();

      // [생각 구독] 구독 관계 Bond 비동기 로드 (황금 연결선 렌더링용)
      dataSync.fetchMySubscriptionBonds();

      // [FIX] GalaxyRouteInitializer 이벤트 유실 복구
      const currentStoreKey = useGalaxyStore.getState().galaxyKey;
      if (currentStoreKey !== targetKey) {
        dataSync.switchGalaxyDomain(currentStoreKey);
        const storeCoord = GALAXY_CENTERS[currentStoreKey];
        if (storeCoord) {
          camera.warpTo(
            storeCoord.x * VISUAL_SCALE,
            storeCoord.y * VISUAL_SCALE,
          );
          camera.applyTransform();
        }
      }

      // ── 엔진 준비 완료 ──
      handleSetTargetProgress(100);
      useGalaxyStore.getState().setIsPixiReady(true);

      // 픽셀리프 은하 진입 연출
      if (partnerCode === "pixelyf" && worldContainer.alpha === 0) {
        const urlParams = new URLSearchParams(window.location.search);
        const currentZoom = camera.viewport.zoom;
        if (
          !urlParams.get("pixel") &&
          !urlParams.get("feed") &&
          currentZoom < 0.4
        ) {
          camera.zoomTo(0.05, 0.8);
        }
        const fadeStart = performance.now();
        const fadeIn = () => {
          const t = Math.min((performance.now() - fadeStart) / 600, 1);
          worldContainer.alpha = t;
          if (t < 1) requestAnimationFrame(fadeIn);
        };
        requestAnimationFrame(fadeIn);
      }

      const myUserId = useUserStore.getState().user?.id || null;
      if (myUserId)
        useGalaxyStore.getState().setHighlightedBondPixelId(myUserId);

      // ── 카메라 포커스 이벤트 ──
      const handleCameraFocus = (e: Event) => {
        const { x, y, zoom, showPing } = (e as CustomEvent).detail;
        const isGraph = useGalaxyStore.getState().viewMode === "thoughtGraph";
        const minZoom = isGraph ? 0.031 : 0.031;
        const maxZoom = isGraph ? 6.3 : 6.3;
        const clampedZoom = Math.max(
          minZoom,
          Math.min(maxZoom, zoom ?? (isGraph ? 0.5 : CAMERA_ZOOM.PIXEL_FOCUS)),
        );
        camera.moveTo(x, y, 0.5);
        camera.zoomTo(clampedZoom, 0.5);
        forceUpdateRef.current = true;

        if (showPing) {
          // [UX FIX] 포커스 이동 완료 시점에 맞춰 타겟 좌표(화면 중앙)에 시각적 핑(Ping) 파동 트리거
          setTimeout(() => {
            if (isCancelled) return;
            const panelOffset = useGalaxyStore.getState().pixelPanelWidth || 0;
            const contentArea = document.getElementById("galaxy-content-area");
            const effectivePanelW = contentArea
              ? window.innerWidth - contentArea.clientWidth
              : panelOffset;

            // 카메라 중심점 역산 (우측 패널 오프셋 적용된 실제 뷰포트 중앙)
            const centerLeftPct = (
              ((window.innerWidth - effectivePanelW) / 2 / window.innerWidth) *
              100
            ).toFixed(1);

            const ping = document.createElement("div");
            ping.style.cssText = `
              position: absolute;
              left: ${centerLeftPct}%;
              top: 50%;
              width: 60px;
              height: 60px;
              margin-left: -30px;
              margin-top: -30px;
              border: 2px solid rgba(251, 191, 36, 0.9);
              border-radius: 50%;
              pointer-events: none;
              z-index: 100;
              box-shadow: 0 0 15px rgba(251, 191, 36, 0.5), inset 0 0 10px rgba(251, 191, 36, 0.3);
              animation: focusPingAnim 1.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
            `;
            containerRef.current?.appendChild(ping);

            if (!document.getElementById("focus-ping-keyframes")) {
              const style = document.createElement("style");
              style.id = "focus-ping-keyframes";
              style.textContent = `
                @keyframes focusPingAnim {
                  0% { transform: scale(0.1); opacity: 1; border-width: 6px; }
                  100% { transform: scale(3.5); opacity: 0; border-width: 1px; }
                }
              `;
              document.head.appendChild(style);
            }

            // 애니메이션 종료 후 돔 제거
            setTimeout(() => ping.remove(), 1200);
          }, 500);
        }
      };
      window.addEventListener("camera-focus", handleCameraFocus);

      // ── 모바일 프리뷰 (싱글탭) 연결선 동기화 ──
      const handleMobilePreviewBondFetch = (e: Event) => {
        const detail = (e as CustomEvent).detail;
        if (detail && detail.isMobileTap && detail.pixelId) {
          dataSync.fetchBondsForPixel(detail.pixelId);
        }
      };
      window.addEventListener("pixel-hover", handleMobilePreviewBondFetch);

      // ── 워프 이벤트 (은하 전환) — engine/initGalaxyWarp.ts로 위임 ──
      const galaxyWarp = initGalaxyWarp({
        camera,
        worldContainer,
        dataSync,
        containerRef: containerRef as React.RefObject<HTMLDivElement | null>,
        worldOffsetX,
        worldOffsetY,
        isCancelledRef,
        forceUpdateRef,
      });

      // ── TICKER (렌더 루프) — engine/tickerLoop.ts로 위임 ──
      const tickerLoop = initTickerLoop({
        pixiApp,
        camera,
        spritePool,
        spatialGrid,
        canvasSize,
        swimmers,
        starLayer,
        starSprites,
        nebulaFx,
        constellationRenderer,
        thoughtRendererRef,
        dataSync,
        worldOffsetX,
        worldOffsetY,
        initialExternalData,
        isWheelActive,
        forceUpdateRef,
        setVisiblePixels,
      });

      // ── CLEANUP 등록 ──
      cleanupFn = () => {
        thoughtGraph.cleanup();
        tickerLoop.cleanup();

        storeSync.cleanup();
        cleanupGuardians();
        if (desktopInput) desktopInput.cleanup();
        if (cleanupMobileGestures) cleanupMobileGestures();
        dataSync.cleanup();
        resizeHandler.cleanup();
        window.removeEventListener("camera-focus", handleCameraFocus);
        window.removeEventListener("pixel-hover", handleMobilePreviewBondFetch);
        galaxyWarp.cleanup();
        if (channels && supabaseClient) {
          const { pulseUnsub, coordUnsub } = channels;

          // 업계 표준: 비동기 Realtime 소멸 시의 레이스 컨디션 및 Null Pointer 예외를 철저히 방어하는 격리 핸들러 적용
          const safeRemoveChannel = async (channel: any) => {
            if (!channel) return;
            try {
              await supabaseClient.removeChannel(channel);
            } catch (error) {
              console.warn(
                "[Realtime Cleanup] Supabase channel removal warning (silently handled):",
                error,
              );
            }
          };

          safeRemoveChannel(pulseUnsub);
          safeRemoveChannel(coordUnsub);
        }
        spritePool.destroy();
        NebulaEffect.clearCache();
        pixiApp.destroy(true, { children: true, texture: true });
        canvas.remove();
      };
    };

    init();
    return () => {
      isCancelled = true;
      isCancelledRef.current = true;
      initStartedRef.current = false;
      if (cleanupFn) {
        cleanupFn();
      } else {
        safeDestroy();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!galaxies?.length]);

  // 모바일 감지: HUD 위치를 탭바 위로 이동
  const isMobileHUD =
    typeof navigator !== "undefined" &&
    /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  return (
    <div
      ref={containerRef}
      className="w-full h-full block touch-none relative outline-none"
    >
      {isLoaderActive && (
        <GalaxyLoader
          progress={loadingProgress}
          status={loadingStatus}
          isFadeOut={isLoaderFadeOut}
        />
      )}
      {!isLoaderActive && viewMode !== "thoughtGraph" && (
        <div
          className="fixed left-4 z-50 pointer-events-none select-none"
          style={{ bottom: isMobileHUD ? 96 : 24 }}
        >
          <div className="bg-slate-950/60 backdrop-blur-xl border border-white/10 px-5 py-3 rounded-full flex items-center gap-3 shadow-2xl text-white/80">
            <Globe className="w-4 h-4 text-hot-magenta" />
            <span
              ref={hudCountRef}
              className="text-sm font-bold text-hot-magenta"
            >
              0
            </span>
            <span className="text-[10px] text-white/40">in view</span>
          </div>
        </div>
      )}
      <GalaxyJoinModal />
    </div>
  );
}

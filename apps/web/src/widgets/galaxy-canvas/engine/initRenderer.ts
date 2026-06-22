/**
 * [엔진 렌더러 초기화 모듈]
 * PixiJS Application 생성, 레이어 구조, 배경 별, 네뷸라 이펙트를 초기화합니다.
 * 24단계 히스토리 알고리즘 100% 보존.
 */
import * as PIXI from "pixi.js";
import { createPixiApp } from "@/shared/lib/pixi/pixiApp";
import { type GalaxyLayers } from "@/shared/lib/pixi/layers";
import { MOODS } from "@/shared/constants/moods";
import { ConstellationPixiRenderer } from "../constellations/ConstellationPixiRenderer";
import { ALL_CONSTELLATIONS } from "../constellations/constellationData";
import { NebulaEffect } from "@/shared/lib/pixi/NebulaEffect";

export interface StarData {
  x: number;
  y: number;
  z: number;
  size: number;
  color: number;
}

export interface RendererResult {
  pixiApp: PIXI.Application;
  layers: GalaxyLayers;
  worldContainer: PIXI.Container;
  starLayer: PIXI.Container;
  bondContainer: PIXI.Graphics;
  subscriptionBondContainer: PIXI.Graphics; // [생각 구독] 황금 연결선용
  starSprites: PIXI.Sprite[];
  nebulaFx: NebulaEffect;
  constellationRenderer: ConstellationPixiRenderer;
}

/**
 * PixiJS 렌더러를 초기화합니다. 캔버스, 레이어, 배경 별, 네뷸라를 세팅합니다.
 */
export async function initRenderer(
  canvas: HTMLCanvasElement,
  containerWidth?: number,
  containerHeight?: number,
): Promise<RendererResult> {
  // [NETWORK THROTTLE] 만 명의 픽셀이 동시에 아바타를 로드할 때 발생하는 CORS 및 네트워크 과부하를 방지
  if ((PIXI.Assets as any).background) {
    (PIXI.Assets as any).background.concurrency = 10;
  }

  const cw =
    containerWidth ??
    (window.innerWidth ||
      (typeof window !== "undefined" ? window.screen?.width : 390) ||
      390);
  const ch =
    containerHeight ??
    (window.innerHeight ||
      (typeof window !== "undefined" ? window.screen?.height : 844) ||
      844);
  const pixiApp = await createPixiApp(canvas, cw, ch);

  // 레이어 인스턴스만 생성 (addChild는 worldContainer에서 관장)
  const layers: GalaxyLayers = {
    background: new PIXI.Graphics(),
    starField: new PIXI.Container(),
    nebula: new PIXI.Container(),
    connection: new PIXI.Graphics(),
    pixel: (() => {
      const c = new PIXI.Container();
      c.sortableChildren = true;
      return c;
    })(),
    effect: new PIXI.Container(),
  };

  // 월드 컨테이너에 합산 (background만 stage 직접 자식)
  const worldContainer = new PIXI.Container();
  pixiApp.stage.addChild(layers.background);
  pixiApp.stage.addChild(worldContainer);

  // [BONDS LAYER] 별자리 연결 로드 레이어. 픽셀(스프라이트)보다 반드시 아래에 렌더링되게 0번에 추가
  const bondContainer = new PIXI.Graphics();
  worldContainer.addChildAt(bondContainer, 0);

  // [생각 구독] 황금 연결선 레이어 (bondContainer 바로 위)
  const subscriptionBondContainer = new PIXI.Graphics();
  worldContainer.addChildAt(subscriptionBondContainer, 1);

  // [성운] stage 직접 자식으로 배치 (4월 구조 복원)
  // 카메라 변환(worldContainer)의 영향을 받지 않고, 자체 패럴랙스 계산
  const nebulaFx = new NebulaEffect();
  pixiApp.stage.addChildAt(nebulaFx, 1); // background(0) 바로 위

  worldContainer.addChild(
    layers.starField,
    layers.nebula,
    layers.connection,
    layers.pixel,
    layers.effect,
  );

  // 배경 별 레이어
  const starLayer = new PIXI.Container();
  pixiApp.stage.addChildAt(starLayer, 2); // nebulaFx(1) 바로 위

  // 배경 별 생성 (300개, 무드 색상 반영)
  const starSprites: PIXI.Sprite[] = [];
  const starCircleTexture = (() => {
    const g = new PIXI.Graphics().circle(0, 0, 10).fill(0xffffff);
    return pixiApp.renderer.generateTexture(g);
  })();

  for (let i = 0; i < 300; i++) {
    const mood = MOODS[Math.floor(Math.random() * MOODS.length)];
    const color = Math.random() > 0.3 ? mood.primaryColor : 0xffffff;

    const s = new PIXI.Sprite(starCircleTexture);
    s.anchor.set(0.5);
    s.tint = color;

    const starData: StarData = {
      x: Math.random(),
      y: Math.random(),
      z: i < 100 ? 0.03 : 0.02,
      size: Math.random() * (i < 100 ? 1.5 : 1) + 0.5,
      color,
    };

    (s as any).starData = starData;
    starLayer.addChild(s);
    starSprites.push(s);
  }

  // 배경 렉트
  layers.background.rect(0, 0, cw, ch).fill(0x000000);

  // ── 별자리 PixiJS 렌더러 초기화 (worldContainer에 직접 배치) ──
  // 활성화된 별자리만 렌더링
  const enabledConstellations = ALL_CONSTELLATIONS.filter((c) => c.enabled);
  const constellationRenderer = new ConstellationPixiRenderer(
    worldContainer,
    enabledConstellations,
  );

  return {
    pixiApp,
    layers,
    worldContainer,
    starLayer,
    bondContainer,
    subscriptionBondContainer,
    starSprites,
    nebulaFx,
    constellationRenderer,
  };
}

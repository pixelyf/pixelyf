import * as PIXI from 'pixi.js';
import type { ThoughtNodeData, ThoughtEdge } from './types';
import { useGalaxyStore } from '@/stores/galaxyStore';

// 관계 유형별 한글 번역 매핑
const RELATION_LABEL_KOREAN: Record<string, string> = {
  'extends': '더하기',
  'supports': '공감',
  'contradicts': '반론',
  'refines': '진화',
  'instantiates': '기록',
  'requires': '뿌리',
  'triggered-by': '영감',
  'near-miss': '통함'
};

// 관계 유형별 시각 디자인 매핑
const RELATION_VISUALS: Record<string, { color: number; alpha: number; dash?: boolean }> = {
  extends: { color: 0x818CF8, alpha: 0.65 },
  supports: { color: 0x10B981, alpha: 0.75 },
  contradicts: { color: 0xEF4444, alpha: 0.75 },
  refines: { color: 0xF59E0B, alpha: 0.6 },
  instantiates: { color: 0x06B6D4, alpha: 0.6 },
  requires: { color: 0x8B5CF6, alpha: 0.6 },
  'triggered-by': { color: 0xEAB308, alpha: 0.6 },
  'near-miss': { color: 0x6B7280, alpha: 0.35 }
};

// ── [레퍼런스 이미지 정합] 카테고리별 선명 컬러 팔레트 ──
const CATEGORY_DOT_COLORS: Record<string, number> = {
  // PIXELYF 은하 카테고리
  'SPARK':                 0x00CFFF,  // 시안 하늘
  'CREATIVE':              0x3B82F6,  // 블루
  'GROWTH':                0x22C55E,  // 라임 그린
  'DAILY':                 0xA855F7,  // 퍼플
  'THOUGHTS':              0xEC4899,  // 핑크
  'CONNECT':               0xEF4444,  // 레드
  'TASTE':                 0xF59E0B,  // 골드
  'ACTION':                0xFBBF24,  // 옐로우

  // 기타 은하 카테고리
  'INQUE':                 0x6366F1,  // 분석가 (인디고)
  'THOUGHT_SUBSCRIPTION':  0xF59E0B,  // 생각구독 (골드)
  'UNLEARN':               0xEC4899,  // 언러닝 (핑크)
  'INSIDE_ROOM':           0x3B82F6,  // 내면의방 (블루)
  'CONTINUOUS':            0x10B981,  // 컨티뉴어스 (그린)
};
const DEFAULT_DOT_COLOR = 0x9CA3AF;

// 카테고리 한글 라벨 (공식 명칭 일치 완료)
const CATEGORY_KOREAN_LABELS: Record<string, string> = {
  // PIXELYF
  'SPARK': '영감', 'CREATIVE': '창작', 'CREATE': '창작',
  'GROWTH': '성장', 'DAILY': '일상', 'THOUGHTS': '생각',
  'CONNECT': '관계', 'TASTE': '취향', 'ACTION': '실천',

  // 기타 은하
  'INQUE': '분석가',
  'THOUGHT_SUBSCRIPTION': '생각구독',
  'UNLEARN': '언러닝',
  'INSIDE_ROOM': '내면의방',
  'CONTINUOUS': '컨티뉴어스',
};

export class ThoughtGraphRenderer {
  private container: PIXI.Container;
  private nebulaDustContainer: PIXI.Container;
  // [BUG FIX] Custom Shader Mesh → PIXI.Graphics 교체
  // 원인: PIXI.Mesh Custom Shader의 uWorldTransformMatrix가 PixiJS v8 UBO 바인딩과
  //       충돌하여 identity matrix로 남으면서 엣지가 원점(0,0)에만 그려졌음.
  // 해결: PIXI.Graphics는 일반 컨테이너 변환을 자동으로 따르므로 좌표계가 노드와 일치함.
  private edgeGraphics: PIXI.Graphics;
  private edgeLabelsContainer: PIXI.Container;
  private nodeContainer: PIXI.Container;
  private lastCoordsHash: string = '';
  
  private spritesMap = new Map<string, PIXI.Container>();
  private edgeLabelsMap = new Map<string, PIXI.Container>();
  private edges: ThoughtEdge[] = [];
  
  private edgeCountMap = new Map<string, number>();
  private categoryLabelsContainer: PIXI.Container; // 카테고리 그룹 라벨
  private categoryLabelsMap = new Map<string, PIXI.Text>();
  
  // 텍스처 캐시 (도트 크기별 캐싱)
  private dotTextures = new Map<number, PIXI.Texture>();
  private dustTexture: PIXI.Texture | null = null;
  private pixiAppRef: PIXI.Application | null = null;

  private pulseManager: any = null;
  private time = 0;
  private relationLabels: Record<string, string>;

  constructor(parentContainer: PIXI.Container, pulseManager?: any, relationLabels?: Record<string, string>) {
    this.relationLabels = relationLabels || RELATION_LABEL_KOREAN;
    this.container = new PIXI.Container();
    this.container.visible = false;
    parentContainer.addChild(this.container);

    this.nebulaDustContainer = new PIXI.Container();
    this.edgeLabelsContainer = new PIXI.Container();
    this.nodeContainer = new PIXI.Container();
    
    this.pulseManager = pulseManager || null;

    this.categoryLabelsContainer = new PIXI.Container();

    // [BUG FIX] PIXI.Graphics로 엣지 컨테이너 초기화 (Custom Shader Mesh 제거)
    this.edgeGraphics = new PIXI.Graphics();

    // 레이어 순서: 배경 ⇢ 엣지선 ⇢ 관계 배지 ⇢ 노드 ⇢ 카테고리 라벨
    this.container.addChild(this.nebulaDustContainer);
    this.container.addChild(this.edgeGraphics);
    this.container.addChild(this.edgeLabelsContainer);
    this.container.addChild(this.nodeContainer);
    this.container.addChild(this.categoryLabelsContainer);
  }

  // [BUG FIX] initEdgeMesh 제거 — PIXI.Graphics로 대체

  public setVisible(visible: boolean) {
    this.container.visible = visible;
  }

  /** 도트 반지름 계산: 1:N 수납 피드 수 + 엣지 연결 수 기반 (20% 축소) */
  private calcDotRadius(postsCount: number, edgeCount: number): number {
    // posts 기반: 20% 축소 (계수 2.5→2.0, max 25→20)
    const postsRadius = 2.4 + Math.log2(Math.max(1, postsCount)) * 2.0;
    const edgeBonus = Math.min(4, edgeCount * 0.24);
    return Math.min(20, postsRadius + edgeBonus);
  }

  /** 도트 텍스처 가져오기 (캐시) */
  private getDotTexture(radius: number, pixiApp: PIXI.Application, dpr: number): PIXI.Texture {
    const key = Math.round(radius * 2); // 0.5px 단위 캐시
    if (this.dotTextures.has(key)) return this.dotTextures.get(key)!;
    
    // 4배 크기로 래스터화 후 축소 → 줌인 시 선명도 확보
    const renderRadius = radius * 4;
    const gDot = new PIXI.Graphics().circle(0, 0, renderRadius).fill(0xffffff);
    const tex = pixiApp.renderer.generateTexture({ target: gDot, resolution: dpr });
    this.dotTextures.set(key, tex);
    return tex;
  }

  /** 노드 및 엣지 드로잉 */
  public renderData(
    nodes: ThoughtNodeData[],
    edges: ThoughtEdge[],
    pixiApp: PIXI.Application
  ) {
    this.edges = edges;

    // 엣지 연결 수 맵 빌드
    this.edgeCountMap.clear();
    nodes.forEach(n => this.edgeCountMap.set(n.id, 0));
    edges.forEach(e => {
      this.edgeCountMap.set(e.source, (this.edgeCountMap.get(e.source) || 0) + 1);
      this.edgeCountMap.set(e.target, (this.edgeCountMap.get(e.target) || 0) + 1);
    });

    // 기존 리소스 정리
    this.nodeContainer.removeChildren();
    this.edgeLabelsContainer.removeChildren();
    this.nebulaDustContainer.removeChildren();
    this.spritesMap.clear();
    this.edgeLabelsMap.clear();

    const dprResolution = pixiApp.renderer.resolution || window.devicePixelRatio || 2;

    // 배경 스타더스트 제거됨

    this.pixiAppRef = pixiApp;

    // ── 카테고리 그룹 라벨 사전 생성 ──
    this.categoryLabelsContainer.removeChildren();
    this.categoryLabelsMap.clear();

    const isMineScope = useGalaxyStore.getState().thoughtScope === 'mine';
    this.categoryLabelsContainer.visible = !isMineScope;

    if (!isMineScope) {
      const seenCategories = new Set<string>();
      nodes.forEach(n => { if (n.category) seenCategories.add(n.category); });
      seenCategories.forEach(cat => {
        const koLabel = CATEGORY_KOREAN_LABELS[cat] || cat;
        const catColor = CATEGORY_DOT_COLORS[cat] || DEFAULT_DOT_COLOR;
        const catText = new PIXI.Text({
          text: koLabel,
          style: new PIXI.TextStyle({
            fontFamily: 'Inter, Outfit, system-ui, -apple-system',
            fontSize: 56,
            fontWeight: '700',
            fill: catColor,
            letterSpacing: -1,
            dropShadow: {
              alpha: 0.9,
              angle: Math.PI / 4,
              blur: 12,
              color: 0x020617,
              distance: 6
            }
          }),
          resolution: dprResolution
        });
        catText.anchor.set(0.5, 1);
        catText.scale.set(0.25);
        catText.eventMode = 'none';
        this.categoryLabelsContainer.addChild(catText);
        this.categoryLabelsMap.set(cat, catText);
      });
    }


    // ── [레퍼런스 정합] 컬러풀 원형 도트 노드 생성 ──
    nodes.forEach((node) => {
      const nodeGroup = new PIXI.Container();
      nodeGroup.eventMode = 'static';
      nodeGroup.cursor = 'pointer';

      const edgeCount = this.edgeCountMap.get(node.id) || 0;
      const postsCount = node.posts?.length || 1;
      const dotRadius = this.calcDotRadius(postsCount, edgeCount);

      // 카테고리별 선명 색상
      const dotColor = CATEGORY_DOT_COLORS[node.category || ''] || DEFAULT_DOT_COLOR;

      // 도트 스프라이트 (4배 생성 → 0.25 축소)
      const dotTex = this.getDotTexture(dotRadius, pixiApp, dprResolution);
      const dot = new PIXI.Sprite(dotTex);
      dot.anchor.set(0.5);
      dot.tint = dotColor;
      dot.scale.set(0.25);
      nodeGroup.addChild(dot);

      // 히트영역: 도트+텍스트 포함 Rectangle 동적 계산
      let hitWidth = dotRadius * 2 + 6; // 도트만 있을 때
      let hitX = -(dotRadius + 3);

      // ── 라벨: 줌 레벨 및 하이라이트 상태에 따라 선별적 출력 (가독성 튜닝) ──
      const labelText = node.summary || (node.content && node.content.length > 12 ? node.content.slice(0, 12) + '...' : node.content || '');
      if (labelText) {
        const style = new PIXI.TextStyle({
          fontFamily: 'Inter, Outfit, system-ui, -apple-system',
          fontSize: 44,
          fontWeight: '600',
          fill: 0xffffff,
          letterSpacing: -1.6,
          dropShadow: {
            alpha: 0.85,
            angle: Math.PI / 4,
            blur: 10,
            color: 0x020617,
            distance: 6
          }
        });
        const nameText = new PIXI.Text({ text: labelText, style, resolution: dprResolution });
        nameText.anchor.set(0, 0.5);
        nameText.scale.set(0.25);
        nameText.x = dotRadius + 4;
        nameText.eventMode = 'none';
        nodeGroup.addChild(nameText);

        // 텍스트 포함한 hitWidth 확장
        const textWidth = (nameText.width) + 8;
        hitWidth = dotRadius + 3 + dotRadius + 4 + textWidth;
      }

      // 히트영역 설정 (도트+텍스트 전체)
      nodeGroup.hitArea = new PIXI.Rectangle(hitX, -(dotRadius + 3), hitWidth, (dotRadius + 3) * 2);

      // 클릭/드래그 이벤트
      let dragStartX = 0;
      let dragStartY = 0;

      nodeGroup.on('pointerdown', (e: any) => {
        if (e.nativeEvent && (e.nativeEvent.target as Element).tagName !== 'CANVAS') return;
        dragStartX = e.global.x;
        dragStartY = e.global.y;
      });

      nodeGroup.on('pointerup', (e: any) => {
        if (e.nativeEvent && (e.nativeEvent.target as Element).tagName !== 'CANVAS') return;
        const dx = e.global.x - dragStartX;
        const dy = e.global.y - dragStartY;
        const distance = Math.hypot(dx, dy);

        if (distance < 10) {
          const store = useGalaxyStore.getState();
          store.selectThought(node.id);
          if (this.pulseManager) {
            this.pulseManager.triggerPulse(nodeGroup.x, nodeGroup.y, 'CHALLENGER', 0.8);
          }
        }
      });

      // 초기 좌표
      nodeGroup.x = node.x ?? (Math.random() - 0.5) * 200;
      nodeGroup.y = node.y ?? (Math.random() - 0.5) * 200;

      // 메타데이터 캐싱
      (nodeGroup as any)._dotRadius = dotRadius;
      (nodeGroup as any)._postsCount = postsCount;
      (nodeGroup as any)._category = node.category || '';

      this.nodeContainer.addChild(nodeGroup);
      this.spritesMap.set(node.id, nodeGroup);
    });

    // ── 엣지 관계 배지 (줌인 시에만 표시) ──
    edges.forEach((edge) => {
      const koLabel = this.relationLabels[edge.relationType] || edge.relationType;
      const vis = RELATION_VISUALS[edge.relationType] || RELATION_VISUALS.extends;

      const badgeGroup = new PIXI.Container();
      const tStyle = new PIXI.TextStyle({
        fontFamily: 'Inter, Outfit, system-ui',
        fontSize: 36,
        fontWeight: 'bold',
        fill: vis.color,
        letterSpacing: -1.2,
        stroke: {
          color: 0x05050A,
          width: 8,
          join: 'round'
        }
      });
      const tText = new PIXI.Text({ text: koLabel, style: tStyle, resolution: dprResolution });
      tText.anchor.set(0.5);
      badgeGroup.addChild(tText);
      badgeGroup.scale.set(0.15); // 배지 크기 축소 (0.25→0.15)

      this.edgeLabelsContainer.addChild(badgeGroup);
      this.edgeLabelsMap.set(edge.id, badgeGroup);
    });
  }

  /** 현재 선택 생각 ID 및 인접 엣지 노드 ID들의 목록을 획득 */
  private getSelectionState(): { selectedThoughtId: string | null; linkedNodeIds: Set<string> } {
    const store = useGalaxyStore.getState();
    const selectedThoughtId = store.selectedThoughtId || null;
    const linkedNodeIds = new Set<string>();

    if (selectedThoughtId) {
      linkedNodeIds.add(selectedThoughtId);
      this.edges.forEach((edge) => {
        if (edge.source === selectedThoughtId) linkedNodeIds.add(edge.target);
        else if (edge.target === selectedThoughtId) linkedNodeIds.add(edge.source);
      });
    }

    return { selectedThoughtId, linkedNodeIds };
  }

  /** 선택 하이라이트, 라벨 가시성, 고립 노드 페이드 및 성운 알파 일괄 업데이트 */
  private updateNodeVisibilitiesAndAlphas(zoom: number, selectedThoughtId: string | null, linkedNodeIds: Set<string>) {
    // 스타더스트 배경 패럴랙스 처리 통합
    if (this.container.parent) {
      this.nebulaDustContainer.x = -this.container.parent.x * 0.15;
      this.nebulaDustContainer.y = -this.container.parent.y * 0.15;
    }



    // 개별 노드 상태 갱신
    this.spritesMap.forEach((spriteGroup, id) => {
      // 1. 선택 하이라이트
      if (selectedThoughtId) {
        spriteGroup.alpha = linkedNodeIds.has(id) ? 1.0 : 0.15;
      } else {
        spriteGroup.alpha = 1.0;
      }

      // 2. 줌에 따른 라벨 가시성 및 선택 노드 가시성 하이브리드 제어
      const nameLabel = spriteGroup.children[1] as PIXI.Text | undefined;
      if (nameLabel) {
        const isHighlight = selectedThoughtId ? linkedNodeIds.has(id) : false;
        nameLabel.visible = isHighlight || zoom > 0.45;
      }

      // 3. 고립 노드 줌아웃 시 페이드
      const edgeCount = this.edgeCountMap.get(id) || 0;
      if (zoom < 0.1 && edgeCount === 0) {
        spriteGroup.alpha = Math.max(0.08, spriteGroup.alpha * 0.3);
      }
    });
  }

  /** 카테고리 라벨 위치 및 역스케일링 업데이트 (수학적 IQR 이상치 제거 및 Lerp 보간 + 거리 점프 격벽 필터 탑재) */
  private updateCategoryLabels(zoom: number) {
    const isMineScope = useGalaxyStore.getState().thoughtScope === 'mine';
    this.categoryLabelsContainer.visible = !isMineScope;
    if (isMineScope) return;

    // [고스트 라벨 방어 격벽] 좌표 계산 개시 전 모든 카테고리 라벨을 일괄 비활성화 (노드 수 0개인 카테고리의 잔상 원천 격리)
    this.categoryLabelsMap.forEach(label => { label.visible = false; });

    // 1. 카테고리별 활성 노드 좌표 수집
    const catCoordsMap = new Map<string, { x: number; y: number }[]>();
    
    this.spritesMap.forEach((spriteGroup, id) => {
      const cat = (spriteGroup as any)._category as string | undefined;
      if (!cat) return;
      if (!catCoordsMap.has(cat)) {
        catCoordsMap.set(cat, []);
      }
      catCoordsMap.get(cat)!.push({ x: spriteGroup.x, y: spriteGroup.y });
    });

    // 2. 줌 역스케일링 비율 결정
    const invZoom = 1.0 / Math.max(zoom, 0.031);
    const targetScale = zoom < 0.5 ? invZoom * 0.25 : 0.5;

    // 3. 각 카테고리별 이상치 제거 및 기하학적 중심 계산
    catCoordsMap.forEach((coordsList, cat) => {
      const label = this.categoryLabelsMap.get(cat);
      if (!label || coordsList.length === 0) return;

      // 과학적/수학적 IQR 기반 이상치(Outlier) 제거 알고리즘 적용 (떠돌이 노드 영향 완벽 배제)
      let targetCoords = coordsList;
      if (coordsList.length >= 4) {
        // X축 IQR 산출
        const sortedX = coordsList.map(c => c.x).sort((a, b) => a - b);
        const q1x = sortedX[Math.floor(sortedX.length * 0.25)];
        const q3x = sortedX[Math.floor(sortedX.length * 0.75)];
        const iqrX = q3x - q1x;
        const minX = q1x - 1.5 * iqrX;
        const maxX = q3x + 1.5 * iqrX;

        // Y축 IQR 산출
        const sortedY = coordsList.map(c => c.y).sort((a, b) => a - b);
        const q1y = sortedY[Math.floor(sortedY.length * 0.25)];
        const q3y = sortedY[Math.floor(sortedY.length * 0.75)];
        const iqrY = q3y - q1y;
        const minY = q1y - 1.5 * iqrY;
        const maxY = q3y + 1.5 * iqrY;

        // 핵심 군집(Core Cluster) 필터링
        const filtered = coordsList.filter(c => 
          c.x >= minX && c.x <= maxX &&
          c.y >= minY && c.y <= maxY
        );
        if (filtered.length > 0) {
          targetCoords = filtered;
        }
      }

      // 핵심 군집 기반 기하학적 무게중심 및 최상단 y좌표 추출
      let sumX = 0;
      let sumY = 0;
      let minYVal = Infinity;
      targetCoords.forEach(c => {
        sumX += c.x;
        sumY += c.y;
        if (c.y < minYVal) {
          minYVal = c.y;
        }
      });

      const centerX = sumX / targetCoords.length;
      const targetY = minYVal - 120; // 줌아웃 상태에서 노드 도트와 겹치지 않도록 충분한 간격 확보

      // 4. Lerp 보간 및 임계 거리 점프 적용 (부드러운 Fluid Motion 및 잔상 차단 완벽 실현)
      const dist = Math.hypot(centerX - label.x, targetY - label.y);

      if (dist > 300 || (label.x === 0 && label.y === 0)) {
        // 극단적 거리 차이 또는 최초 렌더링 프레임 시 즉시 순간이동 (Jump)
        label.x = centerX;
        label.y = targetY;
      } else {
        // 평상시 미세 출렁임은 Lerp 선형 보간으로 은은하게 추종
        label.x += (centerX - label.x) * 0.08;
        label.y += (targetY - label.y) * 0.08;
      }

      label.scale.set(targetScale);
      label.visible = true;
    });
  }

  /** Web Worker 시뮬레이션 좌표 틱 실시간 연동 */
  public updatePositions(coords: { id: string; x: number; y: number }[], zoom: number) {
    this.time += 0.015;

    // ── 스프라이트 좌표 동기화 ──
    coords.forEach((coord) => {
      const spriteGroup = this.spritesMap.get(coord.id);
      if (spriteGroup) {
        (spriteGroup as any).targetX = coord.x;
        (spriteGroup as any).targetY = coord.y;
        spriteGroup.x = coord.x;
        spriteGroup.y = coord.y;
      }
    });

    const { selectedThoughtId, linkedNodeIds } = this.getSelectionState();
    this.updateNodeVisibilitiesAndAlphas(zoom, selectedThoughtId, linkedNodeIds);
    this.updateCategoryLabels(zoom);
    this.drawEdges(zoom, selectedThoughtId, linkedNodeIds);
  }

  /** [BUG FIX] PIXI.Graphics 기반 엣지 드로잉 — Custom Shader Mesh 좌표계 버그 해결 */
  private drawEdges(zoom: number, selectedThoughtId: string | null, linkedNodeIds: Set<string>) {
    // 1. Dirty Flag: 좌표 변화 감지
    let checkSum = 0;
    let idx = 1;
    this.spritesMap.forEach((sprite) => {
      checkSum += (sprite.x * 17 + sprite.y * 31) * idx;
      idx++;
    });

    const currentCoordsHash = `${this.edges.length}_${zoom.toFixed(4)}_${selectedThoughtId || ''}_${checkSum.toFixed(2)}`;
    if (currentCoordsHash === this.lastCoordsHash) return;
    this.lastCoordsHash = currentCoordsHash;

    // 2. Graphics 클리어 후 재드로잉
    this.edgeGraphics.clear();

    // 동일 소스-타겟 쌍을 지닌 엣지 그룹화 맵 빌드
    const edgeGroupMap = new Map<string, any[]>();
    this.edges.forEach((edge) => {
      const key = [edge.source, edge.target].sort().join('-');
      if (!edgeGroupMap.has(key)) {
        edgeGroupMap.set(key, []);
      }
      edgeGroupMap.get(key)!.push(edge);
    });

    const baseWidth = Math.max(0.6, 0.25 / zoom);

    this.edges.forEach((edge) => {
      const sourceGroup = this.spritesMap.get(edge.source);
      const targetGroup = this.spritesMap.get(edge.target);
      if (!sourceGroup || !targetGroup) return;

      const vis = RELATION_VISUALS[edge.relationType] || RELATION_VISUALS.extends;
      let strokeColor = vis.color;
      let strokeWidth = baseWidth;
      let strokeAlpha = 0.12;
      let badgeAlphaBase = 0.7;

      const isConfirmed = edge.status === 'confirmed';
      const isPending = edge.status === 'pending';
      const isNearMiss = edge.status === 'near-miss' || edge.relationType === 'near-miss';
      const isUserCreated = edge.createdBy === 'user';
      const isBackfill = edge.createdBy === 'ai-backfill';

      if (!selectedThoughtId) {
        if (isConfirmed) {
          strokeAlpha = isUserCreated ? 0.22 : 0.14;
          strokeWidth = isUserCreated ? baseWidth : baseWidth * 0.8;
        } else if (isPending) {
          strokeAlpha = 0.08;
          strokeWidth = baseWidth * 0.6;
        } else if (isNearMiss) {
          strokeAlpha = 0.04;
          strokeWidth = baseWidth * 0.5;
          strokeColor = 0x444444;
          badgeAlphaBase = 0.15;
        }
      } else {
        const isLinkedEdge = edge.source === selectedThoughtId || edge.target === selectedThoughtId;
        if (isLinkedEdge) {
          if (isConfirmed) {
            strokeAlpha = 0.65;
            strokeWidth = baseWidth * 1.1;
          } else if (isPending) {
            strokeAlpha = 0.35;
            strokeWidth = baseWidth * 0.9;
          } else if (isNearMiss) {
            strokeAlpha = 0.15;
            strokeWidth = baseWidth * 0.7;
            strokeColor = 0x666666;
          }
          badgeAlphaBase = 0.9;
        } else {
          if (isConfirmed) {
            strokeAlpha = 0.03;
            strokeWidth = baseWidth * 0.4;
            strokeColor = 0x333333;
          } else if (isPending) {
            strokeAlpha = 0.02;
            strokeWidth = baseWidth * 0.3;
            strokeColor = 0x222222;
          } else {
            strokeAlpha = 0.01;
            strokeWidth = baseWidth * 0.2;
            strokeColor = 0x111111;
          }
          badgeAlphaBase = 0.05;
        }
      }

      // 동일 소스-타겟 쌍을 지닌 엣지 그룹화 정보 및 오프셋 계산
      const key = [edge.source, edge.target].sort().join('-');
      const groupEdges = edgeGroupMap.get(key) || [];
      // 안전하게 e.id 기준으로 인덱스를 검색 (참조 불일치 방지)
      const edgeIdx = groupEdges.findIndex(e => e.id === edge.id);
      const totalCount = groupEdges.length;

      let cpX = (sourceGroup.x + targetGroup.x) / 2;
      let cpY = (sourceGroup.y + targetGroup.y) / 2;
      let offsetDist = 0;
      let nx = 0;
      let ny = 0;

      if (totalCount > 1) {
        // 소스와 타겟의 ID 사전순 정렬을 고정하여 법선 벡터 기준 방향을 정규화 (부호 상쇄 방지)
        const sortedIds = [edge.source, edge.target].sort();
        const normSource = this.spritesMap.get(sortedIds[0]);
        const normTarget = this.spritesMap.get(sortedIds[1]);

        if (normSource && normTarget) {
          const dx = normTarget.x - normSource.x;
          const dy = normTarget.y - normSource.y;
          const dist = Math.hypot(dx, dy);
          if (dist > 0) {
            nx = -dy / dist; // 수직 법선 벡터 X
            ny = dx / dist;  // 수직 법선 벡터 Y
            
            // 꼼수 없는 기하 정량 거리 적용 (비율식 축소 보장)
            const step = 10;
            offsetDist = (edgeIdx - (totalCount - 1) / 2) * step;
            
            // 2차 베지어 곡선의 정점이 offsetDist 만큼 밀려나도록 제어점은 2배 이동
            cpX = cpX + nx * (offsetDist * 2);
            cpY = cpY + ny * (offsetDist * 2);
          }
        }
      }

      // 3. PIXI.Graphics로 2차 베지어 곡선 그리기
      if (isBackfill) {
        // [곡선형 점선 보간] 베지어 궤적을 30단계로 분할하여 점선 구현
        const steps = 30;
        const points: { x: number; y: number }[] = [];
        for (let i = 0; i <= steps; i++) {
          const t = i / steps;
          const mt = 1 - t;
          const x = mt * mt * sourceGroup.x + 2 * mt * t * cpX + t * t * targetGroup.x;
          const y = mt * mt * sourceGroup.y + 2 * mt * t * cpY + t * t * targetGroup.y;
          points.push({ x, y });
        }

        // 점선 형태의 세그먼트 드로잉 (i를 2씩 증가시키며 선-공백-선 반복)
        for (let i = 0; i < steps; i += 2) {
          const nextIdx = Math.min(i + 1, steps);
          this.edgeGraphics
            .moveTo(points[i].x, points[i].y)
            .lineTo(points[nextIdx].x, points[nextIdx].y)
            .stroke({ color: strokeColor, alpha: strokeAlpha * 0.85, width: strokeWidth });
        }
      } else {
        // [일반 실선 베지어] 시작/끝점은 노드 센터에 고정하고 cpX, cpY를 향해 아치형으로 휨
        this.edgeGraphics
          .moveTo(sourceGroup.x, sourceGroup.y)
          .quadraticCurveTo(cpX, cpY, targetGroup.x, targetGroup.y)
          .stroke({ color: strokeColor, alpha: strokeAlpha, width: strokeWidth });
      }



      // 관계 배지 위치 (베지어 곡선의 실제 정점 좌표에 정확히 밀착)
      const badge = this.edgeLabelsMap.get(edge.id);
      if (badge) {
        if (zoom < 0.5) {
          badge.visible = false;
        } else {
          badge.visible = true;
          badge.x = (sourceGroup.x + targetGroup.x) / 2 + nx * offsetDist;
          badge.y = (sourceGroup.y + targetGroup.y) / 2 + ny * offsetDist;
          badge.alpha = badgeAlphaBase;
        }
      }
    });
  }

  /** 무중력 부유 + 엣지 재드로잉 (D3 수렴 후 영구 애니메이션) */
  public updateBreathingAndFloating(zoom: number) {
    this.time += 0.015;

    // 각 노드별 무중력 부유
    this.spritesMap.forEach((spriteGroup, id) => {
      const phase = (id.charCodeAt(0) || 0) * 0.35;
      const floatX = Math.sin(this.time * 0.9 + phase) * 2.5;
      const floatY = Math.cos(this.time * 0.75 + phase) * 2.5;

      const targetX = (spriteGroup as any).targetX ?? spriteGroup.x;
      const targetY = (spriteGroup as any).targetY ?? spriteGroup.y;

      spriteGroup.x = targetX + floatX;
      spriteGroup.y = targetY + floatY;
    });

    const { selectedThoughtId, linkedNodeIds } = this.getSelectionState();
    this.updateNodeVisibilitiesAndAlphas(zoom, selectedThoughtId, linkedNodeIds);
    this.updateCategoryLabels(zoom);
    this.drawEdges(zoom, selectedThoughtId, linkedNodeIds);
  }

  public getSpritesMap() {
    return this.spritesMap;
  }

  public destroy() {
    this.dotTextures.forEach(t => t.destroy(true));
    this.dotTextures.clear();
    if (this.dustTexture) this.dustTexture.destroy(true);

    this.edgeGraphics.destroy();

    this.container.destroy({ children: true });
  }

}

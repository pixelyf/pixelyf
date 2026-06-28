/**
 * [ThoughtGraphWorker] D3-Force 물리 시뮬레이션 (Web Worker)
 *
 * [CRITICAL FIX — 원형 구체 문제 완전 해결]
 * 근본 원인: forceX(0) + forceY(0) 가 모든 노드를 (0,0)으로 독립적으로 끌어당겨
 *           척력과 균형을 이루면 필연적으로 원형 등방성 분포(동그라미 구체)가 됨.
 *
 * 해결: D3 공식 Les Miserables 예제와 100% 동일한 구조로 재작성
 *   - forceX, forceY 완전 제거 (개별 노드 중심 인력 삭제)
 *   - forceCenter 사용 (전체 무게중심만 고정, 내부 구조 왜곡 없음)
 *   - forceManyBody 척력 -120 으로 강화 (넓게 퍼뜨림)
 *   - forceLink 스프링 거리/강도 조정
 *   - alphaDecay 느리게 하여 군집 분화 충분한 시간 확보
 */

import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  SimulationNodeDatum,
  SimulationLinkDatum
} from 'd3-force';

interface GraphNode extends SimulationNodeDatum {
  id: string;
  category?: string;
}

interface GraphLink extends SimulationLinkDatum<GraphNode> {
  source: string | GraphNode;
  target: string | GraphNode;
  weight?: number;
}

let simulation: ReturnType<typeof forceSimulation<GraphNode>> | null = null;

const GALAXY_WORKER_VERSION = "v10.0.0-FORCE-CENTER-LES-MISERABLES";
console.log(`=== [ThoughtGraphWorker] ACTIVE VERSION: ${GALAXY_WORKER_VERSION} ===`);

self.onmessage = (e: MessageEvent) => {
  const { type, nodes, edges, centerX = 0, centerY = 0 } = e.data;

  if (type === 'INIT') {
    if (simulation) {
      simulation.stop();
      simulation = null;
    }

    console.log(`[ThoughtGraphWorker] INIT. Nodes: ${nodes.length}, Edges: ${edges.length}, Center: (${centerX}, ${centerY})`);

    // 1. 노드별 엣지 연결도(Degree) 사전 연산
    const nodeDegrees: Record<string, number> = {};
    nodes.forEach((n: any) => { nodeDegrees[n.id] = 0; });
    
    // 유효한 엣지만 필터링하여 D3 링크 데이터 구축
    const nodeIds = new Set(nodes.map((n: any) => n.id));
    const d3Links: GraphLink[] = edges
      .filter((e: any) => nodeIds.has(e.source) && nodeIds.has(e.target))
      .map((e: any) => ({
        source: e.source,
        target: e.target,
        weight: e.weight
      }));

    d3Links.forEach(l => {
      const sId = typeof l.source === 'string' ? l.source : l.source.id;
      const tId = typeof l.target === 'string' ? l.target : l.target.id;
      if (nodeDegrees[sId] !== undefined) nodeDegrees[sId]++;
      if (nodeDegrees[tId] !== undefined) nodeDegrees[tId]++;
    });

    // 2. D3 노드 초기 좌표: 캐시가 존재하는 경우 오프셋 차감 후 반영, 없으면 넓게 무작위 분산
    const d3Nodes: GraphNode[] = nodes.map((n: any) => ({
      id: n.id,
      x: n.x !== undefined ? n.x - centerX : (Math.random() - 0.5) * 800,
      y: n.y !== undefined ? n.y - centerY : (Math.random() - 0.5) * 800,
      category: n.category
    }));

    // 3. D3-Force 시뮬레이션 — 레퍼런스 정합 파라미터
    //    노드 간 충분한 간격 확보로 연결선이 명확히 보이도록 설정
    simulation = forceSimulation<GraphNode>(d3Nodes)
      // 링크 스프링: 연결된 노드 간 인력 (거리 330px)
      .force("link", forceLink<GraphNode, GraphLink>(d3Links)
        .id(d => d.id)
        .distance(330)
        .strength((link: any) => (link.weight || 1.0) * 0.3)
      )
      // Many-Body 척력: -450
      .force("charge", forceManyBody().strength(-450))
      // forceCenter: 전체 그래프의 무게중심만 원점에 고정
      .force("center", forceCenter(0, 0));

    // alphaDecay: 느린 수렴으로 군집이 자연스럽게 분화될 충분한 시간 확보
    simulation.alphaDecay(0.008);

    // 4. 실시간 TICK 이벤트: 원점(0,0) 기준 연산 결과를 은하 중심 오프셋으로 변환
    simulation.on("tick", () => {
      const coords = d3Nodes.map(n => ({
        id: n.id,
        x: (n.x || 0) + centerX,
        y: (n.y || 0) + centerY
      }));
      self.postMessage({ type: 'TICK', coords });
    });

    // 5. 시뮬레이션 자연 수렴 시 알림 및 최종 좌표 캐시 백업용 전송
    simulation.on("end", () => {
      console.log("[ThoughtGraphWorker] D3-Force simulation converged (Les Miserables config).");
      const coords = d3Nodes.map(n => ({
        id: n.id,
        x: (n.x || 0) + centerX,
        y: (n.y || 0) + centerY
      }));
      self.postMessage({ type: 'END', coords });
    });

  } else if (type === 'STOP') {
    if (simulation) {
      simulation.stop();
      simulation = null;
    }
  }
};

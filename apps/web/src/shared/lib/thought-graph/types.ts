/**
 * [생각그래프] ThoughtGraph 타입 정의
 * 프론트엔드 + API 공용 인터페이스
 */

/** 생각 노드 데이터 (캔버스 렌더링용) */
export interface ThoughtNodeData {
  id: string
  userId: string
  content: string | null
  summary: string | null
  category: string | null
  galaxyKey: string | null
  moodId: string | null
  createdAt: string
  displayName: string
  avatarUrl: string | null
  /** D3 시뮬레이션 후 결정되는 좌표 */
  x?: number
  y?: number
  // [NEW] 하이브리드 개념 수렴 수납 글 리스트
  posts?: {
    id: string
    userId: string
    content: string
    displayName: string
    avatarUrl: string | null
    createdAt: string
  }[]
}

/** 생각 엣지 데이터 (연결선 렌더링용) */
export interface ThoughtEdge {
  id: string
  /** source_moment_id */
  source: string
  /** target_moment_id */
  target: string
  /** extends | supports | contradicts | refines | instantiates | requires | triggered-by | near-miss */
  relationType: string
  /** 연결 강도 (0.0~1.0) */
  weight: number
  /** 생성 주체 */
  createdBy: 'ai' | 'user' | 'ai-backfill'
  /** confirmed | pending | rejected */
  status: string
}

/** GET /api/thought-graph 응답 */
export interface ThoughtGraphResponse {
  nodes: ThoughtNodeData[]
  edges: ThoughtEdge[]
  /** 전체 노드 수 (수렴/cap 전 원본 카운트) */
  totalCount?: number
  /** 카테고리별 노드 수 집계 (줌아웃 슈퍼노드 렌더링 데이터) */
  categoryCounts?: Record<string, number>
}

/** 관계 유형 상수 — 유저 대면 3종 */
export const USER_RELATION_TYPES = ['extends', 'supports', 'contradicts'] as const

/** 관계 유형 상수 — AI 세분류 포함 전체 8종 */
export const ALL_RELATION_TYPES = [
  'extends', 'supports', 'contradicts',
  'refines', 'instantiates', 'requires', 'triggered-by', 'near-miss',
] as const

/** 생성 주체 상수 */
export const CREATED_BY_TYPES = ['ai', 'user', 'ai-backfill'] as const

/** Confidence 기반 처리 기준 */
export const CONFIDENCE_THRESHOLDS = {
  /** 자동 승인 (유저 개입 없음) */
  AUTO_CONFIRM: 0.7,
  /** 토스트 확인 (0.4~0.7) */
  TOAST_MIN: 0.4,
  /** near-miss 저장 (0.25~0.4) */
  NEAR_MISS_MIN: 0.25,
  /** 이 미만은 폐기 */
  DISCARD_BELOW: 0.25,
} as const

/** [백필] 2-hop 브릿지 후보 타입 */
export interface BackfillCandidate {
  /** 시작 노드 (A) */
  node_a: string
  /** 브릿지 노드 (B) — A↔C를 연결하는 중간 허브 */
  bridge: string
  /** 도착 노드 (C) */
  node_c: string
  /** A↔B 엣지 가중치 */
  w1: number
  /** B↔C 엣지 가중치 */
  w2: number
}


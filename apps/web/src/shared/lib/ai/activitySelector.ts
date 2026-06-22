/**
 * [AI 활동 선택 모듈]
 * LLM이 반환한 JSON 응답을 파싱하고, 행동 빈도를 제어합니다.
 * 순수 함수 — DB 의존 없음, 테스트 용이.
 *
 * 사용처:
 * - Heartbeat 오케스트레이터 (B-1)에서 LLM 응답 파싱 시 사용
 *
 * LLM 응답 형식 (Phase 4 설계 문서 2번):
 * ```json
 * {
 *   "action": "POST_MOMENT" | "COMMENT" | "PING" | "TOUCH" | "HEARTBEAT_OK",
 *   "target_soul_id": "uuid",
 *   "target_moment_id": "uuid",
 *   "content": "본문",
 *   "reasoning": "이유"
 * }
 * ```
 */

// ─── 타입 정의 ───────────────────────────────────────────────

/** 허용된 행동 유형 */
export type ActionType = 'POST_MOMENT' | 'COMMENT' | 'PING' | 'TOUCH' | 'HEARTBEAT_OK'

/** 파싱된 행동 결과 */
export interface ParsedAction {
  /** 행동 유형 */
  action: ActionType
  /** 대상 Soul ID (COMMENT/PING/TOUCH 시) */
  targetSoulId: string | null
  /** 대상 Moment ID (COMMENT 시) */
  targetMomentId: string | null
  /** 콘텐츠 본문 (POST_MOMENT/COMMENT 시) */
  content: string
  /** Babel: 주인 언어 버전 (대상 언어 ≠ 주인 언어일 때) */
  contentOwner: string | null
  /** Babel: content의 언어 코드 (ko, ja, en 등) */
  outputLanguage: string | null
  /** Pexels 이미지 검색 키워드 (POST_MOMENT 시, LLM 생성) */
  imageKeyword: string | null
  /** 행동 선택 이유 (디버깅용, 저장하지 않음) */
  reasoning: string
}

/** 활동 선택 결과 */
export interface ActivityDecision {
  /** 최종 결정된 행동 */
  action: ParsedAction
  /** 빈도 제어에 의해 오버라이드되었는지 */
  wasOverridden: boolean
  /** 오버라이드 이유 */
  overrideReason?: string
}

// ─── 상수 ────────────────────────────────────────────────────

/** 허용된 행동 목록 */
const VALID_ACTIONS: ActionType[] = [
  'POST_MOMENT', 'COMMENT', 'PING', 'TOUCH', 'HEARTBEAT_OK',
]

/** 하드 리밋 배수 (일일 목표의 1.5배 초과 시 강제 중단) */
const HARD_LIMIT_MULTIPLIER = 1.5

// ─── 메인 함수 ───────────────────────────────────────────────

/**
 * LLM 응답을 파싱하고 빈도 제어를 적용합니다.
 *
 * @example
 * ```ts
 * const decision = selectActivity(llmResult.content, dailyActionCount, 7)
 * if (decision.action.action !== 'HEARTBEAT_OK') {
 *   await executeAction(decision.action)
 * }
 * ```
 */
export function selectActivity(
  llmResponse: string,
  dailyActionCount: number,
  dailyTarget: number,
): ActivityDecision {
  // 1. LLM 응답 파싱
  const parsed = parseLLMResponse(llmResponse)

  // 2. HEARTBEAT_OK면 빈도 제어 불필요
  if (parsed.action === 'HEARTBEAT_OK') {
    return { action: parsed, wasOverridden: false }
  }

  // 3. 하드 리밋: 일일 목표 × 1.5 초과 시 강제 HEARTBEAT_OK
  const hardLimit = Math.ceil(dailyTarget * HARD_LIMIT_MULTIPLIER)
  if (dailyActionCount >= hardLimit) {
    return {
      action: createHeartbeatOk(`하드 리밋 초과 (${dailyActionCount}/${hardLimit})`),
      wasOverridden: true,
      overrideReason: `일일 활동 하드 리밋 초과: ${dailyActionCount}회 (한도: ${hardLimit}회)`,
    }
  }

  // 4. 정상 통과
  return { action: parsed, wasOverridden: false }
}

// ─── LLM 응답 파싱 ──────────────────────────────────────────

/**
 * LLM JSON 응답을 안전하게 파싱합니다.
 * 실패 시 HEARTBEAT_OK로 폴백.
 */
export function parseLLMResponse(raw: string): ParsedAction {
  try {
    // 마크다운 코드블록 제거: ```json ... ```
    const cleaned = raw
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim()

    const data = JSON.parse(cleaned)

    // action 유효성 검증
    const action = validateAction(data.action)

    return {
      action,
      targetSoulId: normalizeId(data.target_soul_id),
      targetMomentId: normalizeId(data.target_moment_id),
      content: typeof data.content === 'string' ? data.content.trim() : '',
      contentOwner: typeof data.content_owner === 'string' ? data.content_owner.trim() : null,
      outputLanguage: typeof data.output_language === 'string' ? data.output_language.trim() : null,
      imageKeyword: typeof data.image_keyword === 'string' ? data.image_keyword.trim() : null,
      reasoning: typeof data.reasoning === 'string' ? data.reasoning : '',
    }
  } catch {
    // JSON 파싱 실패 → 안전하게 HEARTBEAT_OK
    console.warn('[ActivitySelector] LLM 응답 파싱 실패, HEARTBEAT_OK 폴백:', raw.slice(0, 200))
    return createHeartbeatOk('LLM 응답 파싱 실패')
  }
}

// ─── 유틸리티 ────────────────────────────────────────────────

/** action 문자열을 검증하고 유효한 ActionType으로 변환 */
function validateAction(action: unknown): ActionType {
  if (typeof action === 'string' && VALID_ACTIONS.includes(action as ActionType)) {
    return action as ActionType
  }
  // 알 수 없는 action → HEARTBEAT_OK
  console.warn(`[ActivitySelector] 알 수 없는 action: "${action}", HEARTBEAT_OK 폴백`)
  return 'HEARTBEAT_OK'
}

/** 빈 문자열/undefined/null을 null로 정규화 및 UUID 형식 검증 */
function normalizeId(value: unknown): string | null {
  if (typeof value === 'string' && value.trim().length > 0) {
    const trimmed = value.trim()
    // UUID v4 형식 검증
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    if (uuidRegex.test(trimmed)) {
      return trimmed
    }
    console.warn(`[ActivitySelector] 유효하지 않은 UUID 감지 (환각): "${trimmed}"`)
  }
  return null
}

/** HEARTBEAT_OK 행동 생성 */
function createHeartbeatOk(reasoning: string): ParsedAction {
  return {
    action: 'HEARTBEAT_OK',
    targetSoulId: null,
    targetMomentId: null,
    content: '',
    contentOwner: null,
    outputLanguage: null,
    imageKeyword: null,
    reasoning,
  }
}

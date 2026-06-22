/**
 * [AI 콘텐츠 모더레이션 모듈]
 * Heartbeat 행동 실행 전에 생성된 콘텐츠의 품질을 검증합니다.
 * Moltslop(저품질 반복 콘텐츠) 방지.
 * 서버사이드 전용.
 *
 * 설계서 §8 (뉴런 알고리즘):
 *   POST:    하한 15자, 상한 80자 (PAD Arousal > 0.7 → 150자)
 *   COMMENT: 하한 3자, 상한 40자
 *   3. ✅ 최근 5개 자기 활동과 cosine > 0.85 → 중복 차단
 *   4. ✅ blockedWords 포함 → 차단
 *   5. ✅ (향후) 주인 성격 필터
 *
 * 코사인 유사도:
 *   단어 빈도 기반 TF 벡터 (임베딩 API 미사용, 비용 0)
 *   한국어 공백 기반 토큰화 (형태소 분석 없이 초기 구현)
 *
 * 의존:
 * - prisma: AiMoment 최근 활동 조회
 */

import prisma from '@/shared/lib/prisma'

// ─── 타입 정의 ───────────────────────────────────────────────

/** 모더레이션 검증 결과 */
export interface ModerationResult {
  /** 통과 여부 */
  passed: boolean
  /** 차단/재생성 이유 */
  reason?: string
  /** 재생성 권장 여부 (120자 미만 시) */
  shouldRegenerate: boolean
}

/** moderateContent 입력 */
export interface ModerateParams {
  /** 생성된 콘텐츠 */
  content: string
  /** 활동 유형: POST_MOMENT / COMMENT / PING / TOUCH / HEARTBEAT_OK */
  actionType: string
  /** AI Soul ID (중복 감지용) */
  soulId: string
  /** [뉴런] 시나리오가 결정한 최대 길이 (80 or 150) */
  maxLength?: number
}

// ─── 상수 (설계서 §8) ────────────────────────────────────────

/** POST 최소 길이 */
const POST_MIN_LENGTH = parseInt(process.env.AI_MIN_MOMENT_LENGTH || '15', 10)
/** POST 기본 상한 */
const POST_MAX_LENGTH = 80
/** POST 감정 격앙 시 상한 (PAD Arousal > 0.7) */
const POST_MAX_LENGTH_AROUSED = 150
/** COMMENT 최소 길이 */
const COMMENT_MIN_LENGTH = 3
/** COMMENT 상한 */
const COMMENT_MAX_LENGTH = 40

/** 코사인 유사도 중복 임계치 */
const SIMILARITY_THRESHOLD = parseFloat(process.env.AI_SIMILARITY_THRESHOLD || '0.85')

/** 중복 비교 최근 활동 건수 */
const RECENT_ACTIVITY_LIMIT = 5

/** 차단 단어 목록 (기본, 확장 가능) */
const BLOCKED_WORDS: string[] = [
  // 부적절한 콘텐츠 필터 (기본 목록, 프로덕션에서 확장)
  '시발', '씨발', '개새끼', '병신', 'fuck', 'shit',
  // AI 특유의 부자연스러운 패턴 (Moltslop 시그널)
  '물론이죠!', '도움이 되었으면 좋겠어요', '궁금한 점이 있으면',
]

// ─── 메인 함수 ───────────────────────────────────────────────

/**
 * 생성된 AI 콘텐츠를 모더레이션합니다.
 *
 * @example
 * ```ts
 * const result = await moderateContent({
 *   content: generatedText,
 *   actionType: 'POST_MOMENT',
 *   soulId: soul.id,
 * })
 * if (!result.passed && result.shouldRegenerate) {
 *   // 재생성 시도 (최대 2회)
 * }
 * if (!result.passed && !result.shouldRegenerate) {
 *   // 완전 차단, 폐기
 * }
 * ```
 */
export async function moderateContent(params: ModerateParams): Promise<ModerationResult> {
  const { content, actionType, soulId, maxLength } = params

  // PING / TOUCH / HEARTBEAT_OK → 콘텐츠 검증 불필요
  if (actionType === 'PING' || actionType === 'TOUCH' || actionType === 'HEARTBEAT_OK') {
    return { passed: true, shouldRegenerate: false }
  }

  // 빈 콘텐츠 즉시 차단
  if (!content || content.trim().length === 0) {
    return {
      passed: false,
      reason: '빈 콘텐츠',
      shouldRegenerate: true,
    }
  }

  const trimmed = content.trim()
  const isComment = actionType === 'COMMENT'

  // ── 체크 1: 최소 길이 (설계서 §8: POST 15자, COMMENT 3자) ──
  const minLength = isComment ? COMMENT_MIN_LENGTH : POST_MIN_LENGTH
  if (trimmed.length < minLength) {
    return {
      passed: false,
      reason: `콘텐츠 길이 부족: ${trimmed.length}자 (최소 ${minLength}자)`,
      shouldRegenerate: true,
    }
  }

  // ── 체크 2: 최대 길이 (설계서 §8: POST 80/150자, COMMENT 40자) ──
  const effectiveMaxLength = isComment
    ? COMMENT_MAX_LENGTH
    : (maxLength ?? POST_MAX_LENGTH)
  if (trimmed.length > effectiveMaxLength) {
    return {
      passed: false,
      reason: `콘텐츠 길이 초과: ${trimmed.length}자 (최대 ${effectiveMaxLength}자)`,
      shouldRegenerate: true,
    }
  }

  // ── 체크 3: 차단 단어 ──
  const blockedWord = checkBlockedWords(trimmed)
  if (blockedWord) {
    return {
      passed: false,
      reason: `차단 단어 감지: "${blockedWord}"`,
      shouldRegenerate: true,
    }
  }

  // ── 체크 4: 중복 감지 (cosine > 0.85) ──
  const duplicateResult = await checkDuplicate(trimmed, soulId)
  if (duplicateResult) {
    return {
      passed: false,
      reason: `중복 콘텐츠 감지 (유사도: ${duplicateResult.similarity.toFixed(2)})`,
      shouldRegenerate: true,
    }
  }

  // 모든 체크 통과
  return { passed: true, shouldRegenerate: false }
}

// ─── 차단 단어 체크 ──────────────────────────────────────────

function checkBlockedWords(content: string): string | null {
  const lower = content.toLowerCase()
  for (const word of BLOCKED_WORDS) {
    if (lower.includes(word.toLowerCase())) {
      return word
    }
  }
  return null
}

// ─── 중복 감지 (TF 코사인 유사도) ────────────────────────────

async function checkDuplicate(
  content: string,
  soulId: string,
): Promise<{ similarity: number } | null> {
  // 최근 5개 자기 활동 조회
  const recentActivities = await prisma.aiMoment.findMany({
    where: {
      soulId,
      actionType: { in: ['POST', 'COMMENT'] },
    },
    orderBy: { createdAt: 'desc' },
    take: RECENT_ACTIVITY_LIMIT,
    select: { content: true },
  })

  if (recentActivities.length === 0) return null

  const contentTokens = tokenize(content)
  const contentVector = buildTfVector(contentTokens)

  for (const activity of recentActivities) {
    const activityTokens = tokenize(activity.content)
    const activityVector = buildTfVector(activityTokens)
    const similarity = cosineSimilarity(contentVector, activityVector)

    if (similarity > SIMILARITY_THRESHOLD) {
      return { similarity }
    }
  }

  return null
}

// ─── TF 코사인 유사도 계산 ───────────────────────────────────

/** 공백 기반 토큰화 (한국어 + 영어) */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s가-힣]/g, ' ') // 특수문자 제거
    .split(/\s+/)
    .filter(t => t.length > 1) // 1글자 단어 제외
}

/** 단어 빈도(TF) 벡터 생성 */
function buildTfVector(tokens: string[]): Map<string, number> {
  const tf = new Map<string, number>()
  for (const token of tokens) {
    tf.set(token, (tf.get(token) || 0) + 1)
  }
  return tf
}

/** 코사인 유사도 계산 (0 ~ 1) */
function cosineSimilarity(a: Map<string, number>, b: Map<string, number>): number {
  // 분자: 내적
  let dotProduct = 0
  for (const [word, countA] of a) {
    const countB = b.get(word) || 0
    dotProduct += countA * countB
  }

  // 분모: 각 벡터의 크기
  let magnitudeA = 0
  for (const count of a.values()) {
    magnitudeA += count * count
  }

  let magnitudeB = 0
  for (const count of b.values()) {
    magnitudeB += count * count
  }

  const denominator = Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB)

  // 0 벡터 방지 (NaN 방지)
  if (denominator === 0) return 0

  return dotProduct / denominator
}

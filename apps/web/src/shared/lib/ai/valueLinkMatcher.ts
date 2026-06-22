/**
 * [K-Connect v4.0] Value Link 매처 — 카테고리 기반 유저 매칭 엔진
 *
 * v3.0 (5축 가치관 벡터 + culturalBridgeNeeded) 완전 교체.
 * Culture Bridge AI 삭제 확정.
 * 매칭 기준: 공통 관심 카테고리 + 태그 오버랩 + 한-글로벌 보너스.
 */

import {
  ContentCategory,
  CATEGORY_KEYS,
} from "@/shared/config/contentCategories";

// ──────────────────────────────────────────────────────────
// 타입
// ──────────────────────────────────────────────────────────

export type UserCategoryProfile = {
  userId: string;
  primaryCategory?: ContentCategory | null;
  interestCategories: ContentCategory[];
  interestTags: string[];
  /** 글로벌 유저 여부 (KR이 아닌 country) */
  isGlobal: boolean;
  /** 한국어 수준: NONE | BASIC | INTERMEDIATE | FLUENT */
  koreanLangLevel?: string | null;
};

export type ValueLinkMatchResult = {
  userAId: string;
  userBId: string;
  /** 0-100 */
  matchScore: number;
  matchReasons: string[];
  sharedCategories: ContentCategory[];
};

// ──────────────────────────────────────────────────────────
// 핵심 매칭 함수
// ──────────────────────────────────────────────────────────

/**
 * 두 유저의 카테고리 프로필을 비교하여 Value Link 매칭 결과를 반환합니다.
 * 동기 함수 — LLM 호출 없음, API 비용 없음.
 */
export function computeValueLinkMatch(
  a: UserCategoryProfile,
  b: UserCategoryProfile
): ValueLinkMatchResult {
  const reasons: string[] = [];
  let score = 0;

  // 1. 공통 관심 카테고리 (핵심, 최대 60점)
  const sharedCategories = getSharedCategories(a, b);
  const categoryScore = Math.min(sharedCategories.length * 20, 60);
  score += categoryScore;
  if (sharedCategories.length > 0) {
    reasons.push(
      `공통 관심 카테고리 ${sharedCategories.length}개: ${sharedCategories.join(", ")}`
    );
  }

  // 2. 공통 태그 오버랩 (최대 20점)
  const tagOverlap = getTagOverlapScore(a.interestTags, b.interestTags);
  score += tagOverlap;
  if (tagOverlap > 0) {
    reasons.push(`세부 태그 공통점 (+${tagOverlap}점)`);
  }

  // 3. 한-글로벌 연결 보너스 (최대 20점)
  if (a.isGlobal !== b.isGlobal) {
    score += 15;
    reasons.push("한국인 ↔ 글로벌 직접 교류 연결");

    const globalUser = a.isGlobal ? a : b;
    const langLevel = globalUser.koreanLangLevel;
    if (langLevel === "INTERMEDIATE" || langLevel === "FLUENT") {
      score += 5;
      reasons.push(`한국어 수준: ${langLevel} (+5점)`);
    }
  }

  // 4. 주 관심사 일치 보너스 (5점)
  if (
    a.primaryCategory &&
    b.primaryCategory &&
    a.primaryCategory === b.primaryCategory
  ) {
    score += 5;
    reasons.push(`주 관심사 일치: ${a.primaryCategory}`);
  }

  return {
    userAId: a.userId,
    userBId: b.userId,
    matchScore: Math.min(Math.round(score), 100),
    matchReasons: reasons,
    sharedCategories,
  };
}

// ──────────────────────────────────────────────────────────
// 매칭 후보 필터링
// ──────────────────────────────────────────────────────────

/**
 * 후보 유저 풀에서 특정 유저의 Top-N 매칭을 반환합니다.
 *
 * @param target - 매칭을 요청한 유저
 * @param candidates - 매칭 후보 풀
 * @param topN - 반환할 최대 결과 수 (기본 10)
 * @param minScore - 최소 매칭 점수 (기본 30)
 */
export function findTopMatches(
  target: UserCategoryProfile,
  candidates: UserCategoryProfile[],
  topN = 10,
  minScore = 30
): ValueLinkMatchResult[] {
  return candidates
    .filter((c) => c.userId !== target.userId)
    .map((c) => computeValueLinkMatch(target, c))
    .filter((r) => r.matchScore >= minScore)
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, topN);
}

// ──────────────────────────────────────────────────────────
// 피드 카테고리 필터링 유틸
// ──────────────────────────────────────────────────────────

/**
 * 피드 카테고리 탭 필터 — `contentCategory` 기준.
 * "ALL" 선택 시 전체 반환.
 */
export function filterMomentsByCategory<
  T extends { contentCategory?: string | null },
>(moments: T[], category: ContentCategory | "ALL"): T[] {
  if (category === "ALL") return moments;
  return moments.filter((m) => m.contentCategory === category);
}

// ──────────────────────────────────────────────────────────
// 내부 헬퍼
// ──────────────────────────────────────────────────────────

function getSharedCategories(
  a: UserCategoryProfile,
  b: UserCategoryProfile
): ContentCategory[] {
  const aCategories = new Set<ContentCategory>([
    ...(a.primaryCategory ? [a.primaryCategory] : []),
    ...a.interestCategories,
  ]);
  const bCategories = new Set<ContentCategory>([
    ...(b.primaryCategory ? [b.primaryCategory] : []),
    ...b.interestCategories,
  ]);

  return CATEGORY_KEYS.filter(
    (key) => aCategories.has(key) && bCategories.has(key)
  );
}

function getTagOverlapScore(tagsA: string[], tagsB: string[]): number {
  const setB = new Set(tagsB);
  const overlap = tagsA.filter((t) => setB.has(t)).length;
  // 태그 1개당 4점, 최대 20점
  return Math.min(overlap * 4, 20);
}

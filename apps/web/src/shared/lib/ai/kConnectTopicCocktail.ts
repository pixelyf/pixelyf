/**
 * [K-Connect v4.0] K-Connect 토픽 칵테일 엔진
 *
 * AI Soul 대화 토픽을 8대 한류 카테고리 기반으로 선택합니다.
 * 14개의 K-Connect 재료(ingredients)를 정의하고,
 * 유저의 관심 카테고리에 따라 최적의 대화 주제를 제공합니다.
 */

import { ContentCategory } from "@/shared/config/contentCategories";

// ──────────────────────────────────────────────────────────
// 타입
// ──────────────────────────────────────────────────────────

export type KConnectIngredient = {
  /** 재료 코드 (A ~ N, 14개) */
  code: string;
  /** 관련 카테고리 */
  categories: ContentCategory[];
  /** 토픽 생성용 한국어 프롬프트 힌트 */
  hintKo: string;
  /** 토픽 생성용 영어 프롬프트 힌트 */
  hintEn: string;
  /** 가중치 (높을수록 더 자주 선택) */
  weight: number;
};

// ──────────────────────────────────────────────────────────
// 14개 K-Connect 재료 정의
// ──────────────────────────────────────────────────────────

export const K_CONNECT_INGREDIENTS: KConnectIngredient[] = [
  {
    code: "A",
    categories: ["ENTER"],
    hintKo: "최근 화제의 K-POP 트렌드나 새로 나온 곡에 대해 이야기하기",
    hintEn: "Talk about the latest K-POP trends or new releases",
    weight: 3,
  },
  {
    code: "B",
    categories: ["ENTER"],
    hintKo: "지금 보고 있거나 추천하고 싶은 한국 드라마·영화 이야기",
    hintEn: "Share a K-Drama or K-Movie currently watching or recommending",
    weight: 3,
  },
  {
    code: "C",
    categories: ["LANGUAGE"],
    hintKo: "재미있는 한국어 신조어나 표현에 대해 설명하거나 배우기",
    hintEn: "Explain or learn a fun Korean slang expression",
    weight: 2,
  },
  {
    code: "D",
    categories: ["LANGUAGE"],
    hintKo: "언어 교환: 한국어로 하고 싶은 말, 상대 언어로 번역해 주기",
    hintEn: "Language exchange: say something in Korean, translate to partner's language",
    weight: 2,
  },
  {
    code: "E",
    categories: ["CULTURE"],
    hintKo: "한국의 독특한 사회 코드나 예절에 대해 소개하거나 질문하기",
    hintEn: "Introduce or ask about a unique Korean social code or etiquette",
    weight: 2,
  },
  {
    code: "F",
    categories: ["CULTURE"],
    hintKo: "한국 문화와 본인 나라 문화의 흥미로운 차이점 탐구",
    hintEn: "Explore an interesting cultural difference between Korea and your home country",
    weight: 2,
  },
  {
    code: "G",
    categories: ["TRAVEL"],
    hintKo: "한국에서 꼭 가봐야 할 숨은 명소나 현지인만 아는 스팟 공유",
    hintEn: "Share a hidden gem or local-only spot in Korea",
    weight: 2,
  },
  {
    code: "H",
    categories: ["TRAVEL"],
    hintKo: "한국 여행 중 겪은 기억에 남는 경험이나 에피소드",
    hintEn: "Share a memorable experience or episode from traveling in Korea",
    weight: 2,
  },
  {
    code: "I",
    categories: ["FOOD"],
    hintKo: "가장 좋아하는 한식 메뉴나 꼭 먹어봐야 할 음식 추천",
    hintEn: "Recommend a favorite Korean dish or must-try food",
    weight: 3,
  },
  {
    code: "J",
    categories: ["FOOD"],
    hintKo: "한국 편의점 음식이나 야식 문화에 대한 이야기",
    hintEn: "Talk about Korean convenience store food or late-night eating culture",
    weight: 2,
  },
  {
    code: "K",
    categories: ["BRAND"],
    hintKo: "해외에서도 인기 있는 한국 브랜드·제품 소개",
    hintEn: "Introduce a Korean brand or product popular overseas",
    weight: 2,
  },
  {
    code: "L",
    categories: ["LIFE"],
    hintKo: "한국인의 일상 속 소소한 행복이나 특별한 생활 문화",
    hintEn: "Share small daily joys or unique lifestyle habits in Korea",
    weight: 2,
  },
  {
    code: "M",
    categories: ["LIFE", "CULTURE"],
    hintKo: "한국의 직장·학교 문화 중 글로벌 시각에서 신기하거나 공감되는 것",
    hintEn: "Share something surprising or relatable about Korean work or school culture",
    weight: 2,
  },
  {
    code: "N",
    categories: ["BUSINESS"],
    hintKo: "한국 스타트업이나 글로벌로 뻗어가는 한국 기업 이야기",
    hintEn: "Talk about Korean startups or companies going global",
    weight: 1,
  },
];

// ──────────────────────────────────────────────────────────
// 카테고리 기반 재료 선택
// ──────────────────────────────────────────────────────────

/**
 * 유저의 관심 카테고리에 맞는 재료를 가중치 기반으로 랜덤 선택합니다.
 *
 * @param preferredCategories - 유저의 관심 카테고리 배열
 * @param excludeCodes - 최근 사용된 재료 코드 (중복 방지)
 */
export function pickKConnectIngredient(
  preferredCategories: ContentCategory[],
  excludeCodes: string[] = []
): KConnectIngredient {
  const preferredSet = new Set(preferredCategories);
  const available = K_CONNECT_INGREDIENTS.filter(
    (ing) => !excludeCodes.includes(ing.code)
  );

  if (available.length === 0) return K_CONNECT_INGREDIENTS[0];

  // 관심 카테고리와 겹치는 재료에 가중치 2배 부스트
  const weighted = available.flatMap((ing) => {
    const matchBonus = ing.categories.some((c) => preferredSet.has(c)) ? 2 : 0;
    return Array(ing.weight + matchBonus).fill(ing);
  });

  return weighted[Math.floor(Math.random() * weighted.length)];
}

/**
 * 특정 카테고리의 재료 목록만 반환합니다.
 */
export function getIngredientsByCategory(
  category: ContentCategory
): KConnectIngredient[] {
  return K_CONNECT_INGREDIENTS.filter((ing) =>
    ing.categories.includes(category)
  );
}

/**
 * 대화 주제 프롬프트를 생성합니다 (LLM에 전달할 힌트).
 */
export function buildTopicPrompt(
  ingredient: KConnectIngredient,
  isGlobalUser: boolean
): string {
  const hint = isGlobalUser ? ingredient.hintEn : ingredient.hintKo;
  return `[K-Connect 토픽 재료 ${ingredient.code}]\n${hint}`;
}

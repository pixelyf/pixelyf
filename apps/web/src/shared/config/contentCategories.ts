/**
 * [K-Connect v4.0] 한류 8대 카테고리 & 태그 설정
 *
 * DB 테이블이 아닌 코드 컨피그로 관리 — 마이그레이션 부담 없음.
 * 카테고리 키는 Moment.contentCategory / CulturalValueProfile 에서 사용.
 */

// ──────────────────────────────────────────────────────────
// 타입 정의
// ──────────────────────────────────────────────────────────

export type ContentCategory =
  | "ENTER"
  | "LANGUAGE"
  | "CULTURE"
  | "TRAVEL"
  | "FOOD"
  | "BRAND"
  | "LIFE"
  | "BUSINESS"
  | "DAILY"
  | "THOUGHTS";

export type CategoryMeta = {
  key: ContentCategory;
  labelKo: string;
  labelEn: string;
  emoji: string;
  /** 은하 캔버스에서 해당 카테고리 별(star) 색상 */
  starColor: string;
  accentColor: string;
  descriptionKo: string;
  descriptionEn: string;
  tags: ContentTag[];
};

export type ContentTag = {
  key: string;
  labelKo: string;
  labelEn: string;
  category: ContentCategory;
};

// ──────────────────────────────────────────────────────────
// 8대 카테고리 메타데이터
// ──────────────────────────────────────────────────────────

export const CATEGORY_META: Record<ContentCategory, CategoryMeta> = {
  ENTER: {
    key: "ENTER",
    labelKo: "엔터",
    labelEn: "Entertainment",
    emoji: "🎵",
    starColor: "#FF6B9D",
    accentColor: "#FF3D7A",
    descriptionKo: "K-POP, 드라마, 영화, 웹툰, 게임 등 한국 엔터테인먼트",
    descriptionEn: "K-POP, K-Drama, movies, webtoons, and Korean entertainment",
    tags: [
      { key: "KPOP", labelKo: "K-POP", labelEn: "K-POP", category: "ENTER" },
      { key: "KDRAMA", labelKo: "드라마", labelEn: "K-Drama", category: "ENTER" },
      { key: "KMOVIE", labelKo: "영화", labelEn: "K-Movie", category: "ENTER" },
      { key: "WEBTOON", labelKo: "웹툰", labelEn: "Webtoon", category: "ENTER" },
      { key: "KGAME", labelKo: "게임", labelEn: "K-Game", category: "ENTER" },
      { key: "VARIETY", labelKo: "예능", labelEn: "Variety Show", category: "ENTER" },
      { key: "IDOL", labelKo: "아이돌", labelEn: "K-Idol", category: "ENTER" },
    ],
  },

  LANGUAGE: {
    key: "LANGUAGE",
    labelKo: "언어",
    labelEn: "Language",
    emoji: "🗣️",
    starColor: "#6C63FF",
    accentColor: "#5A52E0",
    descriptionKo: "한국어 학습, 한글, 언어 교환, 번역",
    descriptionEn: "Korean language learning, Hangul, language exchange, translation",
    tags: [
      { key: "KOREAN_STUDY", labelKo: "한국어 공부", labelEn: "Korean Study", category: "LANGUAGE" },
      { key: "HANGUL", labelKo: "한글", labelEn: "Hangul", category: "LANGUAGE" },
      { key: "LANG_EXCHANGE", labelKo: "언어 교환", labelEn: "Language Exchange", category: "LANGUAGE" },
      { key: "SLANG", labelKo: "신조어·속어", labelEn: "Korean Slang", category: "LANGUAGE" },
      { key: "TOPIK", labelKo: "TOPIK", labelEn: "TOPIK Exam", category: "LANGUAGE" },
      { key: "TRANSLATION", labelKo: "번역", labelEn: "Translation", category: "LANGUAGE" },
    ],
  },

  CULTURE: {
    key: "CULTURE",
    labelKo: "문화",
    labelEn: "Culture",
    emoji: "🎭",
    starColor: "#9B59B6",
    accentColor: "#8E44AD",
    descriptionKo: "한국 전통 문화, 사회 코드, 예절, 트렌드",
    descriptionEn: "Korean traditional culture, social codes, etiquette, and trends",
    tags: [
      { key: "TRADITION", labelKo: "전통·역사", labelEn: "Tradition & History", category: "CULTURE" },
      { key: "SOCIAL_CODE", labelKo: "사회 코드", labelEn: "Social Code", category: "CULTURE" },
      { key: "ETIQUETTE", labelKo: "예절", labelEn: "Korean Etiquette", category: "CULTURE" },
      { key: "TREND", labelKo: "트렌드", labelEn: "K-Trend", category: "CULTURE" },
      { key: "KBEAUTY", labelKo: "K-뷰티", labelEn: "K-Beauty", category: "CULTURE" },
      { key: "FASHION", labelKo: "패션", labelEn: "K-Fashion", category: "CULTURE" },
    ],
  },

  TRAVEL: {
    key: "TRAVEL",
    labelKo: "여행",
    labelEn: "Travel",
    emoji: "✈️",
    starColor: "#27AE60",
    accentColor: "#1E8449",
    descriptionKo: "한국 여행 정보, 명소, 숙소, 현지 팁",
    descriptionEn: "Korea travel info, attractions, accommodations, and local tips",
    tags: [
      { key: "SEOUL", labelKo: "서울", labelEn: "Seoul", category: "TRAVEL" },
      { key: "BUSAN", labelKo: "부산", labelEn: "Busan", category: "TRAVEL" },
      { key: "JEJU", labelKo: "제주", labelEn: "Jeju", category: "TRAVEL" },
      { key: "LOCAL_TIP", labelKo: "현지 팁", labelEn: "Local Tip", category: "TRAVEL" },
      { key: "ACCOMMODATION", labelKo: "숙소", labelEn: "Accommodation", category: "TRAVEL" },
      { key: "TRANSPORT", labelKo: "교통", labelEn: "Transport", category: "TRAVEL" },
      { key: "TRAVEL_PLAN", labelKo: "여행 계획", labelEn: "Travel Plan", category: "TRAVEL" },
    ],
  },

  FOOD: {
    key: "FOOD",
    labelKo: "푸드",
    labelEn: "Food",
    emoji: "🍜",
    starColor: "#E67E22",
    accentColor: "#CA6F1E",
    descriptionKo: "한식, 식당, 레시피, 배달, 편의점 음식",
    descriptionEn: "Korean cuisine, restaurants, recipes, delivery, convenience store food",
    tags: [
      { key: "HANSIK", labelKo: "한식", labelEn: "Korean Cuisine", category: "FOOD" },
      { key: "KSTREETFOOD", labelKo: "길거리 음식", labelEn: "Street Food", category: "FOOD" },
      { key: "CONVENIENCE", labelKo: "편의점 음식", labelEn: "Convenience Store", category: "FOOD" },
      { key: "RECIPE", labelKo: "레시피", labelEn: "Recipe", category: "FOOD" },
      { key: "RESTAURANT", labelKo: "맛집", labelEn: "Restaurant", category: "FOOD" },
      { key: "MUKBANG", labelKo: "먹방", labelEn: "Mukbang", category: "FOOD" },
    ],
  },

  BRAND: {
    key: "BRAND",
    labelKo: "브랜드",
    labelEn: "Brand",
    emoji: "🛍️",
    starColor: "#F39C12",
    accentColor: "#D68910",
    descriptionKo: "한국 브랜드, 제품, 쇼핑, 리뷰",
    descriptionEn: "Korean brands, products, shopping, and reviews",
    tags: [
      { key: "KBRAND", labelKo: "K-브랜드", labelEn: "K-Brand", category: "BRAND" },
      { key: "COSMETICS", labelKo: "화장품", labelEn: "K-Cosmetics", category: "BRAND" },
      { key: "TECH", labelKo: "테크", labelEn: "Korean Tech", category: "BRAND" },
      { key: "FASHION_BRAND", labelKo: "패션 브랜드", labelEn: "Fashion Brand", category: "BRAND" },
      { key: "SHOPPING", labelKo: "쇼핑", labelEn: "Shopping", category: "BRAND" },
      { key: "REVIEW", labelKo: "제품 리뷰", labelEn: "Product Review", category: "BRAND" },
    ],
  },

  LIFE: {
    key: "LIFE",
    labelKo: "생활",
    labelEn: "Life",
    emoji: "🏠",
    starColor: "#16A085",
    accentColor: "#138D75",
    descriptionKo: "한국 일상, 주거, 교육, 직장 문화",
    descriptionEn: "Korean daily life, housing, education, and work culture",
    tags: [
      { key: "WORK_CULTURE", labelKo: "직장 문화", labelEn: "Work Culture", category: "LIFE" },
      { key: "EDUCATION", labelKo: "교육", labelEn: "Education", category: "LIFE" },
      { key: "HOUSING", labelKo: "주거", labelEn: "Housing", category: "LIFE" },
      { key: "HEALTH", labelKo: "건강·웰빙", labelEn: "Health & Wellness", category: "LIFE" },
      { key: "FAMILY", labelKo: "가족·관계", labelEn: "Family & Relationships", category: "LIFE" },
    ],
  },

  BUSINESS: {
    key: "BUSINESS",
    labelKo: "비즈",
    labelEn: "Business",
    emoji: "💼",
    starColor: "#2C3E50",
    accentColor: "#1A252F",
    descriptionKo: "한국 비즈니스, 스타트업, 취업, 경제",
    descriptionEn: "Korean business, startups, careers, and economy",
    tags: [
      { key: "STARTUP", labelKo: "스타트업", labelEn: "Startup", category: "BUSINESS" },
      { key: "CAREER", labelKo: "취업·커리어", labelEn: "Career", category: "BUSINESS" },
      { key: "ECONOMY", labelKo: "경제", labelEn: "Economy", category: "BUSINESS" },
      { key: "INVESTMENT", labelKo: "투자", labelEn: "Investment", category: "BUSINESS" },
      { key: "BUSINESS_CULTURE", labelKo: "비즈니스 문화", labelEn: "Business Culture", category: "BUSINESS" },
      { key: "GLOBAL_BIZ", labelKo: "글로벌 진출", labelEn: "Going Global", category: "BUSINESS" },
    ],
  },

  DAILY: {
    key: "DAILY",
    labelKo: "일상",
    labelEn: "Daily Life",
    emoji: "☕",
    starColor: "#FDBA74",
    accentColor: "#E28743",
    descriptionKo: "한국의 일상, 소소한 일기, 잡담, 소통",
    descriptionEn: "Korean daily life, casual diaries, vlogs, and communication",
    tags: [
      { key: "DAILY_LIFE", labelKo: "일상", labelEn: "Daily Life", category: "DAILY" },
      { key: "CHAT", labelKo: "잡담", labelEn: "Chat", category: "DAILY" },
      { key: "VLOG", labelKo: "브이로그", labelEn: "Vlog", category: "DAILY" },
      { key: "COMMUNICATION", labelKo: "소통", labelEn: "Communication", category: "DAILY" },
    ],
  },

  THOUGHTS: {
    key: "THOUGHTS",
    labelKo: "생각",
    labelEn: "Thoughts",
    emoji: "💭",
    starColor: "#A78BFA",
    accentColor: "#8B5CF6",
    descriptionKo: "나의 깊은 생각, 감정의 기록, 사색과 성찰",
    descriptionEn: "Deep thoughts, records of emotions, contemplation and reflection",
    tags: [
      { key: "REFLECTION", labelKo: "성찰", labelEn: "Reflection", category: "THOUGHTS" },
      { key: "EMOTION", labelKo: "감정", labelEn: "Emotion", category: "THOUGHTS" },
      { key: "CONTEMPLATION", labelKo: "사색", labelEn: "Contemplation", category: "THOUGHTS" },
      { key: "IDEA", labelKo: "아이디어", labelEn: "Idea", category: "THOUGHTS" },
    ],
  },
};

// ──────────────────────────────────────────────────────────
// 헬퍼 유틸리티
// ──────────────────────────────────────────────────────────

/** 전체 카테고리 배열 (탭 렌더링 순서) */
export const CATEGORY_LIST: CategoryMeta[] = Object.values(CATEGORY_META);

/** 카테고리 키 배열 */
export const CATEGORY_KEYS: ContentCategory[] = Object.keys(CATEGORY_META) as ContentCategory[];

/** 태그 키 → 카테고리 역방향 조회 맵 */
export const CATEGORY_TAG_MAP: Record<string, ContentCategory> = Object.values(
  CATEGORY_META
).reduce(
  (acc, cat) => {
    cat.tags.forEach((tag) => {
      acc[tag.key] = cat.key;
    });
    return acc;
  },
  {} as Record<string, ContentCategory>
);

/** 카테고리 유효성 검사 */
export function isValidCategory(value: string): value is ContentCategory {
  return CATEGORY_KEYS.includes(value as ContentCategory);
}

/** 카테고리의 모든 태그 키 조회 */
export function getTagsForCategory(category: ContentCategory): string[] {
  return CATEGORY_META[category].tags.map((t) => t.key);
}

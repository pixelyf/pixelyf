/**
 * [K-Connect v4.0] 단일 PIXELYF 은하 및 8대 카테고리 시드
 *
 * 은하는 1개 (PIXELYF)만 유지하며,
 * Galaxy.categories(GalaxyCategory)를 8대 한류 카테고리로 일원화하여 관리합니다.
 */

import "dotenv/config";
import prisma from "../src/shared/lib/prisma";

// ──────────────────────────────────────────────────────────
// 단일 은하 정의
// ──────────────────────────────────────────────────────────

const PIXELYF_GALAXY = {
  key: "PIXELYF",
  partnerCode: "pixelyf",
  name: "픽셀리프",
  icon: "Rocket",
  color: "#6C63FF",
  centerX: 0,
  centerY: 0,
  joinType: "auto",
  isRoot: true,
  sortOrder: 0,
  description: "한국과 세계가 연결되는 단 하나의 우주",
};

/**
 * 9대 한류 카테고리 (Galaxy 내부 view_mode)
 */
const GALAXY_VIEW_CATEGORIES = [
  {
    key: "ENTER",
    name: "엔터",
    icon: "Music",
    color: "#FF4757",
    type: "view_mode",
    sortOrder: 0,
  },
  {
    key: "LANGUAGE",
    name: "언어",
    icon: "Languages",
    color: "#FFC312",
    type: "view_mode",
    sortOrder: 1,
  },
  {
    key: "CULTURE",
    name: "문화",
    icon: "Theater",
    color: "#9B59B6",
    type: "view_mode",
    sortOrder: 2,
  },
  {
    key: "TRAVEL",
    name: "여행",
    icon: "Plane",
    color: "#0652DD",
    type: "view_mode",
    sortOrder: 3,
  },
  {
    key: "FOOD",
    name: "푸드",
    icon: "Utensils",
    color: "#FF6348",
    type: "view_mode",
    sortOrder: 4,
  },
  {
    key: "BRAND",
    name: "브랜드",
    icon: "ShoppingBag",
    color: "#FF84A1",
    type: "view_mode",
    sortOrder: 5,
  },
  {
    key: "LIFE",
    name: "생활",
    icon: "Home",
    color: "#00B894",
    type: "view_mode",
    sortOrder: 6,
  },
  {
    key: "BUSINESS",
    name: "비즈니스",
    icon: "Briefcase",
    color: "#B2BEC3",
    type: "view_mode",
    sortOrder: 7,
  },
  {
    key: "DAILY",
    name: "일상",
    icon: "Smile",
    color: "#FF9F43",
    type: "view_mode",
    sortOrder: 8,
  },
  {
    key: "GAME",
    name: "게임",
    icon: "Gamepad2",
    color: "#00FF9F",
    type: "view_mode",
    sortOrder: 9,
  },
  {
    key: "SHOPPING",
    name: "쇼핑",
    icon: "ShoppingBag",
    color: "#FF5E57",
    type: "view_mode",
    sortOrder: 10,
  },
];

const CATEGORY_TRANSLATIONS: Record<string, Record<string, string>> = {
  ENTER: {
    ko: "엔터",
    en: "Enter",
    ja: "エンタメ",
    zh: "娱乐",
    es: "Entretenimiento",
    fr: "Divertissement",
    de: "Unterhaltung",
    pt: "Entretenimento",
    it: "Intrattenimento",
    vi: "Giải trí",
    th: "บันเทิง",
  },
  LANGUAGE: {
    ko: "언어",
    en: "Language",
    ja: "言語",
    zh: "语言",
    es: "Idioma",
    fr: "Langue",
    de: "Sprache",
    pt: "Idioma",
    it: "Lingua",
    vi: "Ngôn ngữ",
    th: "ภาษา",
  },
  CULTURE: {
    ko: "문화",
    en: "Culture",
    ja: "文化",
    zh: "文化",
    es: "Cultura",
    fr: "Culture",
    de: "Kultur",
    pt: "Cultura",
    it: "Cultura",
    vi: "Văn hóa",
    th: "วัฒนธรรม",
  },
  TRAVEL: {
    ko: "여행",
    en: "Travel",
    ja: "旅行",
    zh: "旅行",
    es: "Viaje",
    fr: "Voyage",
    de: "Reise",
    pt: "Viagem",
    it: "Viaggio",
    vi: "Du lịch",
    th: "ท่องเที่ยว",
  },
  FOOD: {
    ko: "푸드",
    en: "Food",
    ja: "フード",
    zh: "美食",
    es: "Comida",
    fr: "Nourriture",
    de: "Essen",
    pt: "Comida",
    it: "Cibo",
    vi: "Ẩm thực",
    th: "อาหาร",
  },
  BRAND: {
    ko: "브랜드",
    en: "Brand",
    ja: "ブランド",
    zh: "品牌",
    es: "Marca",
    fr: "Marque",
    de: "Marke",
    pt: "Marca",
    it: "Marca",
    vi: "Thương hiệu",
    th: "แบรนด์",
  },
  LIFE: {
    ko: "생활",
    en: "Life",
    ja: "生活",
    zh: "生活",
    es: "Vida",
    fr: "Vie",
    de: "Leben",
    pt: "Vida",
    it: "Vita",
    vi: "Đời sống",
    th: "ชีวิต",
  },
  BUSINESS: {
    ko: "비즈니스",
    en: "Business",
    ja: "ビジネス",
    zh: "商务",
    es: "Negocios",
    fr: "Affaires",
    de: "Geschäft",
    pt: "Negócios",
    it: "Affari",
    vi: "Kinh doanh",
    th: "ธุรกิจ",
  },
  DAILY: {
    ko: "일상",
    en: "Daily",
    ja: "日常",
    zh: "日常",
    es: "Diario",
    fr: "Quotidien",
    de: "Alltag",
    pt: "Diário",
    it: "Quotidiano",
    vi: "Hằng ngày",
    th: "ประจำวัน",
  },
  GAME: {
    ko: "게임",
    en: "Gaming",
    ja: "ゲーム",
    zh: "游戏",
    es: "Videojuegos",
    fr: "Jeux",
    de: "Spielen",
    pt: "Jogos",
    it: "Giochi",
    vi: "Trò chơi",
    th: "เกม",
  },
  SHOPPING: {
    ko: "쇼핑",
    en: "Shopping",
    ja: "ショッピング",
    zh: "购物",
    es: "Compras",
    fr: "Achats",
    de: "Einkaufen",
    pt: "Compras",
    it: "Shopping",
    vi: "Mua sắm",
    th: "ช้อปปิ้ง",
  },
};

// ──────────────────────────────────────────────────────────
// 레거시 다중 은하 키 (삭제 대상)
// ──────────────────────────────────────────────────────────

const LEGACY_GALAXY_KEYS = [
  "RESONANCE",
  "BRIDGE",
  "CITY",
  "PIXELYF_AI",
  "PIXELYF_CORE",
];

// ──────────────────────────────────────────────────────────
// 메인
// ──────────────────────────────────────────────────────────

async function main() {
  console.log("[K-Connect v4.0] 단일 은하 시드 시작...");

  // 1. PIXELYF 은하 생성/업데이트
  const galaxy = await prisma.galaxy.upsert({
    where: { key: PIXELYF_GALAXY.key },
    update: PIXELYF_GALAXY,
    create: PIXELYF_GALAXY,
  });
  console.log(`✅ 은하 upsert: ${galaxy.name} (${galaxy.key})`);

  // 2. 뷰모드 카테고리 생성/업데이트
  for (const cat of GALAXY_VIEW_CATEGORIES) {
    const dbCat = await prisma.galaxyCategory.upsert({
      where: {
        galaxyId_key: {
          galaxyId: galaxy.id,
          key: cat.key,
        },
      },
      update: { ...cat, galaxyId: galaxy.id },
      create: { ...cat, galaxyId: galaxy.id },
    });
    console.log(`  ✅ 뷰 카테고리: ${cat.name}`);

    // 2-1. 다국어 번역 주입
    const translations = CATEGORY_TRANSLATIONS[cat.key];
    if (translations) {
      for (const [locale, translatedName] of Object.entries(translations)) {
        await prisma.galaxyCategoryTranslation.upsert({
          where: {
            category_id_locale: {
              category_id: dbCat.id,
              locale: locale,
            },
          },
          update: { name: translatedName },
          create: {
            category_id: dbCat.id,
            locale: locale,
            name: translatedName,
          },
        });
      }
      console.log(`     - 🌐 다국어 번역 11개 언어 upsert 완료`);
    }
  }

  // 3. 레거시 은하 삭제 (RESONANCE, BRIDGE, CITY)
  for (const legacyKey of LEGACY_GALAXY_KEYS) {
    const legacyGalaxy = await prisma.galaxy.findUnique({
      where: { key: legacyKey },
    });
    if (legacyGalaxy) {
      // 카테고리 먼저 삭제
      await prisma.galaxyCategory.deleteMany({
        where: { galaxyId: legacyGalaxy.id },
      });
      await prisma.galaxy.delete({
        where: { key: legacyKey },
      });
      console.log(`🗑️  레거시 은하 삭제: ${legacyKey}`);
    } else {
      console.log(`⏭️  레거시 은하 없음 (이미 삭제됨): ${legacyKey}`);
    }
  }

  console.log("\n[K-Connect v4.0] 단일 은하 시드 완료!");
  console.log(
    "📌 9대 K-Connect 카테고리와 11개국 다국어 번역이 DB에 시딩되었습니다.",
  );
}

main()
  .catch((e) => {
    console.error("[seed-galaxies] 오류:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

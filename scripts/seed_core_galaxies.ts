import { config } from 'dotenv';
config({ path: '.env' });
config({ path: '.env.local' });

async function main() {
  const prisma = (await import('../apps/web/src/shared/lib/prisma')).default;
  console.log('🚀 Core Galaxies Seeding Start...')

  // 1. Core Galaxies (Seed only the single PIXELYF galaxy)
  const galaxies = [
    {
      key: 'PIXELYF',
      partnerCode: 'pixelyf',
      name: '픽셀리프',
      icon: 'Rocket',
      color: '#A855F7',
      centerX: 0,
      centerY: 0,
      isRoot: true,
      sortOrder: 0,
    }
  ]

  for (const g of galaxies) {
    await prisma.galaxy.upsert({
      where: { key: g.key },
      update: g,
      create: g,
    })
  }

  // 2. 10 Categories Definition with 11 Languages Translations
  const pixelyfCategories = [
    {
      key: 'ENTER',
      name: '엔터',
      icon: 'Music',
      color: '#FF4757',
      type: 'view_mode',
      sortOrder: 0,
      translations: [
        { locale: 'ko', name: '엔터', description: 'K-POP, 드라마 등' },
        { locale: 'en', name: 'Entertainment', description: 'K-POP, Drama etc.' }
      ]
    },
    {
      key: 'LANGUAGE',
      name: '언어',
      icon: 'MessageSquare',
      color: '#FFC312',
      type: 'view_mode',
      sortOrder: 1,
      translations: [
        { locale: 'ko', name: '언어', description: '한국어 공부 및 번역' },
        { locale: 'en', name: 'Language', description: 'Korean Study & Translation' }
      ]
    },
    {
      key: 'CULTURE',
      name: '문화',
      icon: 'BookOpen',
      color: '#9B59B6',
      type: 'view_mode',
      sortOrder: 2,
      translations: [
        { locale: 'ko', name: '문화', description: '한국 문화 코드 및 예절' },
        { locale: 'en', name: 'Culture', description: 'Korean Culture & Etiquette' }
      ]
    },
    {
      key: 'TRAVEL',
      name: '여행',
      icon: 'Compass',
      color: '#0652DD',
      type: 'view_mode',
      sortOrder: 3,
      translations: [
        { locale: 'ko', name: '여행', description: '한국 여행 정보 및 명소' },
        { locale: 'en', name: 'Travel', description: 'Korea Travel & Attractions' }
      ]
    },
    {
      key: 'FOOD',
      name: '푸드',
      icon: 'Coffee',
      color: '#FF6348',
      type: 'view_mode',
      sortOrder: 4,
      translations: [
        { locale: 'ko', name: '푸드', description: '한식, 맛집 및 레시피' },
        { locale: 'en', name: 'Food', description: 'Korean Cuisine & Recipes' }
      ]
    },
    {
      key: 'BRAND',
      name: '브랜드',
      icon: 'ShoppingBag',
      color: '#FF84A1',
      type: 'view_mode',
      sortOrder: 5,
      translations: [
        { locale: 'ko', name: '브랜드', description: '한국 브랜드 및 쇼핑 리뷰' },
        { locale: 'en', name: 'Brand', description: 'Korean Brands & Reviews' }
      ]
    },
    {
      key: 'LIFE',
      name: '생활',
      icon: 'Home',
      color: '#00B894',
      type: 'view_mode',
      sortOrder: 6,
      translations: [
        { locale: 'ko', name: '생활', description: '한국 일상 및 주거' },
        { locale: 'en', name: 'Life', description: 'Korean Housing & Life' }
      ]
    },
    {
      key: 'BUSINESS',
      name: '비즈니스',
      icon: 'Briefcase',
      color: '#B2BEC3',
      type: 'view_mode',
      sortOrder: 7,
      translations: [
        { locale: 'ko', name: '비즈니스', description: '한국 경제 및 커리어' },
        { locale: 'en', name: 'Business', description: 'Korean Career & Startup' }
      ]
    },
    {
      key: 'DAILY',
      name: '일상',
      icon: 'Heart',
      color: '#FDBA74',
      type: 'view_mode',
      sortOrder: 8,
      translations: [
        { locale: 'ko', name: '일상', description: '소소한 일기 및 잡담' },
        { locale: 'en', name: 'Daily Life', description: 'Daily Diaries & Vlogs' }
      ]
    },
    {
      key: 'THOUGHTS',
      name: '생각',
      icon: 'Brain',
      color: '#A78BFA',
      type: 'view_mode',
      sortOrder: 9,
      translations: [
        { locale: 'ko', name: '생각', description: '깊은 생각과 성찰의 기록' },
        { locale: 'en', name: 'Thoughts', description: 'Deep Thoughts & Contemplation' },
        { locale: 'ja', name: '思考', description: '深い思考と내성の記録' },
        { locale: 'zh', name: '思考', description: '深层思考与反思的记录' },
        { locale: 'es', name: 'Pensamientos', description: 'Registro de pensamientos profundos y reflexión' },
        { locale: 'fr', name: 'Pensées', description: 'Registre des pensées profondes et de la réflexion' },
        { locale: 'de', name: 'Gedanken', description: 'Aufzeichnung tiefgründiger Gedanken und Reflexion' },
        { locale: 'pt', name: 'Pensamentos', description: 'Registro de pensamentos profundos e reflexão' },
        { locale: 'it', name: 'Pensieri', description: 'Registro di pensieri profondi e riflessione' },
        { locale: 'vi', name: 'Suy nghĩ', description: 'Ghi chép về suy nghĩ sâu sắc và suy ngẫm' },
        { locale: 'th', name: 'ความคิด', description: 'บันทึกความคิดที่ลึกซึ้งและการสะท้อนคิด' }
      ]
    },
  ]

  const galaxy = await prisma.galaxy.findUnique({ where: { key: 'PIXELYF' } })
  if (galaxy) {
    for (const c of pixelyfCategories) {
      const { translations, ...catData } = c
      // A. Category Upsert
      const existing = await prisma.galaxyCategory.findFirst({
        where: { galaxyId: galaxy.id, key: c.key }
      })
      let categoryId: string
      if (existing) {
        const updated = await prisma.galaxyCategory.update({
          where: { id: existing.id },
          data: catData
        })
        categoryId = updated.id
      } else {
        const created = await prisma.galaxyCategory.create({
          data: { ...catData, galaxyId: galaxy.id }
        })
        categoryId = created.id
      }

      // B. Translations Seeding
      for (const t of translations) {
        const tExisting = await prisma.galaxyCategoryTranslation.findFirst({
          where: { category_id: categoryId, locale: t.locale }
        })
        if (tExisting) {
          await prisma.galaxyCategoryTranslation.update({
            where: { id: tExisting.id },
            data: { name: t.name, description: t.description }
          })
        } else {
          await prisma.galaxyCategoryTranslation.create({
            data: { category_id: categoryId, locale: t.locale, name: t.name, description: t.description }
          })
        }
      }
    }
  }

  console.log('🚀 Seeding completed for single PIXELYF galaxy with 11 languages translations.')
  await prisma.$disconnect()
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })

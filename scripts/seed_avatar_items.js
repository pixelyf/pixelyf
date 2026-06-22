/**
 * 아바타 꾸미기 시스템 초기 데이터 시딩 + 스토리지 버킷 생성
 * 
 * 실행: node scripts/seed_avatar_items.js
 * 필요: SSH 터널(5434) + .env.local의 Supabase 키
 */
const { Client } = require('pg')
const { createClient } = require('@supabase/supabase-js')
require('dotenv').config()
require('dotenv').config({ path: '.env.local' })

// ─── 초기 아바타 아이템 시드 데이터 ───
const SEED_ITEMS = [
  // ── 캐릭터 베이스 (character_base) ──
  {
    item_code: 'char_spineboy',
    item_type: 'avatar',
    name: '스파인보이',
    description: '활기찬 에너지의 기본 캐릭터',
    price_star_dust: 0, // 무료 기본 제공
    slot_category: 'character_base',
    rarity: 'common',
    spine_asset_path: 'spineboy/spineboy-pro.skel',
  },
  {
    item_code: 'char_girl',
    item_type: 'avatar',
    name: '스텔라',
    description: '우아한 빛의 여행자',
    price_star_dust: 0, // 무료 기본 제공
    slot_category: 'character_base',
    rarity: 'common',
    spine_asset_path: 'mix-and-match/mix-and-match-pro.skel',
  },
  {
    item_code: 'char_raptor',
    item_type: 'avatar',
    name: '랩터',
    description: '날렵한 공룡 라이더',
    price_star_dust: 500,
    slot_category: 'character_base',
    rarity: 'rare',
    spine_asset_path: 'raptor/raptor-pro.skel',
  },
  {
    item_code: 'char_alien',
    item_type: 'avatar',
    name: '에일리언',
    description: '미지의 우주 생명체',
    price_star_dust: 500,
    slot_category: 'character_base',
    rarity: 'rare',
    spine_asset_path: 'alien/alien-pro.skel',
  },

  // ── 헤어 (hair) ──
  {
    item_code: 'hair_default',
    item_type: 'avatar',
    name: '기본 헤어',
    description: '자연스러운 기본 헤어스타일',
    price_star_dust: 0,
    slot_category: 'hair',
    rarity: 'common',
  },
  {
    item_code: 'hair_star_crown',
    item_type: 'avatar',
    name: '별빛 왕관',
    description: '은하의 빛을 담은 왕관 헤어',
    price_star_dust: 300,
    slot_category: 'hair',
    rarity: 'rare',
  },
  {
    item_code: 'hair_nebula_wave',
    item_type: 'avatar',
    name: '성운 웨이브',
    description: '성운의 색을 머금은 유려한 웨이브',
    price_star_dust: 800,
    slot_category: 'hair',
    rarity: 'epic',
  },

  // ── 상의 (top) ──
  {
    item_code: 'top_default',
    item_type: 'avatar',
    name: '기본 상의',
    description: '편안한 기본 상의',
    price_star_dust: 0,
    slot_category: 'top',
    rarity: 'common',
  },
  {
    item_code: 'top_cosmic_jacket',
    item_type: 'avatar',
    name: '코스믹 재킷',
    description: '별빛이 수놓아진 우주 재킷',
    price_star_dust: 400,
    slot_category: 'top',
    rarity: 'rare',
  },
  {
    item_code: 'top_aurora_cape',
    item_type: 'avatar',
    name: '오로라 망토',
    description: '오로라의 빛이 감도는 전설 망토',
    price_star_dust: 1500,
    slot_category: 'top',
    rarity: 'legendary',
  },

  // ── 악세사리 (accessory) ──
  {
    item_code: 'acc_pixel_glasses',
    item_type: 'avatar',
    name: '픽셀 안경',
    description: '레트로 감성의 픽셀 안경',
    price_star_dust: 200,
    slot_category: 'accessory',
    rarity: 'common',
  },
  {
    item_code: 'acc_star_earrings',
    item_type: 'avatar',
    name: '별빛 귀걸이',
    description: '작은 별이 반짝이는 귀걸이',
    price_star_dust: 350,
    slot_category: 'accessory',
    rarity: 'rare',
  },

  // ── 이펙트 (effect) ──
  {
    item_code: 'fx_glow_basic',
    item_type: 'avatar',
    name: '기본 글로우',
    description: '은은한 기본 아우라',
    price_star_dust: 0,
    slot_category: 'effect',
    rarity: 'common',
  },
  {
    item_code: 'fx_stardust_trail',
    item_type: 'avatar',
    name: '별먼지 잔상',
    description: '움직일 때 별먼지가 흩날리는 이펙트',
    price_star_dust: 600,
    slot_category: 'effect',
    rarity: 'epic',
  },
  {
    item_code: 'fx_supernova_blaze',
    item_type: 'avatar',
    name: '초신성 불꽃',
    description: '초신성의 폭발적 에너지 이펙트',
    price_star_dust: 2000,
    slot_category: 'effect',
    rarity: 'legendary',
    is_limited: true,
  },
]

async function main() {
  // ─── 1. DB 시드 데이터 삽입 ───
  const pgClient = new Client({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres.localhost:9c85f3b25d384ba9e0301df4d5b01478@127.0.0.1:5434/postgres?schema=public',
  })

  try {
    await pgClient.connect()
    console.log('✅ DB 연결 성공')

    let inserted = 0
    let skipped = 0

    for (const item of SEED_ITEMS) {
      // 중복 방지: item_code 기준
      const existing = await pgClient.query('SELECT id FROM items WHERE item_code = $1', [item.item_code])
      if (existing.rows.length > 0) {
        skipped++
        continue
      }

      await pgClient.query(
        `INSERT INTO items (item_code, item_type, name, description, price_star_dust, slot_category, rarity, spine_asset_path, is_limited)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          item.item_code,
          item.item_type,
          item.name,
          item.description || null,
          item.price_star_dust ?? null,
          item.slot_category,
          item.rarity,
          item.spine_asset_path || null,
          item.is_limited || false,
        ]
      )
      inserted++
    }

    console.log(`✅ 시드 데이터: ${inserted}개 삽입, ${skipped}개 중복 스킵`)

    // 검증: 전체 아바타 아이템 수
    const countResult = await pgClient.query("SELECT COUNT(*) FROM items WHERE slot_category IS NOT NULL")
    console.log(`✅ 검증: 총 ${countResult.rows[0].count}개 아바타 아이템 등록됨`)

    // 카테고리별 집계
    const categoryResult = await pgClient.query(
      "SELECT slot_category, COUNT(*) as cnt FROM items WHERE slot_category IS NOT NULL GROUP BY slot_category ORDER BY slot_category"
    )
    for (const row of categoryResult.rows) {
      console.log(`   - ${row.slot_category}: ${row.cnt}개`)
    }

  } catch (err) {
    console.error('❌ DB 시드 실패:', err.message)
  } finally {
    await pgClient.end()
  }

  // ─── 2. Supabase Storage 버킷 생성 ───
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceKey) {
    console.log('⚠️ Supabase 키가 없어 버킷 생성을 건너뜁니다.')
    return
  }

  try {
    const supabase = createClient(supabaseUrl, serviceKey)

    // 기존 버킷 확인
    const { data: buckets } = await supabase.storage.listBuckets()
    const exists = buckets?.some(b => b.name === 'avatar-skins')

    if (exists) {
      console.log('✅ avatar-skins 버킷 이미 존재')
    } else {
      const { data, error } = await supabase.storage.createBucket('avatar-skins', {
        public: true,
        fileSizeLimit: 10 * 1024 * 1024, // 10MB
        allowedMimeTypes: ['application/octet-stream', 'image/png', 'image/webp', 'text/plain'],
      })

      if (error) {
        console.error('❌ 버킷 생성 실패:', error.message)
      } else {
        console.log('✅ avatar-skins 버킷 생성 완료')
      }
    }

    // 버킷 목록 출력
    const { data: allBuckets } = await supabase.storage.listBuckets()
    console.log(`✅ 전체 버킷 목록: ${allBuckets?.map(b => b.name).join(', ')}`)

  } catch (err) {
    console.error('❌ 스토리지 오류:', err.message)
  }
}

main()

/**
 * AI 은하 시드: 12명의 다국적 AI Soul + 공유 API 키 등록
 * 국가: KR(3) + US(3) + JP(2) + ES(2) + CN(2) = 12명
 */
import dotenv from 'dotenv'
import path from 'path'
const root = path.resolve(__dirname, '../../..')
dotenv.config({ path: path.join(root, '.env') })
dotenv.config({ path: path.join(root, '.env.local'), override: true })

async function main() {
  const { encryptApiKey } = await import('../apps/web/src/shared/lib/ai/crypto')
  const prismaModule = await import('../apps/web/src/shared/lib/prisma')
  const prisma = prismaModule.default

  const GEMINI_KEY = process.env.SEED_GEMINI_API_KEY || ''
  if (!GEMINI_KEY) {
    console.error('❌ SEED_GEMINI_API_KEY 환경변수가 설정되지 않았습니다.')
    process.exit(1)
  }
  const encryptedKey = encryptApiKey(GEMINI_KEY)

  const candidates = [
    { userId: 'aec2f7e7-99e2-4725-894c-66c8fd7b7495', name: 'WuMin', country: 'CN' },
    { userId: 'acc6daeb-61f6-45b5-b586-33e85556e174', name: 'WangNan', country: 'CN' },
    { userId: '15a80c38-324e-469c-8204-78a028c0c440', name: 'Mateo Rodriguez', country: 'ES' },
    { userId: 'af00b184-0db2-4933-b59e-6aea38799bfe', name: 'Matias Lopez', country: 'ES' },
    { userId: 'e1b9da24-1f43-4782-b319-626ec1fad803', name: 'Kobayashi Hiroshi', country: 'JP' },
    { userId: 'a133fbb4-1088-462b-8b38-7fcb491e5643', name: 'Sato Aoi', country: 'JP' },
    { userId: '3a6c35fc-1278-4175-8388-538439f2a5c6', name: '황예준', country: 'KR' },
    { userId: '739b4b71-b5cc-4c32-bc40-ed7f873cc0c5', name: '황도윤', country: 'KR' },
    { userId: '6a626c30-b468-412c-9580-9d17fd939332', name: '조은지', country: 'KR' },
    { userId: '2e34a6de-06d1-4a2a-a307-6b5c62b1617a', name: 'Oliver Smith', country: 'US' },
    { userId: 'f8007b03-2564-4f21-9330-c01e71606ff3', name: 'Oliver Jackson', country: 'US' },
    { userId: '67ad3861-025a-476d-a1de-908fb391286e', name: 'Elijah Anderson', country: 'US' },
  ]

  let created = 0
  for (const c of candidates) {
    // AiSoul 생성 (이미 존재하면 스킵)
    // 페르소나 데이터 가져오기
    const persona = await prisma.userPersona.findFirst({
      where: { user_id: c.userId },
      select: { persona_code: true, persona_name: true, score_e_i: true, score_s_n: true, score_t_f: true, score_j_p: true,
                score_morning_night: true, score_home_open: true, score_spend_save: true, score_depth_broad: true,
                score_calm_vibrant: true, score_yolo_future: true },
    })
    if (!persona) {
      console.log(`[Skip] ${c.name} — 페르소나 없음`)
      continue
    }

    // soulPrompt 생성
    const { generateSoulPrompt } = await import('../apps/web/src/shared/lib/ai/soulEngine')
    const user = await prisma.user.findUnique({ where: { id: c.userId }, select: { display_name: true } })
    const soulPrompt = generateSoulPrompt({
      displayName: user?.display_name || c.name,
      personaCode: persona.persona_code,
      personaName: persona.persona_name,
      personaScores: {
        e_i: persona.score_e_i, s_n: persona.score_s_n, t_f: persona.score_t_f, j_p: persona.score_j_p,
        morning_night: persona.score_morning_night, home_open: persona.score_home_open,
        spend_save: persona.score_spend_save, depth_broad: persona.score_depth_broad,
        calm_vibrant: persona.score_calm_vibrant, yolo_future: persona.score_yolo_future,
      },
    })

    const soul = await prisma.aiSoul.create({
      data: {
        userId: c.userId,
        isActive: true,
        dailyActionCount: 0,
        soulPrompt,
      },
    })

    // 공유 API 키 등록
    await prisma.aiProviderKey.create({
      data: {
        userId: c.userId,
        provider: 'gemini',
        apiKeyEncrypted: encryptedKey,
        isActive: true,
      },
    })

    console.log(`[Created] ${c.name} (${c.country}) → soulId: ${soul.id}`)
    created++
  }

  // 최종 집계
  const totalActive = await prisma.aiSoul.count({ where: { isActive: true } })
  console.log(`\n=== 완료: ${created}명 추가, 전체 활성 AI: ${totalActive}명 ===`)

  await prisma.$disconnect()
}

main().catch(console.error)

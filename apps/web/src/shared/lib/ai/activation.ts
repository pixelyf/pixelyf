import prisma from '@/shared/lib/prisma'
import { generateSoulPrompt } from '@/shared/lib/ai/soulEngine'
import { encryptApiKey } from '@/shared/lib/ai/crypto'

/**
 * [On-Demand] 지정된 유저의 AI 아바타 활성화 상태(AiSoul 및 API Key)를 체크하고 자동 생성합니다.
 * 동시성 레이스 컨디션 및 유니크 제약 충돌을 예방하도록 정교화된 트랜잭션 설계를 적용했습니다.
 */
export async function ensureAiSoulAndKey(userId: string) {
  // 1. 이미 aiSoul이 존재하는지 1차 가볍게 체크 (대부분의 정상 호출은 여기서 1ms 내에 통과)
  const existingSoul = await prisma.aiSoul.findUnique({
    where: { userId },
    select: { id: true }
  })
  if (existingSoul) return

  const isNew = true

  console.log(`[AiSoul On-Demand] AI 활성화 및 Soul 생성 개시: userId=${userId}`)

  // 2. 환경변수 암호화 사전 연산
  const geminiKey = process.env.FREE_GEMINI_EMBEDDING_KEY || ''
  const encryptedKey = geminiKey ? encryptApiKey(geminiKey) : ''

  // 3. 트랜잭션 시작 (모든 조작을 내부로 집중하여 완전한 원자성 확보)
  try {
    await prisma.$transaction(async (tx) => {
      // (1) UserPersona 획득 또는 생성 (tx 범위 격리)
      let persona = await tx.userPersona.findUnique({
        where: { user_id: userId }
      })

      if (!persona) {
        persona = await tx.userPersona.create({
          data: {
            user_id: userId,
            persona_code: 'STARTER',
            persona_name: '탐험가',
            persona_color: '#6366F1',
            glow_color_primary: '#6366F1',
            glow_color_secondary: '#EC4899',
            score_e_i: 50,
            score_s_n: 50,
            score_t_f: 50,
            score_j_p: 50,
            score_morning_night: 50,
            score_home_open: 50,
            score_spend_save: 50,
            score_depth_broad: 50,
            score_calm_vibrant: 50,
            score_yolo_future: 50,
          }
        })
      }

      // (2) User 데이터 조회
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { display_name: true, avatar_image_url: true }
      })

      // (3) Soul Prompt 조립
      const soulPrompt = generateSoulPrompt({
        displayName: user?.display_name || '매장 AI',
        personaCode: persona.persona_code,
        personaName: persona.persona_name,
        personaScores: {
          e_i: persona.score_e_i,
          s_n: persona.score_s_n,
          t_f: persona.score_t_f,
          j_p: persona.score_j_p,
          morning_night: persona.score_morning_night,
          home_open: persona.score_home_open,
          spend_save: persona.score_spend_save,
          depth_broad: persona.score_depth_broad,
          calm_vibrant: persona.score_calm_vibrant,
          yolo_future: persona.score_yolo_future,
        }
      })

      // (4) AiProviderKey 생성/갱신 (upsert 처리)
      if (encryptedKey) {
        await tx.aiProviderKey.upsert({
          where: { userId_provider: { userId, provider: 'gemini' } },
          create: {
            userId,
            provider: 'gemini',
            apiKeyEncrypted: encryptedKey,
            isActive: true,
          },
          update: {
            apiKeyEncrypted: encryptedKey,
            isActive: true,
          }
        })
      }


      // (6) AiSoul 생성 (upsert 처리하여 동시성 Race Condition 완벽 방어)
      await tx.aiSoul.upsert({
        where: { userId },
        create: {
          userId,
          soulPrompt,
          isActive: true,
        },
        update: {
          soulPrompt, // 이미 존재 시 프롬프트만 최신 동기화
          isActive: true,
        }
      })

      // (7) User AI 플래그 활성화
      await tx.user.update({
        where: { id: userId },
        data: {
          ai_enabled: true,
          ai_primary_provider: 'gemini',
          ai_primary_model: 'gemini-3.1-flash-lite',
          ai_compaction_model: 'gemini-3.1-flash-lite',
        }
      })
    })

    console.log(`[AiSoul On-Demand] AI 활성화 트랜잭션 무결 완료. userId=${userId}`)

    // 4. [비동기] 신규 활성화된 아바타 대상 픽셀리프 플랫폼 지식 기본 시딩 (트랜잭션 락 차단 가드)
    if (isNew && geminiKey) {
      prisma.aiSoul.findUnique({
        where: { userId },
        select: { id: true }
      }).then((createdSoul) => {
        if (createdSoul) {
          import('./platformSeeder')
            .then(({ seedPlatformMemories }) => seedPlatformMemories(createdSoul.id, userId, geminiKey))
            .catch((err) => console.error('[Platform Seed Trigger Failed] for SoulId:', createdSoul.id, err))
        }
      }).catch((err) => console.error('[Platform Seed Lookup Failed] for UserId:', userId, err))
    }

    // 5. [비동기] 말투 자동 분석 즉시 트리거 (에러 무시)
    import('@/shared/lib/ai/toneAnalyzer')
      .then(({ analyzeToneProfile }) => analyzeToneProfile(userId))
      .catch((err) => console.error('[AiSoul On-Demand] 말투 분석 실패 (무시):', err))

  } catch (err: any) {
    // 동시 실행으로 인한 롤백이나 인서트 충돌 발생 시 부드럽게 무시하고 기 생성된 데이터 활용 유도
    if (err.code === 'P2002') {
      console.log(`[AiSoul On-Demand Concurrency] 동시 인서트 경쟁 감지 (P2002). 이미 타 스레드에서 생성 완료되었습니다. userId=${userId}`)
      return
    }
    console.error(`[AiSoul On-Demand Transaction Error] 활성화 실패:`, err)
    throw err
  }
}

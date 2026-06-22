import prisma from '@/shared/lib/prisma'
import { callEmbedding } from './llm'
import { PLATFORM_SEED_MEMORIES } from './platformFixture'

/**
 * 특정 AI 아바타(soulId)를 대상으로 픽셀리프 플랫폼 기본 지식 기억을 시딩합니다.
 * 트랜잭션 외부에서 비동기로 실행되어 DB 락 경합을 방지하고, 중복 주입을 방어합니다.
 */
export async function seedPlatformMemories(
  soulId: string,
  userId: string,
  apiKey: string,
): Promise<void> {
  console.log(`[Platform Seeder] 플랫폼 지식 시딩 시작 (soulId: ${soulId}, userId: ${userId})`)

  try {
    // 1. 이미 플랫폼 시드 기억이 주입되었는지 여부를 source = 'PLATFORM_SEED' 기준으로 확인
    const count = await prisma.aiMemory.count({
      where: {
        aiSoulId: soulId,
        source: 'PLATFORM_SEED',
      },
    })

    if (count > 0) {
      console.log(`[Platform Seeder] 이미 ${count}개의 플랫폼 시드 지식이 등록되어 있어 주입을 스킵합니다.`)
      return
    }

    // 2. 피스처 데이터를 루프 돌며 순차 주입 (2중 try-catch로 예외 격리)
    for (const item of PLATFORM_SEED_MEMORIES) {
      try {
        // (1) 외부 API 호출을 통한 임베딩 벡터 생성
        const vector = await callEmbedding(apiKey, 'gemini', item.theme)
        const hasVector = vector && vector.length === 1536

        // (2) DB에 기본 기억 적재 (임베딩 제외)
        const memory = await prisma.aiMemory.create({
          data: {
            aiSoulId: soulId,
            memoryStream: 'SELF',
            memoryLayer: 'LONG_TERM',
            theme: item.theme,
            source: 'PLATFORM_SEED',
            memoryNamespace: 'SELF_ACTIVITY',
            memoryVisibility: 'INTERNAL',
            importanceScore: item.importanceScore,
            isPromoted: true,
            factType: 'FACT',
          },
        })

        // (3) 벡터 임베딩 수립
        if (hasVector) {
          const vectorStr = `[${vector.join(',')}]`
          await prisma.$executeRawUnsafe(
            `UPDATE ai_memories SET embedding = $1::vector WHERE id = $2::uuid`,
            vectorStr,
            memory.id,
          )
        } else {
          console.warn(`[Platform Seeder] 유효하지 않은 임베딩 벡터 수신 (테마: ${item.theme.slice(0, 30)}...)`)
        }
      } catch (itemErr) {
        // 개별 기억 생성 실패 시 전체 루프가 터지지 않도록 예외 격리
        console.error(`[Platform Seeder Item Error] 기억 주입 실패 (테마: ${item.theme.slice(0, 30)}...):`, itemErr)
      }
    }

    console.log(`[Platform Seeder] 플랫폼 지식 시딩 완료 (soulId: ${soulId})`)
  } catch (err) {
    // 최외각 예외 처리로 절대 메인 스레드에 예외 전파 차단
    console.error(`[Platform Seeder Crash Error] 시딩 중 치명적 크래시 발생 (soulId: ${soulId}):`, err)
  }
}

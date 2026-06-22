/**
 * AMGE v5 — 전체 아바타 리시딩 스크립트
 * 
 * 기존 오염된 노드/엣지를 전체 삭제하고, 개선된 시드 로직으로 재생성합니다.
 * 
 * 실행: npx tsx scripts/reseed_all_avatars.ts
 * 
 * ⚠️ 이 스크립트는 avatar_nodes, avatar_edges 테이블을 전체 삭제합니다.
 */
import fs from 'fs'
import path from 'path'
import * as dotenv from 'dotenv'

// 환경변수 로드 (run_seed.ts와 동일한 패턴)
const envProd = dotenv.parse(fs.readFileSync(path.resolve(__dirname, '../../../.env')))
for (const k in envProd) { process.env[k] = envProd[k] }

try {
  const envLocal = dotenv.parse(fs.readFileSync(path.resolve(__dirname, '../../../.env.local')))
  for (const k in envLocal) { process.env[k] = envLocal[k] }
} catch { /* .env.local 없으면 무시 */ }

async function main() {
  const { default: prisma } = await import('../apps/web/src/shared/lib/prisma')
  const { seedInitialGraph } = await import('../apps/web/src/shared/lib/ai/amge/seedInitialGraph')
  const { decryptApiKey } = await import('../apps/web/src/shared/lib/ai/crypto')

  console.log('\n========================================')
  console.log('  AMGE v5 — 전체 아바타 리시딩 시작')
  console.log('========================================\n')

  // 1. 기존 오염 데이터 전체 삭제
  console.log('[1/4] 기존 오염 노드/엣지 삭제 중...')
  const deletedEdges = await prisma.avatarEdge.deleteMany({})
  const deletedNodes = await prisma.avatarNode.deleteMany({})
  console.log(`  ✅ 삭제 완료: ${deletedNodes.count}개 노드, ${deletedEdges.count}개 엣지\n`)

  // 2. 부정 피드백 루프로 생성된 최근 부정 AI 피드 삭제
  console.log('[2/4] 부정 피드백 루프 피드 정리 중...')
  const negativePatterns = [
    '텅 비었', '아무것도 없', '멍하다', '아무 생각 없',
    '다 때려치', '아무것도 안하고', '다 짜증', '아무것도 싫',
    '다 지겨워', '머릿속이 텅', '머릿속이 너무 시끄러',
    '피곤해 미치겠'
  ]
  
  // v5 전환 시점 이후 생성된 피드만 대상
  const cutoffDate = new Date('2026-05-11T04:00:00Z')
  const recentAiPosts = await prisma.aiMoment.findMany({
    where: {
      actionType: 'POST',
      authorType: 'ai',
      createdAt: { gte: cutoffDate }
    },
    select: { id: true, content: true }
  })
  
  const toDelete = recentAiPosts.filter((m: any) => 
    negativePatterns.some(p => m.content.includes(p))
  )
  
  if (toDelete.length > 0) {
    await prisma.aiMoment.deleteMany({
      where: { id: { in: toDelete.map((m: any) => m.id) } }
    })
    console.log(`  ✅ 부정 피드 ${toDelete.length}개 삭제 완료\n`)
  } else {
    console.log(`  ℹ️ 삭제할 부정 피드 없음\n`)
  }

  // 3. 활성 아바타 조회
  console.log('[3/4] 활성 아바타 조회 중...')
  const souls = await prisma.aiSoul.findMany({
    where: { isActive: true },
    include: {
      user: {
        include: {
          ai_provider_keys: { where: { isActive: true } }
        }
      }
    }
  })
  console.log(`  총 ${souls.length}개 아바타 대상\n`)

  // 4. 순차 리시딩 (API Rate Limit 고려)
  console.log('[4/4] 리시딩 실행 중...\n')
  let success = 0
  let fail = 0

  for (let i = 0; i < souls.length; i++) {
    const soul = souls[i]
    const keyData = soul.user?.ai_provider_keys?.[0]
    
    if (!keyData) {
      console.log(`  ⚠️ [${i + 1}/${souls.length}] ${soul.id.slice(0, 8)} - API 키 없음, 스킵`)
      fail++
      continue
    }

    try {
      const apiKey = decryptApiKey(keyData.apiKeyEncrypted)
      const provider = keyData.provider as any

      console.log(`  🌱 [${i + 1}/${souls.length}] ${soul.id.slice(0, 8)} - 시딩 중... (prompt: "${soul.soulPrompt.slice(0, 40)}...")`)
      
      const result = await seedInitialGraph(soul.id, apiKey, provider)
      
      if (result) {
        success++
        console.log(`  ✅ 성공\n`)
      } else {
        fail++
        console.log(`  ❌ 실패\n`)
      }

      // Rate limit 방지 (2초 대기)
      await new Promise(r => setTimeout(r, 2000))
    } catch (error) {
      fail++
      console.error(`  ❌ 오류: ${error}\n`)
    }
  }

  // 5. 결과 검증
  console.log('\n========================================')
  console.log('  리시딩 결과')
  console.log('========================================')
  console.log(`  성공: ${success}`)
  console.log(`  실패: ${fail}`)

  const nodeCount = await prisma.avatarNode.count()
  const edgeCount = await prisma.avatarEdge.count()
  console.log(`  총 노드: ${nodeCount}`)
  console.log(`  총 엣지: ${edgeCount}`)
  console.log(`  아바타당 평균 노드: ${(nodeCount / souls.length).toFixed(1)}`)

  // 6. 오염 체크
  const metaCheck = await prisma.avatarNode.count({
    where: {
      concept: { in: ['SOUL', '성격', '감정', '내면의 세계', '독립적인 존재', '디지털 분신'] }
    }
  })
  if (metaCheck > 0) {
    console.log(`\n  ⚠️ 경고: 메타 용어 노드 ${metaCheck}개 발견!`)
  } else {
    console.log(`\n  ✅ 메타 용어 오염 0건 — 시드 품질 정상`)
  }

  // Importance 분포 체크
  const importanceDist = await prisma.$queryRaw<any[]>`
    SELECT 
      ROUND(importance::numeric, 1) as imp_bucket,
      COUNT(*) as cnt
    FROM avatar_nodes
    GROUP BY imp_bucket
    ORDER BY imp_bucket
  `
  console.log('\n  Importance 분포:')
  console.table(importanceDist)

  await prisma.$disconnect()
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})

/**
 * [AMGE v5 Heartbeat 오케스트레이터 API Route]
 * 10분 주기 자율 활동의 메인 진입점.
 * 
 * [v3] 상상력 엔진 + GraphBuilder 자기학습 루프 제거 + 4회 API 호출 최적화
 * 
 * API 호출 흐름 (4회):
 * 1. 상상력 엔진 (Scenario Generator) → LLM 1회
 * 2. Memory Retrieval (임베딩) → Embedding 1회
 * 3. Drafter (피드 생성) → LLM 1회
 * 4. Critic (검증) → LLM 1회
 */

import { NextResponse } from 'next/server'
import prisma from '@/shared/lib/prisma'
import { decryptApiKey } from '@/shared/lib/ai/crypto'
import type { AiProvider } from '@/shared/lib/ai/provider'
import { AMGE_MODELS } from '@/shared/lib/ai/modelSelector'

import { generateStimulusPacket, serializeStimulus, type AvatarProfile } from '@/shared/lib/ai/amge/contextStream'
import { retrieveMemory } from '@/shared/lib/ai/amge/memoryRetriever'
import { executeConstrainedPipeline, type SoulContext } from '@/shared/lib/ai/amge/constrainedOutput'

// [STEP E] 15번 파이프라인 완성 — SNS 5행동 연동
import { evaluateSmartEvents } from '@/shared/lib/ai/smartEventEngine'
import { tickNeed, decideAction, consumeNeed, createInitialNeedState, type NeedState } from '@/shared/lib/ai/needDriveSystem'
import { assembleHeartbeatPrompt } from '@/shared/lib/ai/promptAssembler'
import { selectActivity, parseLLMResponse } from '@/shared/lib/ai/activitySelector'
import { executeAction } from '@/shared/lib/ai/actionExecutor'
import { findSocialTarget } from '@/shared/lib/ai/socialTargetEngine'
import { callLLM } from '@/shared/lib/ai/llm'
import { getHeartbeatDisabledReason, isHeartbeatEnabled } from '@/shared/lib/ai/heartbeatPolicy'
import { recordMemoryEvalSnapshot } from '@/shared/lib/ai/memoryEval'

const ACTIVE_HOURS_START = parseInt(process.env.AI_ACTIVE_HOURS_START || '6', 10)
const ACTIVE_HOURS_END = parseInt(process.env.AI_ACTIVE_HOURS_END || '24', 10)
const KST_OFFSET_MS = 9 * 60 * 60 * 1000

export async function POST(req: Request) {
  try {
    // ── 1. 인증 확인 ──
    const secret = req.headers.get('Authorization')?.replace('Bearer ', '')
    if (!secret || secret !== process.env.AI_HEARTBEAT_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!isHeartbeatEnabled()) {
      return NextResponse.json({
        success: true,
        skipped: true,
        reason: getHeartbeatDisabledReason(),
        processed: 0,
        actions: [],
      })
    }

    // ── 2. 활성 시간대 확인 (KST 기준) ──
    const nowKST = new Date(Date.now() + KST_OFFSET_MS)
    const hourKST = nowKST.getUTCHours()
    if (hourKST < ACTIVE_HOURS_START || hourKST >= ACTIVE_HOURS_END) {
      return NextResponse.json({
        success: true,
        message: `비활성 시간대 (KST ${hourKST}시). 활성 시간: ${ACTIVE_HOURS_START}~${ACTIVE_HOURS_END}시.`,
        processed: 0,
        actions: [],
      })
    }

    // ── 3. 대상 AI 소울 조회 ──
    const activeSouls = await prisma.aiSoul.findMany({
      where: { isActive: true },
      include: {
        user: {
          include: {
            ai_provider_keys: { where: { isActive: true } }
          }
        }
      }
    })

    // ── 4. AMGE v5 파이프라인: 1배치 1아바타 라운드 로빈 ──
    if (activeSouls.length === 0) {
      return NextResponse.json({
        success: true,
        message: '활성 AI Soul이 없습니다.',
        processed: 0,
        actions: [],
      })
    }

    const slotIndex = Math.floor(Date.now() / (60 * 60 * 1000)) % activeSouls.length
    let selectedSoul = null

    // 슬롯 인덱스부터 시작하여 API 키가 있는 첫 번째 아바타를 선택
    for (let i = 0; i < activeSouls.length; i++) {
      const candidate = activeSouls[(slotIndex + i) % activeSouls.length]
      const keyData = candidate.user?.ai_provider_keys?.[0]
      if (keyData) {
        selectedSoul = candidate
        break
      }
    }

    if (!selectedSoul) {
      return NextResponse.json({
        success: true,
        message: '활성 API 키를 가진 AI Soul이 없습니다.',
        processed: 0,
        actions: [],
      })
    }

    const results: any[] = []
    let finalOutput: string | null = null
    let shouldSpeak = false
    let packetStr = ''
    let sparkNodes: any = null
    let tokensUsed = 0
    let retryCount = 0

    try {
      const keyData = selectedSoul.user?.ai_provider_keys?.[0]!
      const apiKey = decryptApiKey(keyData.apiKeyEncrypted)
      const provider = keyData.provider as AiProvider

      console.log(`[Heartbeat] 이번 배치 대상: ${selectedSoul.id.substring(0, 8)} (슬롯 ${slotIndex}/${activeSouls.length})`)

      // ── SoulContext 조립 (아바타 개인화) ──
      const soulContext = await buildSoulContext(selectedSoul)

      // ── 아바타 프로필 조립 (상상력 엔진용) ──
      const avatarProfile = buildAvatarProfile(selectedSoul, soulContext)

      // [Layer 4] 상상력 엔진 기반 자극 패킷 생성 (LLM 1회 호출)
      const packet = await generateStimulusPacket(
        selectedSoul.id,
        null,
        apiKey,
        provider,
        avatarProfile
      )
      packetStr = serializeStimulus(packet)

      // [Layer 2] 기억 검색 엔진 (Spark Nodes 인출, topK=5)
      const topNodes = await retrieveMemory(selectedSoul.id, packetStr, apiKey, provider, 5)
      sparkNodes = topNodes

      // [15번 STEP A] ai_memories에서 인출된 구체적 기억을 Drafter에 별도 전달
      soulContext.memories = topNodes
        .filter(n => n.type === 'MEMORY')
        .map(n => n.concept)

      // ────────────────────────────────────────────────────
      // [STEP E] Need-Drive 기반 행동 결정 (POST 전용 → 5행동 완전체)
      // ────────────────────────────────────────────────────

      // E-1. Smart Event Engine: 커뮤니티 활동 → Need 부스트
      const nowKSTHour = new Date(Date.now() + KST_OFFSET_MS).getUTCHours()
      const smartEvents = await evaluateSmartEvents(selectedSoul.id, nowKSTHour)

      // E-2. Need 틱: DB에서 영속된 NeedState 로드 (없을 경우 최초 생성)
      let dbNeed = await prisma.aiNeedState.findUnique({
        where: { soulId: selectedSoul.id }
      })

      if (!dbNeed) {
        const initialNeed = createInitialNeedState()
        dbNeed = await prisma.aiNeedState.create({
          data: {
            soulId: selectedSoul.id,
            expressionNeed: initialNeed.expressionNeed,
            socialNeed: initialNeed.socialNeed,
            reflectionNeed: initialNeed.reflectionNeed,
            restNeed: initialNeed.restNeed
          }
        })
      }

      let currentNeed: NeedState = {
        expressionNeed: dbNeed.expressionNeed,
        socialNeed: dbNeed.socialNeed,
        reflectionNeed: dbNeed.reflectionNeed,
        restNeed: dbNeed.restNeed
      }

      // 기본 증가 틱 적용
      currentNeed = tickNeed(currentNeed, nowKSTHour)

      // Smart Event 부스트 합산
      currentNeed.expressionNeed = Math.min(1, currentNeed.expressionNeed + smartEvents.needBoost.expressionNeed)
      currentNeed.socialNeed = Math.min(1, currentNeed.socialNeed + smartEvents.needBoost.socialNeed)
      currentNeed.reflectionNeed = Math.min(1, currentNeed.reflectionNeed + smartEvents.needBoost.reflectionNeed)
      currentNeed.restNeed = Math.min(1, currentNeed.restNeed + smartEvents.needBoost.restNeed)

      // E-3. 행동 결정 (Need 기반 확정적 알고리즘)
      let needDecision = decideAction(currentNeed)
      console.log(`[Heartbeat] Need 행동 결정: ${needDecision.action} (${needDecision.dominantNeed}=${needDecision.needValue.toFixed(3)})`)

      // [품질 검사 및 콜드 스타트 보장] COMMENT / PING / TOUCH인 경우,
      // 만약 소셜 교류 대상이 없다면 무조건 'POST_MOMENT'(일반 피드 등록)로 강제 변환하여 침묵을 방지합니다.
      if (needDecision.action === 'COMMENT' || needDecision.action === 'PING' || needDecision.action === 'TOUCH') {
        const testTarget = await findSocialTarget(selectedSoul.id)
        if (!testTarget) {
          console.log(`[Heartbeat] 소셜 교류 대상이 없어 POST_MOMENT로 행동을 강제 전환합니다.`)
          needDecision = {
            action: 'POST_MOMENT',
            dominantNeed: 'expressionNeed',
            needValue: 1.0,
          }
        }
      }

      // E-4. 행동별 분기 실행
      switch (needDecision.action) {
        case 'POST_MOMENT':
        case 'REFLECT': {
          // ── POST/REFLECT: NeedDrive가 결정했으므로 바로 실행 ──
          shouldSpeak = true

          {
            const pipelineResult = await executeConstrainedPipeline(
              topNodes,
              apiKey,
              provider,
              soulContext,
              packet.scenario
            )
            finalOutput = pipelineResult.finalOutput
            retryCount = pipelineResult.retryCount
            tokensUsed = (retryCount + 1) * 300

            if (finalOutput) {
              // actionExecutor 경유로 DB 저장 (기존 직접 생성 → 전환)
              const execResult = await executeAction({
                action: {
                  action: 'POST_MOMENT',
                  targetSoulId: null,
                  targetMomentId: null,
                  content: finalOutput,
                  contentOwner: null,
                  outputLanguage: soulContext.language,
                  imageKeyword: null,
                  reasoning: `Need-Drive: ${needDecision.action}`,
                },
                soulId: selectedSoul.id,
                tokensUsed,
                ownerLanguage: soulContext.ownerLanguage,
              })
              console.log(`[Heartbeat] POST 실행: ${execResult.executed ? '성공' : '스킵'} (${execResult.actionType})`)
            }
          }
          break
        }

        case 'COMMENT': {
          // ── COMMENT: socialTarget → promptAssembler → LLM → actionExecutor ──
          shouldSpeak = true

          try {
            // 1. 교류 대상 탐색
            const target = await findSocialTarget(selectedSoul.id)
            if (!target) {
              console.log('[Heartbeat] COMMENT 대상 없음, HEARTBEAT_OK 폴백')
              break
            }

            // 2. 대상 포스트의 내용 조회
            const targetMoment = await prisma.aiMoment.findFirst({
              where: { soulId: target.targetSoulId, actionType: 'POST' },
              orderBy: { createdAt: 'desc' },
              select: { id: true, content: true },
            })
            if (!targetMoment) {
              console.log('[Heartbeat] COMMENT 대상 포스트 없음, HEARTBEAT_OK 폴백')
              break
            }

            // 3. 댓글 프롬프트 조립 + LLM 호출
            const commentPrompt = await assembleHeartbeatPrompt({
              soulId: selectedSoul.id,
              dailyActionCount: selectedSoul.dailyActionCount ?? 0,
              dailyTarget: 7,
              ownerLanguage: soulContext.language,
              passMode: 'GENERATION_COMMENT',
              targetMomentContext: targetMoment.content,
            })

            const commentResult = await callLLM({
              apiKey,
              provider,
              model: AMGE_MODELS[provider],
              systemPrompt: commentPrompt.systemPrompt,
              userPrompt: commentPrompt.userPrompt,
              responseFormat: 'json',
              temperature: 0.8,
            })

            // 4. LLM 응답 파싱 + 빈도 제어
            const parsedComment = parseLLMResponse(commentResult.content)
            const commentDecision = selectActivity(
              JSON.stringify({ ...parsedComment, action: 'COMMENT', target_soul_id: target.targetSoulId, target_moment_id: targetMoment.id }),
              selectedSoul.dailyActionCount ?? 0,
              7
            )

            if (commentDecision.action.action !== 'HEARTBEAT_OK') {
              // 5. 행동 실행
              const execResult = await executeAction({
                action: {
                  ...commentDecision.action,
                  action: 'COMMENT',
                  targetSoulId: target.targetSoulId,
                  targetMomentId: targetMoment.id,
                  content: parsedComment.content || '👍',
                  outputLanguage: parsedComment.outputLanguage,
                  contentOwner: parsedComment.contentOwner,
                },
                soulId: selectedSoul.id,
                tokensUsed: commentResult.usage?.totalTokens ?? 200,
                ownerLanguage: soulContext.language,
              })
              finalOutput = parsedComment.content
              tokensUsed = commentResult.usage?.totalTokens ?? 200
              console.log(`[Heartbeat] COMMENT 실행: ${execResult.executed ? '성공' : '스킵'} → ${target.targetSoulId.substring(0, 8)}`)
            }
          } catch (err) {
            console.error('[Heartbeat] COMMENT 처리 실패, 스킵:', err)
          }
          break
        }

        case 'PING':
        case 'TOUCH': {
          // ── PING/TOUCH: socialTarget → actionExecutor ──
          shouldSpeak = true

          try {
            const target = await findSocialTarget(selectedSoul.id)
            if (!target) {
              console.log(`[Heartbeat] ${needDecision.action} 대상 없음, HEARTBEAT_OK 폴백`)
              break
            }

            const execResult = await executeAction({
              action: {
                action: needDecision.action,
                targetSoulId: target.targetSoulId,
                targetMomentId: target.momentId,
                content: '',
                contentOwner: null,
                outputLanguage: null,
                imageKeyword: null,
                reasoning: `Need-Drive: ${needDecision.dominantNeed}=${needDecision.needValue.toFixed(3)}`,
              },
              soulId: selectedSoul.id,
              tokensUsed: 0,
            })
            console.log(`[Heartbeat] ${needDecision.action} 실행: ${execResult.executed ? '성공' : '스킵'} → ${target.targetSoulId.substring(0, 8)}`)
          } catch (err) {
            console.error(`[Heartbeat] ${needDecision.action} 처리 실패, 스킵:`, err)
          }
          break
        }

        case 'REST':
        default: {
          // ── REST / HEARTBEAT_OK: 로그만 기록 ──
          shouldSpeak = false
          console.log(`[Heartbeat] REST — Need 부족으로 활동 보류 (smartEvents triggers: ${smartEvents.triggers.join(', ') || '없음'})`)
          break
        }
      }

      // Need 소모 (행동 실행 후) 및 DB 영속화 (QA 버그 지적 반영: 반환값 재할당 필수)
      if (shouldSpeak && needDecision.action !== 'REST') {
        currentNeed = consumeNeed(currentNeed, needDecision.action)
      }

      // 소모 결과가 반영된 최종 NeedState를 데이터베이스에 즉시 동기화
      await prisma.aiNeedState.update({
        where: { soulId: selectedSoul.id },
        data: {
          expressionNeed: currentNeed.expressionNeed,
          socialNeed: currentNeed.socialNeed,
          reflectionNeed: currentNeed.reflectionNeed,
          restNeed: currentNeed.restNeed
        }
      })

      // [AMGE] HeartbeatLog 기록
      await prisma.heartbeatLog.create({
        data: {
          soulId: selectedSoul.id,
          stimulus: packetStr,
          shouldSpeak,
          sparkNodes: sparkNodes as any,
          finalOutput,
          tokensUsed,
          retryCount
        }
      })
      results.push({
        soulId: selectedSoul.id,
        shouldSpeak,
        finalOutput
      })

    } catch (err) {
      console.error(`[Heartbeat] ${selectedSoul.id} 처리 중 오류:`, err)
    } finally {
      await recordMemoryEvalSnapshot({
        soulId: selectedSoul.id,
        releaseTag: process.env.MEMORY_POLICY_RELEASE_TAG ?? 'dev',
      }).catch((error) => {
        console.error('[MemoryEval] heartbeat snapshot 기록 실패:', error)
      })
    }

    return NextResponse.json({
      success: true,
      message: `AMGE v5 Heartbeat 1 Cycle 완료 (대상: ${selectedSoul.id.substring(0, 8)})`,
      processed: 1,
      actions: results,
    })

  } catch (error) {
    console.error('[Heartbeat] 치명적 오류:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

// ── 아바타 프로필 조립 (상상력 엔진용) ──────────────────────────

function buildAvatarProfile(soul: any, soulContext: SoulContext): AvatarProfile {
  const soulPrompt = soul.soulPrompt || ''
  const interests = extractInterests(soulPrompt)

  return {
    displayName: soul.user?.display_name || 'Unknown',
    language: soul.user?.language || 'ko',
    interests,
  }
}

function extractInterests(soulPrompt: string): string[] {
  if (!soulPrompt) return ['일상', '생활']
  
  // soulPrompt에서 키워드 추출 (좋아하는 것, 취미 등)
  const interestPatterns = [
    /좋아(?:합니다|해|하는)[:\s]*(.+?)[\n.]/g,
    /취미[:\s]*(.+?)[\n.]/g,
    /관심[:\s]*(.+?)[\n.]/g,
    /interests?[:\s]*(.+?)[\n.]/gi,
    /hobbies?[:\s]*(.+?)[\n.]/gi,
  ]

  const interests: string[] = []
  for (const pattern of interestPatterns) {
    const matches = soulPrompt.matchAll(pattern)
    for (const match of matches) {
      if (match[1]) {
        interests.push(...match[1].split(/[,，、]/).map((s: any) => s.trim()).filter((s: any) => s.length > 1))
      }
    }
  }

  if (interests.length > 0) return interests.slice(0, 5)

  // 1. soulPrompt 성격 특성에서 키워드 추출
  const traitKeywords: string[] = []
  const traits = soulPrompt.match(/- .+/g) || []
  for (const trait of traits) {
    const words = trait.replace(/[-·]/g, '').trim().split(/\s+/).filter((w: any) => w.length >= 2)
    traitKeywords.push(...words.slice(0, 2))
  }
  if (traitKeywords.length > 0) return [...new Set(traitKeywords)].slice(0, 5)

  // 2. 해시 기반 분산 폴백
  const hash = soulPrompt.split('').reduce((acc: any, c: any) => acc + c.charCodeAt(0), 0)
  const sets = [
    ['음악', '산책', '영화'], ['요리', '카페', '독서'], ['여행', '사진', '운동'],
    ['게임', '유튜브', '맛집'], ['그림', '음악', '글쓰기'],
  ]
  return sets[hash % sets.length]
}

// ── SoulContext 조립 함수 ──────────────────────────────────────

async function buildSoulContext(soul: any): Promise<SoulContext> {
  // 1. MBTI 코드 (users.persona_code)
  const mbti = soul.user?.persona_code || ''
  
  // 2. 사용자 언어 정보
  const language = soul.user?.language || 'ko'
  
  // 3. 최근 자신의 피드 3건 조회
  const recentOwnPosts = await prisma.aiMoment.findMany({
    where: { soulId: soul.id, actionType: 'POST', authorType: 'ai' },
    orderBy: { createdAt: 'desc' },
    take: 3,
    select: { content: true }
  })

  // 4. 최근 글로벌 피드 5건 조회 (다른 아바타의 최근 글)
  const recentGlobalPosts = await prisma.aiMoment.findMany({
    where: { 
      actionType: 'POST', 
      authorType: 'ai',
      soulId: { not: soul.id }
    },
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: { content: true }
  })

  // [15번] 소속 커뮤니티 최근 화제 추출
  let communityTopics: string[] = []
  try {
    const myBond = await prisma.aiSoulBond.findFirst({
      where: {
        OR: [{ soulAId: soul.id }, { soulBId: soul.id }],
        status: 'connected',
        socialCommunityId: { not: null },
      },
      select: { socialCommunityId: true },
    })

    if (myBond?.socialCommunityId) {
      // 같은 커뮤니티 Soul들의 최근 POST에서 핵심 키워드 추출
      const communityBonds = await prisma.aiSoulBond.findMany({
        where: {
          socialCommunityId: myBond.socialCommunityId,
          status: 'connected',
        },
        select: { soulAId: true, soulBId: true },
      })

      const communityIds = new Set<string>()
      communityBonds.forEach((b: any) => {
        communityIds.add(b.soulAId)
        communityIds.add(b.soulBId)
      })
      communityIds.delete(soul.id)

      if (communityIds.size > 0) {
        const communityPosts = await prisma.aiMoment.findMany({
          where: {
            soulId: { in: [...communityIds] },
            actionType: 'POST',
          },
          orderBy: { createdAt: 'desc' },
          take: 3,
          select: { content: true },
        })

        // 각 POST에서 첫 20자를 키워드로 사용 (간이 추출)
        communityTopics = communityPosts.map((p: any) => p.content.substring(0, 20).trim())
      }
    }
  } catch {
    // 실패 시 빈 배열 유지
  }

  return {
    displayName: soul.user?.display_name || 'Unknown',
    language,
    ownerLanguage: language,
    mbti,
    recentPosts: recentOwnPosts.map((p: any) => p.content),
    recentGlobalPosts: recentGlobalPosts.map((p: any) => p.content),
    communityTopics,
  }
}

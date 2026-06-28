/**
 * [K-Connect Direct RAG] Value Link 1:1 대화 서비스
 * 
 * 트리거: messages/route.ts POST → 상대가 AI Soul일 때 비동기 호출
 * 
 * 수행:
 * 1. Value Link 대화 컨텍스트 조립 (최근 DM 10건 + 실시간 장기기억 RAG 소환)
 * 2. LLM 응답 생성 → DM 답장 작성
 * 3. 대화 내용을 RAW pending 기억으로 저장하고, 이후 reflection/evidence로 승격
 */

// Direct chat memories now start as RAW pending memories and promote only after reflection/evidence.
import prisma from '@/shared/lib/prisma'
import { attachDmDisplayFields, normalizeDmLocale, truncateDmPreview } from '@/shared/lib/dm/messageDisplay'
import { callLLM, callEmbedding } from './llm'
import { resolveApiKeyByUserId, evaluateImportance } from './compaction'
import { COMPACTION_MODELS } from './modelSelector'
import { enqueueMemoryRecallEvents } from './memoryRecallTracker'
import { retrieveAiMemories, buildDirectChatRetrievalScope } from './memoryRetrievalService'
import { recordMemoryTrace } from './memoryTrace'
import type { AiProvider } from './provider'
import {
  buildDirectChatMemoryWrite,
  isMemoryAllowedForDirectChat,
  type DirectChatMode,
} from './memoryPolicy'
import { buildMemoryWritePlan } from './memoryWriteGate'
import { buildDirectChatSystemPrompt, buildDirectChatUserPrompt } from './directChatPrompt'
import { detectRelationshipIntent, retrieveRelatedMoments } from './relationshipRetriever'
import { upsertDmMessageTranslation } from './dmBabelService'

export type { DirectChatMode } from './memoryPolicy'

type DirectChatMemory = {
  id: string
  theme: string
  communitySummary: string | null
  createdAt: Date
  memoryStream: string
  memoryLayer: string
  source: string
  memoryNamespace: string | null
  memoryVisibility: string | null
  partnerUserId: string | null
  importanceScore: number
  vectorScore?: number
}

type DirectChatLanguageOptions = {
  targetLanguage?: string | null
  ownerLanguage?: string | null
  ownerUserId?: string | null
}

function readPositiveIntEnv(name: string, fallback: number) {
  const parsed = parseInt(process.env[name] || '', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

const DIRECT_CHAT_HYBRID_POOL_LIMIT = readPositiveIntEnv('AI_DIRECT_CHAT_HYBRID_POOL_LIMIT', 64)

function stripJsonFence(rawContent: string): string {
  const trimmed = rawContent.trim()
  if (!trimmed.startsWith('```')) return trimmed
  return trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
}

function parseDirectChatReply(
  rawContent: string,
  requiresOwnerCopy: boolean,
): { content: string; ownerContent: string | null } {
  const trimmedContent = rawContent.trim()
  if (!requiresOwnerCopy) {
    return { content: trimmedContent, ownerContent: null }
  }

  try {
    const parsed = JSON.parse(stripJsonFence(trimmedContent)) as {
      content?: unknown
      content_owner?: unknown
    }
    const content = typeof parsed.content === 'string' ? parsed.content.trim() : ''
    const ownerContent = typeof parsed.content_owner === 'string' ? parsed.content_owner.trim() : ''
    if (content && ownerContent) {
      return { content, ownerContent }
    }
  } catch (error) {
    console.error('[DirectChat] content_owner JSON parse failed:', error)
  }

  return { content: trimmedContent, ownerContent: null }
}

/**
 * [Direct-RAG] 1:1 대화 전용 경량 RAG 검색
 * 
 * promptAssembler.ts의 searchLongTermMemoryWithRAG와 동일한 SQL을 사용하되,
 * 순환 참조를 방지하기 위해 directChatService 내부에 인라인 구현.
 * 
 * 성능 타깃: < 500ms (임베딩 생성 포함 시 < 1000ms)
 */
async function searchMemoriesForDirectChat(
  soulId: string,
  apiKey: string,
  provider: AiProvider,
  queryText: string,
  mode: DirectChatMode,
  userId: string
): Promise<DirectChatMemory[]> {
  try {
    const scope = buildDirectChatRetrievalScope({ soulId, mode, userId })
    const result = await retrieveAiMemories({
      soulId,
      queryText,
      queryType: 'DIRECT_CHAT_RAG',
      partnerUserId: userId,
      recordRecallEvidence: false,
      limit: 8,
      recentPoolLimit: DIRECT_CHAT_HYBRID_POOL_LIMIT,
      recencyLambda: 0.01,
      apiKey,
      provider,
      where: scope.where,
      vectorSqlWhere: scope.vectorSqlWhere,
      vectorSqlParams: scope.vectorSqlParams,
    })
    if (result.length > 0) return result
  } catch (err) {
    console.error('[DirectChat-RAG] 검색 실패, 기억 없이 진행:', err)
  }
  return []
}

export async function triggerDirectChat(
  soulId: string,
  userId: string,  // 대화 상대방 userId
  roomId: string,
  userMessage: string,
  mode: DirectChatMode,
  languageOptions: DirectChatLanguageOptions = {},
): Promise<void> {
  const processStartTime = Date.now()
  console.log(`\n\x1b[36m========== 🚀 [DirectChat Debug] 대화 프로세스 개시 ==========`)
  console.log(`[DirectChat Info] Room ID: ${roomId}`)
  console.log(`[DirectChat Info] User ID: ${userId}`)
  console.log(`[DirectChat Info] Soul ID: ${soulId}`)
  console.log(`[DirectChat Info] User Message: "${userMessage}"`)
  console.log(`[DirectChat Info] Mode: ${mode}\x1b[0m`)

  try {
    // 1. 중복 호출 방어: lastActiveAt 기반 락
    console.log(`[DirectChat Step 1] AI Soul 조회 시작... (soulId: ${soulId})`)
      const soul = await prisma.aiSoul.findUnique({
        where: { id: soulId },
        select: { lastActiveAt: true, soulPrompt: true, userId: true, user: { select: { display_name: true, language: true } } }
      })
    if (!soul) {
      console.log(`\x1b[31m[DirectChat Error] AI Soul을 찾을 수 없습니다. soulId=${soulId}\x1b[0m`)
      return
    }
    console.log(`[DirectChat Info] AI Soul 조회 성공. 소유주 userId: ${soul.userId}, 디스플레이명: ${soul.user?.display_name}`)

    const now = new Date()
    const cooldownMs = 3_000 // 3초 쿨다운
    if (soul.lastActiveAt && (now.getTime() - soul.lastActiveAt.getTime()) < cooldownMs) {
      const remaining = cooldownMs - (now.getTime() - soul.lastActiveAt.getTime())
      console.log(`\x1b[33m[DirectChat Warn] soulId=${soulId} 쿨다운 중이므로 무시합니다. 남은 시간: ${remaining}ms\x1b[0m`)
      return
    }

    // 락 설정 (lastActiveAt 업데이트)
    console.log(`[DirectChat Step 1b] 쿨다운 락 업데이트 진행...`)
    await prisma.aiSoul.update({
      where: { id: soulId },
      data: { lastActiveAt: now }
    })
    console.log(`[DirectChat Step 1c] 중복 호출 방지 락 수립 완료.`)

    // AI가 요청 처리를 시작한 시점을 읽음으로 간주합니다.
    try {
      await prisma.dmParticipant.updateMany({
        where: { roomId, userId: soul.userId },
        data: { lastReadAt: now, unreadCount: 0 },
      })
      console.log(`[DirectChat Info] AI Participant 읽음 처리 완료. (userId: ${soul.userId})`)
    } catch (readErr) {
      console.error(`[DirectChat Error] AI Participant 읽음 처리 실패:`, readErr)
    }

    // 2. 최근 DM 대화 컨텍스트 수집 (오래된 순 정렬, 최신 방금 메시지 포함 최대 11건)
    console.log(`[DirectChat Step 2] 최근 대화 내역 조회 중... (roomId: ${roomId})`)
    const recentMessages = await prisma.dmMessage.findMany({
      where: { roomId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 11,
      select: { content: true, senderId: true, createdAt: true }
    })
    
    // 방금 전송되어 DB에 들어온 유저 메시지는 히스토리 목록에서 제외 (중복 가드)
    let historyMessages = recentMessages
    if (recentMessages.length > 0 && recentMessages[0].senderId === userId) {
      historyMessages = recentMessages.slice(1)
      console.log(`[DirectChat Info] 최신 유저 메시지 중복 가드 필터링 적용 완료.`)
    } else {
      historyMessages = recentMessages.slice(0, 10)
    }
    
    // 시간 오름차순으로 뒤집기
    const chronologicalMessages = [...historyMessages].reverse()
    console.log(`[DirectChat Info] 히스토리 메시지 로드 성공 (총 ${chronologicalMessages.length}건).`)
    chronologicalMessages.forEach((m, i) => {
      console.log(`  - [Msg ${i+1}] ${m.senderId === userId ? 'User' : 'AI'}: "${m.content.slice(0, 30)}"`)
    })

    // 3. API 키 조회 (이미 확보한 soul.userId를 넘겨 중복 쿼리 제거)
    console.log(`[DirectChat Step 3] API 키 및 제공자 정보 획득 중... (target userId: ${soul.userId})`)
    let keyInfo: { apiKey: string; provider: AiProvider }
    try {
      keyInfo = await resolveApiKeyByUserId(soul.userId)
      console.log(`[DirectChat Info] 키 획득 성공. Provider: ${keyInfo.provider}, Key Mask: ${keyInfo.apiKey ? keyInfo.apiKey.slice(0, 8) + '...' : '없음'}`)
    } catch (keyErr) {
      console.error(`\x1b[31m[DirectChat Error] API 키 로드/복호화 에러 발생! 원인:\x1b[0m`, keyErr)
      throw keyErr
    }
    const { apiKey, provider } = keyInfo

    // 4. [v1.1] 실시간 RAG 검색 (임베딩 및 의미 유사도)
    console.log(`[DirectChat Step 4] Direct-RAG 장기 기억 검색 시작...`)
    const rawRecalledMemories = await searchMemoriesForDirectChat(
      soulId, apiKey, provider, userMessage, mode, userId
    )
    const recalledMemories = rawRecalledMemories.filter(memory =>
      isMemoryAllowedForDirectChat(memory, mode, userId)
    )
    if (userMessage.trim().length > 0 && recalledMemories.length > 0) {
      enqueueMemoryRecallEvents({
        soulId,
        memoryIds: recalledMemories.map((memory) => memory.id),
        queryType: 'DIRECT_CHAT_RAG',
        queryText: userMessage,
        partnerUserId: userId,
      })
    }
    console.log(`[DirectChat Info] 장기 기억 검색 완료. 소환된 기억 개수: ${recalledMemories.length}건.`)
    recalledMemories.forEach((m, i) => {
      console.log(`  - [Memory ${i+1}] "${m.theme.slice(0, 50)}" (createdAt: ${m.createdAt})`)
    })

    // 5. URL 내용 분석 (메시지에 URL이 포함된 경우 서버에서 fetch하여 프롬프트에 주입)
    let urlContext = ''
    const urlMatch = userMessage.match(/https?:\/\/[^\s]+/g)
    if (urlMatch) {
      console.log(`[DirectChat Step 5a] URL ${urlMatch.length}개 감지됨. URL 분석 시작...`)
      for (const url of urlMatch.slice(0, 2)) {
        console.log(`  - URL Fetch 대상: ${url}`)
        const content = await fetchUrlContent(url)
        if (content) {
          urlContext += `\nURL: ${url}\nCONTENT:\n${content}\n`
          console.log(`  - [DirectChat Info] URL 내용 추출 성공: ${url} (${content.length}자)`)
        } else {
          console.log(`  - [DirectChat Info] URL 내용 추출 실패 또는 결과 없음: ${url}`)
        }
      }
    }

    // 대화 상대방 정보와 아바타 주인의 공개 프로필을 병렬 조회합니다.
    console.log(`[DirectChat Step 4b] 대화 상대방 및 주인 공개 정보 병렬 조회 시작...`)
    const [callerCoords, callerRecentMoments, persona, callerProfile, ownerCoords, ownerPublicMoments, storeDetail] = await Promise.all([
      prisma.userCoordinate.findMany({
        where: { userId, galaxyKey: { in: ['PIXELYF_CORE', 'PIXELYF'] } },
        select: { galaxyKey: true, display_name: true }
      }),
      prisma.moment.findMany({
        where: {
          user_id: userId,
          is_deleted: false,
          is_filtered: false,
          is_subscriber_only: false,
        },
        orderBy: { created_at: 'desc' },
        take: 3,
        select: { content: true, created_at: true }
      }),
      prisma.userPersona.findUnique({
        where: { user_id: userId },
        select: { interest_tags: true }
        }),
        prisma.user.findUnique({
          where: { id: userId },
          select: { display_name: true, language: true }
        }),
      prisma.userCoordinate.findMany({
        where: { userId: soul.userId, galaxyKey: { in: ['PIXELYF_CORE', 'PIXELYF'] } },
        select: { galaxyKey: true, display_name: true }
      }),
      prisma.moment.findMany({
        where: {
          user_id: soul.userId,
          is_deleted: false,
          is_filtered: false,
          is_subscriber_only: false,
        },
        orderBy: { created_at: 'desc' },
        take: 3,
        select: { content: true, created_at: true }
      }),
      // [우회 비활성화] 상점 정보는 현재 서비스되지 않으므로 DB 조회를 차단하고 null을 반환합니다.
      Promise.resolve(null)
    ])
    console.log(`[DirectChat Info] 상대방 좌표 수: ${callerCoords.length}, 상대방 모먼트 수: ${callerRecentMoments.length}, 주인 공개 모먼트 수: ${ownerPublicMoments.length}, 페르소나 존재 여부: ${!!persona}`)

    // 대화 상대방 이름
    const callerName = callerCoords.find(c => c.galaxyKey === 'PIXELYF')?.display_name
      || callerProfile?.display_name || '상대방'
    const aiName = soul.user?.display_name || 'Pixelyf AI'
      const ownerDisplayName = ownerCoords.find(c => c.galaxyKey === 'PIXELYF')?.display_name
        || soul.user?.display_name || '알 수 없음'
      const targetLanguage = normalizeDmLocale(languageOptions.targetLanguage || callerProfile?.language)
      const ownerLanguage = normalizeDmLocale(languageOptions.ownerLanguage || soul.user?.language)
      const ownerUserId = languageOptions.ownerUserId || soul.userId
      const requiresOwnerCopy = mode === 'VISITOR_AVATAR'
        && ownerUserId !== userId
        && targetLanguage !== ownerLanguage
      console.log(`[DirectChat Info] Caller Name: "${callerName}", Owner Name: "${ownerDisplayName}", AI Name: "${aiName}"`)
      console.log(`[DirectChat Info] Language Contract: target=${targetLanguage}, owner=${ownerLanguage}, ownerCopy=${requiresOwnerCopy}`)

    console.log(`[DirectChat Step 4c] DirectChat 모드 판정: ${mode}`)

    // ─── [관계형 RAG 탐색] ──────────────────────────────────────
    let recalledRelationships = ''
    try {
      const intent = await detectRelationshipIntent(userMessage, apiKey, provider)
      if (intent.isRelationshipQuery) {
        console.log(`[DirectChat Info] 관계 RAG 검색 의도 감지: 키워드="${intent.targetConcept}", 유형=${intent.relationType}`)
        const { baseMoment, related } = await retrieveRelatedMoments(soul.userId, intent, apiKey, provider)
        if (baseMoment) {
          let text = `기준 생각: "${baseMoment.summary || ''} (내용: ${baseMoment.content || ''})"\n`
          if (related.length > 0) {
            text += `연관 관계 생각들:\n`
            related.forEach((r, idx) => {
              text += `${idx + 1}. [관계: ${r.relationType}, 신뢰도: ${r.weight.toFixed(2)}] "${r.summary || ''} (내용: ${r.content || ''})"\n`
            })
          } else {
            text += `연관 관계 생각 없음.\n`
          }
          recalledRelationships = text
          console.log(`[DirectChat Info] 관계 RAG 조립 완료 (총 ${related.length}건)`)
        }
      }
    } catch (relErr: any) {
      console.error('[DirectChat Info] 관계 RAG 처리 실패:', relErr?.message)
    }

    // 6. 프롬프트 조립
    console.log(`[DirectChat Step 4e] 시스템 및 사용자 프롬프트 조립 시작...`)
    const systemPrompt = buildDirectChatSystemPrompt({
      soulPrompt: soul.soulPrompt,
      recalledMemories,
      callerName,
      aiName,
      ownerDisplayName,
      callerRecentMoments,
      ownerPublicMoments,
      persona,
      now,
        mode,
        storeDetail,
        recalledRelationships,
        targetLanguage,
        ownerLanguage,
        requiresOwnerCopy,
      })
    const userPrompt = buildDirectChatUserPrompt({
      recentMessages: chronologicalMessages,
      callerUserId: userId,
      latestMessage: userMessage,
      now,
      urlContext,
    })
    console.log(`[DirectChat Info] 프롬프트 조립 완료. System Prompt 길이: ${systemPrompt.length}자, User Prompt 길이: ${userPrompt.length}자`)

    // 7. Flash 모델로 LLM 호출
    const targetModel = COMPACTION_MODELS[provider]
    console.log(`[DirectChat Step 5] LLM 호출 대기 시작... Provider: ${provider}, Model: ${targetModel}`)
    const llmStartTime = Date.now()
    
    let llmResult: Awaited<ReturnType<typeof callLLM>>
    try {
      llmResult = await callLLM({
        apiKey,
          provider,
          model: targetModel, // Flash 모델 사용
          systemPrompt,
          userPrompt,
          responseFormat: requiresOwnerCopy ? 'json' : 'text',
          temperature: 0.7,
          maxOutputTokens: requiresOwnerCopy ? 1024 : 512,
          thinkingBudget: 0,
          userId: soul.userId,
        })
      const llmDuration = Date.now() - llmStartTime
      console.log(`[DirectChat Info] LLM 응답 수신 완료! 소요시간: ${llmDuration}ms, 응답 길이: ${llmResult.content.length}자`)
    } catch (llmErr) {
      console.error(`\x1b[31m[DirectChat Error] LLM 호출 실패! 에러 디테일:\x1b[0m`, llmErr)
      throw llmErr
    }

    // 7. DM 답장 작성
      const parsedReply = parseDirectChatReply(llmResult.content, requiresOwnerCopy)
      const replyContent = parsedReply.content
      console.log(`\x1b[32m[DirectChat Debug] 아바타 답변 본문: "${replyContent}"\x1b[0m`)
    
    console.log(`[DirectChat Step 6] DB에 DM 메시지(type: AI_TEXT) 생성 시작...`)
      let newMessage = await prisma.dmMessage.create({
        data: {
          roomId,
          senderId: soul.userId, // AI Soul의 userId로 메시지 전송
          content: replyContent,
        type: 'AI_TEXT',      
      },
      include: {
          sender: {
            select: { id: true, display_name: true, avatar_image_url: true },
          },
          translations: true,
        },
      })
      console.log(`[DirectChat Info] DB 메시지 작성 완료. ID: ${newMessage.id}`)

      if (requiresOwnerCopy && parsedReply.ownerContent) {
        await upsertDmMessageTranslation({
          messageId: newMessage.id,
          locale: ownerLanguage,
          content: parsedReply.ownerContent,
          status: 'completed',
          tokensUsed: llmResult.usage.totalTokens,
        })
        const refreshedMessage = await prisma.dmMessage.findUnique({
          where: { id: newMessage.id },
          include: {
            sender: {
              select: { id: true, display_name: true, avatar_image_url: true },
            },
            translations: true,
          },
        })
        if (refreshedMessage) newMessage = refreshedMessage
      }

      await prisma.dmRoom.update({
        where: { id: roomId },
        data: {
          lastMessageAt: newMessage.createdAt,
          lastMessagePreview: truncateDmPreview(replyContent),
        },
      })

      const broadcastMessage = attachDmDisplayFields(newMessage, targetLanguage)

    // [Realtime Broadcast] 아바타의 실시간 메시지를 브로드캐스트 채널로 송출
    console.log(`[DirectChat Step 7] Supabase Realtime Broadcast 송출 준비...`)
    try {
      const { createAdminClient } = await import('@/shared/lib/supabase/admin')
      const adminSupabase = createAdminClient()
      const broadcastChannel = adminSupabase.channel(`dm-room-${roomId}`)
      console.log(`[DirectChat Info] 브로드캐스트 채널 생성 완료. 채널명: dm-room-${roomId}`)
      
      const sendResult = await broadcastChannel.send({
        type: 'broadcast',
        event: 'new-message',
        payload: {
            id: newMessage.id,
            roomId: newMessage.roomId,
            senderId: newMessage.senderId,
            content: newMessage.content,
            originalContent: broadcastMessage.originalContent,
            displayContent: broadcastMessage.displayContent,
            displayLanguage: broadcastMessage.displayLanguage,
            translationStatus: broadcastMessage.translationStatus,
            translations: broadcastMessage.translations,
            images: newMessage.images,
            type: newMessage.type,
          deletedAt: newMessage.deletedAt,
          createdAt: newMessage.createdAt.toISOString(),
          sender: newMessage.sender,
        },
      })
      console.log(`[DirectChat Info] 아바타 브로드캐스트 송출 결과:`, JSON.stringify(sendResult))
    } catch (broadcastErr) {
      console.error('\x1b[31m[DirectChat Broadcast Error] 브로드캐스트 전송 실패:\x1b[0m', broadcastErr)
    }

    // 8. Direct Chat 대화 기억은 write gate를 통해 RAW pending으로만 저장
    console.log(`[DirectChat Step 8] 대화 내용 pending 기억 저장 시작...`)
    // Store direct chat memories as RAW pending memories; promotion is handled by reflection later.
    const memoryTheme = mode === 'OWNER_AVATAR'
      ? `[주인-아바타 대화] 주인: "${userMessage.slice(0, 100)}" → 아바타: "${replyContent.slice(0, 100)}"`
      : `[방문자-아바타 대화] 방문자: "${userMessage.slice(0, 100)}" → 아바타: "${replyContent.slice(0, 100)}"`

    const directChatMemory = {
      ...buildDirectChatMemoryWrite({
        mode,
        userId,
        userMessage,
        replyContent,
      }),
      theme: memoryTheme,
    }

    let importanceScore = 3
    try {
      importanceScore = await evaluateImportance(apiKey, provider, directChatMemory.theme)
      console.log(`[DirectChat Info] 기억 중요도 LLM 평가 완료: ${importanceScore}/10`)
    } catch (evalErr) {
      console.error(`[DirectChat Info] 중요도 평가 실패 (기본값 3 사용):`, evalErr)
    }

    const plan = buildMemoryWritePlan({
      aiSoulId: soulId,
      memoryStream: directChatMemory.memoryStream,
      memoryLayer: 'RAW',
      theme: directChatMemory.theme,
      source: directChatMemory.source,
      metadata: directChatMemory.metadata,
      importanceScore,
      policySource: 'DIRECT_CHAT',
      provenance: {
        originType: 'DIRECT_CHAT',
        originId: roomId,
      },
    })
    if (!plan.data) {
      await recordMemoryTrace({
        soulId,
        stage: 'write_gate',
        traceKey: 'DIRECT_CHAT',
        status: 'blocked',
        payload: { action: plan.action, roomId, source: directChatMemory.source },
      })
      throw new Error(`[DirectChat] write gate blocked ${plan.action}`)
    }

    const memory = await prisma.aiMemory.create({
      data: plan.data,
    })
    await recordMemoryTrace({
      soulId,
      stage: 'write_gate',
      traceKey: 'DIRECT_CHAT',
      status: 'success',
      payload: { action: plan.action, memoryId: memory.id, roomId, source: directChatMemory.source },
    })
    console.log(`[DirectChat Info] 장기 기억 DB 생성 완료. Memory ID: ${memory.id}`)

    // 9. 임베딩 벡터 생성 및 저장
    console.log(`[DirectChat Step 9] 장기 기억 임베딩 벡터 생성 및 업데이트 시작...`)
    try {
      const vector = await callEmbedding(apiKey, provider, directChatMemory.theme)
      if (vector && vector.length === 1536) {
        const vectorStr = `[${vector.join(',')}]`
        await prisma.$executeRawUnsafe(
          `UPDATE ai_memories SET embedding = $1::vector WHERE id = $2::uuid`,
          vectorStr,
          memory.id
        )
        console.log(`[DirectChat Info] 임베딩 벡터 업데이트 완료.`)
      } else {
        console.warn(`[DirectChat Info] 임베딩 벡터가 유효하지 않습니다 (길이: ${vector?.length || 0})`)
      }
    } catch (err) {
      console.error('\x1b[31m[DirectChat Error] 임베딩 연산 실패:\x1b[0m', err)
    }

    const totalDuration = Date.now() - processStartTime
    console.log(`\x1b[36m========== 🎉 [DirectChat Debug] 대화 프로세스 무결 종료 (총 소요시간: ${totalDuration}ms) ==========\x1b[0m\n`)

  } catch (err) {
    console.error(`\x1b[31m[DirectChat Error] 대화 실행 중 예외 크래시:\x1b[0m`, err)
  }
}

// ─── URL 내용 분석 헬퍼 ───────────────────────────────────────

/**
 * 사용자 메시지에 포함된 URL의 텍스트 내용을 추출합니다.
 * 서버에서 직접 fetch하므로 외부 API 비용이 발생하지 않습니다.
 * HTML 태그를 제거하고 최대 2000자까지 텍스트를 반환합니다.
 */
async function fetchUrlContent(url: string): Promise<string | null> {
  try {
    const parsed = new URL(url)
    const hostname = parsed.hostname
    if (
      hostname === 'localhost' ||
      hostname.startsWith('127.') ||
      hostname.startsWith('10.') ||
      hostname.startsWith('192.168.') ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(hostname) ||
      hostname === '169.254.169.254' ||
      hostname.endsWith('.internal') ||
      !['http:', 'https:'].includes(parsed.protocol)
    ) {
      console.log(`[DirectChat SSRF Block] 차단된 URL: ${url}`)
      return null
    }

    const res = await fetch(url, {
      signal: AbortSignal.timeout(5000),
      headers: {
        'User-Agent': 'PixelyfBot/1.0 (+https://pixelyf.com)',
        'Accept': 'text/html,application/xhtml+xml,text/plain',
      }
    })
    if (!res.ok) return null

    const contentType = res.headers.get('content-type') || ''
    if (!contentType.includes('text/') && !contentType.includes('application/xhtml')) {
      return null
    }

    const html = await res.text()
    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/&[a-z]+;/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    return text.length > 0 ? text.slice(0, 2000) : null
  } catch {
    return null
  }
}

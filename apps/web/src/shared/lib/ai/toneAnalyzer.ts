/**
 * [말투 자동 분석 서비스]
 * 주인의 모먼트 및 DM 메시지를 LLM으로 분석하여 말투 프로파일을 생성합니다.
 * 결과는 UserToneProfile 테이블에 저장되고, soulPrompt 재생성에 활용됩니다.
 *
 * 트리거:
 * - AI 온보딩 완료 직후 (비동기)
 * - 수동 호출 (관리 도구)
 *
 * 의존:
 * - llm.ts: callLLM (Flash 모델)
 * - compaction.ts: resolveApiKey
 * - soulEngine.ts: generateSoulPrompt
 */

import prisma from '@/shared/lib/prisma'
import { callLLM } from './llm'
import { resolveApiKey } from './compaction'
import { generateSoulPrompt, type SoulPromptData, type ToneProfile } from './soulEngine'

// ─── 분석 프롬프트 ────────────────────────────────────────────

const TONE_ANALYSIS_SYSTEM_PROMPT = `당신은 한국어 텍스트 분석 전문가입니다.
사용자가 작성한 글 모음을 분석하여 해당 사용자의 말투 패턴을 JSON으로 정확히 추출해주세요.

반드시 아래 JSON 형식으로만 응답하세요:
{
  "endingStyle": "~해체 / ~요체 / ~ㅋㅋ / 혼합 등",
  "avgSentenceLength": 숫자(평균 문장 길이, 글자 수),
  "emojiDensity": "none / low / moderate / high",
  "slangUsage": "none / low / moderate / high",
  "formalityLevel": 숫자(1~5, 1=매우 캐주얼, 5=매우 격식),
  "emotionalExpressiveness": "restrained / moderate / rich",
  "toneInstruction": "이 사용자의 말투를 복제할 때 특별히 주의할 점 (1~2문장)",
  "writingExamples": ["글 원문에서 가장 말투가 잘 드러나는 문장 2~3개"]
}`

const TONE_ANALYSIS_USER_PROMPT = (texts: string[]) => `
아래는 한 사용자가 실제로 작성한 글 모음입니다. 이 글들을 분석하여 사용자의 말투 패턴을 추출해주세요.

<user_writings>
${texts.map((t, i) => `${i + 1}. "${t}"`).join('\n')}
</user_writings>

위 글들을 분석하여 JSON으로 응답하세요.`

// ─── 메인 함수 ───────────────────────────────────────────────

/**
 * 주인의 글(모먼트/DM)을 분석하여 ToneProfile을 생성하고 DB에 저장합니다.
 * soulPrompt도 자동으로 재생성합니다.
 */
export async function analyzeToneProfile(userId: string): Promise<void> {
  console.log(`[ToneAnalyzer] 말투 분석 시작. userId=${userId}`)

  try {
    // 1. 분석 소스 수집: 모먼트 + DM 메시지
    const [moments, messages] = await Promise.all([
      prisma.moment.findMany({
        where: { user_id: userId, is_deleted: false, content: { not: null } },
        orderBy: { created_at: 'desc' },
        take: 10,
        select: { content: true },
      }),
      prisma.dmMessage.findMany({
        where: { senderId: userId, type: { not: 'AI_TEXT' }, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: { content: true },
      }),
    ])

    const texts = [
      ...moments.map((m) => m.content).filter(Boolean),
      ...messages.map((m) => m.content).filter(Boolean),
    ] as string[]

    if (texts.length < 3) {
      console.log(`[ToneAnalyzer] 분석 소스 부족 (${texts.length}건). 최소 3건 필요. 건너뜀.`)
      return
    }

    console.log(`[ToneAnalyzer] 분석 소스 ${texts.length}건 수집 완료.`)

    // 2. API 키 획득
    const soul = await prisma.aiSoul.findUnique({
      where: { userId },
      select: { id: true },
    })
    if (!soul) {
      console.log(`[ToneAnalyzer] AI Soul 미발견. 건너뜀.`)
      return
    }

    const { apiKey, provider } = await resolveApiKey(soul.id)

    // 3. LLM 호출 — Flash 모델로 말투 분석
    const { COMPACTION_MODELS } = await import('./modelSelector')
    const targetModel = COMPACTION_MODELS[provider]

    const result = await callLLM({
      apiKey,
      provider,
      model: targetModel,
      systemPrompt: TONE_ANALYSIS_SYSTEM_PROMPT,
      userPrompt: TONE_ANALYSIS_USER_PROMPT(texts.slice(0, 15)),
      responseFormat: 'json',
      temperature: 0.3,
      maxOutputTokens: 500,
      thinkingBudget: 0,
    })

    // 4. 응답 파싱
    let parsed: any
    try {
      parsed = JSON.parse(result.content)
    } catch {
      console.error(`[ToneAnalyzer] JSON 파싱 실패:`, result.content.slice(0, 200))
      return
    }

    // 5. DB 저장 (upsert)
    await prisma.userToneProfile.upsert({
      where: { user_id: userId },
      create: {
        user_id: userId,
        ending_style: parsed.endingStyle || '~해체',
        avg_sentence_length: parseInt(parsed.avgSentenceLength) || 20,
        emoji_density: parsed.emojiDensity || 'low',
        slang_usage: parsed.slangUsage || 'low',
        formality_level: parseInt(parsed.formalityLevel) || 2,
        emotional_expressiveness: parsed.emotionalExpressiveness || 'moderate',
        tone_instruction: parsed.toneInstruction || null,
        writing_examples: parsed.writingExamples || [],
        analyzed_at: new Date(),
      },
      update: {
        ending_style: parsed.endingStyle || '~해체',
        avg_sentence_length: parseInt(parsed.avgSentenceLength) || 20,
        emoji_density: parsed.emojiDensity || 'low',
        slang_usage: parsed.slangUsage || 'low',
        formality_level: parseInt(parsed.formalityLevel) || 2,
        emotional_expressiveness: parsed.emotionalExpressiveness || 'moderate',
        tone_instruction: parsed.toneInstruction || null,
        writing_examples: parsed.writingExamples || [],
        analyzed_at: new Date(),
      },
    })

    console.log(`[ToneAnalyzer] 말투 프로파일 DB 저장 완료.`)

    // 6. soulPrompt 재생성
    await regenerateSoulPrompt(userId)

    console.log(`[ToneAnalyzer] 말투 분석 + soulPrompt 재생성 완료!`)
  } catch (err) {
    console.error(`[ToneAnalyzer Error] 분석 실패:`, err)
  }
}

// ─── soulPrompt 재생성 헬퍼 ──────────────────────────────────

/**
 * 현재 DB 데이터를 기반으로 soulPrompt를 재생성하여 ai_souls에 업데이트합니다.
 */
export async function regenerateSoulPrompt(userId: string): Promise<void> {
  const [persona, toneProfile] = await Promise.all([
    prisma.userPersona.findUnique({
      where: { user_id: userId },
    }),
    prisma.userToneProfile.findUnique({
      where: { user_id: userId },
    }),
  ])

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { display_name: true },
  })

  if (!user || !persona) {
    console.log(`[ToneAnalyzer] 유저 또는 페르소나 없음. soulPrompt 재생성 건너뜀.`)
    return
  }

  // ToneProfile DB → soulEngine ToneProfile 타입 변환
  let toneData: ToneProfile | undefined
  if (toneProfile) {
    toneData = {
      endingStyle: toneProfile.ending_style,
      avgSentenceLength: toneProfile.avg_sentence_length,
      emojiDensity: toneProfile.emoji_density as ToneProfile['emojiDensity'],
      slangUsage: toneProfile.slang_usage as ToneProfile['slangUsage'],
      formalityLevel: toneProfile.formality_level,
      emotionalExpressiveness: toneProfile.emotional_expressiveness as ToneProfile['emotionalExpressiveness'],
      toneInstruction: toneProfile.tone_instruction,
      writingExamples: toneProfile.writing_examples,
    }
  }

  const soulData: SoulPromptData = {
    displayName: user.display_name,
    personaCode: persona.persona_code || 'STARTER',
    personaName: persona.persona_name || '탐험가',
    personaScores: {
      e_i: persona.score_e_i ?? 50,
      s_n: persona.score_s_n ?? 50,
      t_f: persona.score_t_f ?? 50,
      j_p: persona.score_j_p ?? 50,
      morning_night: persona.score_morning_night ?? 50,
      home_open: persona.score_home_open ?? 50,
      spend_save: persona.score_spend_save ?? 50,
      depth_broad: persona.score_depth_broad ?? 50,
      calm_vibrant: persona.score_calm_vibrant ?? 50,
      yolo_future: persona.score_yolo_future ?? 50,
    },
    occupation: persona.occupation || undefined,
    interestTags: persona.interest_tags?.length ? persona.interest_tags : undefined,
    lifeStage: persona.life_stage || undefined,
    toneProfile: toneData,
  }

  const newSoulPrompt = generateSoulPrompt(soulData)

  await prisma.aiSoul.updateMany({
    where: { userId },
    data: { soulPrompt: newSoulPrompt },
  })

  console.log(`[ToneAnalyzer] soulPrompt 재생성 완료. 길이: ${newSoulPrompt.length}자`)
}

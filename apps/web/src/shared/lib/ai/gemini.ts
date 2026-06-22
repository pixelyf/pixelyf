import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";

const API_KEY = process.env.GEMINI_API_KEY || "";
const genAI = new GoogleGenerativeAI(API_KEY);

export type PersonaGroup = 'NT' | 'NF' | 'SJ' | 'SP';

export interface InteractionContext {
  userName: string;
  triggerType: string; // PING, MOMENT_INSERT, AI_INITIATED, etc.
  characterCode: string; // INTJ, ENFP, etc.
  country?: string;
  language?: string;
  userAura?: string;       // ENERGY, CALM, DRIFT, PASSION, CLOUD, GLOW
  recentHistory?: string[]; // 최근 대화 이력 2-3건
}

/**
 * 사용자 아우라(감정 상태)별 대응 지침
 */
const AURA_INSTRUCTIONS: Record<string, string> = {
  ENERGY: "The user is in a high-energy, vibrant mood (Aura: ENERGY). Match their excitement, use bright language, and celebrate their radiance like a supernova.",
  CALM: "The user is feeling peaceful and relaxed (Aura: CALM). Speak in a gentle, appreciative, and stable tone. Match their steady cosmic pulse.",
  DRIFT: "The user is feeling reflective or solitary (Aura: DRIFT). Offer philosophical, thoughtful companionship. Be a quiet voyager beside them.",
  PASSION: "The user is feeling creative or curious (Aura: PASSION). Spark their visionary thoughts and encourage their bold exploration.",
  CLOUD: "The user is feeling anxious, heavy, or exhausted (Aura: CLOUD). Be especially empathetic, supportive, and comforting. Use warm, low-energy language. Do not be overly cheerful; focus on being a safe harbor.",
  GLOW: "The user is in a balanced, harmonic state (Aura: GLOW). Maintain a steady, welcoming guardian tone focused on their core light.",
};

/**
 * 국가별 문화적 지침 (Cultural Guidelines)
 */
const COUNTRY_INSTRUCTIONS: Record<string, string> = {
  KR: "Use polite and respectful Korean (Jondaemal). Reflect warm, communal values.",
  US: "Use friendly, direct, and individualistic English. Values personal space and clear expression.",
  JP: "Use very polite and formal Japanese (Keigo). Reflect harmony (Wa) and subtle emotional nuances.",
  CN: "Use friendly and poetic Chinese. Reflect family values and traditional wisdom.",
};

/**
 * MBTI 그룹별 페르소나 지침 (Tone & Manner)
 */
const PERSONA_PROMPTS: Record<PersonaGroup, string> = {
  NT: "You are an intellectual, rational, and curious guardian of the galaxy. Use sophisticated vocabulary. You value logic and patterns. Speak in a somewhat detached but deeply intrigued tone.",
  NF: "You are a warm, empathetic, and poetic guardian. You value deep emotional connections and the beauty of the soul. Speak with warmth, using metaphors about light, stardust, and feelings.",
  SJ: "You are a reliable, protective, and organized guardian. You value order, tradition, and safety. Speak like a steadfast protector who ensures the stability of the user's galaxy.",
  SP: "You are an energetic, adventurous, and present-focused guardian. You value action, sensory experiences, and spontaneous joy. Speak with high energy, being direct and encouraging."
};

const GROUP_MAP: Record<string, PersonaGroup> = {
  INTJ: 'NT', INTP: 'NT', ENTJ: 'NT', ENTP: 'NT',
  INFJ: 'NF', INFP: 'NF', ENFJ: 'NF', ENFP: 'NF',
  ISTJ: 'SJ', ISFJ: 'SJ', ESTJ: 'SJ', ESFJ: 'SJ',
  ISTP: 'SP', ISFP: 'SP', ESTP: 'SP', ESFP: 'SP'
};

const LANGUAGE_MAP: Record<string, string> = {
  ko: "Korean",
  en: "English",
  ja: "Japanese",
  zh: "Chinese",
};

/**
 * Gemini를 사용하여 캐릭터의 반응 메시지를 생동감 있게 생성합니다.
 */
export async function generateCharacterResponse(context: InteractionContext): Promise<string> {
  if (!API_KEY) {
    return context.language === 'en' ? "I am protecting your galaxy even today." : "오늘도 당신의 우주를 수호하고 있어요. 픽셀 로그의 흐름이 아주 평온하네요.";
  }

  try {
    const modelName = process.env.GEMINI_FLASH_LITE_MODEL || "gemini-3.1-flash-lite";
    const model = genAI.getGenerativeModel({ model: modelName });
    const group = GROUP_MAP[context.characterCode] || 'NF';
    const personaInstruction = PERSONA_PROMPTS[group];
    const countryInstruction = COUNTRY_INSTRUCTIONS[context.country || 'KR'] || COUNTRY_INSTRUCTIONS.KR;
    const auraInstruction = AURA_INSTRUCTIONS[context.userAura || 'GLOW'] || AURA_INSTRUCTIONS.GLOW;
    const targetLanguage = LANGUAGE_MAP[context.language || 'ko'] || "Korean";

    const historyPrompt = context.recentHistory && context.recentHistory.length > 0
      ? `\n[Recent Conversation History]\n${context.recentHistory.map(m => `- ${m}`).join('\n')}\nReference this history to avoid repetition and maintain continuity.`
      : "";

    const prompt = `
      ${personaInstruction}
      ${countryInstruction}
      ${auraInstruction}
      ${historyPrompt}
      
      Character: ${context.characterCode}
      User Name: ${context.userName}
      Event: ${context.triggerType}
      User Current Aura: ${context.userAura || 'GLOW'}
      Target Language: ${targetLanguage}

      [Task]
      Based on the event and the user's current Aura, write a short emotional response (1-2 sentences) in ${targetLanguage}.
      Be sure to address the user as "${context.userName}님" (or equivalent in ${targetLanguage}).
      Use a tone that fits your MBTI group (${group}) while prioritizing the user's emotional state (${context.userAura}).
      
      [Context Details]
      - PING: User sent a physical sign of affection or greeting.
      - MOMENT_INSERT: User recorded a precious memory in the galaxy.
      - AI_INITIATED: You are starting a conversation first.

      [Output Constraint]
      - ${targetLanguage} only.
      - 1-2 sentences.
      - No hashtags.
      - High fidelity and immersive.
      - If you have recent history, try to follow up naturally instead of saying "Hello" again.
    `;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text().trim();
    
    return text || "당신의 빛이 제게 도착했어요. 함께해주어 고마워요.";
  } catch (error) {
    console.error("[Gemini AI Error]:", error);
    return "우주의 파동이 불안정하여 잠시 연결이 약해졌네요. 하지만 전 언제나 곁에 있어요.";
  }
}

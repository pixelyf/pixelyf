import { AiProvider } from '../provider'

/**
 * AMGE v5 임베딩 유틸리티
 * 768차원 Matryoshka Representation 지원 (OpenAI text-embedding-3-small 기준)
 * 
 * @param apiKey 사용자의 API 키 (복호화된 상태)
 * @param provider 제공자 (현재 openai 전용)
 * @param text 임베딩할 텍스트
 * @returns 768차원 number 배열
 */
export async function generateEmbedding(
  apiKey: string,
  provider: AiProvider,
  text: string
): Promise<number[] | null> {
  if (!apiKey) return null

  try {
    // 현재 v5 아키텍처는 OpenAI의 text-embedding-3-small (768차원)을 표준으로 사용합니다.
    // 만약 사용자가 gemini 키만 제공했다면, gemini의 임베딩 모델(예: text-embedding-004)을 폴백으로 구현해야 합니다.
    // 여기서는 기본적으로 OpenAI 호환 API를 호출합니다.
    
    let apiUrl = 'https://api.openai.com/v1/embeddings'
    let headers: Record<string, string> = {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    }
    let body: any = {
      model: 'text-embedding-3-small',
      input: text,
      dimensions: 768, // 중요: Matryoshka 768차원 강제
    }

    if (provider === 'gemini') {
      // Gemini의 경우 REST API 구조가 다릅니다.
      // ⚠️ text-embedding-004는 2026-01-14 폐기됨 → gemini-embedding-001 사용
      const geminiKey = process.env.FREE_GEMINI_EMBEDDING_KEY || apiKey
      apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent`
      headers = {
        'Content-Type': 'application/json',
        'x-goog-api-key': geminiKey,
      }
      body = {
        content: { parts: [{ text }] },
        outputDimensionality: 768
      }
    }

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      console.error(`[Embedding Error] ${provider} 응답 실패:`, await response.text())
      return null
    }

    const data = await response.json()
    
    if (provider === 'gemini') {
      return data.embedding?.values ?? null
    } else {
      return data.data?.[0]?.embedding ?? null
    }
  } catch (error) {
    console.error('[Embedding Error] 네트워크/파싱 오류:', error)
    return null
  }
}

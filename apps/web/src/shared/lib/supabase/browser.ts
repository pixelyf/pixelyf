import { createBrowserClient } from '@supabase/ssr'
import { RealtimeClient } from '@supabase/realtime-js'

let supabaseBrowserClient: ReturnType<typeof createBrowserClient> | null = null

export function createClient() {
  // REST/Auth: 프록시 경유 (동일 도메인 → CORS 문제 없음)
  // 프로덕션: pixelyf.com/supabase → Next.js rewrites → Supabase REST
  // 로컬: localhost:3200/supabase → 개발환경은 NEXT_PUBLIC_SUPABASE_URL로 직접 연결 (next.config.ts 참고)
  const supabaseUrl = typeof window !== 'undefined'
    ? (process.env.NODE_ENV === 'development' ||
       window.location.hostname === 'localhost' ||
       window.location.hostname === '127.0.0.1'
      ? process.env.NEXT_PUBLIC_SUPABASE_URL!
      : window.location.origin + '/supabase')
    : process.env.NEXT_PUBLIC_SUPABASE_URL!

  if (typeof window !== 'undefined' && supabaseBrowserClient) {
    return supabaseBrowserClient
  }

  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

  const client = createBrowserClient(
    supabaseUrl,
    anonKey,
    {
      cookieOptions: {
        name: 'sb-pixelyf-auth',
        secure: true,
      },
    }
  )

  // ─────────────────────────────────────────────────────────────────────
  // Realtime(WebSocket) URL 분리
  //
  // 문제: Next.js rewrites는 WebSocket을 프록시할 수 없음
  //       → /supabase 프록시로는 Realtime 연결 불가
  //
  // 해법: SupabaseClient.realtime (public 프로퍼티)를 직접 URL의
  //       새 RealtimeClient 인스턴스로 교체
  //       → REST/Auth는 프록시, Realtime만 직접 연결
  //
  // Auth 연동: SupabaseClient._listenForAuthEvents()가
  //            this.realtime.setAuth(token)을 호출하며,
  //            이는 런타임에 교체된 인스턴스를 참조 (정상 동작)
  //
  // 참조: SupabaseClient.ts L75 (public realtime: RealtimeClient)
  //       SupabaseClient.ts L608-624 (_handleTokenChanged)
  // ─────────────────────────────────────────────────────────────────────
  if (typeof window !== 'undefined') {
    const directUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const wsUrl = directUrl.replace(/^http/i, 'ws') + '/realtime/v1'

    client.realtime = new RealtimeClient(wsUrl, {
      params: {
        apikey: anonKey,
        eventsPerSecond: 10,
      },
      heartbeatIntervalMs: 15000,
    })
  }

  if (typeof window !== 'undefined') {
    supabaseBrowserClient = client
  }

  return client
}

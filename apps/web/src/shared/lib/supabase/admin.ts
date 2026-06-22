/**
 * [Supabase Admin Client] cookies() 무의존 순수 SDK 클라이언트
 * 
 * ⚠️ 사용 용도: 비동기 백그라운드 작업 (fire-and-forget), 브로드캐스트 송출 등
 *    Next.js Request Scope 밖에서 Supabase에 접근해야 할 때 사용합니다.
 * 
 * ❌ Route Handler 내부에서 사용자 인증이 필요한 경우 → server.ts의 createClient() 사용
 * ✅ 비동기 백그라운드에서 브로드캐스트/DB 조작이 필요한 경우 → 이 createAdminClient() 사용
 */
import { createClient } from '@supabase/supabase-js'

let adminClient: ReturnType<typeof createClient> | null = null

export function createAdminClient() {
  // 싱글톤: 동일 프로세스 내에서 재사용하여 불필요한 인스턴스 생성 방지
  if (adminClient) return adminClient

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      '[createAdminClient] NEXT_PUBLIC_SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY 환경변수가 설정되지 않았습니다.'
    )
  }

  adminClient = createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })

  return adminClient
}

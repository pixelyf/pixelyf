-- ============================================================
-- Migration: Enable RLS on ALL public tables with proper policies
-- Date: 2026-06-24
-- Strategy:
--   1. Enable RLS on every table
--   2. Create appropriate SELECT/INSERT/UPDATE/DELETE policies
--   3. Public-facing tables: anon + authenticated SELECT
--   4. Private tables: authenticated only, scoped to own data
--   5. Prisma-only tables: RLS enabled, no policies (PostgREST blocked)
--
-- Role Reference:
--   anon          = 비로그인 사용자 (PostgREST)
--   authenticated = 로그인 사용자 (PostgREST, JWT 쿠키 기반)
--   service_role  = 서버 admin 클라이언트 (RLS 자동 우회)
--   Prisma        = 직접 PostgreSQL 연결 (RLS 미적용)
-- ============================================================

-- ╔══════════════════════════════════════════════════════════════╗
-- ║  SECTION 1: 공개 조회 테이블 (Galaxy Public Data)           ║
-- ║  anon + authenticated SELECT 허용                          ║
-- ╚══════════════════════════════════════════════════════════════╝

-- ── users ────────────────────────────────────────────────────
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view users" ON "users";
CREATE POLICY "Anyone can view users"
  ON "users" FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Users can insert own profile" ON "users";
CREATE POLICY "Users can insert own profile"
  ON "users" FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON "users";
CREATE POLICY "Users can update own profile"
  ON "users" FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can delete own profile" ON "users";
CREATE POLICY "Users can delete own profile"
  ON "users" FOR DELETE
  TO authenticated
  USING (auth.uid() = id);

-- ── user_coordinates ─────────────────────────────────────────
ALTER TABLE "user_coordinates" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view coordinates" ON "user_coordinates";
CREATE POLICY "Anyone can view coordinates"
  ON "user_coordinates" FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Users can insert own coordinates" ON "user_coordinates";
CREATE POLICY "Users can insert own coordinates"
  ON "user_coordinates" FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own coordinates" ON "user_coordinates";
CREATE POLICY "Users can update own coordinates"
  ON "user_coordinates" FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own coordinates" ON "user_coordinates";
CREATE POLICY "Users can delete own coordinates"
  ON "user_coordinates" FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- ── moments ──────────────────────────────────────────────────
ALTER TABLE "moments" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view moments" ON "moments";
CREATE POLICY "Anyone can view moments"
  ON "moments" FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Users can insert own moments" ON "moments";
CREATE POLICY "Users can insert own moments"
  ON "moments" FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own moments" ON "moments";
CREATE POLICY "Users can update own moments"
  ON "moments" FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own moments" ON "moments";
CREATE POLICY "Users can delete own moments"
  ON "moments" FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- ── constellation_bonds ──────────────────────────────────────
ALTER TABLE "constellation_bonds" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view bonds" ON "constellation_bonds";
CREATE POLICY "Anyone can view bonds"
  ON "constellation_bonds" FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Authenticated can create bonds" ON "constellation_bonds";
CREATE POLICY "Authenticated can create bonds"
  ON "constellation_bonds" FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_a_id OR auth.uid() = user_b_id);

DROP POLICY IF EXISTS "Bond members can update" ON "constellation_bonds";
CREATE POLICY "Bond members can update"
  ON "constellation_bonds" FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_a_id OR auth.uid() = user_b_id)
  WITH CHECK (auth.uid() = user_a_id OR auth.uid() = user_b_id);

DROP POLICY IF EXISTS "Bond members can delete" ON "constellation_bonds";
CREATE POLICY "Bond members can delete"
  ON "constellation_bonds" FOR DELETE
  TO authenticated
  USING (auth.uid() = user_a_id OR auth.uid() = user_b_id);

-- ── user_avatar_config ───────────────────────────────────────
ALTER TABLE "user_avatar_config" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view avatar config" ON "user_avatar_config";
CREATE POLICY "Anyone can view avatar config"
  ON "user_avatar_config" FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Users can insert own avatar config" ON "user_avatar_config";
CREATE POLICY "Users can insert own avatar config"
  ON "user_avatar_config" FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own avatar config" ON "user_avatar_config";
CREATE POLICY "Users can update own avatar config"
  ON "user_avatar_config" FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── store_details ────────────────────────────────────────────
ALTER TABLE "store_details" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view store details" ON "store_details";
CREATE POLICY "Anyone can view store details"
  ON "store_details" FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Users can insert own store details" ON "store_details";
CREATE POLICY "Users can insert own store details"
  ON "store_details" FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own store details" ON "store_details";
CREATE POLICY "Users can update own store details"
  ON "store_details" FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── galaxy_category_translations ─────────────────────────────
ALTER TABLE "galaxy_category_translations" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view galaxy category translations" ON "galaxy_category_translations";
CREATE POLICY "Anyone can view galaxy category translations"
  ON "galaxy_category_translations" FOR SELECT
  TO anon, authenticated
  USING (true);

-- ── moment_translations ──────────────────────────────────────
ALTER TABLE "moment_translations" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view moment translations" ON "moment_translations";
CREATE POLICY "Anyone can view moment translations"
  ON "moment_translations" FOR SELECT
  TO anon, authenticated
  USING (true);

-- ╔══════════════════════════════════════════════════════════════╗
-- ║  SECTION 2: 인증 사용자 테이블 (Authenticated Access)       ║
-- ║  authenticated SELECT + 자기 데이터 CUD                    ║
-- ╚══════════════════════════════════════════════════════════════╝

-- ── user_personas ────────────────────────────────────────────
ALTER TABLE "user_personas" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can view personas" ON "user_personas";
CREATE POLICY "Authenticated can view personas"
  ON "user_personas" FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Users can insert own persona" ON "user_personas";
CREATE POLICY "Users can insert own persona"
  ON "user_personas" FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own persona" ON "user_personas";
CREATE POLICY "Users can update own persona"
  ON "user_personas" FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── user_blocks ──────────────────────────────────────────────
ALTER TABLE "user_blocks" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own blocks" ON "user_blocks";
CREATE POLICY "Users can view own blocks"
  ON "user_blocks" FOR SELECT
  TO authenticated
  USING (auth.uid() = blocker_id);

DROP POLICY IF EXISTS "Users can create blocks" ON "user_blocks";
CREATE POLICY "Users can create blocks"
  ON "user_blocks" FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = blocker_id);

DROP POLICY IF EXISTS "Users can delete own blocks" ON "user_blocks";
CREATE POLICY "Users can delete own blocks"
  ON "user_blocks" FOR DELETE
  TO authenticated
  USING (auth.uid() = blocker_id);

-- ── user_inventory ───────────────────────────────────────────
ALTER TABLE "user_inventory" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own inventory" ON "user_inventory";
CREATE POLICY "Users can view own inventory"
  ON "user_inventory" FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own inventory" ON "user_inventory";
CREATE POLICY "Users can insert own inventory"
  ON "user_inventory" FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own inventory" ON "user_inventory";
CREATE POLICY "Users can update own inventory"
  ON "user_inventory" FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── user_reports ─────────────────────────────────────────────
ALTER TABLE "user_reports" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own reports" ON "user_reports";
CREATE POLICY "Users can view own reports"
  ON "user_reports" FOR SELECT
  TO authenticated
  USING (auth.uid() = reporter_id);

DROP POLICY IF EXISTS "Authenticated can create reports" ON "user_reports";
CREATE POLICY "Authenticated can create reports"
  ON "user_reports" FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = reporter_id);

-- ── user_statistics ──────────────────────────────────────────
ALTER TABLE "user_statistics" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own statistics" ON "user_statistics";
CREATE POLICY "Users can view own statistics"
  ON "user_statistics" FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own statistics" ON "user_statistics";
CREATE POLICY "Users can insert own statistics"
  ON "user_statistics" FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own statistics" ON "user_statistics";
CREATE POLICY "Users can update own statistics"
  ON "user_statistics" FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── user_ai_affinity ─────────────────────────────────────────
ALTER TABLE "user_ai_affinity" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own ai affinity" ON "user_ai_affinity";
CREATE POLICY "Users can view own ai affinity"
  ON "user_ai_affinity" FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own ai affinity" ON "user_ai_affinity";
CREATE POLICY "Users can insert own ai affinity"
  ON "user_ai_affinity" FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own ai affinity" ON "user_ai_affinity";
CREATE POLICY "Users can update own ai affinity"
  ON "user_ai_affinity" FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── user_mood_history ────────────────────────────────────────
ALTER TABLE "user_mood_history" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own mood history" ON "user_mood_history";
CREATE POLICY "Users can view own mood history"
  ON "user_mood_history" FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own mood history" ON "user_mood_history";
CREATE POLICY "Users can insert own mood history"
  ON "user_mood_history" FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- ── onboarding_answers ───────────────────────────────────────
ALTER TABLE "onboarding_answers" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own onboarding answers" ON "onboarding_answers";
CREATE POLICY "Users can view own onboarding answers"
  ON "onboarding_answers" FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own onboarding answers" ON "onboarding_answers";
CREATE POLICY "Users can insert own onboarding answers"
  ON "onboarding_answers" FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own onboarding answers" ON "onboarding_answers";
CREATE POLICY "Users can update own onboarding answers"
  ON "onboarding_answers" FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── moment_comments ──────────────────────────────────────────
ALTER TABLE "moment_comments" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can view comments" ON "moment_comments";
CREATE POLICY "Authenticated can view comments"
  ON "moment_comments" FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Authenticated can create comments" ON "moment_comments";
CREATE POLICY "Authenticated can create comments"
  ON "moment_comments" FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own comments" ON "moment_comments";
CREATE POLICY "Users can update own comments"
  ON "moment_comments" FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own comments" ON "moment_comments";
CREATE POLICY "Users can delete own comments"
  ON "moment_comments" FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- ── pings ────────────────────────────────────────────────────
ALTER TABLE "pings" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can view pings" ON "pings";
CREATE POLICY "Authenticated can view pings"
  ON "pings" FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Authenticated can create pings" ON "pings";
CREATE POLICY "Authenticated can create pings"
  ON "pings" FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = sender_id);

DROP POLICY IF EXISTS "Sender can update own pings" ON "pings";
CREATE POLICY "Sender can update own pings"
  ON "pings" FOR UPDATE
  TO authenticated
  USING (auth.uid() = sender_id)
  WITH CHECK (auth.uid() = sender_id);

-- ── touches ──────────────────────────────────────────────────
ALTER TABLE "touches" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can view touches" ON "touches";
CREATE POLICY "Authenticated can view touches"
  ON "touches" FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Authenticated can create touches" ON "touches";
CREATE POLICY "Authenticated can create touches"
  ON "touches" FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = toucher_id);

-- ── pixel_visit_logs ─────────────────────────────────────────
ALTER TABLE "pixel_visit_logs" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own visit logs" ON "pixel_visit_logs";
CREATE POLICY "Users can view own visit logs"
  ON "pixel_visit_logs" FOR SELECT
  TO authenticated
  USING (auth.uid() = visitor_id);

DROP POLICY IF EXISTS "Authenticated can create visit logs" ON "pixel_visit_logs";
CREATE POLICY "Authenticated can create visit logs"
  ON "pixel_visit_logs" FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = visitor_id);

-- ── notifications ────────────────────────────────────────────
ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own notifications" ON "notifications";
CREATE POLICY "Users can view own notifications"
  ON "notifications" FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own notifications" ON "notifications";
CREATE POLICY "Users can insert own notifications"
  ON "notifications" FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own notifications" ON "notifications";
CREATE POLICY "Users can update own notifications"
  ON "notifications" FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── weekly_diaries ───────────────────────────────────────────
ALTER TABLE "weekly_diaries" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own diaries" ON "weekly_diaries";
CREATE POLICY "Users can view own diaries"
  ON "weekly_diaries" FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own diaries" ON "weekly_diaries";
CREATE POLICY "Users can insert own diaries"
  ON "weekly_diaries" FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own diaries" ON "weekly_diaries";
CREATE POLICY "Users can update own diaries"
  ON "weekly_diaries" FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── stardust_transactions ────────────────────────────────────
ALTER TABLE "stardust_transactions" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own transactions" ON "stardust_transactions";
CREATE POLICY "Users can view own transactions"
  ON "stardust_transactions" FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own transactions" ON "stardust_transactions";
CREATE POLICY "Users can insert own transactions"
  ON "stardust_transactions" FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- ── thought_subscriptions ────────────────────────────────────
ALTER TABLE "thought_subscriptions" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own subscriptions" ON "thought_subscriptions";
CREATE POLICY "Users can view own subscriptions"
  ON "thought_subscriptions" FOR SELECT
  TO authenticated
  USING (auth.uid() = subscriber_id);

DROP POLICY IF EXISTS "Users can insert own subscriptions" ON "thought_subscriptions";
CREATE POLICY "Users can insert own subscriptions"
  ON "thought_subscriptions" FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = subscriber_id);

DROP POLICY IF EXISTS "Users can delete own subscriptions" ON "thought_subscriptions";
CREATE POLICY "Users can delete own subscriptions"
  ON "thought_subscriptions" FOR DELETE
  TO authenticated
  USING (auth.uid() = subscriber_id);

-- ── items ────────────────────────────────────────────────────
ALTER TABLE "items" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can view items" ON "items";
CREATE POLICY "Authenticated can view items"
  ON "items" FOR SELECT
  TO authenticated
  USING (true);

-- ── coordinate_history ───────────────────────────────────────
ALTER TABLE "coordinate_history" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own coordinate history" ON "coordinate_history";
CREATE POLICY "Users can view own coordinate history"
  ON "coordinate_history" FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own coordinate history" ON "coordinate_history";
CREATE POLICY "Users can insert own coordinate history"
  ON "coordinate_history" FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- ╔══════════════════════════════════════════════════════════════╗
-- ║  SECTION 3: Prisma 전용 테이블 (RLS Only, No Policies)      ║
-- ║  PostgREST 접근 차단, Prisma(직접 DB 연결)는 영향 없음       ║
-- ╚══════════════════════════════════════════════════════════════╝

-- ── 갤럭시 & 네뷸라 ──────────────────────────────────────────
ALTER TABLE "galaxies"               ENABLE ROW LEVEL SECURITY;
ALTER TABLE "galaxy_categories"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "nebulae"                ENABLE ROW LEVEL SECURITY;
ALTER TABLE "nebula_members"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cosmic_weather_logs"    ENABLE ROW LEVEL SECURITY;

-- ── DM ───────────────────────────────────────────────────────
ALTER TABLE "dm_rooms"               ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dm_participants"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dm_messages"            ENABLE ROW LEVEL SECURITY;

-- ── AI 소울 & 메모리 ─────────────────────────────────────────
ALTER TABLE "ai_souls"               ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ai_memories"            ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ai_conversations"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ai_interactions"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ai_reflection_logs"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ai_whispers"            ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ai_galaxy_views"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ai_moments"             ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ai_provider_keys"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ai_pings"               ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ai_touches"             ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ai_soul_bonds"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ai_life_threads"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ai_need_states"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ai_memory_traces"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ai_memory_eval_logs"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ai_memory_recall_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ai_memory_derivations"  ENABLE ROW LEVEL SECURITY;

-- ── 아바타 그래프 ─────────────────────────────────────────────
ALTER TABLE "avatar_nodes"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE "avatar_edges"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE "heartbeat_logs"         ENABLE ROW LEVEL SECURITY;

-- ── 관리자 ───────────────────────────────────────────────────
ALTER TABLE "admin_profiles"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "admin_audit_logs"       ENABLE ROW LEVEL SECURITY;

-- ── K-Connect / 문화가치 ──────────────────────────────────────
ALTER TABLE "cultural_value_profiles"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "value_link_connections"   ENABLE ROW LEVEL SECURITY;

-- ── 미평탄화/추가 보안 관리 대상 (RLS 활성화, PostgREST 접근 완전 차단) ──
ALTER TABLE "user_tone_profiles"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_profile_translations"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "moment_comment_translations"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "moment_relationships"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "_prisma_migrations"           ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- VERIFICATION NOTES:
--
-- 1. service_role 키를 사용하는 admin.ts는 RLS를 자동 우회합니다.
-- 2. Prisma ORM은 직접 PostgreSQL 연결이므로 RLS에 영향받지 않습니다.
-- 3. server.ts (createServerClient + anon_key + cookies)는
--    authenticated 역할로 동작하며, 위 Policy에 의해 접근이 제어됩니다.
-- 4. browser.ts (createBrowserClient + anon_key)는
--    로그인 시 authenticated, 비로그인 시 anon 역할로 동작합니다.
-- ============================================================

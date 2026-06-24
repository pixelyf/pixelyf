-- ============================================================
-- Migration: Enable RLS on all public tables
-- Date: 2026-06-24
-- Reason: Supabase security advisor warning - RLS not enabled
-- Strategy: Enable RLS + allow service_role bypass (server-side API only)
--           Block anon/authenticated direct PostgREST access
-- ============================================================

-- ── 사용자 & 프로필 ──────────────────────────────────────────
ALTER TABLE "users"                ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_coordinates"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_personas"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_avatar_config"   ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_blocks"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_inventory"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_reports"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_statistics"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_ai_affinity"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_mood_history"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "onboarding_answers"   ENABLE ROW LEVEL SECURITY;

-- ── 피드 & 소셜 ──────────────────────────────────────────────
ALTER TABLE "moments"              ENABLE ROW LEVEL SECURITY;
ALTER TABLE "moment_comments"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pings"                ENABLE ROW LEVEL SECURITY;
ALTER TABLE "touches"              ENABLE ROW LEVEL SECURITY;
ALTER TABLE "constellation_bonds"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pixel_visit_logs"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notifications"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "weekly_diaries"       ENABLE ROW LEVEL SECURITY;

-- ── 구독 & 경제 ──────────────────────────────────────────────
ALTER TABLE "stardust_transactions"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "thought_subscriptions"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "items"                  ENABLE ROW LEVEL SECURITY;

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
ALTER TABLE "coordinate_history"     ENABLE ROW LEVEL SECURITY;

-- ── 관리자 ───────────────────────────────────────────────────
ALTER TABLE "admin_profiles"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "admin_audit_logs"       ENABLE ROW LEVEL SECURITY;

-- ── K-Connect / 문화가치 ──────────────────────────────────────
ALTER TABLE "cultural_value_profiles"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "value_link_connections"   ENABLE ROW LEVEL SECURITY;
ALTER TABLE "store_details"            ENABLE ROW LEVEL SECURITY;
ALTER TABLE "galaxy_category_translations" ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- NOTE: service_role은 RLS를 자동 우회합니다.
-- 이 프로젝트의 모든 DB 접근은 Next.js API Routes에서
-- SUPABASE_SERVICE_ROLE_KEY를 통해 이루어지므로
-- 별도 policy 없이도 서버 기능은 완전 정상 동작합니다.
-- anon/authenticated key로의 직접 PostgREST 접근은 차단됩니다.
-- ============================================================

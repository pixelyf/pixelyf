-- [K-Connect v4.0] 카테고리 시스템 마이그레이션
-- 적용 범위:
--   1. moments 테이블: content_category, content_tags 컬럼 추가
--   2. cultural_value_profiles 테이블: 5축 벡터 제거 → 8대 카테고리 관심사로 재구성
--   3. cultural_contexts 테이블: 삭제 (Culture Bridge AI 삭제 확정)
--   4. value_link_connections 테이블: cultural_bridge 제거, shared_categories 추가

-- ──────────────────────────────────────────────────────────
-- 1. moments 테이블: K-Connect 카테고리 + 태그 컬럼 추가
-- ──────────────────────────────────────────────────────────

ALTER TABLE "moments"
  ADD COLUMN IF NOT EXISTS "content_category" TEXT,
  ADD COLUMN IF NOT EXISTS "content_tags"     TEXT[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS "idx_moments_content_category"
  ON "moments" ("content_category")
  WHERE "content_category" IS NOT NULL;

-- ──────────────────────────────────────────────────────────
-- 2. cultural_value_profiles 테이블: v3.0 → v4.0 재구성
-- ──────────────────────────────────────────────────────────

-- [새 테이블 생성 지원] shadow database용 테이블 생성
CREATE TABLE IF NOT EXISTS "cultural_value_profiles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "primary_category" TEXT,
    "interest_categories" TEXT[] NOT NULL DEFAULT '{}',
    "interest_tags" TEXT[] NOT NULL DEFAULT '{}',
    "korean_lang_level" TEXT,
    "korean_exp_level" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cultural_value_profiles_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "cultural_value_profiles_user_id_key" ON "cultural_value_profiles"("user_id");
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cultural_value_profiles_user_id_fkey') THEN
    ALTER TABLE "cultural_value_profiles" ADD CONSTRAINT "cultural_value_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;
END $$;

-- 2-1. v3.0 5축 벡터 컬럼 제거
ALTER TABLE "cultural_value_profiles"
  DROP COLUMN IF EXISTS "collectivism",
  DROP COLUMN IF EXISTS "hierarchical",
  DROP COLUMN IF EXISTS "tradition",
  DROP COLUMN IF EXISTS "visible",
  DROP COLUMN IF EXISTS "present";

-- 2-2. v4.0 8대 카테고리 관심사 컬럼 추가
ALTER TABLE "cultural_value_profiles"
  ADD COLUMN IF NOT EXISTS "primary_category"     TEXT,
  ADD COLUMN IF NOT EXISTS "interest_categories"  TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "interest_tags"        TEXT[] NOT NULL DEFAULT '{}';

-- 주석: interest_tags가 이미 있으면 DEFAULT를 추가
DO $$
BEGIN
  -- interest_tags가 없을 때만 추가 (이미 있으면 ALTER TABLE ADD COLUMN IF NOT EXISTS가 처리)
  NULL;
END $$;

-- ──────────────────────────────────────────────────────────
-- 3. cultural_contexts 테이블: 삭제
--    (Culture Bridge AI 삭제 확정 — 번역 댓글 시스템으로 대체)
-- ──────────────────────────────────────────────────────────

-- moments 테이블의 culturalContext 관계는 이미 schema에서 제거됨
DROP TABLE IF EXISTS "cultural_contexts" CASCADE;

-- ──────────────────────────────────────────────────────────
-- 4. value_link_connections 테이블: cultural_bridge 제거, shared_categories 추가
-- ──────────────────────────────────────────────────────────

-- [새 테이블 생성 지원] shadow database용 테이블 생성
CREATE TABLE IF NOT EXISTS "value_link_connections" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_a_id" UUID NOT NULL,
    "user_b_id" UUID NOT NULL,
    "match_score" SMALLINT NOT NULL,
    "match_reasons" TEXT[] NOT NULL DEFAULT '{}',
    "shared_categories" TEXT[] NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "value_link_connections_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "value_link_connections_user_a_id_user_b_id_key" ON "value_link_connections"("user_a_id", "user_b_id");
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'value_link_connections_user_a_id_fkey') THEN
    ALTER TABLE "value_link_connections" ADD CONSTRAINT "value_link_connections_user_a_id_fkey" FOREIGN KEY ("user_a_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'value_link_connections_user_b_id_fkey') THEN
    ALTER TABLE "value_link_connections" ADD CONSTRAINT "value_link_connections_user_b_id_fkey" FOREIGN KEY ("user_b_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;
END $$;

ALTER TABLE "value_link_connections"
  DROP COLUMN IF EXISTS "cultural_bridge",
  ADD  COLUMN IF NOT EXISTS "shared_categories" TEXT[] NOT NULL DEFAULT '{}';

-- Whisper 시스템 테이블
CREATE TABLE IF NOT EXISTS "ai_whispers" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "soul_id" UUID NOT NULL,
  "target_moment_id" UUID,
  "target_soul_id" UUID,
  "whisper_type" TEXT NOT NULL,
  "content" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  CONSTRAINT "ai_whispers_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ai_whispers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
  CONSTRAINT "ai_whispers_soul_id_fkey" FOREIGN KEY ("soul_id") REFERENCES "ai_souls"("id") ON DELETE CASCADE,
  CONSTRAINT "ai_whispers_target_moment_id_fkey" FOREIGN KEY ("target_moment_id") REFERENCES "ai_moments"("id") ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS "ai_whispers_soul_id_created_at_idx" ON "ai_whispers" ("soul_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "ai_whispers_user_id_idx" ON "ai_whispers" ("user_id");

-- Galaxy Views 테이블
CREATE TABLE IF NOT EXISTS "ai_galaxy_views" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "ai_moment_id" UUID NOT NULL,
  "view_duration_ms" INTEGER NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  CONSTRAINT "ai_galaxy_views_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ai_galaxy_views_user_id_created_at_idx" ON "ai_galaxy_views" ("user_id", "created_at" DESC);

-- 생각 상태(Mood) 일별 히스토리 테이블 생성
-- 하루 1건, Daily Upsert (같은 날 = UPDATE, 새 날 = INSERT)

CREATE TABLE IF NOT EXISTS "user_mood_history" (
  "id"            UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id"       UUID NOT NULL,
  "mood_id"       VARCHAR(20) NOT NULL,
  "aura"          VARCHAR(20) NOT NULL,
  "recorded_date" DATE NOT NULL,
  "created_at"    TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  "updated_at"    TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),

  CONSTRAINT "user_mood_history_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "user_mood_history_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
);

-- 하루 1건 보장 (핵심 제약)
CREATE UNIQUE INDEX IF NOT EXISTS "uq_mood_history_user_date"
  ON "user_mood_history" ("user_id", "recorded_date");

-- 시계열 조회 최적화
CREATE INDEX IF NOT EXISTS "idx_mood_history_timeline"
  ON "user_mood_history" ("user_id", "recorded_date" DESC);

-- RLS 활성화 (Supabase 보안)
ALTER TABLE "user_mood_history" ENABLE ROW LEVEL SECURITY;

-- 본인만 조회/수정 가능
CREATE POLICY "user_mood_history_select_own" ON "user_mood_history"
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "user_mood_history_insert_own" ON "user_mood_history"
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_mood_history_update_own" ON "user_mood_history"
  FOR UPDATE USING (auth.uid() = user_id);

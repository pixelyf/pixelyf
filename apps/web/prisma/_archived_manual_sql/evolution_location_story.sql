-- ═══════════════════════════════════════════════════════════════════════════
-- 진화/위치이동 고도화 마이그레이션
-- 실행 대상: Supabase SQL Editor (프로덕션)
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. user_coordinates에 rank 컬럼 추가
ALTER TABLE user_coordinates ADD COLUMN IF NOT EXISTS rank INTEGER;

-- 2. coordinate_history 테이블 생성
CREATE TABLE IF NOT EXISTS coordinate_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  galaxy_key TEXT,
  coord_x DOUBLE PRECISION NOT NULL,
  coord_y DOUBLE PRECISION NOT NULL,
  z_depth REAL DEFAULT 1.0,
  rank INTEGER NOT NULL,
  zone INTEGER NOT NULL,
  activity_score BIGINT NOT NULL,
  snapshot_date DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, galaxy_key, snapshot_date)
);

-- 3. 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_coord_history_user_date 
  ON coordinate_history(user_id, snapshot_date DESC);

CREATE INDEX IF NOT EXISTS idx_coord_history_date 
  ON coordinate_history(snapshot_date);

-- 4. RLS 정책 (인증된 유저만 자기 데이터 읽기 가능)
ALTER TABLE coordinate_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own coordinate history"
  ON coordinate_history
  FOR SELECT
  USING (auth.uid() = user_id);

-- 5. 90일 이상 오래된 히스토리 자동 삭제를 위한 함수 (주간 배치에서 호출)
CREATE OR REPLACE FUNCTION cleanup_old_coordinate_history()
RETURNS void AS $$
BEGIN
  DELETE FROM coordinate_history
  WHERE snapshot_date < CURRENT_DATE - INTERVAL '90 days';
END;
$$ LANGUAGE plpgsql;

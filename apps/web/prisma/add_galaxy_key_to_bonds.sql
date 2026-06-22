-- ============================================================
-- [GALAXY INDEPENDENT] constellation_bonds에 galaxy_key 추가
-- 은하를 초월한 별자리 연결 불가 — 같은 은하 내에서만 연결
-- ============================================================

-- 1. galaxy_key 컬럼 추가 (nullable — 기존 데이터 보호)
ALTER TABLE constellation_bonds
  ADD COLUMN IF NOT EXISTS galaxy_key TEXT;

-- 2. 기존 데이터: 기존 연결을 'PIXELYF'(원래 은하)로 backfill
--    → 신규 연결부터 galaxy_key 필수화 (NULL은 레거시 bonds)
UPDATE constellation_bonds
  SET galaxy_key = 'PIXELYF'
  WHERE galaxy_key IS NULL;

-- 3. 기존 unique 제약 제거
ALTER TABLE constellation_bonds
  DROP CONSTRAINT IF EXISTS uq_constellation_bonds_a_b;

-- 4. 새로운 unique 제약 추가 (user_a + user_b + galaxy_key)
ALTER TABLE constellation_bonds
  ADD CONSTRAINT uq_constellation_bonds_a_b_galaxy
  UNIQUE (user_a_id, user_b_id, galaxy_key);

-- 5. galaxy_key 인덱스 추가
CREATE INDEX IF NOT EXISTS idx_constellation_bonds_galaxy_key
  ON constellation_bonds (galaxy_key);

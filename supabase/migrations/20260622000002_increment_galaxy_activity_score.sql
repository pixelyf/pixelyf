-- ============================================================
-- Pixelyf Multiverse Evolution: increment_galaxy_activity_score RPC
-- 은하별 독립 진화 점수 증분 함수 (JSONB 기반)
-- 예: galaxy_activity_scores = {"INQUE": 15, "UNLEARN": 2}
-- ============================================================

CREATE OR REPLACE FUNCTION increment_galaxy_activity_score(
  user_id_param UUID,
  galaxy_key_param TEXT,
  amount INTEGER
)
RETURNS VOID AS $$
BEGIN
  UPDATE users
  SET galaxy_activity_scores = COALESCE(galaxy_activity_scores, '{}'::jsonb)
    || jsonb_build_object(
         galaxy_key_param,
         COALESCE((galaxy_activity_scores->>galaxy_key_param)::int, 0) + amount
       )
  WHERE id = user_id_param;
END;
$$ LANGUAGE plpgsql;

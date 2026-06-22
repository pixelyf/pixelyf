-- ============================================================
-- Pixelyf Evolution System: increment_activity_score RPC
-- 기존 increment_glow_score와 동일한 패턴의 경량 증분 함수
-- ============================================================

CREATE OR REPLACE FUNCTION increment_activity_score(
  user_id_param UUID,
  amount INTEGER
)
RETURNS VOID AS $$
BEGIN
  UPDATE users 
  SET activity_score = activity_score + amount
  WHERE id = user_id_param;
END;
$$ LANGUAGE plpgsql;

-- Migration: Add Activity Score Triggers (Glow Score)
-- Description: Automatically increments users.glow_score when interacting (Moments, Pings)

-- 1. 트리거 함수: 모먼트 작성 시 점수 부여 (+10점)
CREATE OR REPLACE FUNCTION handle_moment_activity()
RETURNS TRIGGER AS $$
BEGIN
  -- 새 모먼트가 등록될 때 작성자의 glow_score를 10점 증가
  UPDATE users 
  SET glow_score = glow_score + 10,
      updated_at = NOW()
  WHERE id = NEW.user_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. 트리거 등록: moments 테이블 INSERT 감지
DROP TRIGGER IF EXISTS trigger_moment_activity ON moments;
CREATE TRIGGER trigger_moment_activity
  AFTER INSERT ON moments
  FOR EACH ROW
  EXECUTE FUNCTION handle_moment_activity();


-- 3. 트리거 함수: 핑 발신(+2점) 및 수신(+5점) 시 점수 부여
CREATE OR REPLACE FUNCTION handle_ping_activity()
RETURNS TRIGGER AS $$
BEGIN
  -- 핑 발신자 점수 증가 (+2)
  UPDATE users 
  SET glow_score = glow_score + 2,
      updated_at = NOW()
  WHERE id = NEW.sender_id;

  -- 핑 수신자 점수 증가 (+5)
  UPDATE users 
  SET glow_score = glow_score + 5,
      updated_at = NOW()
  WHERE id = NEW.receiver_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. 트리거 등록: pings 테이블 INSERT 감지
DROP TRIGGER IF EXISTS trigger_ping_activity ON pings;
CREATE TRIGGER trigger_ping_activity
  AFTER INSERT ON pings
  FOR EACH ROW
  EXECUTE FUNCTION handle_ping_activity();

-- 5. 일일 감가상각 및 레벨 판별 함수 (Cron으로 매일 자정 실행용)
CREATE OR REPLACE FUNCTION process_daily_glow_decay()
RETURNS void AS $$
BEGIN
  -- 하루가 지나면 활동 점수의 5% 감가 상각 (최소 0점)
  UPDATE users
  SET glow_score = GREATEST(0, (glow_score * 0.95)::bigint);
  
  -- 글로우 레벨 계산 로직 (예: 점수가 100점 단위로 레벨 1 증가)
  UPDATE users
  SET glow_level = GREATEST(1, LEAST(100, 1 + (glow_score / 100)::int));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

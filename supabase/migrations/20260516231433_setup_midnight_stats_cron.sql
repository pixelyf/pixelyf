-- ==============================================================================
-- Migration: Setup Midnight Statistics Reset Cron Job
-- Description:
-- 1. Enables pg_cron extension.
-- 2. Creates `reset_daily_statistics()` function to rollover user_statistics, 
--    reset ai_souls daily counts, and decay activity_score.
-- 3. Schedules the reset job to run daily at KST midnight (UTC 15:00).
-- 4. Schedules a cron log cleanup job to keep cron.job_run_details lean.
-- 5. Drops the legacy `process_daily_glow_decay()` function.
-- ==============================================================================

-- 1. pg_cron 익스텐션 활성화
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 2. 통합 리셋 함수 생성
CREATE OR REPLACE FUNCTION reset_daily_statistics()
RETURNS void AS $$
BEGIN
  -- 2.1 user_statistics 롤오버 (어제 방문자 수를 오늘 방문자 수로 덮어쓰고, 오늘을 0으로)
  UPDATE user_statistics
  SET yesterday_visits = today_visits,
      today_visits = 0;

  -- 2.2 ai_souls 일일 활동 카운터 초기화
  UPDATE ai_souls
  SET daily_action_count = 0;

  -- 2.3 activity_score 감가상각 (매일 5% 삭감 -> 지수 감쇠 모델 반감기 약 13.5일)
  UPDATE users
  SET activity_score = GREATEST(0, (activity_score * 0.95)::bigint);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. 기존 스케줄이 있다면 제거 (멱등성 보장)
DO $$
BEGIN
  -- cron.unschedule returns boolean, so we can just call it via PERFORM
  PERFORM cron.unschedule('daily-statistics-reset');
  PERFORM cron.unschedule('purge-cron-history');
EXCEPTION
  WHEN OTHERS THEN
    -- cron.unschedule is not available yet if pg_cron was just installed or fails
    NULL;
END $$;

-- 4. 크론 스케줄 등록
-- 4.1 매일 KST 자정(UTC 15:00)에 통계 리셋 실행
SELECT cron.schedule(
  'daily-statistics-reset',
  '0 15 * * *', 
  $$SELECT reset_daily_statistics()$$
);

-- 4.2 매일 KST 09:00(UTC 00:00)에 7일 경과된 cron 로그 자동 삭제 (비대화 방지)
SELECT cron.schedule(
  'purge-cron-history',
  '0 0 * * *',
  $$DELETE FROM cron.job_run_details WHERE end_time < NOW() - INTERVAL '7 days'$$
);

-- 5. 레거시 감가상각 함수 제거 (activity_score_triggers 에 있던 구버전)
DROP FUNCTION IF EXISTS process_daily_glow_decay();

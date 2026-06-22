-- ══════════════════════════════════════════════════════════════
-- Phase 2: DM 보안 강화 — Row Level Security (RLS) 적용
-- 설계 출처: docs/2_DM_기능_설계/2_Phase2_RLS_보안_강화_설계서.md
-- 적용일: 2026-05-10
-- ══════════════════════════════════════════════════════════════
-- 
-- 목적:
-- 1. Supabase Realtime(WebSocket) 구독 시, 참여자가 아닌 유저가
--    roomId를 변조하여 남의 채팅을 엿보는 것을 DB 레벨에서 차단
-- 2. 서버 API(Prisma service_role)는 RLS를 우회(bypass)하므로 영향 없음
--
-- 주의: auth.uid()는 UUID를 반환하며, user_id 컬럼도 UUID 타입이므로
--       직접 비교합니다 (::text 캐스팅 불필요)
-- ══════════════════════════════════════════════════════════════

-- ──────────────────────────────────────────────────────────────
-- 1. dm_messages (핵심 — Realtime 구독 보안)
-- ──────────────────────────────────────────────────────────────

-- 1-1. RLS 활성화
ALTER TABLE dm_messages ENABLE ROW LEVEL SECURITY;

-- 1-2. SELECT 정책: 채팅방 참여자만 메시지 읽기 가능
CREATE POLICY "dm_messages_select_participant"
ON dm_messages FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM dm_participants
    WHERE dm_participants.room_id = dm_messages.room_id
      AND dm_participants.user_id = auth.uid()
      AND dm_participants.left_at IS NULL
  )
);

-- 1-3. INSERT 정책: 채팅방 참여자만 메시지 전송 가능
--      sender_id가 본인과 일치해야 위조 방지
CREATE POLICY "dm_messages_insert_participant"
ON dm_messages FOR INSERT
WITH CHECK (
  sender_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM dm_participants
    WHERE dm_participants.room_id = dm_messages.room_id
      AND dm_participants.user_id = auth.uid()
      AND dm_participants.left_at IS NULL
  )
);

-- ──────────────────────────────────────────────────────────────
-- 2. dm_participants (권장 — 참여자 정보 보호)
-- ──────────────────────────────────────────────────────────────

ALTER TABLE dm_participants ENABLE ROW LEVEL SECURITY;

-- 같은 방에 참여 중인 유저만 해당 방의 참여자 정보 열람 가능
CREATE POLICY "dm_participants_select_same_room"
ON dm_participants FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM dm_participants AS my
    WHERE my.room_id = dm_participants.room_id
      AND my.user_id = auth.uid()
      AND my.left_at IS NULL
  )
);

-- ──────────────────────────────────────────────────────────────
-- 3. dm_rooms (권장 — 채팅방 메타데이터 보호)
-- ──────────────────────────────────────────────────────────────

ALTER TABLE dm_rooms ENABLE ROW LEVEL SECURITY;

-- 참여 중인 방만 열람 가능
CREATE POLICY "dm_rooms_select_participant"
ON dm_rooms FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM dm_participants
    WHERE dm_participants.room_id = dm_rooms.id
      AND dm_participants.user_id = auth.uid()
      AND dm_participants.left_at IS NULL
  )
);

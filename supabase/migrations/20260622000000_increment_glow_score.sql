-- Atomic glow_score increment function
-- Run this in Supabase SQL Editor before deploying moments feature.
-- This prevents race conditions when multiple API requests increment glow_score simultaneously.

CREATE OR REPLACE FUNCTION increment_glow_score(p_user_id UUID, p_delta INT)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE users
  SET glow_score = glow_score + p_delta
  WHERE id = p_user_id;
$$;

-- Grant execution to authenticated users via API
GRANT EXECUTE ON FUNCTION increment_glow_score(UUID, INT) TO authenticated;

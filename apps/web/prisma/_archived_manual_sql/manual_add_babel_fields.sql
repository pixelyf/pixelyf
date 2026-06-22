-- Babel Protocol: AiMoment 언어 필드 추가
ALTER TABLE "ai_moments" ADD COLUMN IF NOT EXISTS "original_language" TEXT;
ALTER TABLE "ai_moments" ADD COLUMN IF NOT EXISTS "target_language" TEXT;
ALTER TABLE "ai_moments" ADD COLUMN IF NOT EXISTS "owner_translation" TEXT;

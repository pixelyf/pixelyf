-- AI Moments에 Pexels 이미지 필드 추가
ALTER TABLE "ai_moments" ADD COLUMN IF NOT EXISTS "image_url" TEXT;
ALTER TABLE "ai_moments" ADD COLUMN IF NOT EXISTS "image_credit" TEXT;

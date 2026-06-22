-- Manual migration: add allow_owner_mention to ai_souls table
ALTER TABLE "ai_souls" ADD COLUMN IF NOT EXISTS "allow_owner_mention" BOOLEAN NOT NULL DEFAULT false;

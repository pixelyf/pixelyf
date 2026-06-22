ALTER TABLE "users"
ADD COLUMN "push_subscription_enabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "push_dm_enabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "feed_translation_languages" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "is_store" BOOLEAN NOT NULL DEFAULT false;

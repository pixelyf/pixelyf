-- [Schema Alignment] store_details / galaxy_category_translations 누락 복구
-- 목적:
--   1. schema.prisma에는 존재하지만 마이그레이션 히스토리에 없던 store_details 테이블 생성
--   2. schema.prisma에는 존재하지만 마이그레이션 히스토리에 없던 galaxy_category_translations 테이블 생성
--   3. Supabase/PostgREST 관계 캐시가 users <-> store_details FK를 인식하도록 스키마 reload 트리거

CREATE TABLE IF NOT EXISTS "store_details" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "phone" TEXT,
    "address" TEXT,
    "google_place_id" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "business_hours" JSONB,
    "menu_info" JSONB,
    "gallery_photos" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "description" TEXT,
    "review_count" INTEGER NOT NULL DEFAULT 0,
    "average_rating" DOUBLE PRECISION NOT NULL DEFAULT 4.0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "store_details_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "store_details_user_id_key"
  ON "store_details"("user_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'store_details_user_id_fkey'
  ) THEN
    ALTER TABLE "store_details"
      ADD CONSTRAINT "store_details_user_id_fkey"
      FOREIGN KEY ("user_id")
      REFERENCES "users"("id")
      ON DELETE CASCADE
      ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "galaxy_category_translations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "category_id" UUID NOT NULL,
    "locale" VARCHAR(5) NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "galaxy_category_translations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "galaxy_category_translations_category_id_locale_key"
  ON "galaxy_category_translations"("category_id", "locale");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'galaxy_category_translations_category_id_fkey'
  ) THEN
    ALTER TABLE "galaxy_category_translations"
      ADD CONSTRAINT "galaxy_category_translations_category_id_fkey"
      FOREIGN KEY ("category_id")
      REFERENCES "galaxy_categories"("id")
      ON DELETE CASCADE
      ON UPDATE CASCADE;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

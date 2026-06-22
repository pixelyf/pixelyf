ALTER TABLE "moments"
  ADD COLUMN IF NOT EXISTS "target_pixel_id" UUID,
  ADD COLUMN IF NOT EXISTS "original_language" TEXT,
  ADD COLUMN IF NOT EXISTS "summary" VARCHAR(100),
  ADD COLUMN IF NOT EXISTS "embedding" vector(768);

CREATE INDEX IF NOT EXISTS "idx_moments_target_pixel_id"
  ON "moments" ("target_pixel_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'moments_target_pixel_id_fkey'
  ) THEN
    ALTER TABLE "moments"
      ADD CONSTRAINT "moments_target_pixel_id_fkey"
      FOREIGN KEY ("target_pixel_id")
      REFERENCES "users"("id")
      ON DELETE CASCADE
      ON UPDATE NO ACTION;
  END IF;
END $$;

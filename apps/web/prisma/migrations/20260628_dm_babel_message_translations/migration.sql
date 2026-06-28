-- CreateTable
CREATE TABLE "dm_message_translations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "message_id" UUID NOT NULL,
    "locale" VARCHAR(10) NOT NULL,
    "content" TEXT NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'completed',
    "tokens_used" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dm_message_translations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "dm_message_translations_message_id_locale_key" ON "dm_message_translations"("message_id", "locale");

-- CreateIndex
CREATE INDEX "dm_message_translations_locale_idx" ON "dm_message_translations"("locale");

-- AddForeignKey
ALTER TABLE "dm_message_translations"
ADD CONSTRAINT "dm_message_translations_message_id_fkey"
FOREIGN KEY ("message_id") REFERENCES "dm_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Enable Row Level Security
ALTER TABLE "dm_message_translations" ENABLE ROW LEVEL SECURITY;

-- Create Policy for SELECT
CREATE POLICY "Select translations if room participant" ON "dm_message_translations"
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM "dm_messages" m
    JOIN "dm_participants" p ON m."room_id" = p."room_id"
    WHERE m."id" = "dm_message_translations"."message_id"
      AND p."user_id"::text = auth.uid()::text
      AND p."left_at" IS NULL
  )
);

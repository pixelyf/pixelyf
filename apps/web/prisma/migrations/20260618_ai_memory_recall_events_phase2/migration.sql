CREATE TABLE "ai_memory_recall_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ai_soul_id" UUID NOT NULL,
    "memory_id" UUID NOT NULL,
    "query_type" VARCHAR(30) NOT NULL,
    "query_hash" VARCHAR(64) NOT NULL,
    "partner_user_id" UUID,
    "recalled_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_memory_recall_events_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ai_memory_recall_events"
  ADD CONSTRAINT "ai_memory_recall_events_ai_soul_id_fkey"
  FOREIGN KEY ("ai_soul_id")
  REFERENCES "ai_souls"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "ai_memory_recall_events"
  ADD CONSTRAINT "ai_memory_recall_events_memory_id_fkey"
  FOREIGN KEY ("memory_id")
  REFERENCES "ai_memories"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

CREATE INDEX "idx_memory_recall_events_soul_time"
ON "ai_memory_recall_events"("ai_soul_id", "recalled_at" DESC);

CREATE INDEX "idx_memory_recall_events_memory_time"
ON "ai_memory_recall_events"("memory_id", "recalled_at" DESC);

CREATE INDEX "idx_memory_recall_events_soul_memory_time"
ON "ai_memory_recall_events"("ai_soul_id", "memory_id", "recalled_at" DESC);

CREATE INDEX "idx_memory_recall_events_partner"
ON "ai_memory_recall_events"("partner_user_id");

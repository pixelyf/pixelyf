ALTER TABLE "ai_memories"
ADD COLUMN "origin_type" VARCHAR(30),
ADD COLUMN "origin_id" TEXT,
ADD COLUMN "derived_from_memory_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "merge_reason" TEXT,
ADD COLUMN "is_locked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "locked_at" TIMESTAMPTZ(6),
ADD COLUMN "locked_by_user_id" UUID,
ADD COLUMN "invalidated_at" TIMESTAMPTZ(6),
ADD COLUMN "invalidation_reason" TEXT;

CREATE INDEX "idx_memories_soul_origin_type"
ON "ai_memories"("ai_soul_id", "origin_type");

CREATE INDEX "idx_memories_soul_invalidated_at"
ON "ai_memories"("ai_soul_id", "invalidated_at");

CREATE INDEX "idx_memories_soul_is_locked"
ON "ai_memories"("ai_soul_id", "is_locked");

CREATE TABLE "ai_memory_traces" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "ai_soul_id" UUID NOT NULL,
  "stage" VARCHAR(40) NOT NULL,
  "status" VARCHAR(20) NOT NULL,
  "trace_key" VARCHAR(80),
  "payload" JSONB,
  "duration_ms" INT NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_memory_traces_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ai_memory_traces"
  ADD CONSTRAINT "ai_memory_traces_ai_soul_id_fkey"
  FOREIGN KEY ("ai_soul_id")
  REFERENCES "ai_souls"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

CREATE INDEX "idx_memory_traces_soul_time"
ON "ai_memory_traces"("ai_soul_id", "created_at" DESC);

CREATE INDEX "idx_memory_traces_stage_time"
ON "ai_memory_traces"("stage", "created_at" DESC);

CREATE TABLE "ai_memory_eval_logs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "ai_soul_id" UUID,
  "dataset_version" VARCHAR(40) NOT NULL,
  "eval_type" VARCHAR(40) NOT NULL,
  "metrics" JSONB NOT NULL,
  "release_tag" VARCHAR(80),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_memory_eval_logs_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ai_memory_eval_logs"
  ADD CONSTRAINT "ai_memory_eval_logs_ai_soul_id_fkey"
  FOREIGN KEY ("ai_soul_id")
  REFERENCES "ai_souls"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

CREATE INDEX "idx_memory_eval_logs_created_at"
ON "ai_memory_eval_logs"("created_at" DESC);

CREATE INDEX "idx_memory_eval_logs_dataset_time"
ON "ai_memory_eval_logs"("dataset_version", "created_at" DESC);

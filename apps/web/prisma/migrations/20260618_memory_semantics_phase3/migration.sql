ALTER TABLE "ai_memories"
ADD COLUMN "valid_from" TIMESTAMPTZ(6),
ADD COLUMN "valid_to" TIMESTAMPTZ(6),
ADD COLUMN "superseded_by_id" UUID,
ADD COLUMN "supersedes_id" UUID,
ADD COLUMN "fact_type" VARCHAR(20) DEFAULT 'EPISODE',
ADD COLUMN "confidence" DOUBLE PRECISION DEFAULT 0.5;

UPDATE "ai_memories"
SET
  "valid_from" = COALESCE("valid_from", "created_at"),
  "fact_type" = COALESCE("fact_type", 'EPISODE'),
  "confidence" = COALESCE("confidence", 0.5);

CREATE INDEX "idx_memories_soul_fact_type_layer"
ON "ai_memories"("ai_soul_id", "fact_type", "memory_layer");

CREATE INDEX "idx_memories_soul_valid_to"
ON "ai_memories"("ai_soul_id", "valid_to");

CREATE INDEX "idx_memories_soul_superseded_by"
ON "ai_memories"("ai_soul_id", "superseded_by_id");

ALTER TABLE "ai_memories"
  ADD CONSTRAINT "ai_memories_confidence_check"
  CHECK ("confidence" IS NULL OR ("confidence" >= 0 AND "confidence" <= 1)) NOT VALID,
  ADD CONSTRAINT "ai_memories_fact_type_check"
  CHECK ("fact_type" IS NULL OR "fact_type" IN ('FACT', 'EPISODE')) NOT VALID,
  ADD CONSTRAINT "ai_memories_valid_window_check"
  CHECK ("valid_from" IS NULL OR "valid_to" IS NULL OR "valid_to" >= "valid_from") NOT VALID,
  ADD CONSTRAINT "ai_memories_superseded_by_id_fkey"
  FOREIGN KEY ("superseded_by_id") REFERENCES "ai_memories"("id") ON DELETE SET NULL NOT VALID,
  ADD CONSTRAINT "ai_memories_supersedes_id_fkey"
  FOREIGN KEY ("supersedes_id") REFERENCES "ai_memories"("id") ON DELETE SET NULL NOT VALID;

CREATE TABLE "ai_memory_derivations" (
  "derived_memory_id" UUID NOT NULL,
  "source_memory_id" UUID NOT NULL,
  "relation_type" VARCHAR(30) NOT NULL DEFAULT 'DERIVED_FROM',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_memory_derivations_pkey" PRIMARY KEY ("derived_memory_id", "source_memory_id"),
  CONSTRAINT "ai_memory_derivations_derived_memory_id_fkey"
    FOREIGN KEY ("derived_memory_id") REFERENCES "ai_memories"("id") ON DELETE CASCADE,
  CONSTRAINT "ai_memory_derivations_source_memory_id_fkey"
    FOREIGN KEY ("source_memory_id") REFERENCES "ai_memories"("id") ON DELETE RESTRICT
);

CREATE UNIQUE INDEX "uq_memory_derivations_source"
ON "ai_memory_derivations"("source_memory_id");

INSERT INTO "ai_memory_derivations" ("derived_memory_id", "source_memory_id")
SELECT DISTINCT ON (source."id") derived."id", source."id"
FROM "ai_memories" AS derived
CROSS JOIN LATERAL unnest(COALESCE(derived."derived_from_memory_ids", ARRAY[]::TEXT[])) AS source_ref("id")
INNER JOIN "ai_memories" AS source ON source."id"::TEXT = source_ref."id"
ORDER BY source."id", derived."created_at" ASC
ON CONFLICT DO NOTHING;

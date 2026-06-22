ALTER TABLE "ai_memories"
ADD COLUMN "memory_namespace" TEXT,
ADD COLUMN "memory_visibility" TEXT,
ADD COLUMN "partner_user_id" UUID;

CREATE INDEX "idx_memories_soul_namespace_layer"
ON "ai_memories"("ai_soul_id", "memory_namespace", "memory_layer");

CREATE INDEX "idx_memories_soul_visibility_layer"
ON "ai_memories"("ai_soul_id", "memory_visibility", "memory_layer");

CREATE INDEX "idx_memories_soul_partner_layer"
ON "ai_memories"("ai_soul_id", "partner_user_id", "memory_layer");

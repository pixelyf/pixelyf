export function buildVectorMemoryRetrievalSql(vectorSqlWhere: string): string {
  return `SELECT id,
                LEFT(theme, 500) as theme,
                community_summary as "communitySummary",
                created_at as "createdAt",
                memory_stream as "memoryStream",
                memory_layer as "memoryLayer",
                source,
                memory_namespace as "memoryNamespace",
                memory_visibility as "memoryVisibility",
                partner_user_id as "partnerUserId",
                importance_score as "importanceScore",
                promoted_category as "promotedCategory",
                community_id as "communityId",
                GREATEST(0, 1 - (embedding <=> $2::vector)) as "vectorScore"
         FROM ai_memories
         WHERE ai_soul_id = $1::uuid
           AND embedding IS NOT NULL
           AND ${vectorSqlWhere}
         ORDER BY GREATEST(0, 1 - (embedding <=> $2::vector))
                  * EXP(-1.0 * $3::double precision * EXTRACT(EPOCH FROM (NOW() - created_at)) / 3600.0) DESC
         LIMIT $4::integer`
}

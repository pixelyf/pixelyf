-- pgvector HNSW 인덱스 마이그레이션 DDL 스크립트
-- moments.embedding(768차원)에 대해 코사인 유사도 검색 가속 인덱스 수립
-- 7번 결함 형상관리 복원용

CREATE INDEX IF NOT EXISTS idx_moments_embedding_hnsw
ON moments
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

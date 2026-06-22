import assert from 'node:assert/strict'
import test from 'node:test'

import { buildVectorMemoryRetrievalSql } from './memoryRetrievalSql.ts'

test('벡터 검색 SQL은 실수 감쇠값과 정수 limit 타입을 명시한다', () => {
  const sql = buildVectorMemoryRetrievalSql(`memory_stream = ANY($5::text[])`)

  assert.match(sql, /\$3::double precision/)
  assert.match(sql, /LIMIT \$4::integer/)
  assert.match(sql, /memory_visibility as "memoryVisibility"/)
  assert.match(sql, /memory_stream = ANY\(\$5::text\[\]\)/)
  assert.doesNotMatch(sql, /-1 \* \$3(?!:)/)
})

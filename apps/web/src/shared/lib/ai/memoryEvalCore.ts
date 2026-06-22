import { MEMORY_EVAL_FIXTURES, type MemoryEvalFixture } from './fixtures/memoryEvalDataset.ts'
import { rankHybridMemoryCandidates } from './memoryHybridRanker.ts'
import { isMemorySnapshotActive } from './memorySemantics.ts'

export function computeMemoryEvalMetrics(fixtures: MemoryEvalFixture[] = MEMORY_EVAL_FIXTURES) {
  let retrieved = 0
  let matched = 0
  let expected = 0
  let stale = 0
  let contradiction = 0
  let contradictionPairs = 0

  for (const fixture of fixtures) {
    const evaluatedAt = new Date(fixture.evaluatedAt)
    const activeCandidates = fixture.candidates.filter((candidate) =>
      isMemorySnapshotActive(candidate, evaluatedAt),
    )
    const retrievedMemoryIds = rankHybridMemoryCandidates({
      queryText: fixture.query,
      candidates: activeCandidates,
      limit: fixture.limit,
    }).map((memory) => memory.id)

    const expectedSet = new Set(fixture.expectedMemoryIds)
    const staleSet = new Set(fixture.staleMemoryIds)
    const retrievedSet = new Set(retrievedMemoryIds)
    retrieved += retrievedMemoryIds.length
    expected += expectedSet.size
    matched += retrievedMemoryIds.filter((id) => expectedSet.has(id)).length
    stale += retrievedMemoryIds.filter((id) => staleSet.has(id)).length
    contradictionPairs += fixture.contradictionPairs.length
    contradiction += fixture.contradictionPairs.filter(
      ([leftId, rightId]) => retrievedSet.has(leftId) && retrievedSet.has(rightId),
    ).length
  }

  const precision = retrieved === 0 ? 0 : matched / retrieved
  const recall = expected === 0 ? 0 : matched / expected
  const staleRecallRate = retrieved === 0 ? 0 : stale / retrieved
  const contradictionRate = contradictionPairs === 0
    ? 0
    : contradiction / contradictionPairs

  return {
    datasetSize: fixtures.length,
    precision,
    recall,
    recallPrecision: precision,
    staleRecallRate,
    contradictionRate,
  }
}

export function passesMemoryEvalQualityGate(
  metrics: ReturnType<typeof computeMemoryEvalMetrics>,
): boolean {
  return metrics.precision >= 0.8
    && metrics.recall >= 0.8
    && metrics.staleRecallRate === 0
    && metrics.contradictionRate === 0
}

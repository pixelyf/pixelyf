import prisma from '@/shared/lib/prisma'
import { MEMORY_EVAL_DATASET_VERSION } from './fixtures/memoryEvalDataset'
import { computeMemoryEvalMetrics, passesMemoryEvalQualityGate } from './memoryEvalCore'

export { computeMemoryEvalMetrics, passesMemoryEvalQualityGate } from './memoryEvalCore'

export async function recordMemoryEvalSnapshot(params?: { soulId?: string | null; releaseTag?: string | null }) {
  const metrics = computeMemoryEvalMetrics()
  await prisma.aiMemoryEvalLog.create({
    data: {
      aiSoulId: params?.soulId ?? null,
      datasetVersion: MEMORY_EVAL_DATASET_VERSION,
      evalType: 'OFFLINE_FIXTURE',
      metrics: {
        ...metrics,
        qualityGatePassed: passesMemoryEvalQualityGate(metrics),
      },
      releaseTag: params?.releaseTag ?? process.env.MEMORY_POLICY_RELEASE_TAG ?? 'dev',
    },
  })
  return metrics
}

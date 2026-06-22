import type { Prisma } from '@prisma/client'
import prisma from '@/shared/lib/prisma'

export type MemoryTraceStage = 'retrieve' | 'write_gate' | 'promote' | 'community_rebuild'
export type MemoryTraceStatus = 'success' | 'blocked' | 'error'

type RecordMemoryTraceParams = {
  soulId: string
  stage: MemoryTraceStage
  status: MemoryTraceStatus
  traceKey?: string
  durationMs?: number
  payload?: Record<string, unknown>
}

export async function recordMemoryTrace(params: RecordMemoryTraceParams) {
  const { soulId, stage, status, traceKey, durationMs = 0, payload } = params
  const jsonPayload = (payload ?? {}) as Prisma.InputJsonValue

  try {
    await prisma.aiMemoryTrace.create({
      data: {
        aiSoulId: soulId,
        stage,
        status,
        traceKey: traceKey ?? null,
        durationMs,
        payload: jsonPayload,
      },
    })
  } catch (error) {
    console.error('[MemoryTrace] trace 기록 실패:', error)
  }
}

export async function traceMemoryStage<T>(
  params: Omit<RecordMemoryTraceParams, 'status' | 'durationMs'> & {
    run: () => Promise<T>
    onSuccessPayload?: (result: T) => Record<string, unknown>
  },
): Promise<T> {
  const startedAt = Date.now()
  try {
    const result = await params.run()
    await recordMemoryTrace({
      soulId: params.soulId,
      stage: params.stage,
      traceKey: params.traceKey,
      status: 'success',
      durationMs: Date.now() - startedAt,
      payload: params.onSuccessPayload ? params.onSuccessPayload(result) : params.payload,
    })
    return result
  } catch (error: any) {
    await recordMemoryTrace({
      soulId: params.soulId,
      stage: params.stage,
      traceKey: params.traceKey,
      status: 'error',
      durationMs: Date.now() - startedAt,
      payload: {
        ...(params.payload ?? {}),
        error: error?.message ?? 'unknown',
      },
    })
    throw error
  }
}

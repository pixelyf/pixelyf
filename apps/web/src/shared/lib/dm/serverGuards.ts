import prisma from '@/shared/lib/prisma'

type PrismaLike = typeof prisma

export type DmGuardResult = {
  ok: true
} | {
  ok: false
  status: number
  code: string
  error: string
}

export async function findUserBlockBetween(
  userAId: string,
  userBId: string,
  client: PrismaLike = prisma,
) {
  if (userAId === userBId) return null

  return client.user_blocks.findFirst({
    where: {
      OR: [
        { blocker_id: userAId, blocked_id: userBId },
        { blocker_id: userBId, blocked_id: userAId },
      ],
    },
    select: { blocker_id: true, blocked_id: true },
  })
}

export async function assertNoUserBlockBetween(
  userAId: string,
  userBId: string,
  client: PrismaLike = prisma,
): Promise<DmGuardResult> {
  const block = await findUserBlockBetween(userAId, userBId, client)
  if (!block) return { ok: true }

  return {
    ok: false,
    status: 403,
    code: 'DM_BLOCKED',
    error: '차단 관계가 있는 사용자와는 대화를 시작하거나 메시지를 보낼 수 없습니다.',
  }
}

export async function hasActiveAiProviderKey(
  userId: string,
  client: PrismaLike = prisma,
): Promise<boolean> {
  const key = await client.aiProviderKey.findFirst({
    where: { userId, isActive: true },
    select: { id: true },
  })
  return Boolean(key)
}

export async function assertActiveAiProviderKey(
  userId: string,
  client: PrismaLike = prisma,
): Promise<DmGuardResult> {
  const hasKey = await hasActiveAiProviderKey(userId, client)
  if (hasKey) return { ok: true }

  return {
    ok: false,
    status: 428,
    code: 'AI_KEY_REQUIRED',
    error: 'AI 키 등록이 필요합니다.',
  }
}

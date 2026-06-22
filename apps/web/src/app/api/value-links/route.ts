import { NextResponse } from 'next/server'
import prisma from '@/shared/lib/prisma'
import { createClient } from '@/shared/lib/supabase/server'
import {
  findTopMatches,
  type UserCategoryProfile,
  type ValueLinkMatchResult,
} from '@/shared/lib/ai/valueLinkMatcher'
import type { ContentCategory } from '@/shared/config/contentCategories'

const DEFAULT_LIMIT = 10
const MAX_LIMIT = 30
const DEFAULT_MIN_SCORE = 30

function normalizeLimit(value: string | null) {
  const parsed = Number.parseInt(value || String(DEFAULT_LIMIT), 10)
  if (!Number.isFinite(parsed)) return DEFAULT_LIMIT
  return Math.min(Math.max(parsed, 1), MAX_LIMIT)
}

function normalizeMinScore(value: string | null) {
  const parsed = Number.parseInt(value || String(DEFAULT_MIN_SCORE), 10)
  if (!Number.isFinite(parsed)) return DEFAULT_MIN_SCORE
  return Math.min(Math.max(parsed, 0), 100)
}

function toProfile(input: {
  userId: string
  primaryCategory: string | null
  interestCategories: string[]
  interestTags: string[]
  koreanLangLevel: string | null
  user?: { country: string | null } | null
}): UserCategoryProfile {
  return {
    userId: input.userId,
    primaryCategory: input.primaryCategory as ContentCategory | null,
    interestCategories: input.interestCategories as ContentCategory[],
    interestTags: input.interestTags,
    koreanLangLevel: input.koreanLangLevel,
    isGlobal: input.user?.country ? input.user.country !== 'KR' : true,
  }
}

function orderedPair(userAId: string, userBId: string) {
  return userAId < userBId
    ? { userAId, userBId }
    : { userAId: userBId, userBId: userAId }
}

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const limit = normalizeLimit(searchParams.get('limit'))
    const minScore = normalizeMinScore(searchParams.get('minScore'))

    const target = await prisma.culturalValueProfile.findUnique({
      where: { userId: user.id },
      include: {
        user: { select: { id: true, display_name: true, avatar_image_url: true, country: true } },
      },
    })

    if (!target) {
      return NextResponse.json({ data: [], hasProfile: false })
    }

    const candidates = await prisma.culturalValueProfile.findMany({
      where: { userId: { not: user.id } },
      take: 200,
      include: {
        user: { select: { id: true, display_name: true, avatar_image_url: true, country: true } },
      },
    })

    const targetProfile = toProfile(target)
    const candidateProfiles = candidates.map(toProfile)
    const matches = findTopMatches(targetProfile, candidateProfiles, limit, minScore)
    const candidateMap = new Map(candidates.map((candidate) => [candidate.userId, candidate]))

    await prisma.$transaction(
      matches.map((match) => {
        const pair = orderedPair(match.userAId, match.userBId)
        return prisma.valueLinkConnection.upsert({
          where: {
            userAId_userBId: pair,
          },
          create: {
            ...pair,
            matchScore: match.matchScore,
            matchReasons: match.matchReasons,
            sharedCategories: match.sharedCategories,
            status: 'PENDING',
          },
          update: {
            matchScore: match.matchScore,
            matchReasons: match.matchReasons,
            sharedCategories: match.sharedCategories,
          },
        })
      })
    )

    const data = matches.map((match: ValueLinkMatchResult) => {
      const candidate = candidateMap.get(match.userBId)
      return {
        userId: match.userBId,
        displayName: candidate?.user.display_name || null,
        avatarUrl: candidate?.user.avatar_image_url || null,
        country: candidate?.user.country || null,
        matchScore: match.matchScore,
        matchReasons: match.matchReasons,
        sharedCategories: match.sharedCategories,
      }
    })

    return NextResponse.json({ data, hasProfile: true })
  } catch (error) {
    console.error('[ValueLink API] match failed:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

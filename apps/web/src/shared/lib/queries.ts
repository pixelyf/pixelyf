import { cache } from 'react'
import prisma from './prisma'

// 1. Moment 조회 캐싱 (feed 파라미터가 있을 때 사용)
export const getCachedMoment = cache(async (feedId: string) => {
  try {
    return await prisma.moment.findUnique({
      where: { id: feedId },
      include: { user: true }
    })
  } catch (e) {
    console.error('getCachedMoment error:', e)
    return null
  }
})

// 2. User 조회 캐싱 (pixel 파라미터가 있을 때 사용)
export const getCachedUser = cache(async (userId: string) => {
  try {
    return await prisma.user.findUnique({
      where: { id: userId }
    })
  } catch (e) {
    console.error('getCachedUser error:', e)
    return null
  }
})

// 3. 은하 partnerCode 매칭 캐싱
export const getCachedGalaxyByPartnerCode = cache(async (partnerCode: string) => {
  try {
    const galaxy = await prisma.galaxy.findUnique({
      where: { partnerCode }
    })
    return galaxy && galaxy.isActive ? galaxy : null
  } catch (e) {
    console.error('getCachedGalaxyByPartnerCode error:', e)
    return null
  }
})

// 4. 은하 partnerCode 및 categories 매칭 캐싱
export const getCachedGalaxyByPartnerCodeWithCategories = cache(async (partnerCode: string) => {
  try {
    const galaxy = await prisma.galaxy.findUnique({
      where: { partnerCode },
      include: { categories: true }
    })
    return galaxy && galaxy.isActive ? galaxy : null
  } catch (e) {
    console.error('getCachedGalaxyByPartnerCodeWithCategories error:', e)
    return null
  }
})

// 5. 루트 은하 조회 캐싱
export const getCachedRootGalaxy = cache(async () => {
  try {
    return await prisma.galaxy.findFirst({
      where: { isRoot: true, isActive: true },
      include: { categories: true }
    })
  } catch (e) {
    console.error('getCachedRootGalaxy error:', e)
    return null
  }
})

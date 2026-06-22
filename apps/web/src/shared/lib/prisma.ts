import { Pool } from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'

declare global {
  var prisma: undefined | PrismaClient
  var pgPool: undefined | Pool
}

const getPgPool = () => {
  const connectionString = process.env.DATABASE_URL

  if (!connectionString) {
    throw new Error('DATABASE_URL is not set in environment variables.')
  }

  // 핫 리로딩 시 pool이 여러 개 생기는 것 방지
  if (globalThis.pgPool) {
    return globalThis.pgPool
  }

  // PostgreSQL 커넥션 풀 생성 (SSH 터널링 안정화용)
  // 커넥션 개수를 2개로 줄여 개발 중 핫 리로딩으로 인한 원격 DB 커넥션 초과(Connection Limit)를 예방
  const pool = new Pool({ 
    connectionString,
    max: 2,                 
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000, 
  })

  if (process.env.NODE_ENV !== 'production') {
    globalThis.pgPool = pool
  }

  return pool
}

const prismaClientSingleton = () => {
  const pool = getPgPool()
  const adapter = new PrismaPg(pool)

  return new PrismaClient({ 
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  })
}

// 싱글톤 인스턴스 공유 (Next.js 핫 리로딩 보호)
const prisma = globalThis.prisma ?? prismaClientSingleton()

export default prisma

if (process.env.NODE_ENV !== 'production') globalThis.prisma = prisma


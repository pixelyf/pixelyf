import { Pool } from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'
import * as dotenv from 'dotenv'
import * as path from 'path'
import * as fs from 'fs'

dotenv.config({ path: path.join(__dirname, '../apps/web/.env') })

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  console.error('DATABASE_URL is not set in environment variables.')
  process.exit(1)
}

const pool = new Pool({ connectionString })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

// 의존 관계(외래키)를 고려하여 데이터 생성 순서 정렬
// 부모 테이블이 먼저 들어가고 자식 테이블이 나중에 들어가야 외래키 제약조건 위반이 없습니다.
const RESTORE_ORDER = [
  'user',
  'userPersona',
  'userCoordinate',
  'user_avatar_config',
  'nebulae',
  'nebula_members',
  'items',
  'user_inventory',
  'onboarding_answers',
  'moment',
  'momentTranslation',
  'momentComment',
  'ping',
  'constellation_bonds',
  'stardust_transactions',
  'thought_subscriptions',
  'touches',
  'userStatistics',
  'pixelVisitLog',
  'aiSoul',
  'aiMoment',
  'aiConversation',
  'aiMemory',
  'aiReflectionLog',
  'aiWhisper',
  'aiGalaxyView'
]

async function runRestore() {
  const args = process.argv.slice(2)
  if (args.length === 0) {
    console.error('Please provide the path to the backup JSON file.')
    console.error('Usage: npx tsx scripts/restore_db.ts backups/db_backup_xxx.json')
    process.exit(1)
  }

  const backupFilePath = path.resolve(args[0])
  if (!fs.existsSync(backupFilePath)) {
    console.error(`Backup file not found at: ${backupFilePath}`)
    process.exit(1)
  }

  console.log(`Loading backup data from ${backupFilePath}...`)
  const backupData = JSON.parse(fs.readFileSync(backupFilePath, 'utf-8'))

  console.log('Starting Database Restore Pipeline...')
  
  try {
    // 1. 기존 모든 데이터 초기화 (Cascade 제약조건에 의해 user를 지우면 하위 테이블도 자동 삭제됩니다.)
    console.log('Cleaning up existing database records...')
    // User 테이블 및 items, nebulae 등 상위 독립 테이블들을 명시적으로 비웁니다.
    await prisma.user.deleteMany()
    await prisma.items.deleteMany()
    await prisma.nebulae.deleteMany()
    console.log('Cleanup completed successfully.')

    // 2. 종속성 역순(RESTORE_ORDER)으로 복구 시작
    for (const model of RESTORE_ORDER) {
      const records = backupData[model]
      if (!records || records.length === 0) {
        console.log(`Model ${model}: No records to restore. Skipping.`)
        continue
      }

      console.log(`Restoring model: ${model} (${records.length} records)...`)
      const prismaModel = (prisma as any)[model]
      
      // 날짜 필드(String -> Date) 및 기타 정합성 정규화 처리
      const normalizedRecords = records.map((r: any) => {
        const normalized = { ...r }
        // Date 타입 필드 복원
        for (const [key, value] of Object.entries(normalized)) {
          if (typeof value === 'string' && value.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)) {
            normalized[key] = new Date(value)
          }
        }
        return normalized
      })

      // Prisma createMany를 사용하여 bulk insert 수행
      if (prismaModel && typeof prismaModel.createMany === 'function') {
        const result = await prismaModel.createMany({
          data: normalizedRecords,
          skipDuplicates: true // 중복된 데이터 건너뛰기
        })
        console.log(`  -> Successfully restored ${result.count} records.`)
      } else if (prismaModel) {
        // createMany가 없는 단일 릴레이션의 경우 개별 insert
        let count = 0
        for (const record of normalizedRecords) {
          await prismaModel.create({ data: record })
          count++
        }
        console.log(`  -> Successfully restored ${count} records (fallback single-inserts).`)
      }
    }

    console.log('\n========================================')
    console.log('🎉 Database Restoration COMPLETED Successfully!')
    console.log('========================================')

  } catch (error) {
    console.error('\n❌ Restoration failed during execution:')
    console.error(error)
  } finally {
    await prisma.$disconnect()
    await pool.end()
  }
}

runRestore()

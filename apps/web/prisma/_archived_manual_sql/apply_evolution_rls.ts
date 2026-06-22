/**
 * coordinate_history 테이블에 RLS 정책 및 cleanup 함수를 적용하는 마이그레이션 스크립트
 * 
 * 사용법: npx tsx prisma/migrations/apply_evolution_rls.ts
 */
import prisma from '../../src/shared/lib/prisma'

async function main() {
  console.log('=== coordinate_history RLS + cleanup 함수 적용 시작 ===')

  // 1. RLS 활성화
  try {
    await prisma.$executeRawUnsafe(`ALTER TABLE coordinate_history ENABLE ROW LEVEL SECURITY`)
    console.log('[✅] RLS 활성화 완료')
  } catch (e: any) {
    console.log(`[⚠️] RLS 이미 활성화 또는 오류: ${e.message}`)
  }

  // 2. RLS 정책 생성
  try {
    await prisma.$executeRawUnsafe(`
      CREATE POLICY "Users can read own coordinate history"
      ON coordinate_history
      FOR SELECT
      USING (auth.uid() = user_id)
    `)
    console.log('[✅] RLS 정책 생성 완료')
  } catch (e: any) {
    console.log(`[⚠️] RLS 정책 이미 존재 또는 오류: ${e.message}`)
  }

  // 3. 90일 cleanup 함수 생성
  try {
    await prisma.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION cleanup_old_coordinate_history()
      RETURNS void AS $$
      BEGIN
        DELETE FROM coordinate_history
        WHERE snapshot_date < CURRENT_DATE - INTERVAL '90 days';
      END;
      $$ LANGUAGE plpgsql
    `)
    console.log('[✅] cleanup 함수 생성 완료')
  } catch (e: any) {
    console.log(`[⚠️] cleanup 함수 오류: ${e.message}`)
  }

  // 4. 테이블 존재 및 컬럼 확인
  try {
    const result = await prisma.$queryRawUnsafe<any[]>(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'coordinate_history'
      ORDER BY ordinal_position
    `)
    console.log('\n[📋] coordinate_history 테이블 구조:')
    result.forEach((r: any) => console.log(`  - ${r.column_name}: ${r.data_type}`))
  } catch (e: any) {
    console.log(`[❌] 테이블 확인 실패: ${e.message}`)
  }

  // 5. user_coordinates.rank 컬럼 확인
  try {
    const result = await prisma.$queryRawUnsafe<any[]>(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'user_coordinates' AND column_name = 'rank'
    `)
    if (result.length > 0) {
      console.log(`\n[✅] user_coordinates.rank 컬럼 존재: ${result[0].data_type}`)
    } else {
      console.log('\n[❌] user_coordinates.rank 컬럼 미존재!')
    }
  } catch (e: any) {
    console.log(`[❌] rank 컬럼 확인 실패: ${e.message}`)
  }

  console.log('\n=== 마이그레이션 완료 ===')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())

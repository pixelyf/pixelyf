import { config } from 'dotenv';
import * as path from 'path';

// 환경 변수 로드
config({ path: path.resolve(__dirname, '../.env') });
config({ path: path.resolve(__dirname, '../.env.local') });

import { createClient as createSupabaseAdmin } from '@supabase/supabase-js';

async function setup() {
  const prisma = (await import('../apps/web/src/shared/lib/prisma')).default;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    throw new Error("Supabase URL or Service Role Key is missing in environment variables.");
  }

  const supabaseAdmin = createSupabaseAdmin(supabaseUrl, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  console.log('📦 [Storage Setup] 스토리지 버킷 초기화 시작...');

  // 1. 버킷 생성 (moments, avatars)
  try {
    const { data: buckets, error: listError } = await supabaseAdmin.storage.listBuckets();
    if (listError) throw listError;

    const requiredBuckets = ['moments', 'avatars', 'menus', 'gallery'];
    for (const bName of requiredBuckets) {
      if (!buckets.find(b => b.id === bName)) {
        console.log(`   - 버킷 생성 중: ${bName}`);
        const { error: createError } = await supabaseAdmin.storage.createBucket(bName, {
          public: true,
          fileSizeLimit: 10485760 // 10MB
        });
        if (createError) throw createError;
        console.log(`   - 버킷 생성 완료: ${bName}`);
      } else {
        console.log(`   - 버킷 이미 존재함: ${bName}`);
      }
    }
  } catch (err) {
    console.error('   ❌ 스토리지 버킷 생성 실패:', err);
  }

  // 2. RLS 정책 주입 (Prisma direct SQL)
  console.log('🔒 [Storage Setup] 스토리지 RLS 정책 설정 시작...');
  const policies = [
    // moments policies
    `CREATE POLICY "Public Read for moments" ON storage.objects FOR SELECT USING (bucket_id = 'moments')`,
    `CREATE POLICY "Authenticated Insert for moments" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'moments')`,
    `CREATE POLICY "Authenticated Update for moments" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'moments')`,
    `CREATE POLICY "Authenticated Delete for moments" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'moments')`,

    // avatars policies
    `CREATE POLICY "Public Read for avatars" ON storage.objects FOR SELECT USING (bucket_id = 'avatars')`,
    `CREATE POLICY "Authenticated Insert for avatars" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'avatars')`,
    `CREATE POLICY "Authenticated Update for avatars" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'avatars')`,
    `CREATE POLICY "Authenticated Delete for avatars" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'avatars')`,

    // menus policies
    `CREATE POLICY "Public Read for menus" ON storage.objects FOR SELECT USING (bucket_id = 'menus')`,
    `CREATE POLICY "Authenticated Insert for menus" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'menus')`,
    `CREATE POLICY "Authenticated Update for menus" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'menus')`,
    `CREATE POLICY "Authenticated Delete for menus" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'menus')`,

    // gallery policies
    `CREATE POLICY "Public Read for gallery" ON storage.objects FOR SELECT USING (bucket_id = 'gallery')`,
    `CREATE POLICY "Authenticated Insert for gallery" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'gallery')`,
    `CREATE POLICY "Authenticated Update for gallery" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'gallery')`,
    `CREATE POLICY "Authenticated Delete for gallery" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'gallery')`,
  ];

  for (const query of policies) {
    try {
      await prisma.$executeRawUnsafe(query);
      console.log(`   - 정책 주입 성공: ${query.split('ON')[0].trim()}`);
    } catch (err: any) {
      if (err.message.includes('already exists') || err.message.includes('duplicate')) {
        console.log(`   - 정책 이미 존재함 (스킵): ${query.split('ON')[0].trim()}`);
      } else {
        console.error(`   - 정책 주입 실패: ${query.split('ON')[0].trim()}`, err.message);
      }
    }
  }

  console.log('✅ [Storage Setup] 스토리지 초기화가 성공적으로 끝났습니다.');
  await prisma.$disconnect();
}

setup().catch(console.error);

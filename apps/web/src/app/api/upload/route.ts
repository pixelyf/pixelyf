import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/shared/lib/supabase/server';
import { processImage, processAvatarImage } from '@/shared/lib/image/imageProcessor';
import { uploadImageVariants, uploadAvatarImage } from '@/shared/lib/image/storageService';

/**
 * 전역 고해상도 이미지 업로드 API (miniFlea 패턴 이식)
 * multipart/form-data 처리 (files, folder)
 * - avatars: 300px 정사각 1장 (1-tier)
 * - moments 등: 1080/800/300px 3단 변환 (3-tier)
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const files = formData.getAll('files') as File[];
    const folder = formData.get('folder') as string || 'moments';

    if (!files || files.length === 0) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 });
    }

    const isAvatarUpload = folder === 'avatars';

    const results = [];
    for (const file of files) {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        if (isAvatarUpload) {
          // 아바타: 300px 정사각 WebP 1장
          const processed = await processAvatarImage(buffer);
          const uploadResult = await uploadAvatarImage(folder, user.id, file.name, processed);
          results.push({ success: true, name: file.name, ...uploadResult });
        } else {
          // 모먼트 등: 1080/800/300px 3단 WebP
          const processed = await processImage(buffer);
          const uploadResult = await uploadImageVariants(folder, user.id, file.name, processed);
          results.push({ success: true, name: file.name, ...uploadResult });
        }
      } catch (e) {
        console.error(`Upload failed for file ${file.name}:`, e);
        results.push({
          success: false,
          name: file.name,
          error: e instanceof Error ? e.message : 'Unknown error'
        });
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        images: results,
        count: results.length
      }
    });

  } catch (error) {
    console.error('Upload Route Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}


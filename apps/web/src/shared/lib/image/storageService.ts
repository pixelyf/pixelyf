import { createClient } from '@/shared/lib/supabase/server';
import { ProcessedImages, ProcessedAvatar, makeVariantFileName } from './imageProcessor';
import crypto from 'crypto';

export interface UploadResult {
  url: string;
  path: string;
  thumbnailUrl: string;
  mediumUrl: string;
}

/**
 * Supabase Storage에 변환된 이미지 3종을 병렬 업로드합니다.
 */
export async function uploadImageVariants(
  bucket: string,
  userId: string,
  fileName: string,
  processed: ProcessedImages
): Promise<UploadResult> {
  const supabase = await createClient();
  
  // 1. 고유 경로 생성 (userId/timestamp_uuid_name.webp)
  const timestamp = Date.now();
  const uniqueId = crypto.randomUUID().substring(0, 8);
  const baseFileName = `${timestamp}_${uniqueId}_${fileName.replace(/\.[^.]+$/, '')}.webp`;
  const filePath = `${userId}/${baseFileName}`;
  
  const thumbPath = `${userId}/${makeVariantFileName(baseFileName, '_th')}`;
  const mediumPath = `${userId}/${makeVariantFileName(baseFileName, '_md')}`;

  // 2. 병렬 업로드 실행
  const uploadTasks = [
    // 원본 (1080px WebP)
    supabase.storage.from(bucket).upload(filePath, processed.original, {
      contentType: 'image/webp',
      upsert: true,
    }),
    // 중간 (800px WebP)
    supabase.storage.from(bucket).upload(mediumPath, processed.medium, {
      contentType: 'image/webp',
      upsert: true,
    }),
    // 썸네일 (300px WebP)
    supabase.storage.from(bucket).upload(thumbPath, processed.thumbnail, {
      contentType: 'image/webp',
      upsert: true,
    }),
  ];

  const results = await Promise.all(uploadTasks);
  
  // 에러 체크 및 롤백 클린업
  const errors = results.filter(r => r.error);
  if (errors.length > 0) {
    console.error('Storage upload errors:', errors.map(e => e.error));
    
    // 성공적으로 업로드된 부분 파일들을 찾아서 롤백 삭제 처리
    const rollbackPaths: string[] = [];
    results.forEach((r, idx) => {
      if (!r.error && r.data) {
        if (idx === 0) rollbackPaths.push(filePath);
        else if (idx === 1) rollbackPaths.push(mediumPath);
        else if (idx === 2) rollbackPaths.push(thumbPath);
      }
    });

    if (rollbackPaths.length > 0) {
      console.log(`[Storage Rollback] Cleaning up uploaded variants: ${rollbackPaths.join(', ')}`);
      await supabase.storage.from(bucket).remove(rollbackPaths).catch(rollbackErr => {
        console.error('[Storage Rollback] Failed to delete rollback files:', rollbackErr);
      });
    }

    throw new Error('Failed to upload image variants to storage');
  }

  // 3. 공개 URL 생성
  const { data: { publicUrl: originalUrl } } = supabase.storage.from(bucket).getPublicUrl(filePath);
  const { data: { publicUrl: thumbUrl } } = supabase.storage.from(bucket).getPublicUrl(thumbPath);
  const { data: { publicUrl: mediumUrl } } = supabase.storage.from(bucket).getPublicUrl(mediumPath);

  return {
    url: originalUrl,
    path: filePath,
    thumbnailUrl: thumbUrl,
    mediumUrl: mediumUrl,
  };
}

/**
 * 아바타 전용: 300px 정사각 WebP 1장만 업로드
 * 스토리지 비용 2/3 절감 (3장 → 1장)
 */
export async function uploadAvatarImage(
  bucket: string,
  userId: string,
  fileName: string,
  processed: ProcessedAvatar
): Promise<UploadResult> {
  const supabase = await createClient();
  
  const timestamp = Date.now();
  const uniqueId = crypto.randomUUID().substring(0, 8);
  const baseFileName = `${timestamp}_${uniqueId}_${fileName.replace(/\.[^.]+$/, '')}.webp`;
  const filePath = `${userId}/${baseFileName}`;

  const { error } = await supabase.storage.from(bucket).upload(filePath, processed.thumbnail, {
    contentType: 'image/webp',
    upsert: true,
  });

  if (error) {
    console.error('Avatar upload error:', error);
    throw new Error('Failed to upload avatar to storage');
  }

  const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(filePath);

  // UploadResult 인터페이스 호환: 3개 URL 모두 동일 경로
  return {
    url: publicUrl,
    path: filePath,
    thumbnailUrl: publicUrl,
    mediumUrl: publicUrl,
  };
}


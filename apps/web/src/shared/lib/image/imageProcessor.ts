import sharp from 'sharp';

/**
 * 이미지 프로세서 상수 (miniFlea 패턴 동일)
 */
const ORIGINAL_MAX_SIZE = 1080;
const MEDIUM_SIZE = 800;
const THUMB_SIZE = 300;

const ORIGINAL_QUALITY = 85;
const MEDIUM_QUALITY = 80;
const THUMB_QUALITY = 70;

export interface ProcessedImages {
  original: Buffer;
  medium: Buffer;
  thumbnail: Buffer;
  meta: {
    width: number;
    height: number;
    format: string;
    originalSize: number;
  };
}

/** 아바타 전용: 300px 정사각 1장만 생성 */
export interface ProcessedAvatar {
  thumbnail: Buffer;
  meta: {
    width: number;
    height: number;
    format: string;
    originalSize: number;
  };
}

/**
 * 이미지 버퍼를 받아 원본(1080px WebP) + 중간(800px WebP) + 썸네일(300px WebP)을 생성합니다.
 */
export async function processImage(inputBuffer: Buffer): Promise<ProcessedImages> {
  try {
    const metadata = await sharp(inputBuffer).metadata();

    // 1. 원본 리사이징 (1080px 내, WebP q85)
    const original = await sharp(inputBuffer)
      .resize(ORIGINAL_MAX_SIZE, ORIGINAL_MAX_SIZE, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: ORIGINAL_QUALITY })
      .toBuffer();

    // 2. 800px 미디엄 (WebP q80)
    const medium = await sharp(inputBuffer)
      .resize(MEDIUM_SIZE, MEDIUM_SIZE, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: MEDIUM_QUALITY })
      .toBuffer();

    // 3. 300px 썸네일 (300^2 Cover Crop, WebP q70)
    const thumbnail = await sharp(inputBuffer)
      .resize(THUMB_SIZE, THUMB_SIZE, {
        fit: 'cover',
        position: 'centre',
      })
      .webp({ quality: THUMB_QUALITY })
      .toBuffer();

    return {
      original,
      medium,
      thumbnail,
      meta: {
        width: metadata.width || 0,
        height: metadata.height || 0,
        format: metadata.format || 'unknown',
        originalSize: inputBuffer.length,
      },
    };
  } catch (error) {
    console.error('Image processing failed:', error);
    throw error;
  }
}

/**
 * 전용 접미사 추가 유틸리티
 */
export function makeVariantFileName(originalFileName: string, suffix: '_th' | '_md'): string {
  const baseName = originalFileName.replace(/\.[^.]+$/, '');
  return `${baseName}${suffix}.webp`;
}

/**
 * 아바타 전용 프로세서: 300px 정사각 Cover Crop WebP 1장만 생성
 * 패널 아바타(44px), 편집 모달(96px) 등 소형 표시 전용
 */
export async function processAvatarImage(inputBuffer: Buffer): Promise<ProcessedAvatar> {
  try {
    const metadata = await sharp(inputBuffer).metadata();

    const thumbnail = await sharp(inputBuffer)
      .resize(THUMB_SIZE, THUMB_SIZE, {
        fit: 'cover',
        position: 'centre',
      })
      .webp({ quality: THUMB_QUALITY })
      .toBuffer();

    return {
      thumbnail,
      meta: {
        width: metadata.width || 0,
        height: metadata.height || 0,
        format: metadata.format || 'unknown',
        originalSize: inputBuffer.length,
      },
    };
  } catch (error) {
    console.error('Avatar processing failed:', error);
    throw error;
  }
}

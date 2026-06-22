import { useState } from 'react'

interface UseImageUploadOptions {
  folder: 'moments' | 'avatars' | 'covers' | string
  maxSizeMB?: number
  maxFiles?: number
}

export interface UploadedImage {
  url: string
  thumbnailUrl: string
}

export function useImageUpload({ folder, maxSizeMB = 5, maxFiles = 10 }: UseImageUploadOptions) {
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  const uploadImages = async (files: FileList | File[] | null): Promise<UploadedImage[]> => {
    if (!files || files.length === 0) return []

    const MAX_FILE_SIZE = maxSizeMB * 1024 * 1024
    const validFiles: File[] = []
    
    // File validation
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) {
        throw new Error(`${file.name}은(는) 이미지가 아닙니다.`)
      }
      if (file.size > MAX_FILE_SIZE) {
        throw new Error(`${file.name}의 용량이 너무 큽니다. (${maxSizeMB}MB 이하만 가능)`)
      }
      validFiles.push(file)
    }

    if (validFiles.length === 0) return []
    if (validFiles.length > maxFiles) {
      throw new Error(`이미지는 최대 ${maxFiles}개까지만 업로드 가능합니다.`)
    }

    setIsUploading(true)
    setUploadError(null)

    try {
      const formData = new FormData()
      validFiles.slice(0, maxFiles).forEach(file => {
        formData.append('files', file)
      })
      formData.append('folder', folder)

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Upload failed')
      }

      const { data } = await res.json()
      return data.images as UploadedImage[]
    } catch (err: unknown) {
      console.error(err)
      const errorMsg = err instanceof Error ? err.message : '이미지 업로드에 실패했습니다.'
      setUploadError(errorMsg)
      throw new Error(errorMsg)
    } finally {
      setIsUploading(false)
    }
  }

  return { isUploading, uploadError, uploadImages, setUploadError }
}

'use client'

import { useState, useEffect, useCallback } from 'react'
import { LogoSpinner } from '@/shared/ui/LogoSpinner'
import { createPortal } from 'react-dom'
import { X, ChevronLeft, ChevronRight } from 'lucide-react'
import { useTranslations } from 'next-intl'

interface LightboxImage {
  url: string        // 원본 (1080px)
  mediumUrl?: string  // 중간 (800px)
  thumbnailUrl?: string
  youtubeUrl?: string
}

import { extractYouTubeId } from '@/shared/utils/youtube'

interface ImageLightboxProps {
  images: LightboxImage[]
  initialIndex?: number
  isOpen: boolean
  onClose: () => void
}

export function ImageLightbox({ images, initialIndex = 0, isOpen, onClose }: ImageLightboxProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex)
  const t = useTranslations('Pixel')
  const [isLoaded, setIsLoaded] = useState(false)
  const [mounted, setMounted] = useState(false)

  // Portal 마운트 확인
  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    setCurrentIndex(initialIndex)
    setIsLoaded(false)
  }, [initialIndex, isOpen])

  // 키보드 네비게이션
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!isOpen) return
    e.stopPropagation()
    if (e.key === 'Escape') onClose()
    if (e.key === 'ArrowLeft' && currentIndex > 0) {
      setCurrentIndex(prev => prev - 1)
      setIsLoaded(false)
    }
    if (e.key === 'ArrowRight' && currentIndex < images.length - 1) {
      setCurrentIndex(prev => prev + 1)
      setIsLoaded(false)
    }
  }, [isOpen, currentIndex, images.length, onClose])

  useEffect(() => {
    if (!isOpen) return
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [handleKeyDown, isOpen])

  // 배경 스크롤 방지
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [isOpen])

  if (!isOpen || images.length === 0 || !mounted) return null

  const currentImage = images[currentIndex]
  const displaySrc = currentImage.url

  const goToPrev = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1)
      setIsLoaded(false)
    }
  }

  const goToNext = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (currentIndex < images.length - 1) {
      setCurrentIndex(prev => prev + 1)
      setIsLoaded(false)
    }
  }

  const handleBackdropClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onClose()
  }

  const content = (
    <div
      className="fixed inset-0 flex items-center justify-center bg-black/95 backdrop-blur-xl"
      style={{ zIndex: 9999, pointerEvents: 'auto' }}
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
    >
      {/* 닫기 버튼 */}
      <button
        onClick={(e) => { e.stopPropagation(); onClose() }}
        className="absolute top-4 right-4 z-10 p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
        aria-label={t('lightboxClose')}
      >
        <X className="w-5 h-5" />
      </button>

      {/* 이미지 카운터 */}
      {images.length > 1 && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 px-3 py-1.5 rounded-full bg-white/10 backdrop-blur text-xs font-bold text-white/70 tabular-nums">
          {currentIndex + 1} / {images.length}
        </div>
      )}

      {/* 이전 버튼 */}
      {currentIndex > 0 && (
        <button
          onClick={goToPrev}
          className="absolute left-3 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
          aria-label={t('lightboxPrev')}
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
      )}

      {/* 다음 버튼 */}
      {currentIndex < images.length - 1 && (
        <button
          onClick={goToNext}
          className="absolute right-3 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
          aria-label={t('lightboxNext')}
        >
          <ChevronRight className="w-6 h-6" />
        </button>
      )}

      {/* 메인 이미지 / 유튜브 영상 */}
      <div
        className="max-w-[90vw] max-h-[85vh] flex items-center justify-center relative w-full h-full"
        onClick={(e) => e.stopPropagation()}
      >
        {!isLoaded && !currentImage.youtubeUrl && (
          <div className="absolute inset-0 flex items-center justify-center">
            <LogoSpinner size={32} />
          </div>
        )}
        
        {currentImage.youtubeUrl ? (
          <div className="w-full h-full max-w-5xl aspect-video rounded-lg overflow-hidden shadow-2xl bg-black">
            <iframe
              src={`https://www.youtube.com/embed/${extractYouTubeId(currentImage.youtubeUrl)}?autoplay=1`}
              title="YouTube video player"
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              className="w-full h-full"
            />
          </div>
        ) : (
          <img
            src={displaySrc}
            alt={t('lightboxAlt', { index: currentIndex + 1 })}
            className={`max-w-full max-h-[85vh] object-contain rounded-lg select-none transition-opacity duration-300 ${
              isLoaded ? 'opacity-100' : 'opacity-0 absolute'
            }`}
            draggable={false}
            onLoad={() => {
              setIsLoaded(true)
            }}
          />
        )}
      </div>

      {/* 하단 썸네일 스트립 */}
      {images.length > 1 && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-2">
          {images.map((img, i) => (
            <button
              key={i}
              onClick={(e) => { e.stopPropagation(); setCurrentIndex(i); setIsLoaded(false) }}
              className={`w-12 h-12 rounded-lg overflow-hidden border-2 transition-all ${
                i === currentIndex
                  ? 'border-white shadow-[0_0_12px_rgba(255,255,255,0.3)] scale-110'
                  : 'border-white/20 opacity-50 hover:opacity-80'
              }`}
            >
              <img
                src={img.thumbnailUrl || img.mediumUrl || img.url}
                alt=""
                className="w-full h-full object-cover"
              />
              {img.youtubeUrl && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                  <div className="w-5 h-5 rounded-full bg-red-600 flex items-center justify-center">
                    <div className="w-0 h-0 border-t-[3px] border-t-transparent border-l-[5px] border-l-white border-b-[3px] border-b-transparent ml-0.5" />
                  </div>
                </div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )

  // React Portal로 document.body에 직접 렌더링 — z-index/pointer-events 격리 보장
  return createPortal(content, document.body)
}

'use client'

import { useEffect, useRef, useState, ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { requestHideTabBar, requestShowTabBar } from '@/shared/lib/bridge'
import { isNativeApp } from '@/shared/utils/isNativeApp'
import { useMediaQuery } from '@/shared/hooks/useMediaQuery'

interface FullScreenModalProps {
  /** 모달 열림 상태 */
  isOpen: boolean
  /** 모달 닫기 핸들러 */
  onClose: () => void
  /** 헤더 타이틀 */
  title: string
  /** 모달 내부 컨텐츠 */
  children: ReactNode
  /** 하단 고정 영역 (버튼 등) */
  footer?: ReactNode
  /** 모달 컨테이너 배경색 (예: 'bg-slate-900', 'bg-[#0b0f10]') */
  bgColor?: string
  /** 풀팝업 시 네이티브 탭바를 숨길지 여부 (기본값: true) */
  hideTabBar?: boolean
  /** 데스크탑 최대 너비 제어 (기본값: 'max-w-lg') */
  maxWidth?: string
  /** React Portal 렌더링 시 외부 CSS 변수(--theme-rgb 등) 주입용 스타일 */
  style?: React.CSSProperties
}

/**
 * [공통 풀스크린 모달]
 * 
 * - 모바일(네이티브): 화면을 꽉 채우는 풀팝업. 열리면 네이티브 탭바를 브릿지를 통해 숨김.
 * - 데스크탑: 중앙 라운딩 다이얼로그.
 * - 다중 모달 동시 오픈 시 전역 카운트로 탭바 상태를 안전하게 관리.
 * - 웹뷰 리로드 시 Fail-safe로 탭바 자동 복구.
 */
export function FullScreenModal({ isOpen, onClose, title, children, footer, bgColor = 'bg-[#0b0f10]', hideTabBar = true, maxWidth = 'max-w-lg', style }: FullScreenModalProps) {
  const isMobile = useMediaQuery('(max-width: 767px)')
  const isNative = isNativeApp()
  const hasRegistered = useRef(false)
  const [mounted, setMounted] = useState(false)

  // Portal 마운트 확인 (SSR 하이드레이션 에러 방지)
  useEffect(() => {
    setMounted(true)
  }, [])

  // ── 네이티브 탭바 숨김/표시 브릿지 ──
  useEffect(() => {
    if (!isNative || !hideTabBar) return

    if (isOpen && !hasRegistered.current) {
      hasRegistered.current = true
      requestHideTabBar()
    } else if (!isOpen && hasRegistered.current) {
      hasRegistered.current = false
      requestShowTabBar()
    }

    // Cleanup: 컴포넌트 언마운트 시 안전장치
    return () => {
      if (hasRegistered.current) {
        hasRegistered.current = false
        requestShowTabBar()
      }
    }
  }, [isOpen, isNative, hideTabBar])

  if (!isOpen || !mounted) return null

  const content = (
    <div style={style} className="fixed inset-0 z-[120] flex items-start sm:items-center justify-center bg-black sm:bg-black/80 sm:backdrop-blur-sm pointer-events-auto animate-in fade-in">
      <div
        style={style}
        className={`w-full ${bgColor} shadow-2xl flex flex-col animate-in slide-in-from-bottom-5 duration-300 ${
          isMobile
            ? 'h-full max-h-full rounded-none border-0'
            : `${maxWidth} max-h-[90vh] rounded-3xl border border-slate-800`
        }`}
      >
        {/* ── 헤더 (플랫폼 공통) ── */}
        <div className="flex justify-between items-center shrink-0 px-5 pt-5 sm:px-8 sm:pt-8 pb-4 border-b border-white/10">
          <h2 className="text-base font-bold text-white">{title}</h2>
          <button
            onClick={onClose}
            className="text-white hover:bg-slate-800 transition p-2 rounded-full"
          >
            <X size={20} />
          </button>
        </div>

        {/* ── 스크롤 가능한 본문 영역 ── */}
        <div className="flex-1 min-h-0 overflow-y-auto px-5 sm:px-8 pb-4 custom-scrollbar">
          {children}
        </div>

        {/* ── 하단 고정 영역 (SafeArea 보호) ── */}
        {footer && (
          <div
            className="shrink-0 px-5 sm:px-8 pt-4 pb-2 sm:pb-4"
            style={{
              paddingBottom: isMobile && isNative
                ? '45px'
                : undefined,
              borderTopWidth: '0.5px',
              borderTopStyle: 'solid',
              borderTopColor: 'rgba(255, 255, 255, 0.1)',
            }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  )

  return createPortal(content, document.body)
}

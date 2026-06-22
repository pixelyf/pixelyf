'use client'

import React from 'react'
import { Languages } from 'lucide-react'

interface MomentBabelSwitcherProps {
  isShowingTranslation: boolean       // 현재 번역본 노출 여부
  onToggle: (e: React.MouseEvent) => void  // 토글 실행 함수
  primaryHex: string                  // 감정 테마 무드 컬러
  viewOriginalLabel?: string          // "원본보기" 다국어 텍스트
  translatedLabel?: string            // "번역됨" 다국어 텍스트
  isLight?: boolean                   // 화이트 배경용 라이트 모드 조건 추가
}

export function MomentBabelSwitcher({
  isShowingTranslation,
  onToggle,
  primaryHex,
  viewOriginalLabel = '원본보기',
  translatedLabel = '번역됨',
  isLight = false,
}: MomentBabelSwitcherProps) {
  // 라이트 모드와 다크 모드에 따른 조건부 테일윈드 클래스 분기
  const themeClasses = isLight
    ? (isShowingTranslation
        ? 'text-slate-800 font-extrabold border-transparent bg-slate-100' // 라이트 모드 번역 활성화 시 고대비 가독성 극대화
        : 'bg-slate-100 border-slate-300 text-slate-700 hover:bg-slate-200 hover:text-slate-900 font-bold' // 원문 상태: 화이트 배경에서 또렷하게 노출
      )
    : (isShowingTranslation
        ? 'border-transparent text-white' // 다크 모드 번역 활성화 시
        : 'bg-white/10 border-theme text-theme-secondary hover:bg-white/15 hover:text-theme-primary' // 원문 상태
      )

  return (
    <span className="inline-flex items-center gap-1.5 ml-2 relative top-[-1px] shrink-0 select-none">
      {/* 둥근 알약형 프리미엄 번역 스위치 버튼 */}
      <button
        onClick={onToggle}
        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black border transition-all duration-300 no-theme-hover outline-none focus:outline-none ring-0 focus:ring-0 ${themeClasses}`}
        style={isShowingTranslation ? {
          backgroundColor: isLight ? `${primaryHex}20` : `${primaryHex}26`, // 라이트 모드에서도 은은한 감정 파스텔톤 배경 연동
          borderColor: isLight ? `${primaryHex}CC` : 'transparent',         // 라이트 모드에서는 80% 고대비 테마 보더 적용
          color: isLight ? '#1e293b' : primaryHex,                          // 라이트 모드는 강한 차콜색(#1e293b)으로 가독성 강제 고정, 다크만 primaryHex로 설정
        } : undefined}
      >
        <Languages className={`w-2.5 h-2.5 ${isLight && isShowingTranslation ? 'text-slate-600' : ''}`} />
        <span>
          {isShowingTranslation 
            ? viewOriginalLabel // 번역본 상태일 때 누르면 원문을 봐야 하므로 -> "원본보기"
            : '번역'           // 원문 상태일 때 누르면 번역본으로 가야 하므로 -> "번역"
          }
        </span>
      </button>

    </span>
  )
}

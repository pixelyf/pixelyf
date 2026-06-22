'use client'

import { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { ArrowLeft, Search, X, Clock } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { isNativeApp } from '@/shared/utils/isNativeApp'
import { requestHideTabBar, requestShowTabBar } from '@/shared/lib/bridge'

interface MobileSearchOverlayProps {
  isOpen: boolean
  onClose: () => void
  searchTerm: string
  onSearchChange: (term: string) => void
  searchMode: 'content' | 'nickname'
  onSearchModeChange: (mode: 'content' | 'nickname') => void
}

export function MobileSearchOverlay({
  isOpen, onClose, searchTerm, onSearchChange, searchMode, onSearchModeChange
}: MobileSearchOverlayProps) {
  const t = useTranslations('Galaxy')
  const inputRef = useRef<HTMLInputElement>(null)

  // ── 최근 검색 기록(Recent Search History) 시스템 ──
  const [recentSearches, setRecentSearches] = useState<string[]>([])

  // 마운트/오픈 시 스토리지 로드
  useEffect(() => {
    if (isOpen) {
      try {
        const stored = localStorage.getItem('recent_feed_searches')
        if (stored) {
          setRecentSearches(JSON.parse(stored))
        }
      } catch (e) {
        console.error('Failed to load recent searches', e)
      }
    }
  }, [isOpen])

  // 검색 기록 저장
  const saveSearchTerm = (term: string) => {
    const trimmed = term.trim()
    if (!trimmed) return
    setRecentSearches((prev) => {
      const filtered = prev.filter((t) => t !== trimmed)
      const next = [trimmed, ...filtered].slice(0, 8)
      try {
        localStorage.setItem('recent_feed_searches', JSON.stringify(next))
      } catch (e) {}
      return next
    })
  }

  // 개별 기록 삭제
  const deleteRecentSearch = (term: string) => {
    setRecentSearches((prev) => {
      const next = prev.filter((t) => t !== term)
      try {
        localStorage.setItem('recent_feed_searches', JSON.stringify(next))
      } catch (e) {}
      return next
    })
  }

  // 전체 기록 삭제
  const clearRecentSearches = () => {
    setRecentSearches([])
    try {
      localStorage.removeItem('recent_feed_searches')
    } catch (e) {}
  }

  useEffect(() => {
    if (isOpen) {
      // 오버레이 열릴 때 자동 포커스
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [isOpen])

  useEffect(() => {
    if (!isNativeApp() || !isOpen) return
    requestHideTabBar()
    return () => requestShowTabBar()
  }, [isOpen])

  if (!isOpen) return null

  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.15 }}
      className="fixed inset-0 z-[60] bg-slate-950 flex flex-col"
    >
      {/* 헤더 */}
      <div className="flex items-center gap-3 px-4 h-12 border-b border-white/10 shrink-0">
        <button onClick={onClose} className="p-1 text-white/60 hover:text-white transition">
          <ArrowLeft className="w-5 h-5" />
        </button>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            saveSearchTerm(searchTerm)
            inputRef.current?.blur()
            onClose()
          }}
          className="flex-1 relative"
        >
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
          <input
            ref={inputRef}
            type="text"
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchMode === 'nickname' ? t('searchPlaceholderNickname') : t('searchPlaceholderContent')}
            className="w-full bg-slate-900/60 border border-slate-700/50 rounded-xl pl-9 pr-9 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-indigo-500/50 transition-all font-medium"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/70 transition"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </form>
      </div>

      {/* 검색 모드 토글 */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/5 shrink-0">
        <span className="text-[10px] text-white/30 font-medium">{t('searchTarget')}</span>
        <button
          onClick={() => onSearchModeChange('content')}
          className={`px-3 py-1 rounded-lg text-xs font-bold border transition-all ${
            searchMode === 'content'
              ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-300'
              : 'bg-slate-900/40 border-slate-700/40 text-white/40'
          }`}
        >
          {t('searchContent')}
        </button>
        <button
          onClick={() => onSearchModeChange('nickname')}
          className={`px-3 py-1 rounded-lg text-xs font-bold border transition-all ${
            searchMode === 'nickname'
              ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-300'
              : 'bg-slate-900/40 border-slate-700/40 text-white/40'
          }`}
        >
          {t('searchNickname')}
        </button>
      </div>

      {/* 바디 영역: 검색어가 없을 때 최근 검색어 세로 리스트 출력 (드넓은 빈 공간 활용) */}
      {!searchTerm && recentSearches.length > 0 ? (
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 shrink-0 animate-in fade-in duration-300">
          <div className="flex items-center justify-between border-b border-white/[0.05] pb-2">
            <span className="text-[12px] font-bold text-white/40">최근 검색어</span>
            <button
              onClick={clearRecentSearches}
              className="text-[11px] font-bold text-rose-400/70 hover:text-rose-400 transition active:scale-95"
            >
              전체 삭제
            </button>
          </div>
          <div className="flex flex-col">
            {recentSearches.map((term, index) => (
              <div
                key={`recent-${index}`}
                onClick={() => {
                  onSearchChange(term)
                  saveSearchTerm(term)
                  inputRef.current?.blur()
                  onClose()
                }}
                className="flex items-center justify-between py-3.5 border-b border-white/[0.03] active:bg-white/[0.03] transition-all cursor-pointer group/item"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Clock className="w-4 h-4 text-white/30 shrink-0" />
                  <span className="text-[14px] font-medium text-white/80 truncate group-hover/item:text-indigo-400 transition-colors">
                    {term}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    deleteRecentSearch(term)
                  }}
                  className="w-8 h-8 flex items-center justify-center rounded-full text-white/20 hover:text-rose-400 hover:bg-rose-500/10 active:scale-90 transition shrink-0"
                  title="검색 기록 삭제"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : (
        /* 안내 메시지 (기본 뷰) */
        <div className="flex-1 flex items-center justify-center">
          <p className="text-white/20 text-sm font-medium">
            {searchTerm ? t('searchResultsInFeed') : t('searchEnterTerm')}
          </p>
        </div>
      )}
    </motion.div>
  )
}

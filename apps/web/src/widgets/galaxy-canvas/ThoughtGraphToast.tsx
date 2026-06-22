'use client'

/**
 * [생각그래프] 화면 E — AI 연결 확인 토스트 (78번 §2)
 * 
 * 글 저장 후 AI가 연결을 만들었을 때 하단에 표시
 * [✓ 맞아요] [✗ 아니에요]
 * 
 * 표시 조건: confidence 0.4~0.7 구간 (pending 상태)
 * 자동 닫힘: 8초 후 자동 승인
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { Check, X } from 'lucide-react'

interface ToastItem {
  relationshipId: string
  summary: string
  relationType: string
  confidence: number
}

/** 관계 유형 한국어 */
const REL_LABELS: Record<string, string> = {
  extends: '이어가기',
  supports: '뒷받침',
  contradicts: '반론',
  refines: '다듬기',
  instantiates: '사례',
  requires: '전제',
  'triggered-by': '촉발',
  'near-miss': '유사',
}

export function ThoughtGraphToast() {
  const [queue, setQueue] = useState<ToastItem[]>([])
  const [current, setCurrent] = useState<ToastItem | null>(null)
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  // Realtime 이벤트 수신 (Supabase broadcast 또는 CustomEvent)
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as ToastItem
      if (detail?.relationshipId) {
        setQueue(prev => [...prev, detail])
      }
    }
    window.addEventListener('thought-graph-toast', handler)
    return () => window.removeEventListener('thought-graph-toast', handler)
  }, [])

  // 큐에서 다음 토스트 표시
  useEffect(() => {
    if (!current && queue.length > 0) {
      const [next, ...rest] = queue
      setCurrent(next)
      setQueue(rest)
    }
  }, [current, queue])

  // 8초 자동 승인 타이머
  useEffect(() => {
    if (!current) return

    timerRef.current = setTimeout(() => {
      handleConfirm()
    }, 8000)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [current])

  const handleConfirm = useCallback(async () => {
    if (!current) return
    try {
      await fetch(`/api/thought-graph/relationships/${current.relationshipId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'confirm' }),
      })
    } catch (err) {
      console.error('[ThoughtGraph] 토스트 승인 실패:', err)
    }
    setCurrent(null)
    if (timerRef.current) clearTimeout(timerRef.current)
  }, [current])

  const handleReject = useCallback(async () => {
    if (!current) return
    try {
      await fetch(`/api/thought-graph/relationships/${current.relationshipId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reject' }),
      })
    } catch (err) {
      console.error('[ThoughtGraph] 토스트 거부 실패:', err)
    }
    setCurrent(null)
    if (timerRef.current) clearTimeout(timerRef.current)
  }, [current])

  if (!current) return null

  const relLabel = REL_LABELS[current.relationType] || current.relationType

  return (
    <div
      className="fixed bottom-[80px] left-1/2 -translate-x-1/2 z-[60] w-[calc(100%-32px)] max-w-md pointer-events-auto animate-in slide-in-from-bottom-4 duration-400"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="rounded-2xl border border-white/10 bg-slate-900/90 backdrop-blur-2xl shadow-[0_8px_40px_rgba(0,0,0,0.6)] px-4 py-3.5">
        {/* 헤더 */}
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[16px]">✨</span>
          <span className="text-white/80 text-[13px] font-bold">
            AI가 과거 생각과 연결했어요
          </span>
        </div>

        {/* 연결 정보 */}
        <div className="flex items-center gap-2 mb-3 pl-6">
          <span className="text-white text-[14px] font-medium">
            "{current.summary}"
          </span>
          <span className="text-indigo-400 text-[11px] font-bold">
            ← {relLabel}
          </span>
        </div>

        {/* 버튼 */}
        <div className="flex items-center gap-2 pl-6">
          <button
            id="btn-toast-confirm"
            onClick={handleConfirm}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-[12px] font-bold hover:bg-emerald-500/30 transition-all active:scale-95"
          >
            <Check size={14} />
            <span>맞아요</span>
          </button>

          <button
            id="btn-toast-reject"
            onClick={handleReject}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-rose-500/20 border border-rose-500/30 text-rose-300 text-[12px] font-bold hover:bg-rose-500/30 transition-all active:scale-95"
          >
            <X size={14} />
            <span>아니에요</span>
          </button>
        </div>
      </div>
    </div>
  )
}

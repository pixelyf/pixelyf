'use client'

/**
 * [보호 키 섹션 컴포넌트]
 * 폴백 프로바이더 API 키를 추가하는 선택적 섹션입니다.
 */

import { useState } from 'react'
import { Shield, ChevronDown } from 'lucide-react'

interface ProtectionKeySectionProps {
  onKeyAdded: (provider: string) => void
}

export function ProtectionKeySection({ onKeyAdded }: ProtectionKeySectionProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [fallbackKey, setFallbackKey] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const handleAddFallbackKey = async () => {
    if (!fallbackKey.trim()) return
    setIsLoading(true)
    setError('')
    setSuccess('')

    try {
      const res = await fetch('/api/ai/providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: fallbackKey.trim() }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || '보호 키 등록에 실패했습니다.')
        return
      }

      setSuccess(`${data.provider} 보호 키가 등록되었습니다.`)
      setFallbackKey('')
      onKeyAdded(data.provider)
    } catch {
      setError('네트워크 오류가 발생했습니다.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="border border-white/10 rounded-2xl overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-amber-400" />
          <span className="text-sm font-medium text-white/70">보호 키 추가 (선택사항)</span>
        </div>
        <ChevronDown className={`w-4 h-4 text-white/30 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="px-4 pb-4 space-y-3 border-t border-white/5">
          <p className="text-xs text-white/40 mt-3">
            기본 키가 만료되었을 때 자동으로 전환할 보호 키를 등록할 수 있습니다.
            다른 프로바이더의 키를 입력해주세요.
          </p>
          <div className="flex gap-2">
            <input
              type="password"
              autoComplete="new-password"
              value={fallbackKey}
              onChange={(e) => setFallbackKey(e.target.value)}
              placeholder="sk-... 또는 AIza..."
              className="flex-1 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder-white/20 focus:outline-none focus:border-amber-500/40"
            />
            <button
              onClick={handleAddFallbackKey}
              disabled={isLoading || !fallbackKey.trim()}
              className="px-4 py-2 rounded-xl bg-amber-500/20 border border-amber-500/30 text-amber-300 text-sm font-bold hover:bg-amber-500/30 disabled:opacity-40 transition-all"
            >
              {isLoading ? '...' : '등록'}
            </button>
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
          {success && <p className="text-xs text-emerald-400">{success}</p>}
        </div>
      )}
    </div>
  )
}

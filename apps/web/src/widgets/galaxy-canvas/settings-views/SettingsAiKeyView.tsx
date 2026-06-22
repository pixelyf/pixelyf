'use client'

import React, { useState, useEffect } from 'react'
import { KeyRound, Check, Plus, Trash2, AlertTriangle, Shield, X } from 'lucide-react'
import { LogoSpinner } from '@/shared/ui/LogoSpinner'
import { ModalButton } from '@/shared/ui/ModalButton'
import { useUserStore } from '@/entities/user/model/useUserStore'

interface ApiKeyRecord {
  provider: string
  lastValidatedAt: string | null
  isActive: boolean
}

export function SettingsAiKeyView() {
  const [keys, setKeys] = useState<ApiKeyRecord[]>([])
  const [newKey, setNewKey] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [deletingProvider, setDeletingProvider] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const primaryProvider = useUserStore((s) => s.user?.ai_primary_provider)

  const PROVIDER_LABELS: Record<string, { label: string; prefix: string; color: string }> = {
    openai: { label: 'OpenAI (GPT)', prefix: 'sk-', color: '#10a37f' },
    gemini: { label: 'Google Gemini', prefix: 'AIza / AQ.', color: '#4285f4' },
    anthropic: { label: 'Anthropic Claude', prefix: 'sk-ant-', color: '#d97706' },
  }

  const loadKeys = async () => {
    setIsLoading(true)
    try {
      const res = await fetch('/api/users/me')
      if (res.ok) {
        const data = await res.json()
        // ai_provider_keys 목록 조회용 별도 엔드포인트가 없으므로 /api/ai/providers GET 활용
        const keysRes = await fetch('/api/ai/providers')
        if (keysRes.ok) {
          const keysData = await keysRes.json()
          setKeys(keysData.keys || [])
        }
      }
    } catch (err) {
      console.error('[SettingsAiKey] 로드 실패:', err)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadKeys()
  }, [])

  const handleAdd = async () => {
    if (!newKey.trim()) return
    setIsSaving(true)
    setError(null)
    setSaveSuccess(false)
    try {
      const res = await fetch('/api/ai/providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: newKey.trim() }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || '키 등록에 실패했습니다.')
        return
      }
      setNewKey('')
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 2000)
      await loadKeys()
    } catch (err) {
      setError('네트워크 오류가 발생했습니다.')
    } finally {
      setIsSaving(false)
    }
  }

  const requestDelete = (provider: string) => {
    setDeleteTarget(provider)
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    const provider = deleteTarget
    setDeleteTarget(null)
    setDeletingProvider(provider)
    setError(null)
    try {
      const res = await fetch('/api/ai/providers', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || '삭제에 실패했습니다.')
        return
      }
      await loadKeys()
    } catch (err) {
      setError('네트워크 오류가 발생했습니다.')
    } finally {
      setDeletingProvider(null)
    }
  }

  const getDeleteWarning = (provider: string) => {
    const isPrimary = primaryProvider === provider
    const isLastKey = keys.length <= 1
    if (isPrimary && isLastKey) {
      return '이 키를 삭제하면 AI 번역, 아바타 활동 등 모든 AI 기능이 비활성화됩니다.'
    }
    if (isPrimary) {
      return '기본 프로바이더 키를 삭제합니다. 다른 등록된 키로 자동 전환됩니다.'
    }
    return '이 보호 키를 삭제하시겠습니까?'
  }

  const detectProvider = (key: string) => {
    if (key.startsWith('sk-ant-')) return 'anthropic'
    if (key.startsWith('AIza') || key.startsWith('AQ.')) return 'gemini'
    if (key.startsWith('sk-')) return 'openai'
    return null
  }

  const detectedProvider = detectProvider(newKey.trim())
  const providerInfo = detectedProvider ? PROVIDER_LABELS[detectedProvider] : null

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <LogoSpinner size={48} variant="white" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* ── 설명 헤더 ── */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <KeyRound className="w-5 h-5 text-[rgb(var(--theme-rgb))]" />
          <h3 className="text-[16px] font-bold text-white">AI 번역 키 관리</h3>
        </div>
        <p className="text-sm text-white/90 leading-relaxed">
          피드 다국어 번역 기능을 사용하려면 OpenAI, Gemini, Claude 중 하나의 API 키를 등록해야 합니다.
          키는 암호화되어 안전하게 저장됩니다.
        </p>
      </div>

      {/* ── 보안 안내 ── */}
      <div className="flex items-start gap-3 p-3 rounded-xl bg-white/5 border border-white/10">
        <Shield className="w-4 h-4 text-[rgb(var(--theme-rgb))] shrink-0 mt-0.5" />
        <p className="text-sm text-white/90 leading-relaxed">
          API 키는 AES-256 암호화로 저장되며, 번역 기능에만 사용됩니다. 키 원본은 등록 후 조회되지 않습니다.
        </p>
      </div>

      {/* ── 에러 ── */}
      {error && (
        <div className="flex items-start gap-3 p-3 rounded-xl bg-red-500/10 border border-red-500/20">
          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <p className="text-sm text-red-300/90">{error}</p>
        </div>
      )}

      {/* ── 등록된 키 목록 ── */}
      {keys.length > 0 && (
        <div className="space-y-2">
          <p className="text-[12px] text-white/85 font-bold uppercase tracking-wider">등록된 키</p>
          <div className="space-y-2">
            {keys.map((key) => {
              const info = PROVIDER_LABELS[key.provider]
              return (
                <div
                  key={key.provider}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl border border-white/10 bg-white/[0.03]"
                >
                  <div
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ background: info?.color || '#64748b', boxShadow: `0 0 8px ${info?.color || '#64748b'}60` }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-white">{info?.label || key.provider}</div>
                    <div className="text-[12px] text-white/85 mt-0.5">
                      {key.isActive ? '✅ 활성' : '⚠ 비활성'} · 접두사: {info?.prefix || '—'}***
                    </div>
                  </div>
                  <button
                    onClick={() => requestDelete(key.provider)}
                    disabled={deletingProvider === key.provider}
                    className="p-1.5 rounded-lg text-white/85 hover:text-red-400 hover:bg-red-500/10 transition"
                  >
                    {deletingProvider === key.provider
                      ? <LogoSpinner size={24} variant="white" />
                      : <Trash2 className="w-3.5 h-3.5" />
                    }
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── 키 입력 ── */}
      <div className="space-y-3">
        <p className="text-[12px] text-white/85 font-bold uppercase tracking-wider">
          {keys.length > 0 ? '키 추가' : 'API 키 등록'}
        </p>
        <div className="relative">
          <input
            type="password"
            autoComplete="new-password"
            value={newKey}
            onChange={(e) => { setNewKey(e.target.value); setError(null) }}
            placeholder="sk-... 또는 AIza... / AQ... 또는 sk-ant-api03-..."
            className="w-full px-4 py-3 bg-black/20 border border-white/10 rounded-xl text-sm text-white placeholder-white/20 focus:outline-none focus:border-white/40 focus:ring-1 focus:ring-white/20 transition-all font-mono"
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          />
          {/* 자동 감지된 프로바이더 배지 */}
          {providerInfo && (
            <div
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] font-bold px-2 py-0.5 rounded-full"
              style={{ background: `${providerInfo.color}20`, color: providerInfo.color, border: `1px solid ${providerInfo.color}40` }}
            >
              {providerInfo.label}
            </div>
          )}
        </div>

        <ModalButton
          variant="solid"
          fullWidth
          isLoading={isSaving}
          disabled={!newKey.trim() || isSaving}
          onClick={handleAdd}
          leftIcon={saveSuccess ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
        >
          {saveSuccess ? '등록 완료!' : 'API 키 검증 후 등록'}
        </ModalButton>
        <p className="text-[12px] text-white/85 text-center">
          등록 시 키의 유효성이 즉시 검증됩니다
        </p>
      </div>

      {/* ── 지원 프로바이더 ── */}
      <div className="space-y-2 pt-2 border-t border-white/5">
        <p className="text-[12px] text-white/85 font-bold uppercase tracking-wider">지원 프로바이더</p>
        <div className="grid grid-cols-1 gap-1.5">
          {Object.entries(PROVIDER_LABELS).map(([prov, info]) => (
            <div key={prov} className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-white/[0.02]">
              <div className="w-1.5 h-1.5 rounded-full" style={{ background: info.color }} />
              <span className="text-[12px] font-medium text-white/90">{info.label}</span>
              <span className="text-[12px] text-white/85 font-mono ml-auto">{info.prefix}***</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── 삭제 확인 모달 ── */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl bg-[#1a1f23] border border-white/10 shadow-2xl">
            {/* 헤더 */}
            <div className="flex items-center justify-between px-5 pt-5 pb-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-red-400" />
                <h4 className="text-[15px] font-bold text-white">키 삭제 확인</h4>
              </div>
              <button
                onClick={() => setDeleteTarget(null)}
                className="p-1 rounded-lg text-white/40 hover:text-white/70 hover:bg-white/5 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 경고 메시지 */}
            <div className="px-5 pb-4">
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20">
                <p className="text-sm text-red-300/90 leading-relaxed">
                  {getDeleteWarning(deleteTarget)}
                </p>
              </div>
              <p className="mt-3 text-[12px] text-white/40">
                삭제 대상: <span className="font-bold text-white/60">{PROVIDER_LABELS[deleteTarget]?.label || deleteTarget}</span>
              </p>
            </div>

            {/* 액션 버튼 */}
            <div className="flex gap-2 px-5 pb-5">
              <button
                onClick={() => setDeleteTarget(null)}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-white/5 border border-white/10 text-white/70 hover:bg-white/10 transition"
              >
                취소
              </button>
              <button
                onClick={confirmDelete}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-red-500/20 border border-red-500/30 text-red-300 hover:bg-red-500/30 transition"
              >
                삭제
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

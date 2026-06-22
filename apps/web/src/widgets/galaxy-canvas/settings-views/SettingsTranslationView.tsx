'use client'

import React, { useState, useEffect } from 'react'
import { Languages, AlertTriangle, Check } from 'lucide-react'
import { LogoSpinner } from '@/shared/ui/LogoSpinner'
import { useUserStore } from '@/entities/user/model/useUserStore'
import { ModalButton } from '@/shared/ui/ModalButton'
import { useTranslations } from 'next-intl'

// ─── 지원 언어 목록 ──────────────────────────────────────────

const SUPPORTED_LANGUAGES = [
  { code: 'ko', label: '한국어', flag: '🇰🇷' },
  { code: 'en', label: 'English', flag: '🇺🇸' },
  { code: 'ja', label: '日本語', flag: '🇯🇵' },
  { code: 'zh', label: '中文', flag: '🇨🇳' },
  { code: 'fr', label: 'Français', flag: '🇫🇷' },
  { code: 'es', label: 'Español', flag: '🇪🇸' },
  { code: 'de', label: 'Deutsch', flag: '🇩🇪' },
  { code: 'pt', label: 'Português', flag: '🇧🇷' },
  { code: 'it', label: 'Italiano', flag: '🇮🇹' },
  { code: 'vi', label: 'Tiếng Việt', flag: '🇻🇳' },
  { code: 'th', label: 'ไทย', flag: '🇹🇭' },
]

export function SettingsTranslationView() {
  const t = useTranslations('Settings')
  const user = useUserStore((s) => s.user)
  const setUser = useUserStore((s) => s.setUser)

  const [selectedLangs, setSelectedLangs] = useState<string[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const [hasApiKey, setHasApiKey] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [saveSuccess, setSaveSuccess] = useState(false)

  // 초기 데이터 로드
  useEffect(() => {
    const loadData = async () => {
      try {
        const [userRes, keysRes] = await Promise.all([
          fetch('/api/users/me'),
          fetch('/api/ai/providers'),
        ])
        if (userRes.ok) {
          const data = await userRes.json()
          const langs = data.feed_translation_languages && data.feed_translation_languages.length > 0
            ? data.feed_translation_languages
            : SUPPORTED_LANGUAGES.map((l) => l.code)
          setSelectedLangs(langs)
        }
        if (keysRes.ok) {
          const keysData = await keysRes.json()
          setHasApiKey((keysData.keys || []).some((k: any) => k.isActive))
        }
      } catch (err) {
        console.error('[SettingsTranslation] 로드 실패:', err)
      } finally {
        setIsLoading(false)
      }
    }
    loadData()
  }, [])

  // 언어 토글
  const toggleLang = (code: string) => {
    if (!hasApiKey) return
    const userLanguage = (user as any)?.language || 'ko'
    if (code === userLanguage) return

    setSelectedLangs((prev) =>
      prev.includes(code)
        ? prev.filter((l) => l !== code)
        : [...prev, code],
    )
    setSaveSuccess(false)
  }

  // 저장
  const handleSave = async () => {
    setIsSaving(true)
    setSaveSuccess(false)
    try {
      const res = await fetch('/api/users/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feed_translation_languages: selectedLangs }),
      })
      if (res.ok) {
        setSaveSuccess(true)
        if (user) {
          setUser({ ...user, feed_translation_languages: selectedLangs } as any)
        }
        setTimeout(() => setSaveSuccess(false), 2000)
      }
    } catch (err) {
      console.error('[SettingsTranslation] 저장 실패:', err)
    } finally {
      setIsSaving(false)
    }
  }

  const userLang = user?.ai_primary_provider // fallback에서 실제 사용자 언어 확인 필요
  // 사용자 언어 코드 (서버에서 받아온 language 필드 기반)
  const userLanguage = (user as any)?.language || 'ko'

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
          <Languages className="w-5 h-5 text-[rgb(var(--theme-rgb))]" />
          <h3 className="text-[16px] font-bold text-white">{t('translationTitle')}</h3>
        </div>
        <p className="text-sm text-white/90 leading-relaxed">
          {t('translationDesc')}
        </p>
      </div>

      {/* ── API 키 미등록 경고 ── */}
      {!hasApiKey && (
        <div className="flex items-start gap-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-300/90 leading-relaxed">
            {t('translationNoApiKey')}
          </p>
        </div>
      )}

      {/* ── 언어 체크박스 목록 ── */}
      <div className="space-y-1.5">
        {SUPPORTED_LANGUAGES.map((lang) => {
          const isUserLang = lang.code === userLanguage
          const isSelected = selectedLangs.includes(lang.code)
          const isDisabled = !hasApiKey || isUserLang

          return (
            <button
              key={lang.code}
              onClick={() => toggleLang(lang.code)}
              disabled={isDisabled}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-all ${
                isDisabled
                  ? 'opacity-50 cursor-not-allowed border-white/5 bg-white/[0.02]'
                  : isSelected
                    ? 'border-[rgba(var(--theme-rgb),0.3)] bg-[rgba(var(--theme-rgb),0.08)] hover:bg-[rgba(var(--theme-rgb),0.12)]'
                    : 'border-white/5 bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/10'
              }`}
            >
              {/* 체크 표시 */}
              <div
                className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-all ${
                  isSelected && !isDisabled
                    ? 'bg-[rgb(var(--theme-rgb))] border-[rgb(var(--theme-rgb-light))]'
                    : 'border-white/20 bg-transparent'
                }`}
              >
                {isSelected && !isDisabled && <Check className="w-3 h-3 text-white" />}
              </div>

              {/* 국기 + 언어명 */}
              <span className="text-base">{lang.flag}</span>
              <span className={`text-[16px] font-medium ${isSelected && !isDisabled ? 'text-white' : 'text-white/90'}`}>
                {lang.label}
              </span>
              <span className="text-[12px] text-white/85 ml-auto">
                {lang.code}
              </span>

              {/* 사용자 언어 표시 */}
              {isUserLang && (
                <span className="text-[12px] text-white/85 bg-white/10 px-2 py-0.5 rounded-full">
                  {t('translationMyLang')}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* ── 선택 요약 + 저장 버튼 ── */}
      <div className="space-y-3">
        <p className="text-[12px] text-white/85">
          {t('translationSelected', { count: selectedLangs.length })}
        </p>
        <ModalButton
          variant="solid"
          fullWidth
          isLoading={isSaving}
          disabled={!hasApiKey}
          onClick={handleSave}
          leftIcon={saveSuccess ? <Check className="w-4 h-4" /> : undefined}
        >
          {saveSuccess ? t('translationSaved') : t('translationSave')}
        </ModalButton>
      </div>
    </div>
  )
}

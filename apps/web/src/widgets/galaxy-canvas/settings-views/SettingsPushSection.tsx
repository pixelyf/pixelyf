'use client'

import React, { useState, useEffect, useCallback } from 'react'
import {
  Bell, Hand, Zap, MessageCircle, Users, BookOpen, Mail, Megaphone,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { LogoSpinner } from '@/shared/ui/LogoSpinner'

interface PushSettings {
  push_touch_enabled: boolean
  push_ping_enabled: boolean
  push_comment_enabled: boolean
  push_bond_enabled: boolean
  push_subscription_enabled: boolean
  push_dm_enabled: boolean
  push_marketing_enabled: boolean
}

const PUSH_SETTING_ITEMS = [
  { key: 'push_touch_enabled', icon: Hand, labelKey: 'touchAlert', descKey: 'touchAlertDesc' },
  { key: 'push_ping_enabled', icon: Zap, labelKey: 'pingAlert', descKey: 'pingAlertDesc' },
  { key: 'push_comment_enabled', icon: MessageCircle, labelKey: 'commentAlert', descKey: 'commentAlertDesc' },
  { key: 'push_bond_enabled', icon: Users, labelKey: 'bondAlert', descKey: 'bondAlertDesc' },
  { key: 'push_subscription_enabled', icon: BookOpen, labelKey: 'subscriptionAlert', descKey: 'subscriptionAlertDesc' },
  { key: 'push_dm_enabled', icon: Mail, labelKey: 'dmAlert', descKey: 'dmAlertDesc' },
  { key: 'push_marketing_enabled', icon: Megaphone, labelKey: 'marketingAlert', descKey: 'marketingAlertDesc' },
] as const

export function SettingsPushSection() {
  const t = useTranslations('Settings')
  const [settings, setSettings] = useState<PushSettings | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [updatingKey, setUpdatingKey] = useState<string | null>(null)

  // ── 설정 로드 ──
  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/users/push-settings')
      if (!res.ok) throw new Error('fetch failed')
      const data = await res.json()
      setSettings(data.data)
    } catch (e) {
      console.error('[SettingsPushSection] fetch error:', e)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSettings()
  }, [fetchSettings])

  // ── 토글 업데이트 ──
  const handleToggle = async (key: string, currentValue: boolean) => {
    if (updatingKey) return // 중복 요청 방지
    setUpdatingKey(key)

    // Optimistic update
    setSettings(prev => prev ? { ...prev, [key]: !currentValue } : prev)

    try {
      const res = await fetch('/api/users/push-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [key]: !currentValue }),
      })

      if (!res.ok) {
        // 롤백
        setSettings(prev => prev ? { ...prev, [key]: currentValue } : prev)
      } else {
        const data = await res.json()
        setSettings(data.data)
      }
    } catch (e) {
      // 롤백
      setSettings(prev => prev ? { ...prev, [key]: currentValue } : prev)
      console.error('[SettingsPushSection] toggle error:', e)
    } finally {
      setUpdatingKey(null)
    }
  }

  if (isLoading) {
    return (
      <div className="rounded-xl border border-white/5 bg-white/[0.02] p-6 flex flex-col items-center justify-center min-h-[160px] gap-3">
        <LogoSpinner size={24} variant="white" />
        <span className="text-xs text-white/40">{t('pushSettingsDesc')}</span>
      </div>
    )
  }

  if (!settings) return null

  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.02] overflow-hidden">
      {/* 헤더 */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5">
        <Bell className="w-4 h-4 text-white/60" />
        <span className="text-sm font-semibold text-white/90">{t('pushSettingsTitle')}</span>
      </div>

      {/* 토글 목록 */}
      {PUSH_SETTING_ITEMS.map(({ key, icon: Icon, labelKey, descKey }) => {
        const value = settings[key as keyof PushSettings]
        const isUpdating = updatingKey === key

        return (
          <div
            key={key}
            className="flex items-center justify-between px-4 py-3 border-b border-white/[0.03] last:border-b-0"
          >
            <div className="flex items-center gap-3">
              <Icon className="w-4 h-4 text-white/50 shrink-0" />
              <div>
                <p className="text-sm text-white/90">{t(labelKey as any)}</p>
                <p className="text-xs text-white/40 mt-0.5">{t(descKey as any)}</p>
              </div>
            </div>

            {/* 토글 스위치 */}
            <button
              onClick={() => handleToggle(key, value)}
              disabled={isUpdating}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 ${
                value ? 'bg-indigo-500' : 'bg-white/10'
              } ${isUpdating ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
                  value ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        )
      })}
    </div>
  )
}

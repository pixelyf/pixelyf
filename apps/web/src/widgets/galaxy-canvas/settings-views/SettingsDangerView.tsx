'use client'

import React, { useState } from 'react'
import { LogOut, Trash2, AlertTriangle } from 'lucide-react'
import { galaxyConfirm, galaxyAlert } from '@/stores/dialogStore'
import { useUserStore } from '@/entities/user/model/useUserStore'
import { createClient } from '@/shared/lib/supabase/browser'
import { useTranslations } from 'next-intl'

export function SettingsDangerView() {
  const t = useTranslations('Settings')
  const [isDeleting, setIsDeleting] = useState(false)

  const handleLogout = async () => {
    const ok = await galaxyConfirm({
      title: t('logoutConfirmTitle'),
      message: t('logoutConfirmMsg'),
      variant: 'warning',
      confirmText: t('logout'),
      confirmButtonClass: 'bg-white hover:bg-slate-100 text-slate-950 border border-slate-200 shadow-sm',
    })
    if (!ok) return
    try {
      // [FIX] 브라우저 쿠키(sb-pixelyf-auth.*)를 직접 삭제하여 OAuth 재로그인 시 잔여 쿠키 충돌 방지
      const supabase = createClient()
      await supabase.auth.signOut()
      await fetch('/api/auth/signout', { method: 'POST' })
    } catch (e) {
      console.error('[Danger] Logout error:', e)
    }
    useUserStore.getState().logout()
    window.location.href = '/auth/login'
  }

  const handleDeleteAccount = async () => {
    // 1차 확인
    const ok1 = await galaxyConfirm({
      title: t('deleteConfirm1Title'),
      message: t('deleteConfirm1Msg'),
      variant: 'danger',
      confirmText: t('deleteConfirm1Btn'),
      confirmDanger: true,
    })
    if (!ok1) return

    // 2차 확인 (최종)
    const ok2 = await galaxyConfirm({
      title: t('deleteConfirm2Title'),
      message: t('deleteConfirm2Msg'),
      variant: 'danger',
      confirmText: t('deleteConfirm2Btn'),
      confirmDanger: true,
    })
    if (!ok2) return

    setIsDeleting(true)
    try {
      const res = await fetch('/api/users/me', { method: 'DELETE' })
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || t('deleteFailed'))
      }

      await galaxyAlert({
        title: t('deleteCompleteTitle'),
        message: data.message || t('deleteCompleteMsg'),
        variant: 'info',
      })

      useUserStore.getState().logout()
      window.location.href = '/auth/login'
    } catch (e) {
      console.error('[Danger] Delete account error:', e)
      await galaxyAlert({
        title: t('deleteFailedTitle'),
        message: e instanceof Error ? e.message : t('deleteRetry'),
        variant: 'error',
      })
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* 안내 배너 */}
      <div className="p-5 rounded-2xl bg-white/5 border border-white/10">
        <h3 className="text-[16px] font-bold text-white mb-1">{t('dangerZoneTitle')}</h3>
        <p className="text-sm text-white/90 leading-relaxed">
          {t('dangerZoneDesc')}
        </p>
      </div>

      {/* 로그아웃 */}
      <div className="p-6 rounded-2xl bg-white/5 border border-white/5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-white/5 border border-white/10">
              <LogOut className="w-5 h-5 text-white" />
            </div>
            <div>
              <h4 className="text-[16px] font-bold text-white">{t('logout')}</h4>
              <p className="text-sm text-white/90 mt-0.5">{t('logoutDesc')}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="px-5 py-2.5 rounded-xl text-sm font-bold text-black bg-white hover:bg-slate-100 transition-all"
          >
            {t('logout')}
          </button>
        </div>
      </div>

      <div className="h-px w-full bg-white/5" />

      {/* 회원탈퇴 */}
      <div className="p-6 rounded-2xl bg-white/5 border border-white/10">
        <div className="flex items-start gap-4 mb-5">
          <div className="flex items-center justify-center w-10 h-10 rounded-full bg-white/5 border border-white/10 shrink-0">
            <Trash2 className="w-5 h-5 text-white" />
          </div>
          <div>
            <h4 className="text-[16px] font-bold text-white">{t('deleteAccount')}</h4>
            <p className="text-sm text-white/85 mt-1 leading-relaxed">
              {t('deleteAccountDesc1')}
              {t('deleteAccountDesc2')}
            </p>
          </div>
        </div>

        <div className="space-y-2.5 mb-5 pl-14">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-3.5 h-3.5 text-red-400/80 shrink-0 mt-0.5" />
            <p className="text-[12px] text-white/85 leading-relaxed">{t('deleteWarn1')}</p>
          </div>
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-3.5 h-3.5 text-red-400/80 shrink-0 mt-0.5" />
            <p className="text-[12px] text-white/85 leading-relaxed">{t('deleteWarn2')}</p>
          </div>
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-3.5 h-3.5 text-red-400/80 shrink-0 mt-0.5" />
            <p className="text-[12px] text-white/85 leading-relaxed">{t('deleteWarn3')}</p>
          </div>
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
            <p className="text-[12px] text-white/90 leading-relaxed font-bold">{t('deleteWarn4')}</p>
          </div>
        </div>

        <div className="pl-14">
          <button
            onClick={handleDeleteAccount}
            disabled={isDeleting}
            className="px-5 py-2.5 rounded-xl text-sm font-bold text-black bg-white hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {isDeleting ? t('processing') : t('deleteAccount')}
          </button>
        </div>
      </div>
    </div>
  )
}

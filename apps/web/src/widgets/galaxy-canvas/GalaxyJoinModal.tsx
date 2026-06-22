'use client'

import React, { useState, useCallback } from 'react'
import { Rocket, Sparkles, Loader2, Globe } from 'lucide-react'
import { useGalaxyStore } from '@/stores/galaxyStore'
import { useToastStore } from '@/stores/toastStore'
import { useGalaxySystem } from '@/shared/hooks/useGalaxySystem'
import { useUserStore } from '@/entities/user/model/useUserStore'
import { dispatchGalaxyWarp } from '@/shared/utils/galaxyWarp'
import { FullScreenModal } from '@/shared/ui/FullScreenModal'
import { ModalButton } from '@/shared/ui/ModalButton'
import type { GalaxyKey } from '@/shared/constants/galaxySystem'
import { stripLocalePrefix } from '@/shared/lib/i18n/stripLocalePrefix'
import { useTranslations } from 'next-intl'

export function GalaxyJoinModal() {
  const { isJoinModalOpen, pendingJoinGalaxyKey, setIsJoinModalOpen, setPendingJoinGalaxyKey } = useGalaxyStore()
  const { getGalaxyByKey } = useGalaxySystem()
  const { addToast } = useToastStore()
  const initialize = useUserStore(s => s.initialize)
  const [isJoining, setIsJoining] = useState(false)
  const t = useTranslations('Galaxy')

  const galaxy = pendingJoinGalaxyKey ? getGalaxyByKey(pendingJoinGalaxyKey) : null

  const handleClose = useCallback(() => {
    setIsJoinModalOpen(false)
    setPendingJoinGalaxyKey(null)
  }, [setIsJoinModalOpen, setPendingJoinGalaxyKey])

  const handleJoin = useCallback(async () => {
    if (!galaxy) return
    setIsJoining(true)

    try {
      const res = await fetch('/api/galaxies/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ galaxyKey: galaxy.key }),
      })
      const data = await res.json()

      if (!res.ok) {
        addToast({ type: 'error', title: t('joinError'), message: data.error || t('joinErrorMsg') })
        setIsJoining(false)
        return
      }

      // User 스토어 갱신 (좌표 등)
      await initialize()

      addToast({ type: 'success', title: t('joinSuccess'), message: t('joinSuccessMsg', { name: galaxy.name }) })
      
      // 모달 닫고 워프
      setIsJoinModalOpen(false)
      
      setTimeout(() => {
        // Zustand 업데이트 후 엔진 워프
        useGalaxyStore.getState().setGalaxyKey(galaxy.key as GalaxyKey)
        useGalaxyStore.getState().setActiveCategory(null)
        dispatchGalaxyWarp({ galaxyKey: galaxy.key as GalaxyKey })
        
        // 브라우저 URL 동기화
        const targetUrl = `/${galaxy.partnerCode}`
        if (stripLocalePrefix(window.location.pathname) !== targetUrl) {
          window.history.pushState(null, '', targetUrl)
        }
        setPendingJoinGalaxyKey(null)
      }, 300)

    } catch (error) {
      console.error('[GalaxyJoinModal] Join error:', error)
      addToast({ type: 'error', title: t('joinError'), message: t('joinNetworkError') })
    } finally {
      setIsJoining(false)
    }
  }, [galaxy, addToast, initialize, setIsJoinModalOpen, setPendingJoinGalaxyKey])

  if (!isJoinModalOpen || !galaxy) return null

  // ── 하단 고정 액션 버튼 ──
  const actionFooter = (
    <div className="w-full">
      <ModalButton
        onClick={handleJoin}
        disabled={isJoining}
        isLoading={isJoining}
        fullWidth
        className="!bg-white hover:!bg-white/90 !text-black font-extrabold !border-0 shadow-xl shadow-white/5 h-12 rounded-xl transition-all"
      >
        {t('joinCreateCoord')}
      </ModalButton>
    </div>
  )

  const modalTitle = t('joinGalaxyTitle', { name: galaxy.name })

  return (
    <FullScreenModal
      isOpen={isJoinModalOpen}
      onClose={handleClose}
      title={modalTitle}
      footer={actionFooter}
      bgColor="bg-[#0b0f10]"
    >
      <div className="space-y-6">
        {/* 설명 */}
        <div className="text-center space-y-3 pt-4">
          <p className="text-sm text-white/50 leading-relaxed">
            {t.rich('joinGalaxyDesc', {
              newCoord: (chunks) => <span className="text-indigo-300 font-bold">{chunks}</span>,
              br: () => <br />,
            })}
          </p>
        </div>
      </div>
    </FullScreenModal>
  )
}

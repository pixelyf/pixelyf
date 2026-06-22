'use client'

import { FullScreenModal } from '@/shared/ui/FullScreenModal'
import { ModalButton } from '@/shared/ui/ModalButton'
import React from 'react'
import { useTranslations } from 'next-intl'

interface ActionConfirmModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  message: React.ReactNode
  onConfirm: () => void
  confirmLabel?: string
  isLoading?: boolean
  themeStyle?: React.CSSProperties
}

export function ActionConfirmModal({
  isOpen,
  onClose,
  title,
  message,
  onConfirm,
  confirmLabel,
  isLoading = false,
  themeStyle,
}: ActionConfirmModalProps) {
  const tCommon = useTranslations('Common')

  const footer = (
    <div className="flex gap-2">
      <ModalButton onClick={onClose} variant="glass" disabled={isLoading} className="flex-1">
        {tCommon('cancel')}
      </ModalButton>
      <ModalButton onClick={onConfirm} isLoading={isLoading} className="flex-1">
        {confirmLabel || tCommon('confirm')}
      </ModalButton>
    </div>
  )

  if (!isOpen) return null

  return (
    <div style={themeStyle} className="contents">
      <FullScreenModal
        style={themeStyle}
        isOpen={isOpen}
        onClose={onClose}
        title={title}
        footer={footer}
        bgColor="theme-panel-bg"
      >
        <div className="py-6 px-2 text-center text-white/80 font-medium">
          {message}
        </div>
      </FullScreenModal>
    </div>
  )
}

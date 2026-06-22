'use client'

/**
 * [GalaxyDialogProvider]
 * 전역 커스텀 다이얼로그 렌더러.
 * layout.tsx에 1회 주입하면 앱 전체에서 galaxyAlert/galaxyConfirm 사용 가능.
 *
 * 디자인: GalaxyModal과 동일한 glass-premium 스타일, variant별 아이콘/색상 분기.
 */

import React, { useEffect, useRef, useCallback, useState } from 'react'
import { useDialogStore, type DialogConfig, type DialogVariant } from '@/stores/dialogStore'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertCircle, CheckCircle2, Info, AlertTriangle, ShieldAlert } from 'lucide-react'
import { useTranslations } from 'next-intl'

// ─── Variant별 스타일 매핑 ───
const VARIANT_STYLES: Record<DialogVariant, {
  Icon: typeof Info
  iconColor: string
  bgAccent: string
  borderAccent: string
  confirmBg: string
  confirmHover: string
}> = {
  info: {
    Icon: Info,
    iconColor: 'text-indigo-400',
    bgAccent: 'bg-indigo-500/10',
    borderAccent: 'border-indigo-500/20',
    confirmBg: 'bg-indigo-500 hover:bg-indigo-400',
    confirmHover: 'hover:bg-indigo-400',
  },
  success: {
    Icon: CheckCircle2,
    iconColor: 'text-emerald-400',
    bgAccent: 'bg-emerald-500/10',
    borderAccent: 'border-emerald-500/20',
    confirmBg: 'bg-emerald-500 hover:bg-emerald-400',
    confirmHover: 'hover:bg-emerald-400',
  },
  warning: {
    Icon: AlertTriangle,
    iconColor: 'text-amber-400',
    bgAccent: 'bg-amber-500/10',
    borderAccent: 'border-amber-500/20',
    confirmBg: 'bg-amber-500 hover:bg-amber-400',
    confirmHover: 'hover:bg-amber-400',
  },
  error: {
    Icon: AlertCircle,
    iconColor: 'text-red-400',
    bgAccent: 'bg-red-500/10',
    borderAccent: 'border-red-500/20',
    confirmBg: 'bg-red-500 hover:bg-red-400',
    confirmHover: 'hover:bg-red-400',
  },
  danger: {
    Icon: ShieldAlert,
    iconColor: 'text-red-400',
    bgAccent: 'bg-red-500/10',
    borderAccent: 'border-red-500/20',
    confirmBg: 'bg-red-600 hover:bg-red-500',
    confirmHover: 'hover:bg-red-500',
  },
}

function DialogRenderer({ dialog }: { dialog: DialogConfig }) {
  const removeDialog = useDialogStore((s) => s.removeDialog)
  const tC = useTranslations('Common')
  const confirmRef = useRef<HTMLButtonElement>(null)
  const modalRef = useRef<HTMLDivElement>(null)

  const variant = dialog.variant || 'info'
  const style = VARIANT_STYLES[variant]
  const IconComponent = style.Icon

  // Prompt 입력값 상태
  const [promptValue, setPromptValue] = useState(dialog.defaultValue || '')

  const handleConfirm = useCallback(() => {
    if (dialog.type === 'prompt') {
      dialog.resolve(promptValue)
    } else {
      dialog.resolve(true)
    }
    removeDialog(dialog.id)
  }, [dialog, removeDialog, promptValue])

  const handleCancel = useCallback(() => {
    if (dialog.type === 'prompt') {
      dialog.resolve(null)
    } else {
      dialog.resolve(false)
    }
    removeDialog(dialog.id)
  }, [dialog, removeDialog])

  // ESC 키 처리 + 자동 포커스
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        if (dialog.type === 'confirm') handleCancel()
        else handleConfirm()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    // 열릴 때 확인 버튼에 포커스
    requestAnimationFrame(() => confirmRef.current?.focus())
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [dialog.type, handleConfirm, handleCancel])

  // Focus Trap
  useEffect(() => {
    const modal = modalRef.current
    if (!modal) return

    const focusableSelector = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      const focusable = modal.querySelectorAll<HTMLElement>(focusableSelector)
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault()
          last.focus()
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', handleTab)
    return () => document.removeEventListener('keydown', handleTab)
  }, [])

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="fixed inset-0 flex items-center justify-center p-4 pointer-events-auto"
      style={{ zIndex: 9999 }}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
        onClick={() => {
          if (dialog.type === 'confirm') handleCancel()
          else handleConfirm()
        }}
      />

      {/* Modal */}
      <motion.div
        ref={modalRef}
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`dialog-title-${dialog.id}`}
        aria-describedby={dialog.message ? `dialog-desc-${dialog.id}` : undefined}
        className="relative w-full max-w-sm bg-slate-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6">
          {/* Icon + Title */}
          <div className="flex items-start gap-3 mb-2">
            <div className={`shrink-0 w-10 h-10 rounded-xl ${style.bgAccent} border ${style.borderAccent} flex items-center justify-center`}>
              <IconComponent className={`w-5 h-5 ${style.iconColor}`} />
            </div>
            <div className="flex-1 min-w-0 pt-1">
              <h3
                id={`dialog-title-${dialog.id}`}
                className="text-sm font-bold text-white leading-snug"
              >
                {dialog.title}
              </h3>
            </div>
          </div>

          {/* Message */}
          {dialog.message && (
            <p
              id={`dialog-desc-${dialog.id}`}
              className="text-sm text-white/60 leading-relaxed mt-3 font-medium"
            >
              {dialog.message}
            </p>
          )}

          {/* Prompt Input */}
          {dialog.type === 'prompt' && (
            <input
              type="text"
              value={promptValue}
              onChange={(e) => setPromptValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleConfirm() }}
              placeholder={dialog.placeholder || ''}
              autoFocus
              className="w-full mt-4 px-4 py-3 bg-slate-950 border border-white/10 rounded-xl text-sm text-white placeholder-white/30 focus:outline-none focus:border-indigo-500 transition"
            />
          )}

          {/* Buttons */}
          <div className={`flex gap-2.5 mt-6 ${dialog.type === 'alert' ? 'justify-end' : ''}`}>
            {(dialog.type === 'confirm' || dialog.type === 'prompt') && (
              <button
                onClick={handleCancel}
                className="flex-1 py-3 rounded-xl bg-white/5 border border-white/10 text-sm font-bold text-white/60 hover:bg-white/10 hover:text-white transition-all active:scale-[0.97]"
              >
                {dialog.cancelText || tC('cancel')}
              </button>
            )}
            <button
              ref={confirmRef}
              onClick={handleConfirm}
              className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all active:scale-[0.97] ${
                dialog.confirmButtonClass
                  ? dialog.confirmButtonClass
                  : dialog.confirmDanger
                  ? `${VARIANT_STYLES.danger.confirmBg} text-white`
                  : `${style.confirmBg} text-white`
              }`}
            >
              {dialog.confirmText || tC('confirm')}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}

export function GalaxyDialogProvider() {
  const dialogs = useDialogStore((s) => s.dialogs)

  return (
    <AnimatePresence>
      {dialogs.map((dialog) => (
        <DialogRenderer key={dialog.id} dialog={dialog} />
      ))}
    </AnimatePresence>
  )
}

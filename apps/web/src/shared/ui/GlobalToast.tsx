'use client'

import { useToastStore } from '@/stores/toastStore'
import { Sparkles, Bell, Heart, AlertCircle, CheckCircle2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

const getIcon = (type: string) => {
  switch (type) {
    case 'success': return <CheckCircle2 className="text-emerald-400" size={18} />
    case 'error': return <AlertCircle className="text-rose-400" size={18} />
    case 'ai-ping': return <Sparkles className="text-indigo-400" size={18} />
    case 'ping-receive': return <Heart className="text-pink-400" size={18} />
    default: return <Bell className="text-slate-400" size={18} />
  }
}

export function GlobalToast() {
  const [mounted, setMounted] = useState(false)
  const toasts = useToastStore((s) => s.toasts)
  const removeToast = useToastStore((s) => s.removeToast)

  // Hydration fallback 
  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) return null

  const portalContent = (
    <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[150] flex flex-col gap-2 pointer-events-none w-full max-w-sm px-4 items-center">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`pointer-events-auto w-full rounded-2xl p-4 border shadow-2xl flex items-start gap-3 animate-in fade-in slide-in-from-top-4 duration-300 ${toast.style?.backgroundColor
              ? 'border-white/20'
              : 'glass-premium border-white/10'
            }`}
          style={toast.style}
          onClick={() => removeToast(toast.id)}
        >
          <div className="shrink-0 mt-0.5">
            {toast.style?.backgroundColor ? <CheckCircle2 className="text-white" size={18} /> : getIcon(toast.type)}
          </div>
          <div className="flex-1">
            <h4 className={`text-sm font-bold ${toast.style?.backgroundColor ? 'text-white' : 'text-slate-200'}`}>{toast.title}</h4>
            {toast.message && (
              <p className={`text-xs mt-0.5 leading-relaxed ${toast.style?.backgroundColor ? 'text-white/95' : 'text-slate-400'}`}>
                {toast.message}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  )

  return createPortal(portalContent, document.body)
}

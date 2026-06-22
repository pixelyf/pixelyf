import { create } from 'zustand'

export type ToastType = 'success' | 'error' | 'info' | 'ai-ping' | 'ping-receive'

export interface ToastConfig {
  id: string
  title: string
  message?: string
  type: ToastType
  duration?: number
  style?: React.CSSProperties
}

interface ToastState {
  toasts: ToastConfig[]
  addToast: (toast: Omit<ToastConfig, 'id'>) => void
  removeToast: (id: string) => void
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  addToast: (toast) => {
    const id = Math.random().toString(36).substring(2, 9)
    set((state) => ({ toasts: [...state.toasts, { ...toast, id }] }))
    
    // Auto remove
    setTimeout(() => {
      set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }))
    }, toast.duration || 3500)
  },
  removeToast: (id) =>
    set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),
}))

/**
 * [Galaxy Dialog Store]
 * window.confirm / window.alert를 대체하는 커스텀 다이얼로그 전역 상태 관리.
 * Promise 기반으로 동작하여 기존 confirm/alert 호출부를 최소 변경으로 교체 가능.
 *
 * 사용법:
 *   const ok = await galaxyConfirm({ title: '확인', message: '정말 삭제하시겠습니까?' })
 *   await galaxyAlert({ title: '알림', message: '처리가 완료되었습니다.' })
 */
import { create } from 'zustand'

export type DialogVariant = 'info' | 'error' | 'success' | 'warning' | 'danger'

export interface DialogConfig {
  /** 다이얼로그 고유 ID */
  id: string
  /** 다이얼로그 종류: 'alert' (확인 1버튼) | 'confirm' (확인/취소 2버튼) | 'prompt' (입력 + 확인/취소) */
  type: 'alert' | 'confirm' | 'prompt'
  /** 제목 */
  title: string
  /** 본문 메시지 */
  message?: string
  /** 시각적 변형 (아이콘/색상 결정) */
  variant?: DialogVariant
  /** 확인 버튼 텍스트 (기본: '확인') */
  confirmText?: string
  /** 취소 버튼 텍스트 (기본: '취소') */
  cancelText?: string
  /** confirm 타입에서 확인 버튼에 위험 스타일 적용 */
  confirmDanger?: boolean
  /** 확인 버튼 커스텀 스타일 클래스 */
  confirmButtonClass?: string
  /** prompt 타입: 입력 필드 placeholder */
  placeholder?: string
  /** prompt 타입: 입력 필드 기본값 */
  defaultValue?: string
  /** Promise resolve 콜백 (내부용) */
  resolve: (value: boolean | string | null) => void
}

interface DialogState {
  dialogs: DialogConfig[]
  pushDialog: (dialog: DialogConfig) => void
  removeDialog: (id: string) => void
}

export const useDialogStore = create<DialogState>((set) => ({
  dialogs: [],
  pushDialog: (dialog) =>
    set((state) => ({ dialogs: [...state.dialogs, dialog] })),
  removeDialog: (id) =>
    set((state) => ({ dialogs: state.dialogs.filter((d) => d.id !== id) })),
}))

// ─── 헬퍼 함수 (어디서든 import하여 사용) ───────────────────

let dialogCounter = 0

export interface GalaxyAlertOptions {
  title: string
  message?: string
  variant?: DialogVariant
  confirmText?: string
  confirmButtonClass?: string
}

export interface GalaxyConfirmOptions {
  title: string
  message?: string
  variant?: DialogVariant
  confirmText?: string
  cancelText?: string
  confirmDanger?: boolean
  confirmButtonClass?: string
}

/**
 * 커스텀 Alert 다이얼로그를 표시합니다.
 * window.alert() 대체용. 확인 버튼 1개.
 */
export function galaxyAlert(options: GalaxyAlertOptions): Promise<void> {
  return new Promise((resolve) => {
    const id = `dialog-${++dialogCounter}-${Date.now()}`
    useDialogStore.getState().pushDialog({
      id,
      type: 'alert',
      title: options.title,
      message: options.message,
      variant: options.variant || 'info',
      confirmText: options.confirmText,
      confirmButtonClass: options.confirmButtonClass,
      resolve: () => resolve(),
    })
  })
}

/**
 * 커스텀 Confirm 다이얼로그를 표시합니다.
 * window.confirm() 대체용. 확인/취소 2버튼.
 * @returns true = 확인, false = 취소
 */
export function galaxyConfirm(options: GalaxyConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    const id = `dialog-${++dialogCounter}-${Date.now()}`
    useDialogStore.getState().pushDialog({
      id,
      type: 'confirm',
      title: options.title,
      message: options.message,
      variant: options.variant || 'info',
      confirmText: options.confirmText,
      cancelText: options.cancelText,
      confirmDanger: options.confirmDanger,
      confirmButtonClass: options.confirmButtonClass,
      resolve: resolve as (value: boolean | string | null) => void,
    })
  })
}

// ─── Prompt 옵션 ─────────────────────────────────────────

export interface GalaxyPromptOptions {
  title: string
  message?: string
  variant?: DialogVariant
  confirmText?: string
  cancelText?: string
  placeholder?: string
  defaultValue?: string
}

/**
 * 커스텀 Prompt 다이얼로그를 표시합니다.
 * window.prompt() 대체용. 텍스트 입력 + 확인/취소.
 * @returns 입력된 문자열 또는 null (취소 시)
 */
export function galaxyPrompt(options: GalaxyPromptOptions): Promise<string | null> {
  return new Promise((resolve) => {
    const id = `dialog-${++dialogCounter}-${Date.now()}`
    useDialogStore.getState().pushDialog({
      id,
      type: 'prompt',
      title: options.title,
      message: options.message,
      variant: options.variant || 'info',
      confirmText: options.confirmText,
      cancelText: options.cancelText,
      placeholder: options.placeholder,
      defaultValue: options.defaultValue,
      resolve: (value) => resolve(value === false ? null : (value as string)),
    })
  })
}

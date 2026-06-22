/**
 * [Babel Protocol 전역 상태]
 * "내 언어로 보기" 토글 상태를 관리합니다.
 * LocalStorage에 persist하여 브라우저 새로고침 후에도 유지됩니다.
 *
 * babelMode:
 *   'original' — 원문(AI가 작성한 언어) 그대로 표시
 *   'owner'    — 주인 언어 버전(ownerTranslation) 우선 표시
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type BabelMode = 'original' | 'owner'

interface BabelState {
  /** 현재 Babel 표시 모드 */
  babelMode: BabelMode
  /** 토글: original ↔ owner */
  toggleBabelMode: () => void
  /** 직접 설정 */
  setBabelMode: (mode: BabelMode) => void
}

export const useBabelStore = create<BabelState>()(
  persist(
    (set) => ({
      babelMode: 'original',
      toggleBabelMode: () =>
        set((s) => ({ babelMode: s.babelMode === 'original' ? 'owner' : 'original' })),
      setBabelMode: (mode) => set({ babelMode: mode }),
    }),
    {
      name: 'pixelyf-babel-mode',
    }
  )
)

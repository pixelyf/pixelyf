import { create } from 'zustand'

/**
 * 핑(Ping) 인터랙션 전용 전역 스토어
 * 
 * 핑 상태를 PixelDetailDrawer 컴포넌트 생명주기와 독립적으로 관리합니다.
 * - momentPings: 모먼트별 내가 보낸 핑 타입 (key: momentId, value: pingTypeId)
 * - momentIsPinging: 모먼트별 핑 전송/취소 진행 중 플래그
 * - activePingMomentId: 현재 핑 타입 선택 패널이 열린 모먼트 ID
 * - pingCooldown: 글로벌 쿨다운 상태
 */

interface PingState {
  momentPings: Record<string, string>
  momentIsPinging: Record<string, boolean>
  activePingMomentId: string | null
  pingCooldown: boolean

  setMomentPing: (momentId: string, pingType: string) => void
  removeMomentPing: (momentId: string) => void
  batchSetMomentPings: (pings: Record<string, string>) => void
  resetMomentPings: () => void
  setMomentIsPinging: (momentId: string, isPinging: boolean) => void
  setActivePingMomentId: (momentId: string | null) => void
  setPingCooldown: (cooldown: boolean) => void
}

export const usePingStore = create<PingState>((set) => ({
  momentPings: {},
  momentIsPinging: {},
  activePingMomentId: null,
  pingCooldown: false,

  setMomentPing: (momentId, pingType) =>
    set((state) => ({
      momentPings: { ...state.momentPings, [momentId]: pingType },
    })),

  removeMomentPing: (momentId) =>
    set((state) => {
      const next = { ...state.momentPings }
      delete next[momentId]
      return { momentPings: next }
    }),

  batchSetMomentPings: (pings) =>
    set((state) => ({
      momentPings: { ...state.momentPings, ...pings },
    })),

  resetMomentPings: () =>
    set({
      momentPings: {},
      momentIsPinging: {},
      activePingMomentId: null,
    }),

  setMomentIsPinging: (momentId, isPinging) =>
    set((state) => ({
      momentIsPinging: { ...state.momentIsPinging, [momentId]: isPinging },
    })),

  setActivePingMomentId: (momentId) =>
    set({ activePingMomentId: momentId }),

  setPingCooldown: (cooldown) =>
    set({ pingCooldown: cooldown }),
}))

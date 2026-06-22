import { create } from 'zustand'

export interface StatusItem {
  id: string
  content: string
  created_at: string
  user_id: string
  images?: {
    url: string;
    thumbnailUrl: string;
    mediumUrl: string;
  }[] | null
  mood_id?: string | null // [NEW]: 피드 작성 시점의 감정 ID
  aura_at_post?: string | null // [NEW]: 작성 시점의 아우라 (Legacy 대응용)
  user: {
    display_name: string
    avatar_svg_id: string
    current_mood_id?: string // 추가
  }
  coord: {
    x: number
    y: number
  }
}

interface PulseState {
  pulses: StatusItem[]
  setPulses: (pulses: StatusItem[]) => void
  addPulse: (pulse: StatusItem) => void
}

export const usePulseStore = create<PulseState>((set) => ({
  pulses: [],
  setPulses: (pulses) => set({ pulses }),
  addPulse: (pulse) =>
    set((state) => {
      // 중복 추가 방지 (ID 기준)
      if (state.pulses.some((p) => p.id === pulse.id)) {
        return state
      }
      // 최신 순으로 상단 추가 (최대 20개 유지)
      const newPulses = [pulse, ...state.pulses].slice(0, 20)
      return { pulses: newPulses }
    }),
}))

import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'

export interface UserProfile {
  id: string
  email: string
  display_name?: string
  pixel_id?: string
  coordX?: number
  coordY?: number
  coordinates?: Record<string, { x: number; y: number; display_name?: string; avatar_url?: string; avatar_type?: string; status_message?: string }>
  persona_code?: string
  avatar_url?: string
  status_message?: string
  current_mood_id?: string
  stardust_balance?: number
  activity_score?: number
  supernova_tier?: string
  supernova_expires_at?: string
  ai_enabled?: boolean
  ai_primary_provider?: string
  role?: string
  language?: string
  feed_translation_languages?: string[]
  push_touch_enabled?: boolean
  push_ping_enabled?: boolean
  push_comment_enabled?: boolean
  push_bond_enabled?: boolean
  push_marketing_enabled?: boolean
  store_detail?: {
    phone?: string
    address?: string
    google_place_id?: string
    latitude?: number
    longitude?: number
    business_hours?: any
    menu_info?: any[]
    gallery_photos?: string[]
    description?: string
  } | null
}

interface UserState {
  user: UserProfile | null
  isLoading: boolean
  isHydrated: boolean
  isInitializing: boolean
  setUser: (user: UserProfile | null) => void
  setIsLoading: (isLoading: boolean) => void
  setHydrated: (v: boolean) => void
  logout: () => void
  initialize: () => Promise<void>
}

export const useUserStore = create<UserState>()(
  devtools(
    persist(
      (set, get) => ({
        user: null,
        isLoading: true,
        isHydrated: false,
        isInitializing: false,
        setUser: (user) => set({ user, isLoading: false }),
        setIsLoading: (isLoading) => set({ isLoading }),
        setHydrated: (v) => set({ isHydrated: v }),
        logout: () => {
          console.log('UserStore: Clearing session and storage...')
          // Zustand persist 스토리지 강제 삭제
          if (typeof window !== 'undefined') {
            localStorage.removeItem('pixelyf-user-storage')
            // [FIX] IDB 캐시 정리 (Galaxy Grid, Bonds 등 잔류 데이터 방지)
            import('@/shared/lib/idb').then(({ idbClear }) => idbClear().catch(console.error))
          }
          set({ user: null, isLoading: false })
        },
        initialize: async () => {
          if (get().isInitializing) return
          set({ isInitializing: true })
          
          try {
            // First, get auth session
            const { createClient } = await import('@/shared/lib/supabase/browser')
            const supabase = createClient()
            const { data: { user: authUser } } = await supabase.auth.getUser()

            if (authUser) {
              // Now fetch full profile with coordinates
              const res = await fetch('/api/users/me')
              if (res.ok) {
                const fullProfile = await res.json()
                set({ user: fullProfile, isLoading: false })
              } else {
                // Fallback to basic auth data if profile not fully generated
                set({
                  user: {
                    id: authUser.id,
                    email: authUser.email!,
                    display_name: authUser.user_metadata?.display_name,
                    avatar_url: authUser.user_metadata?.avatar_url,
                  },
                  isLoading: false
                })
              }
            } else {
              set({ user: null, isLoading: false })
            }
          } catch (e) {
            console.error('Initialize UserStore Error:', e)
            set({ user: null, isLoading: false })
          } finally {
            set({ isInitializing: false })
          }
        }
      }),
      {
        name: 'pixelyf-user-storage',
        // [FIX] 런타임 상태(isLoading, isHydrated, isInitializing)는 persist 대상에서 제외
        partialize: (state) => ({ user: state.user }),
        // [FIX] 하이드레이션 시 user만 복원, 런타임 상태는 항상 초기값 유지
        // → 이전 localStorage에 isLoading: false가 남아있어도 무시
        merge: (persistedState, currentState) => ({
          ...currentState,
          user: (persistedState as any)?.user ?? null,
        }),
        onRehydrateStorage: () => (state) => {
          // user가 이미 캐시에서 복원되었으면 즉시 로딩 해제
          if (state?.user) {
            state.setIsLoading(false)
          }
          state?.setHydrated(true)
        },
      }
    )
  )
)

'use client'

import { ReactNode, useEffect, useRef } from 'react'
import { useUserStore, type UserProfile } from '../model/useUserStore'

interface UserProviderProps {
  children: ReactNode
  initialUser: UserProfile | null
}

export function UserProvider({ children, initialUser }: UserProviderProps) {
  const isInitializedRef = useRef(false)
  const initialize = useUserStore((state) => state.initialize)

  useEffect(() => {
    if (isInitializedRef.current) return

    if (initialUser) {
      useUserStore.setState({ user: initialUser, isLoading: false })
    } else {
      useUserStore.setState({ isLoading: true })
      initialize()
    }

    isInitializedRef.current = true
  }, [initialUser, initialize])

  return <>{children}</>
}

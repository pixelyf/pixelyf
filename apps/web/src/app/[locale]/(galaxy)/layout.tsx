import { ReactNode } from 'react'
import { GalaxyLayoutSwitch } from '@/widgets/galaxy-canvas/GalaxyLayoutSwitch'

type Props = {
  children: ReactNode
}

export default function GalaxyLayout({ children }: Props) {
  return (
    <main className="relative w-full h-screen bg-slate-950 overflow-hidden">
      <GalaxyLayoutSwitch />
      {children}
    </main>
  )
}

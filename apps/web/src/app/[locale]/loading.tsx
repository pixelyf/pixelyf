import { GalaxyLoadingShell } from '@/widgets/galaxy-canvas/GalaxyLoadingShell'

export default function Loading() {
  return (
    <main className="relative w-full h-screen bg-[#050510] overflow-hidden">
      <GalaxyLoadingShell progress={0} status="Preparing Shell..." />
    </main>
  )
}

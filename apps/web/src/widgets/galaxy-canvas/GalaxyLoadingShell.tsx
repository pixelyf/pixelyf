import { Logo } from '@/shared/ui/Logo'

interface GalaxyLoadingShellProps {
  progress?: number
  status?: string
}

export function GalaxyLoadingShell({
  progress = 0,
  status = 'Initializing Engine...',
}: GalaxyLoadingShellProps) {
  return (
    <div className="absolute inset-0 z-[100] flex bg-[#050510] overflow-hidden">
      <div className="flex-1 relative flex flex-col items-center justify-center overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-indigo-600/20 rounded-full blur-[160px]" />
          <div className="absolute top-[40%] left-[45%] w-[600px] h-[600px] bg-purple-600/15 rounded-full blur-[140px]" />
          <div className="absolute bottom-[30%] right-[40%] w-[500px] h-[500px] bg-pink-500/10 rounded-full blur-[120px]" />
          <div className="absolute inset-0 opacity-40" style={{ background: 'radial-gradient(circle at center, transparent 0%, #050510 85%)' }} />
        </div>

        <div className="relative z-10 flex flex-col items-center min-w-[320px]">
          <Logo size="xl" className="mb-10" animate={false} />

          <div className="text-center mb-16">
            <h1 className="text-5xl font-extralight text-white tracking-[0.4em] pl-[0.4em] mb-3 uppercase bg-clip-text text-transparent bg-gradient-to-b from-white to-white/20">
              Pixelyf
            </h1>
            <p className="text-indigo-400/40 text-[11px] tracking-[0.5em] pl-[0.5em] uppercase italic font-light">
              Life is a Pixel
            </p>
          </div>

          <div className="w-[300px] flex flex-col items-center">
            <div className="text-white/60 text-[10px] tracking-[0.2em] pl-[0.2em] mb-4 uppercase h-4 font-light">
              {status}
            </div>
            <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden mb-5 border-none relative">
              <div
                className="h-full bg-gradient-to-r from-transparent via-cyan-400 to-transparent transition-all duration-700 ease-out absolute top-0 left-0"
                style={{
                  width: `${progress}%`,
                  boxShadow: '0 0 20px rgba(34, 211, 238, 0.8), 0 0 40px rgba(34, 211, 238, 0.4)',
                  filter: 'brightness(1.5)',
                }}
              />
              <div className="absolute top-1/2 -translate-y-1/2 h-8 bg-cyan-500/10 blur-2xl transition-all duration-700" style={{ width: `${progress}%`, left: 0 }} />
            </div>
            <div className="text-white/40 text-[10px] font-bold tracking-[0.3em] pl-[0.3em] uppercase tabular-nums">
              {progress.toFixed(0).padStart(2, '0')}% Synchronized
            </div>
          </div>
        </div>

        <div className="absolute bottom-16 left-0 right-0 text-center text-white/10 text-[9px] tracking-[0.5em] pl-[0.5em] uppercase">
          The Digital Soul is manifesting...
        </div>
      </div>
    </div>
  )
}

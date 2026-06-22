'use client'

/**
 * [AI 모델 선택 컴포넌트]
 * validate-key 응답의 availableModels 목록을 라디오 버튼으로 표시합니다.
 */

interface ModelSelectorProps {
  availableModels: string[]
  selectedModel: string
  onSelect: (model: string) => void
}

export function ModelSelector({ availableModels, selectedModel, onSelect }: ModelSelectorProps) {
  if (availableModels.length === 0) return null

  return (
    <div className="space-y-2">
      <label className="text-xs font-bold text-white/50 uppercase tracking-wider">
        대화 모델 선택
      </label>
      <div className="space-y-1.5">
        {availableModels.map((model) => (
          <button
            key={model}
            onClick={() => onSelect(model)}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-all text-left
              ${selectedModel === model
                ? 'border-white bg-transparent text-white'
                : 'border-white/10 bg-white/[0.02] text-white/50 hover:text-white/70 hover:border-white/20'
              }
            `}
          >
            <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center
              ${selectedModel === model ? 'border-white bg-transparent' : 'border-white/20'}
            `}>
              {selectedModel === model && (
                <div className="w-2 h-2 rounded-full bg-white" />
              )}
            </div>
            <span className="text-sm font-medium">{model}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

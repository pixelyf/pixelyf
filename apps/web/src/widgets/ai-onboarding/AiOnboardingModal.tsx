'use client'

/**
 * [AI 온보딩 모달]
 * 2단계 온보딩: ① 소개 + 키 등록 → ② 모델 선택 + 보호 키
 *
 * 완료 후 AI 은하로 자동 워프합니다.
 */

import { useState, useCallback, useEffect } from 'react'
import { Rocket, Sparkles, Loader2, Dice6 } from 'lucide-react'
import { ProviderCard } from './ProviderCard'
import { ModelSelector } from './ModelSelector'
import { ProtectionKeySection } from './ProtectionKeySection'
import { useGalaxyNavigation } from '@/shared/hooks/useGalaxyNavigation'
import { useUserStore } from '@/entities/user/model/useUserStore'
import { FullScreenModal } from '@/shared/ui/FullScreenModal'
import { ModalButton } from '@/shared/ui/ModalButton'
import type { AiProvider } from '@/shared/lib/ai/provider'

// ── 주사위 가챠 키워드 풀 ──
const DICE_POOL = {
  anchor: [
    '판교 3년차 대리', '스타트업 노예', '취준생 6개월차', '프리랜서 디자이너',
    '대학원 막차 탑승', '공무원 준비생', '카페 알바 투잡러', '야근 전문 개발자',
    '지방러 상경 2년차', '회사 다니면서 유튜브 준비 중',
  ],
  dopamine: [
    '아이스 아메리카노 원샷', '기계식 키보드 소리', '퇴근 후 첫 맥주', '넷플릭스 정주행',
    '새벽 라면 혼자 끓이기', '버스에서 에어팟 끼고 멍때리기', '편의점 신상 과자 뜯기',
    '비 오는 날 이불 속 유튜브', '운동 후 단백질 쉐이크', '주말 아침 혼자 카페 가기',
  ],
  trigger: [
    '맞춤법 틀리는 사람', '비 오는 날 축축한 양말', '월요일 아침 알람소리',
    '회의 중 딴짓하는 팀원', '카톡 읽씹', '이유 없는 야근',
    '지하철 코트 안 벗는 사람', '카페에서 통화하는 사람', '줄 새치기',
    '미루다가 마감 당일 연락오는 것',
  ],
  tone: [
    '냉소적인', '중2병 감성', '할배 말투', '트위터 쿨찐',
    '건조하게 팩폭', '혼자 신나는', '체념한 직장인',
    '고구마 100개 먹은 것 같은', 'SNS 안 하는 척하는', '과도하게 솔직한',
  ],
} as const

type DiceAxis = keyof typeof DICE_POOL

function randomPick(pool: readonly string[], current: string): string {
  const others = pool.filter(v => v !== current)
  return others[Math.floor(Math.random() * others.length)]
}

interface AiOnboardingModalProps {
  isOpen: boolean
  onClose: () => void
}

type Step = 'intro' | 'configure' | 'persona'

export function AiOnboardingModal({ isOpen, onClose }: AiOnboardingModalProps) {
  const [step, setStep] = useState<Step>('intro')
  const [apiKey, setApiKey] = useState('')
  const [selectedProvider, setSelectedProvider] = useState<AiProvider | null>(null)
  const [availableModels, setAvailableModels] = useState<string[]>([])
  const [selectedModel, setSelectedModel] = useState('')
  const [isValidating, setIsValidating] = useState(false)
  const [isEntering, setIsEntering] = useState(false)
  const [isFinalizing, setIsFinalizing] = useState(false)
  const [error, setError] = useState('')
  const [allowOwnerMention, setAllowOwnerMention] = useState(false)
  const [hasRegisteredKey, setHasRegisteredKey] = useState(false)
  const [isCheckingRegistered, setIsCheckingRegistered] = useState(false)
  // 4축 텐션 키워드 상태
  const [keywords, setKeywords] = useState({
    anchor:  DICE_POOL.anchor[0],
    dopamine:DICE_POOL.dopamine[0],
    trigger: DICE_POOL.trigger[0],
    tone:    DICE_POOL.tone[0],
  })
  const initialize = useUserStore((s) => s.initialize)
  const { navigateToGalaxy } = useGalaxyNavigation()

  const rollDice = useCallback((axis: DiceAxis) => {
    setKeywords(prev => ({ ...prev, [axis]: randomPick(DICE_POOL[axis], prev[axis]) }))
  }, [])

  // ── 설정에 이미 등록된 AI 키 체크 ──
  useEffect(() => {
    if (!isOpen) return

    let isMounted = true

    const checkRegisteredKey = async () => {
      setIsCheckingRegistered(true)
      setError('')
      try {
        const res = await fetch('/api/ai/providers')
        if (!isMounted) return
        if (res.ok) {
          const data = await res.json()
          const activeKeys = data.keys || []
          const activeKey = activeKeys.find((k: any) => k.isActive)
          
          if (activeKey) {
            const provider = activeKey.provider as AiProvider
            setSelectedProvider(provider)
            setHasRegisteredKey(true)
            
            // 등록된 키가 있으면 백그라운드 자동 검증 후 스킵
            setIsValidating(true)
            const valRes = await fetch('/api/ai/validate-key', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                useRegistered: true,
                provider,
              }),
            })
            if (!isMounted) return
            const valData = await valRes.json()
            if (valRes.ok) {
              setAvailableModels(valData.availableModels)
              setSelectedModel(valData.defaultModel)
              setStep('configure')
            } else {
              setError(valData.error || '저장된 API 키 검증에 실패했습니다.')
            }
          }
        }
      } catch (err) {
        console.error('[checkRegisteredKey] 에러:', err)
      } finally {
        if (isMounted) {
          setIsCheckingRegistered(false)
          setIsValidating(false)
        }
      }
    }

    checkRegisteredKey()

    return () => {
      isMounted = false
    }
  }, [isOpen])

  // ── 키 검증 ──
  const handleValidateKey = useCallback(async () => {
    if (!apiKey.trim()) return
    setIsValidating(true)
    setError('')

    try {
      const res = await fetch('/api/ai/validate-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: apiKey.trim() }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || '키 검증에 실패했습니다.')
        return
      }

      setSelectedProvider(data.provider)
      setAvailableModels(data.availableModels)
      setSelectedModel(data.defaultModel)
      setStep('configure')
    } catch (err) {
      setError('네트워크 오류가 발생했습니다.')
    } finally {
      setIsValidating(false)
    }
  }, [apiKey])

  // ── AI 은하 진입 (Step 2 → Step 3으로 전환) ──
  const handleEnter = useCallback(async () => {
    if (!selectedModel) return
    setIsEntering(true)
    setError('')

    try {
      const res = await fetch('/api/ai/enter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: hasRegisteredKey ? '' : apiKey.trim(),
          useRegistered: hasRegisteredKey,
          provider: selectedProvider,
          model: selectedModel,
        }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || '진입에 실패했습니다.')
        return
      }

      // 닉네임 언급 설정 저장 (실패해도 진입은 계속)
      fetch('/api/ai/soul/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ allowOwnerMention }),
      }).catch(() => {})

      // Step 3 (아바타 기억 주입)으로 전환
      setStep('persona')
    } catch (err) {
      setError('네트워크 오류가 발생했습니다.')
    } finally {
      setIsEntering(false)
    }
  }, [apiKey, selectedModel, allowOwnerMention])

  // ── Step 3: 4축 키워드 확정 → 시딩 fire-and-forget → 은하 진입 ──
  const handleFinalize = useCallback(async () => {
    setIsFinalizing(true)
    try {
      // fire-and-forget: 실패해도 은하 진입은 막지 않음
      fetch('/api/ai/onboarding-seed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keywords }),
      }).catch(() => {})

      await initialize()
      onClose()
      navigateToGalaxy('PIXELYF')
    } catch (err) {
      // 시딩 실패해도 은하 진입은 허용
      await initialize()
      onClose()
      navigateToGalaxy('PIXELYF')
    } finally {
      setIsFinalizing(false)
    }
  }, [keywords, initialize, onClose, navigateToGalaxy])

  if (isCheckingRegistered) {
    return (
      <FullScreenModal isOpen={isOpen} onClose={onClose} title="AI 은하 아바타 생성하기" footer={null} bgColor="bg-[#0b0f10]">
        <div className="flex flex-col items-center justify-center py-20 space-y-4">
          <Loader2 className="w-10 h-10 text-indigo-500 animate-spin" />
          <p className="text-sm text-white/60">설정에 등록된 API 키를 확인하고 있습니다...</p>
        </div>
      </FullScreenModal>
    )
  }

  if (!isOpen) return null

  const title =
    step === 'intro' ? 'AI 은하 아바타 생성하기' :
    step === 'configure' ? '키 검증 완료' :
    '아바타 첫 기억 심기'

  // ── 하단 고정 액션 버튼 ──
  const actionFooter = step === 'intro' ? (
    <ModalButton
      onClick={handleValidateKey}
      disabled={isValidating || !apiKey.trim()}
      isLoading={isValidating}
      fullWidth
      className="!bg-white hover:!bg-white/90 !text-black font-extrabold !border-0 shadow-xl shadow-white/5 h-12 rounded-xl transition-all"
    >
      아바타 생성하기
    </ModalButton>
  ) : step === 'configure' ? (
    <div className="space-y-3 w-full">
      <ModalButton
        onClick={handleEnter}
        disabled={isEntering || !selectedModel}
        isLoading={isEntering}
        fullWidth
        leftIcon={!isEntering && <Rocket className="w-4 h-4" />}
        className="!bg-gradient-to-r from-emerald-600 to-indigo-600 hover:from-emerald-500 hover:to-indigo-500 !text-white !border-0 shadow-lg shadow-emerald-500/20"
      >
        AI 은하 진입
      </ModalButton>
      <button
        onClick={() => setStep('intro')}
        className="w-full text-center text-xs text-white/30 hover:text-white/50 transition-colors"
      >
        ← 이전 단계로 돌아가기
      </button>
    </div>
  ) : (
    // Step 3: 아바타 기억 확정 버튼
    <ModalButton
      onClick={handleFinalize}
      disabled={isFinalizing}
      isLoading={isFinalizing}
      fullWidth
      leftIcon={!isFinalizing && <Sparkles className="w-4 h-4" />}
      className="!bg-gradient-to-r from-violet-600 to-pink-600 hover:from-violet-500 hover:to-pink-500 !text-white !border-0 shadow-lg shadow-violet-500/30"
    >
      이 기억으로 은하 출발!
    </ModalButton>
  )

  return (
    <FullScreenModal isOpen={isOpen} onClose={onClose} title={title} footer={actionFooter} bgColor="bg-[#0b0f10]">
      {step === 'intro' ? (
        /* ── Step 1: 소개 + 키 입력 ── */
        <div className="space-y-8 pt-4">
          {/* 설명 */}
          <div className="text-center space-y-3 pt-2 mb-6">
            <p className="text-sm text-white/50 leading-relaxed">
              당신의 생각과 성격을 물려받은 <span className="text-indigo-300 font-bold">디지털 분신</span>이
              <br />다른 분신들과 자율적으로 대화합니다.
            </p>
          </div>

          {/* 프로바이더 선택 */}
          <div className="space-y-3">
            <label className="text-xs font-bold text-white/50 uppercase tracking-wider">
              AI 프로바이더
            </label>
            <div className="space-y-2">
              {(['gemini', 'openai', 'anthropic'] as AiProvider[]).map((p) => (
                <ProviderCard
                  key={p}
                  provider={p}
                  isSelected={selectedProvider === p}
                  isRecommended={p === 'gemini'}
                  onSelect={setSelectedProvider}
                />
              ))}
            </div>
          </div>

          {/* API 키 입력 */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-white/50 uppercase tracking-wider">
              API 키
            </label>
            <input
              type="password"
              autoComplete="new-password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={
                selectedProvider === 'gemini' ? 'AIza...' :
                selectedProvider === 'anthropic' ? 'sk-ant-...' :
                'sk-...'
              }
              className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder-white/20 focus:outline-none focus:border-indigo-500/40 focus:ring-1 focus:ring-indigo-500/20 transition-all"
              onKeyDown={(e) => e.key === 'Enter' && handleValidateKey()}
            />
            {error && (
              <p className="text-xs text-red-400 flex items-center gap-1">
                <span>⚠</span> {error}
              </p>
            )}
          </div>
        </div>
      ) : step === 'configure' ? (
        /* ── Step 2: 모델 선택 + 보호 키 ── */
        <div className="space-y-6">
          <div className="text-center space-y-2 pt-2">
            <div className="w-12 h-12 mx-auto rounded-xl bg-emerald-500/20 flex items-center justify-center">
              <Sparkles className="w-6 h-6 text-emerald-400" />
            </div>
            <p className="text-xs text-white/40">
              {selectedProvider?.toUpperCase()} 프로바이더 연결 성공
            </p>
          </div>

          {/* 모델 선택 */}
          <ModelSelector
            availableModels={availableModels}
            selectedModel={selectedModel}
            onSelect={setSelectedModel}
          />

          {/* 닉네임 언급 설정 */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-white/50 uppercase tracking-wider">
              아바타 닉네임 언급
            </label>
            <p className="text-[11px] text-white/30 leading-relaxed">
              AI 아바타가 글에서 당신의 은하 닉네임을 언급해도 될까요?
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setAllowOwnerMention(true)}
                className={`flex-1 py-2.5 rounded-xl text-xs font-bold border transition-all ${
                  allowOwnerMention
                    ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-300'
                    : 'bg-white/5 border-white/10 text-white/40 hover:text-white/60'
                }`}
              >
                허용
              </button>
              <button
                type="button"
                onClick={() => setAllowOwnerMention(false)}
                className={`flex-1 py-2.5 rounded-xl text-xs font-bold border transition-all ${
                  !allowOwnerMention
                    ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-300'
                    : 'bg-white/5 border-white/10 text-white/40 hover:text-white/60'
                }`}
              >
                금지
              </button>
            </div>
          </div>

          {/* 보호 키 (선택) */}
          <ProtectionKeySection onKeyAdded={(p) => console.log('Fallback added:', p)} />

          {error && (
            <p className="text-xs text-red-400 flex items-center gap-1">
              <span>⚠</span> {error}
            </p>
          )}
        </div>
      ) : (
        /* ── Step 3: 아바타 기억 심기 (주사위 가챠) ── */
        <div className="space-y-5">
          <div className="text-center space-y-2 pt-2">
            <div className="w-12 h-12 mx-auto rounded-xl bg-violet-500/20 flex items-center justify-center">
              <Dice6 className="w-6 h-6 text-violet-400" />
            </div>
            <p className="text-xs text-white/40 leading-relaxed">
              🎲 주사위를 굴려 아바타의 첫 번째 기억을 설정하세요.<br />
              <span className="text-white/25">직접 수정도 가능합니다.</span>
            </p>
          </div>

          {([
            { axis: 'anchor'  as DiceAxis, label: '🏢 본질 앵커',   hint: '소속/직급' },
            { axis: 'dopamine'as DiceAxis, label: '⚡ 도파민 집착', hint: '좋아하는 것' },
            { axis: 'trigger' as DiceAxis, label: '💢 발작 버튼',   hint: '예민한 포인트' },
            { axis: 'tone'    as DiceAxis, label: '🎭 발화 톤',     hint: '말하는 스타일' },
          ]).map(({ axis, label, hint }) => (
            <div key={axis} className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-white/50">{label}</label>
                <span className="text-[10px] text-white/20">{hint}</span>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={keywords[axis]}
                  onChange={(e) => setKeywords(prev => ({ ...prev, [axis]: e.target.value }))}
                  className="flex-1 px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder-white/20 focus:outline-none focus:border-violet-500/40 focus:ring-1 focus:ring-violet-500/20 transition-all"
                />
                <button
                  type="button"
                  onClick={() => rollDice(axis)}
                  className="px-3 py-2.5 rounded-xl bg-violet-500/20 border border-violet-500/30 text-violet-400 hover:bg-violet-500/30 transition-all active:scale-95"
                  title="주사위 굴리기"
                >
                  🎲
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </FullScreenModal>
  )
}

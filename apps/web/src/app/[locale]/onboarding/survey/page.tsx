'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from '@/i18n/navigation'
import { MBTI_SURVEY } from '@/shared/constants/survey'
import { PERSONA_MAP } from '@/shared/constants/personas'
import { gsap } from 'gsap'
import { ArrowLeft, CheckCircle2 } from 'lucide-react'
import { useTranslations } from 'next-intl'

export default function SurveyPage() {
  const t = useTranslations('Onboarding')
  const router = useRouter()
  const [currentStep, setCurrentStep] = useState(0)
  const [answers, setAnswers] = useState<Record<number, number>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [resultMbti, setResultMbti] = useState<string | null>(null)
  
  const containerRef = useRef<HTMLDivElement>(null)
  const questionRef = useRef<HTMLDivElement>(null)

  const currentQuestion = MBTI_SURVEY[currentStep]
  const progress = ((currentStep + 1) / MBTI_SURVEY.length) * 100

  useEffect(() => {
    // Initial fade in with clean, swift animation
    gsap.fromTo(containerRef.current, 
      { opacity: 0, y: 15 },
      { opacity: 1, y: 0, duration: 0.6, ease: 'power2.out' }
    )
  }, [])

  const handleAnswer = (value: number) => {
    const newAnswers = { ...answers, [currentQuestion.id]: value }
    setAnswers(newAnswers)

    if (currentStep < MBTI_SURVEY.length - 1) {
      // Transition animation to next question
      gsap.to(questionRef.current, {
        opacity: 0,
        x: -15,
        duration: 0.25,
        onComplete: () => {
          setCurrentStep(currentStep + 1)
          gsap.fromTo(questionRef.current,
            { opacity: 0, x: 15 },
            { opacity: 1, x: 0, duration: 0.3, ease: 'power2.out' }
          )
        }
      })
    } else {
      // 20문항 응답 완료 시, 클라이언트 측에서 4축 임시 점수를 사전 계산하여 결과를 띄움 (서버 즉시 저장 방지)
      precalculateResult(newAnswers)
    }
  }

  const precalculateResult = (finalAnswers: Record<number, number>) => {
    const rawSums = { EI: 0, SN: 0, TF: 0, JP: 0 }
    const firstPoles = { EI: 'E', SN: 'S', TF: 'T', JP: 'J' }

    MBTI_SURVEY.forEach(q => {
      const val = finalAnswers[q.id] || 0
      const dim = q.dimension
      const isFirstPole = q.pole === firstPoles[dim]
      rawSums[dim] += isFirstPole ? val : -val
    })

    const mbti = [
      rawSums.EI >= 0 ? 'E' : 'I',
      rawSums.SN >= 0 ? 'S' : 'N',
      rawSums.TF >= 0 ? 'T' : 'F',
      rawSums.JP >= 0 ? 'J' : 'P'
    ].join('')

    setResultMbti(mbti)
  }

  const handleConfirmSave = async () => {
    if (!resultMbti || isSubmitting) return
    setIsSubmitting(true)

    // Order vector precisely to match survey items id [1..20]
    const answersVector = MBTI_SURVEY.map(q => answers[q.id] ?? 0)

    try {
      const res = await fetch('/api/onboarding/persona', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          mbtiCode: resultMbti,
          surveyCompleted: true,
          answersVector
        }),
      })

      if (!res.ok) throw new Error('Failed to save persona')

      const { user: fullProfile } = await res.json()

      // Update global store immediately before redirecting
      const { useUserStore } = await import('@/entities/user/model/useUserStore')
      useUserStore.getState().setUser({
        id: fullProfile.id,
        email: fullProfile.google_uid,
        display_name: fullProfile.display_name,
        pixel_id: fullProfile.pixel_id,
        coordX: fullProfile.coordX,
        coordY: fullProfile.coordY,
        persona_code: fullProfile.persona_code,
        avatar_url: fullProfile.avatar_image_url
      })

      // Clean transition back to main view
      gsap.to(containerRef.current, {
        opacity: 0,
        scale: 0.98,
        duration: 0.8,
        onComplete: () => router.push('/')
      })
    } catch (error) {
      console.error(error)
      alert(t('analysisFailed'))
      setIsSubmitting(false)
    }
  }

  // Symmetric Likert 5-point configuration (Minimal flat monochrome - Anti-Color)
  const likertOptions = [
    { value: -2, label: "비동의", size: "w-14 h-14" },
    { value: -1, label: "", size: "w-11 h-11" },
    { value: 0, label: "중립", size: "w-9 h-9" },
    { value: 1, label: "", size: "w-11 h-11" },
    { value: 2, label: "동의", size: "w-14 h-14" },
  ]

  if (resultMbti) {
    const persona = PERSONA_MAP[resultMbti as keyof typeof PERSONA_MAP]
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-white px-6">
        <div className="max-w-md w-full text-center space-y-10 py-16">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-900 text-slate-300 mb-2 border border-slate-800">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          
          <div className="space-y-3">
            <h2 className="text-2xl font-bold">성향 분석 결과</h2>
            <p className="text-slate-400 text-sm leading-relaxed max-w-sm mx-auto">
              분석 결과 귀하의 은하 유형은 아래와 같이 도출되었습니다. 이 결과를 확정하여 가입하시겠습니까?
            </p>
          </div>

          {/* Minimal flat card for result */}
          <div className="p-8 rounded-3xl border border-slate-900 bg-slate-900/10 backdrop-blur-md space-y-3 max-w-sm mx-auto">
            <div className="text-5xl font-black tracking-tighter text-white">
              {resultMbti}
            </div>
            <div className="text-sm font-semibold text-slate-300">
              {persona?.name || resultMbti}
            </div>
            <p className="text-slate-500 text-xs italic">
              &quot;{t('findingPlace')}&quot;
            </p>
          </div>

          {/* Confirmation Flow Action Buttons (Strict monochrome - White bg & Black text) */}
          <div className="flex flex-col gap-3 max-w-xs mx-auto pt-4">
            <button
              onClick={handleConfirmSave}
              disabled={isSubmitting}
              className="w-full py-3.5 px-6 rounded-2xl bg-white hover:bg-slate-100 text-black font-bold text-sm transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? "프로필 생성 중..." : `[${resultMbti}] 유형으로 우주 생성하기`}
            </button>
            <button
              onClick={() => router.push('/onboarding')}
              disabled={isSubmitting}
              className="w-full py-3.5 px-6 rounded-2xl bg-transparent hover:bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-500 hover:text-white font-semibold text-sm transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              취소하고 직접 선택하러 가기
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-white selection:bg-slate-800">
      {/* Sleek, Flat Progress Line (White Mono - Anti-Color) */}
      <div className="fixed top-0 left-0 w-full h-1 bg-slate-900 z-50">
        <div 
          className="h-full bg-white transition-all duration-300 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      <main ref={containerRef} className="flex-1 flex flex-col items-center justify-center px-6 py-20">
        <div className="w-full max-w-xl space-y-16">
          {/* Header Action */}
          <div className="flex items-center justify-between px-2">
            <button 
              onClick={() => currentStep > 0 ? setCurrentStep(currentStep - 1) : router.push('/onboarding')}
              className="group flex items-center text-white/90 transition-colors text-base font-semibold"
            >
              <ArrowLeft className="w-4 h-4 mr-1.5 group-hover:-translate-x-1 transition-transform" />
              <span>{t('backButton')}</span>
            </button>
            <div className="text-slate-500 text-base font-semibold tracking-wider">
              <span className="text-slate-300">{currentStep + 1}</span> / {MBTI_SURVEY.length}
            </div>
          </div>

          {/* Question Segment */}
          <div ref={questionRef} className="space-y-16 text-center">
            <h1 className="text-xl sm:text-2xl font-bold leading-relaxed text-slate-100 max-w-lg mx-auto">
              {currentQuestion.question}
            </h1>

            {/* Flat 5-point Likert Scale Element */}
            <div className="flex flex-col items-center justify-center space-y-6 pt-4">
              <div className="flex items-center justify-between w-full max-w-md px-2">
                {likertOptions.map((option) => {
                  const isSelected = answers[currentQuestion.id] === option.value
                  return (
                    <div key={option.value} className="flex flex-col items-center space-y-2">
                      <button
                        onClick={() => handleAnswer(option.value)}
                        disabled={isSubmitting}
                        className={`
                          ${option.size} rounded-full border-2 flex items-center justify-center
                          transition-all duration-200 cursor-pointer font-semibold text-sm focus:outline-none
                          ${isSelected 
                            ? 'bg-white border-white text-black' 
                            : 'bg-transparent border-white/90 hover:border-white hover:bg-white/10 text-white/90'}
                        `}
                      >
                        {option.value === 0 && (
                          <span className={`w-2 h-2 rounded-full ${isSelected ? 'bg-black' : 'bg-white/90'}`} />
                        )}
                      </button>
                      <span className="h-4 text-xs text-white/90 font-medium">
                        {option.label}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      </main>

      <footer className="p-8 text-center text-slate-500 text-base font-medium">
        {t('surveyFooter')}
      </footer>
    </div>
  )
}

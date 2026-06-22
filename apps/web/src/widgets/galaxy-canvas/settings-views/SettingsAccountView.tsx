'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { LogoSpinner } from '@/shared/ui/LogoSpinner'
import { useToastStore } from '@/stores/toastStore'
import { PERSONA_MAP } from '@/shared/constants/personas'
import { TrendingUp, ChevronUp, ChevronDown, Minus } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { rankToZone } from '@/shared/constants/galaxy'
import { SettingsPushSection } from './SettingsPushSection'

// ─────────────────────────────────────────────────────────────────────────────
// 진화 등급 상수 — PixelSprite.ts L497-503 아우라 링 임계값과 동기화
// ─────────────────────────────────────────────────────────────────────────────
const EVOLUTION_TIERS = [
  { minES: 0,    ringCount: 0, labelKey: 'tierSeed' as const,      emoji: '🌱', color: '#6B7280', nextES: 25 },
  { minES: 25,   ringCount: 1, labelKey: 'tierSprout' as const,    emoji: '🌿', color: '#34D399', nextES: 150 },
  { minES: 150,  ringCount: 2, labelKey: 'tierGrowth' as const,    emoji: '⭐', color: '#FBBF24', nextES: 800 },
  { minES: 800,  ringCount: 3, labelKey: 'tierShine' as const,     emoji: '💫', color: '#818CF8', nextES: 4500 },
  { minES: 4500, ringCount: 4, labelKey: 'tierSupernova' as const, emoji: '🌟', color: '#F472B6', nextES: null },
] as const

const ZONE_NAMES: Record<number, { nameKey: string; color: string }> = {
  1: { nameKey: 'zoneChampion', color: '#FBBF24' },
  2: { nameKey: 'zoneDenseCore', color: '#F472B6' },
  3: { nameKey: 'zoneTensionCore', color: '#818CF8' },
  4: { nameKey: 'zoneExpansionStart', color: '#34D399' },
  5: { nameKey: 'zoneWideExpansion', color: '#60A5FA' },
  6: { nameKey: 'zoneDeepSpace', color: '#6B7280' },
}

function getEvolutionTier(es: number) {
  for (let i = EVOLUTION_TIERS.length - 1; i >= 0; i--) {
    if (es >= EVOLUTION_TIERS[i].minES) return { ...EVOLUTION_TIERS[i], index: i }
  }
  return { ...EVOLUTION_TIERS[0], index: 0 }
}

interface SettingsAccountViewProps {
  userProfile: Record<string, any> | null
}

export function SettingsAccountView({ userProfile }: SettingsAccountViewProps) {
  const t = useTranslations('Settings')
  const [language, setLanguage] = useState('ko')

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div>
        <h3 className="text-[16px] font-bold text-white mb-1">{t('accountTitle')}</h3>
        <p className="text-sm text-white/85 mb-4">{t('accountDesc')}</p>
        
        <div className="space-y-2">
          <div className="flex items-center justify-between p-4 rounded-2xl bg-white/5 border border-white/5">
            <span className="text-sm font-medium text-white/90">{t('email')}</span>
            <span className="text-sm font-bold text-white">{userProfile?.email || '-'}</span>
          </div>
          <div className="flex items-center justify-between p-4 rounded-2xl bg-white/5 border border-white/5">
            <span className="text-sm font-medium text-white/90">{t('personaGroup')}</span>
            <span className="text-sm font-bold text-white">{PERSONA_MAP[userProfile?.persona_code]?.nebulaName || userProfile?.persona_code || 'STARTER'}</span>
          </div>
          <div className="flex items-center justify-between p-4 rounded-2xl bg-white/5 border border-white/5 hover:bg-white/10 transition-all duration-200">
            <div className="flex flex-col pr-4">
              <span className="text-sm font-medium text-white">{t('surveyRetryTitle') || '은하 성향 정밀 진단'}</span>
              <p className="text-[12px] text-white/80 mt-0.5 leading-relaxed">
                {t('surveyRetryDesc') || '질문을 통해 진짜 나의 은하 유형을 정밀 보정하고 좌표를 재배치합니다.'}
              </p>
            </div>
            <button
              onClick={() => window.location.href = '/onboarding/survey'}
              className="bg-white/10 hover:bg-white/20 text-white text-xs font-bold rounded-xl px-4 py-2.5 border border-white/10 hover:border-white/20 transition-all shrink-0 cursor-pointer active:scale-95"
            >
              {t('startSurvey') || '정밀 설문하기'}
            </button>
          </div>
          <div className="flex items-center justify-between p-4 rounded-2xl bg-white/5 border border-white/5">
            <span className="text-sm font-medium text-white/90">{t('cumulativeScore')}</span>
            <span className="text-sm font-bold text-white tabular-nums">{(userProfile?.activity_score ?? 0).toLocaleString()}</span>
          </div>
          {userProfile?.created_at && (
            <div className="flex items-center justify-between p-4 rounded-2xl bg-white/5 border border-white/5">
              <span className="text-sm font-medium text-white/90">{t('joinDate')}</span>
              <span className="text-sm font-bold text-white">{new Date(userProfile.created_at).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
            </div>
          )}
        </div>
      </div>

      <div className="h-px w-full bg-white/5" />

      {/* ── 진화 상태 대시보드 ── */}
      <EvolutionDashboard activityScore={Number(userProfile?.activity_score ?? 0)} />

      <div className="h-px w-full bg-white/5" />

      {/* ── 위치 스토리 ── */}
      <LocationStory userId={userProfile?.id} />

      <div className="h-px w-full bg-white/5" />

      <div>
        <h3 className="text-[16px] font-bold text-white mb-1">{t('appSettings')}</h3>
        <p className="text-sm text-white/85 mb-4">{t('appSettingsDesc')}</p>
        
        <div className="space-y-2">
          <div className="flex items-center justify-between p-4 rounded-2xl bg-white/5 border border-white/5">
            <span className="text-sm font-medium text-white/90">{t('language')}</span>
            <select 
              value={language}
              onChange={(e) => {
                setLanguage(e.target.value)
                if (e.target.value === 'en') {
                  useToastStore.getState().addToast({ title: t('langComingSoon'), message: 'English support is coming soon!', type: 'info' })
                  setLanguage('ko') // 아직 지원하지 않으므로 한국어로 롤백
                }
              }}
              className="bg-white/[0.03] border border-white/10 text-white text-sm font-bold rounded-xl px-3 py-1.5 outline-none focus:border-white/30 transition-colors"
            >
              <option value="ko">한국어 (Korean)</option>
              <option value="en">English (US)</option>
            </select>
          </div>
        </div>
      </div>

      <SettingsPushSection />
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// 진화 상태 대시보드 컴포넌트
// ═══════════════════════════════════════════════════════════════════════════
function EvolutionDashboard({ activityScore }: { activityScore: number }) {
  const t = useTranslations('Settings')
  const tier = useMemo(() => getEvolutionTier(activityScore), [activityScore])

  const progressPercent = useMemo(() => {
    if (!tier.nextES) return 100 // 최대 등급
    const rangeStart = tier.minES
    const rangeEnd = tier.nextES
    return Math.min(100, Math.round(((activityScore - rangeStart) / (rangeEnd - rangeStart)) * 100))
  }, [activityScore, tier])

  // 호흡 진폭 계산 (PixelSprite.ts 동기화: min(ES * 0.003, 0.06))
  const breathAmplitude = Math.min(activityScore * 0.003, 0.06)
  const breathPercent = Math.round((breathAmplitude / 0.06) * 100)

  // 이중 글로우 활성 여부 (ES >= 5)
  const hasDualGlow = activityScore >= 5

  return (
    <div>
      <h3 className="text-[16px] font-bold text-white mb-1">
        {t('evolutionTitle')}
      </h3>
      <p className="text-sm text-white/85 mb-4">{t('evolutionDesc')}</p>

      {/* 등급 + 프로그레스 바 */}
      <div className="p-4 rounded-2xl bg-white/5 border border-white/10 mb-3">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">

            <div>
              <div className="text-sm font-bold text-white">{t('tierStep', { label: t(tier.labelKey as any) })}</div>
              <div className="text-[11px] text-white/85">{t('auraRings', { count: tier.ringCount })}</div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-sm font-bold tabular-nums" style={{ color: tier.color }}>
              {activityScore.toLocaleString()}
            </div>
            {tier.nextES && (
              <div className="text-[11px] text-white/85 tabular-nums">/ {tier.nextES.toLocaleString()}</div>
            )}
          </div>
        </div>

        {/* 프로그레스 바 */}
        <div className="relative w-full h-2 bg-white/5 rounded-full overflow-hidden">
          <div
            className="absolute inset-y-0 left-0 rounded-full transition-all duration-700 ease-out"
            style={{
              width: `${progressPercent}%`,
              backgroundColor: tier.color,
              boxShadow: `0 0 8px ${tier.color}50`,
            }}
          />
        </div>
        <div className="flex justify-between mt-1.5">
          <span className="text-[11px] text-white/85">{progressPercent}%</span>
          {tier.nextES ? (
            <span className="text-[11px] text-white/85">{t('nextTier', { label: t(EVOLUTION_TIERS[tier.index + 1]?.labelKey as any), remaining: (tier.nextES - activityScore).toLocaleString() })}</span>
          ) : (
            <span className="text-[11px] text-amber-400/60">{t('maxTier')}</span>
          )}
        </div>
      </div>

      {/* 시각 효과 카드 3종 */}
      <div className="grid grid-cols-3 gap-2">
        {/* 이중 글로우 */}
        <div className="p-3 rounded-xl bg-white/5 border border-white/10 text-center transition-colors">
          <div className="text-xs font-semibold text-white/90 mb-1">{t('dualGlow')}</div>
          <div className={`text-[11px] font-semibold mt-0.5 ${hasDualGlow ? 'text-emerald-400' : 'text-white/85'}`}>
            {hasDualGlow ? t('active') : `ES ≥ 5`}
          </div>
        </div>
        {/* 아우라 링 */}
        <div className="p-3 rounded-xl bg-white/5 border border-white/10 text-center">
          <div className="text-xs font-semibold text-white/90 mb-1">{t('auraRingLabel')}</div>
          <div className="text-[11px] font-semibold mt-0.5 text-white/85">{t('unitCount', { count: tier.ringCount })}</div>
        </div>
        {/* 호흡 진폭 */}
        <div className="p-3 rounded-xl bg-white/5 border border-white/10 text-center">
          <div className="text-xs font-semibold text-white/90 mb-1">{t('breathAmplitude')}</div>
          <div className={`text-[11px] font-semibold mt-0.5 ${activityScore > 0 ? 'text-violet-400' : 'text-white/85'}`}>{breathPercent}%</div>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// 위치 스토리 컴포넌트
// ═══════════════════════════════════════════════════════════════════════════

interface EvolutionData {
  activityScore: number
  rank: number
  zone: number
  zoneName: string
  totalUsers: number
  history: Array<{
    date: string
    rank: number
    zone: number
    x: number
    y: number
  }>
}

function LocationStory({ userId }: { userId?: string }) {
  const t = useTranslations('Settings')
  const [data, setData] = useState<EvolutionData | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    setIsLoading(true)
    setError(false)

    fetch('/api/users/me/evolution')
      .then(res => {
        if (!res.ok) throw new Error('fetch failed')
        return res.json()
      })
      .then(d => {
        if (!cancelled) setData(d)
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => { cancelled = true }
  }, [userId])

  // 데이터가 없으면 placeholder 표시
  if (!userId) return null

  return (
    <div>
      <h3 className="text-[16px] font-bold text-white mb-1">
        {t('locationTitle')}
      </h3>
      <p className="text-sm text-white/85 mb-4">{t('locationDesc')}</p>

      {isLoading && (
        <div className="flex items-center justify-center p-6">
          <LogoSpinner size={48} variant="white" />
        </div>
      )}

      {error && (
        <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/5 text-center">
          <p className="text-xs text-white/90">{t('locationLoading')}</p>
          <p className="text-[12px] text-white/85 mt-1">{t('locationBatchNote')}</p>
        </div>
      )}

      {data && !isLoading && (
        <div className="space-y-3">
          {/* 현재 위치 카드 */}
          <div className="p-4 rounded-2xl bg-white/5 border border-white/10">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div
                  className="w-8 h-8 rounded-xl flex items-center justify-center text-sm font-bold"
                  style={{ backgroundColor: `${ZONE_NAMES[data.zone]?.color || '#6B7280'}20`, color: ZONE_NAMES[data.zone]?.color || '#6B7280' }}
                >
                  {data.zone}
                </div>
                <div>
                  <div className="text-sm font-bold text-white">{data.zoneName}</div>
                  <div className="text-[12px] text-white/90">Zone {data.zone}</div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-bold text-white tabular-nums">#{data.rank.toLocaleString()}</div>
                <div className="text-[12px] text-white/85 tabular-nums">/ {data.totalUsers.toLocaleString()}{t('unitPeople')}</div>
              </div>
            </div>
          </div>

          {/* 이동 히스토리 타임라인 */}
          {data.history.length > 0 && (
            <div className="space-y-1">
              <h4 className="text-xs font-bold text-white/90 uppercase px-1">{t('recentMovement')}</h4>
              <div className="space-y-0">
                {data.history.slice(0, 7).map((entry, i) => {
                  const prevEntry = data.history[i + 1]
                  const rankDiff = prevEntry ? prevEntry.rank - entry.rank : 0
                  const zoneInfo = ZONE_NAMES[entry.zone] || { nameKey: 'zoneUndefined', color: '#6B7280' }

                  const dateLabel = (() => {
                    const d = new Date(entry.date)
                    const today = new Date()
                    const diffDays = Math.floor((today.getTime() - d.getTime()) / 86400000)
                    if (diffDays === 0) return t('today')
                    if (diffDays === 1) return t('yesterday')
                    if (diffDays === 2) return t('dayBeforeYesterday')
                    return t('daysAgo', { days: diffDays })
                  })()

                  return (
                    <div key={`${entry.date}-${i}`} className="flex items-center gap-3 px-2 py-1.5">
                      {/* 타임라인 도트 */}
                      <div className="flex flex-col items-center" style={{ width: 12 }}>
                        <div
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: i === 0 ? zoneInfo.color : `${zoneInfo.color}60` }}
                        />
                        {i < data.history.slice(0, 7).length - 1 && (
                          <div className="w-px h-4 bg-white/10 mt-0.5" />
                        )}
                      </div>
                      {/* 내용 */}
                      <div className="flex-1 flex items-center justify-between min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-[12px] text-white/90 w-10 shrink-0">{dateLabel}</span>
                          <span className="text-[12px] font-medium truncate" style={{ color: zoneInfo.color }}>{t(zoneInfo.nameKey as any)}</span>
                          <span className="text-[12px] text-white/85 tabular-nums shrink-0">#{entry.rank}</span>
                        </div>
                        {/* 랭크 변동 */}
                        {rankDiff !== 0 && (
                          <div className={`flex items-center gap-0.5 text-[12px] font-bold tabular-nums shrink-0 ${rankDiff > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {rankDiff > 0 ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                            {Math.abs(rankDiff)}
                          </div>
                        )}
                        {rankDiff === 0 && prevEntry && (
                          <div className="flex items-center gap-0.5 text-[12px] text-white/85 shrink-0">
                            <Minus className="w-3 h-3" />
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

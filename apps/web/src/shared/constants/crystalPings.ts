// 슈퍼핑(크리스탈 핑) — 유튜브 슈퍼챗과 유사한 후원형 핑
// 생각구독 은하 전용: 구독자만 전송 가능 (향후 구독 검증 추가)
export const CRYSTAL_PING_TIERS = [
  { id: 'crystal_100', label: '💎 100', cost: 100, glowBoost: 5 },
  { id: 'crystal_500', label: '💎 500', cost: 500, glowBoost: 15 },
  { id: 'crystal_1000', label: '💎 1,000', cost: 1000, glowBoost: 30 },
  { id: 'crystal_5000', label: '💎 5,000', cost: 5000, glowBoost: 100 },
] as const

export type CrystalPingTierId = typeof CRYSTAL_PING_TIERS[number]['id']

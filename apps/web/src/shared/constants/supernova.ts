export interface SupernovaTier {
  id: string;
  label: string;
  color: string;
  cost: number;
  durationHours: number;
  activityBoost: number;
  description: string;
}

export const SUPERNOVA_TIERS: SupernovaTier[] = [
  {
    id: 'BRONZE',
    label: 'Bronze Nova',
    color: '#CD7F32',
    cost: 100,
    durationHours: 1,
    activityBoost: 1.5,
    description: '1시간 동안 별을 조금 더 밝게 빛나게 합니다.'
  },
  {
    id: 'SILVER',
    label: 'Silver Nova',
    color: '#C0C0C0',
    cost: 500,
    durationHours: 6,
    activityBoost: 2.0,
    description: '6시간 동안 별의 존재감을 뚜렷하게 강조합니다.'
  },
  {
    id: 'GOLD',
    label: 'Gold Supernova',
    color: '#FFD700',
    cost: 1000,
    durationHours: 24,
    activityBoost: 3.0,
    description: '24시간 동안 우주에서 가장 눈부신 초신성으로 만듭니다.'
  }
];

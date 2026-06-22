export interface PersonaConfig {
  code: string
  name: string
  glowColorPrimary: string
  glowColorSecondary: string
  nebulaName: string
  galaxyGroup: keyof typeof GALAXY_BASES
  anchorCoord: { x: number; y: number }
}

export const VISUAL_SCALE = 70;

export const GALAXY_BASES = {
  NT: { x: 0, y: 0, name: '분석가 대은하' },
  NF: { x: 50000, y: 0, name: '외교관 대은하' },
  SJ: { x: 0, y: 50000, name: '관리자 대은하' },
  SP: { x: 50000, y: 50000, name: '탐험가 대은하' },
  CONTEXT: { x: 0, y: 0, name: '맥락 대은하' },
} as const;

/**
 * [대규모 렌더링 아키텍처 v2]
 * 1. 4대 대은하 + 파트너 대은하(CONTEXT)를 서로 격리함.
 * 2. 각 대은하 내부에는 성운(Nebula)이 존재함.
 */
export const PERSONA_MAP: Record<string, PersonaConfig> = {
  // ── NT 대은하 (Base: 0, 0) ──────────────────
  INTJ: {
    code: 'INTJ',
    galaxyGroup: 'NT',
    name: '고독한 수정 성운',
    glowColorPrimary: '#6366F1',
    glowColorSecondary: '#312E81',
    nebulaName: '수정 성단',
    anchorCoord: { x: -2000, y: -2000 },
  },
  INTP: {
    code: 'INTP',
    galaxyGroup: 'NT',
    name: '탐구하는 청백 성운',
    glowColorPrimary: '#06B6D4',
    glowColorSecondary: '#0E7490',
    nebulaName: '논리 성단',
    anchorCoord: { x: -1500, y: 1500 },
  },
  ENTJ: {
    code: 'ENTJ',
    galaxyGroup: 'NT',
    name: '지휘하는 황금 성운',
    glowColorPrimary: '#F59E0B',
    glowColorSecondary: '#92400E',
    nebulaName: '지휘관 성단',
    anchorCoord: { x: 2000, y: -2000 },
  },
  ENTP: {
    code: 'ENTP',
    galaxyGroup: 'NT',
    name: '도전하는 주황 성운',
    glowColorPrimary: '#F97316',
    glowColorSecondary: '#9A3412',
    nebulaName: '혁신 성단',
    anchorCoord: { x: 1500, y: 1500 },
  },

  // ── NF 대은하 (Base: 200,000, 0) ──────────────────
  INFJ: {
    code: 'INFJ',
    galaxyGroup: 'NF',
    name: '예언하는 보라 성운',
    glowColorPrimary: '#8B5CF6',
    glowColorSecondary: '#4C1D95',
    nebulaName: '통찰 성단',
    anchorCoord: { x: -2000, y: -2000 },
  },
  INFP: {
    code: 'INFP',
    galaxyGroup: 'NF',
    name: '꿈꾸는 네온 성운',
    glowColorPrimary: '#EC4899',
    glowColorSecondary: '#831843',
    nebulaName: '꿈꾸는 성단',
    anchorCoord: { x: -1500, y: 1500 },
  },
  ENFJ: {
    code: 'ENFJ',
    galaxyGroup: 'NF',
    name: '이끄는 산호 성운',
    glowColorPrimary: '#F43F5E',
    glowColorSecondary: '#881337',
    nebulaName: '연결 성단',
    anchorCoord: { x: 2000, y: -2000 },
  },
  ENFP: {
    code: 'ENFP',
    galaxyGroup: 'NF',
    name: '에너지 혜성 성운',
    glowColorPrimary: '#22C55E',
    glowColorSecondary: '#14532D',
    nebulaName: '자유 성단',
    anchorCoord: { x: 1500, y: 1500 },
  },

  // ... 나머지 SJ, SP 도 동일한 패턴으로 Base Offset 적용 가능
  ISTJ: { code: 'ISTJ', galaxyGroup: 'SJ', name: '정렬된 강철 성운', glowColorPrimary: '#64748B', glowColorSecondary: '#1E293B', nebulaName: '질서 성단', anchorCoord: { x: -2000, y: -2000 } },
  ISFJ: { code: 'ISFJ', galaxyGroup: 'SJ', name: '따뜻한 황토 성운', glowColorPrimary: '#D97706', glowColorSecondary: '#78350F', nebulaName: '수호 성단', anchorCoord: { x: -1500, y: 1500 } },
  ESTJ: { code: 'ESTJ', galaxyGroup: 'SJ', name: '관리하는 은빛 성운', glowColorPrimary: '#94A3B8', glowColorSecondary: '#334155', nebulaName: '관리자 성단', anchorCoord: { x: 2000, y: -2000 } },
  ESFJ: { code: 'ESFJ', galaxyGroup: 'SJ', name: '돌보는 장미 성운', glowColorPrimary: '#FB7185', glowColorSecondary: '#9F1239', nebulaName: '화합 성단', anchorCoord: { x: 1500, y: 1500 } },

  ISTP: { code: 'ISTP', galaxyGroup: 'SP', name: '고요한 흑요석 성운', glowColorPrimary: '#475569', glowColorSecondary: '#0F172A', nebulaName: '장인 성단', anchorCoord: { x: -2000, y: -2000 } },
  ISFP: { code: 'ISFP', galaxyGroup: 'SP', name: '감성 라벤더 성운', glowColorPrimary: '#C084FC', glowColorSecondary: '#581C87', nebulaName: '예술 성단', anchorCoord: { x: -1500, y: 1500 } },
  ESTP: { code: 'ESTP', galaxyGroup: 'SP', name: '활동적 적색 혜성', glowColorPrimary: '#EF4444', glowColorSecondary: '#7F1D1D', nebulaName: '모험 성단', anchorCoord: { x: 2000, y: -2000 } },
  ESFP: { code: 'ESFP', galaxyGroup: 'SP', name: '빛나는 에메랄드 성운', glowColorPrimary: '#10B981', glowColorSecondary: '#064E3B', nebulaName: '열정 성단', anchorCoord: { x: 1500, y: 1500 } },
}

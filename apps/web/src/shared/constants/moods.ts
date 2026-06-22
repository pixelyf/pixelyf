import { 
  Smile, Heart, Flame, Leaf, Waves,
  CloudRain, Search, BatteryLow, Circle,
  Telescope, Compass, Mountain,
  LucideIcon
} from 'lucide-react'

export interface MoodType {
  id: string
  label: string
  enLabel: string
  icon: LucideIcon
  colorClass: string       // Tailwind gradient classes (from-... to-...)
  primaryColor: number    // Hex number for PixiJS (e.g., 0xFACC15) - Primary
  deepColor: number       // Hex number for PixiJS (e.g., 0x92400E) - Deep (배경)
  lightColor: number      // Hex number for PixiJS (e.g., 0xFDE68A) - Light (연한 하이라이트)
}

/**
 * DB에 저장된 과거 감정 ID들과의 하위 호환성을 보장하기 위한 레거시 맵
 */
export const LEGACY_ID_MAP: Record<string, string> = {
  excited: 'anticipation',
  think: 'reflection',
  challenge: 'determination',
}

/**
 * [Aura Core 12] - 글로벌 보편 감정 기반 12종 정예화 + 3-Tier 컬러 시스템
 * 30종의 중복을 제거하고 시각적 변별력과 일상적 접근성을 극대화함.
 */
export const MOODS: MoodType[] = [
  // 1. 긍정 & 행복 (Warm spectrum)
  { 
    id: 'happy', 
    label: '행복', 
    enLabel: 'Happy', 
    icon: Smile, 
    colorClass: 'from-amber-400 to-orange-600', 
    primaryColor: 0xFBBF24, 
    deepColor: 0x92400E,
    lightColor: 0xFDE68A
  },
  { 
    id: 'love', 
    label: '사랑', 
    enLabel: 'Love', 
    icon: Heart, 
    colorClass: 'from-rose-400 to-pink-600', 
    primaryColor: 0xFB7185, 
    deepColor: 0x9F1239,
    lightColor: 0xFDA4AF
  },
  { 
    id: 'anticipation', 
    label: '기대', 
    enLabel: 'Anticipation', 
    icon: Telescope, 
    colorClass: 'from-orange-400 to-red-600', 
    primaryColor: 0xF97316, 
    deepColor: 0x9A3412,
    lightColor: 0xFDBA74
  },
  { 
    id: 'passion', 
    label: '열정', 
    enLabel: 'Passion', 
    icon: Flame, 
    colorClass: 'from-red-500 to-red-900', 
    primaryColor: 0xEF4444, 
    deepColor: 0x991B1B,
    lightColor: 0xFCA5A5
  },

  // 2. 평온 & 안정 (Cool spectrum)
  { 
    id: 'peace', 
    label: '평온', 
    enLabel: 'Peace', 
    icon: Leaf, 
    colorClass: 'from-green-400 to-green-700', 
    primaryColor: 0x22C55E, 
    deepColor: 0x166534,
    lightColor: 0x86EFAC
  },
  { 
    id: 'calm', 
    label: '고요', 
    enLabel: 'Calm', 
    icon: Waves, 
    colorClass: 'from-cyan-400 to-blue-600', 
    primaryColor: 0x38BDF8, 
    deepColor: 0x075985,
    lightColor: 0xBAE6FD
  },
  { 
    id: 'sad', 
    label: '슬픔', 
    enLabel: 'Sad', 
    icon: CloudRain, 
    colorClass: 'from-blue-600 to-blue-900', 
    primaryColor: 0x3B82F6, 
    deepColor: 0x1E40AF,
    lightColor: 0x93C5FD
  },
  { 
    id: 'reflection', 
    label: '성찰', 
    enLabel: 'Reflection', 
    icon: Compass, 
    colorClass: 'from-indigo-500 to-indigo-950', 
    primaryColor: 0x6366F1, 
    deepColor: 0x3730A3,
    lightColor: 0xA5B4FC
  },

  // 3. 자아 & 상태 (Mixed/Neutral spectrum)
  { 
    id: 'curious', 
    label: '호기심', 
    enLabel: 'Curious', 
    icon: Search, 
    colorClass: 'from-purple-400 to-purple-800', 
    primaryColor: 0x8B5CF6, 
    deepColor: 0x5B21B6,
    lightColor: 0xC4B5FD
  },
  { 
    id: 'determination', 
    label: '의지', 
    enLabel: 'Determination', 
    icon: Mountain, 
    colorClass: 'from-teal-400 to-teal-800', 
    primaryColor: 0x14B8A6, 
    deepColor: 0x115E59,
    lightColor: 0x5EEAD4
  },
  { 
    id: 'tired', 
    label: '지침', 
    enLabel: 'Tired', 
    icon: BatteryLow, 
    colorClass: 'from-slate-600 to-slate-900', 
    primaryColor: 0x64748B, 
    deepColor: 0x334155,
    lightColor: 0x94A3B8
  },
  { 
    id: 'neutral', 
    label: '평범', 
    enLabel: 'Neutral', 
    icon: Circle, 
    colorClass: 'from-stone-500 to-stone-800', 
    primaryColor: 0xD6D3D1, // stone-300 (부드러운 밝은 갈색빛 실버)
    deepColor: 0x292524,    // stone-800 (어두운 갈색빛 웜차콜 - 일주일 전 secondaryColor 복원)
    lightColor: 0x78716C    // stone-500 (중간 갈색빛 웜그레이 - 일주일 전 primaryColor 복원)
  },
]

/**
 * Mood ID를 기반으로 DB에 저장할 HEX 형태의 컬러 정보를 반환합니다.
 * 존재하지 않는 구형 ID일 경우 MOODS[0](행복)을 기본값으로 반환합니다.
 */
export function getMoodColors(moodId: string) {
  const effectiveId = LEGACY_ID_MAP[moodId] || moodId;
  const mood = MOODS.find(m => m.id === effectiveId) || MOODS.find(m => m.id === 'neutral') || MOODS[0];
  
  const toHex = (num: number) => {
    return '#' + num.toString(16).padStart(6, '0').toUpperCase();
  }

  return {
    primary: toHex(mood.primaryColor),
    secondary: toHex(mood.deepColor), // 하위 호환을 위해 secondary에 deepColor 매핑
    light: toHex(mood.lightColor),
    label: mood.label,
    icon: mood.icon
  };
}

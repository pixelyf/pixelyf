import {
  HandHelping,
  Droplets,
  Umbrella,
  Moon,
  Heart,
  Zap,
  HandMetal,
  Sparkles,
  Star,
  Wand2,
  Share2,
  Telescope
} from 'lucide-react'
import type React from 'react'

export const PING_ICON_MAP: Record<string, React.ComponentType<any>> = {
  HandHelping,
  Droplets,
  Umbrella,
  Moon,
  Heart,
  Zap,
  HandMetal,
  Sparkles,
  Star,
  Wand2,
  Share2,
  Telescope,
}

export const PING_GLOW_COLORS: Record<string, string> = {
  hug: '#38bdf8', tear: '#60a5fa', protect: '#818cf8', rest: '#34d399',
  heart: '#fb7185', cheer: '#fb923c', applaud: '#facc15', blessing: '#fbbf24',
  starlight: '#c084fc', magic: '#a78bfa', connect: '#22d3ee', care: '#94a3b8',
}

export const PING_WHITE_BG_COLORS: Record<string, string> = {
  hug: 'text-sky-600', tear: 'text-blue-600', protect: 'text-indigo-600', rest: 'text-emerald-600',
  heart: 'text-rose-600', cheer: 'text-orange-600', applaud: 'text-amber-600', blessing: 'text-amber-500',
  starlight: 'text-purple-600', magic: 'text-violet-600', connect: 'text-cyan-600', care: 'text-slate-600',
}

export interface PingType {
  id: string
  icon: string
  label: string
  emotionalMessage: string
  iconColorClass: string // Tailwind text color styles
}

export const PING_TYPES: PingType[] = [
  // 1. 공감/위로 (Comfort/Empathy)
  {
    id: 'hug',
    icon: 'HandHelping',
    label: '토닥토닥',
    emotionalMessage: '힘든 마음을 다 이해할 순 없겠지만, 제가 조용히 당신의 곁을 지켜드리고 싶어요.',
    iconColorClass: 'text-sky-400',
  },
  {
    id: 'tear',
    icon: 'Droplets',
    label: '눈물공감',
    emotionalMessage: '마음껏 울어도 괜찮아요. 슬픔을 다 쏟아내고 나면 더 맑은 내일이 올 거예요.',
    iconColorClass: 'text-blue-400',
  },
  {
    id: 'protect',
    icon: 'Umbrella',
    label: '수호',
    emotionalMessage: '어떤 찬바람이 불어와도 당신의 따뜻한 마음이 다치지 않게 제가 지켜줄게요.',
    iconColorClass: 'text-indigo-400',
  },
  {
    id: 'rest',
    icon: 'Moon',
    label: '휴식',
    emotionalMessage: '잠시 모든 짐을 내려놓고 편히 쉬어가세요. 당신은 충분히 쉴 자격이 있는 사람이에요.',
    iconColorClass: 'text-emerald-400',
  },

  // 2. 응원/에너지 (Support/Energy)
  {
    id: 'heart',
    icon: 'Heart',
    label: '사랑',
    emotionalMessage: '당신이라는 존재 그 자체로 충분히 소중하고 아름다운 사람이라는 걸 잊지 마세요.',
    iconColorClass: 'text-rose-400',
  },
  {
    id: 'cheer',
    icon: 'Zap',
    label: '파이팅',
    emotionalMessage: '오늘 하루도 정말 고생 많았어요. 제가 항상 당신의 편이 되어 드릴게요.',
    iconColorClass: 'text-orange-400',
  },
  {
    id: 'applaud',
    icon: 'HandMetal',
    label: '박수',
    emotionalMessage: '당신이 이뤄낸 작은 성취들이 하나둘 모여 결국 빛나는 픽셀이 될 거라고 믿어요.',
    iconColorClass: 'text-yellow-400',
  },
  {
    id: 'blessing',
    icon: 'Sparkles',
    label: '축복',
    emotionalMessage: '오늘 당신의 하늘에 예기치 못한 행복이 선물처럼 찾아오길 진심으로 바랄게요.',
    iconColorClass: 'text-amber-400',
  },

  // 3. 연결/관심 (Connection/Interest)
  {
    id: 'starlight',
    icon: 'Star',
    label: '픽셀빔',
    emotionalMessage: '수많은 픽셀 중에서 당신의 존재는 제 마음을 유독 따뜻하게 비추고 있어요.',
    iconColorClass: 'text-purple-400',
  },
  {
    id: 'magic',
    icon: 'Wand2',
    label: '마법',
    emotionalMessage: '지금의 걱정들이 마법처럼 사라지고, 내일은 당신이 환하게 웃을 수 있길 기도해요.',
    iconColorClass: 'text-violet-400',
  },
  {
    id: 'connect',
    icon: 'Share2',
    label: '연결',
    emotionalMessage: '우리가 비록 멀리 떨어져 있어도, 당신의 마음은 언제나 제 우주에 닿고 있어요.',
    iconColorClass: 'text-cyan-400',
  },
  {
    id: 'care',
    icon: 'Telescope',
    label: '관심',
    emotionalMessage: '오늘 당신의 시간들이 어땠을지 궁금해요. 멀리서나마 당신의 하루를 응원할게요.',
    iconColorClass: 'text-slate-400',
  },
]

export type PingId = 
  | 'hug' | 'tear' | 'protect' | 'rest' 
  | 'heart' | 'cheer' | 'applaud' | 'blessing' 
  | 'starlight' | 'magic' | 'connect' | 'care';

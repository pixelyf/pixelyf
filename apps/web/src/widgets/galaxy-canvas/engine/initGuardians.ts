/**
 * [가디언 시스템 초기화 모듈]
 * 은하 그룹별 가디언(PixelySwimmer) 생성/관리를 담당합니다.
 * 24단계 히스토리: 은하 격리 스폰, 네임드 시스템 보존.
 */
import * as PIXI from 'pixi.js'
import { PixelySwimmer, type PersonaGroup } from '@/shared/lib/pixi/PixelySwimmer'

// [FEATURE FLAG] 유영하는 아바타(가디언) 기능 활성화 스위치 (정책 미확정으로 임시 OFF)
export const ENABLE_GUARDIANS = false;

const MBTI_TYPES = [
  'INTJ', 'INTP', 'ENTJ', 'ENTP', 'INFJ', 'INFP', 'ENFJ', 'ENFP',
  'ISTJ', 'ISFJ', 'ESTJ', 'ESFJ', 'ISTP', 'ISFP', 'ESTP', 'ESFP',
]

const PREFIXES = [
  'Solar', 'Lunar', 'Nova', 'Astral', 'Cosmic',
  'Neon', 'Void', 'Astra', 'Zenith', 'Polaris',
  'Cyber', 'Bio', 'Nano', 'Echo', 'Drift',
]

const K_CONNECT_PREFIXES = [
  '자유로운', '탐구하는', '언러닝', '콘티뉴어스', '통찰의', '청여하는', '성찰하는',
]

// [OPT] 가디언 Spine 에셋 고유 캐릭터 목록 — 사전 로드용
const GUARDIAN_SPINE_CHARS = ['spineboy', 'mix-and-match', 'raptor', 'alien']
const SPINE_BASE = 'https://esotericsoftware.com/files/examples/4.3'

export interface GuardianResult {
  swimmers: PixelySwimmer[]
  cleanup: () => void
}

/**
 * [Phase 1] Spine 에셋 사전 로드 — 고유 캐릭터 4종만 한 번에 로드
 * 100개 가디언이 각각 로드하는 대신, 여기서 4개 에셋을 병렬 로드 후
 * PixelySwimmer.drawPersonaShape()에서는 캐시 히트만 발생합니다.
 */
async function preloadGuardianSpineAssets(): Promise<void> {
  const keysToLoad: string[] = []

  for (const charName of GUARDIAN_SPINE_CHARS) {
    const skelKey = `${charName}Skel`
    const atlasKey = `${charName}Atlas`

    if (!PIXI.Assets.resolver.hasKey(skelKey)) {
      PIXI.Assets.add({ alias: skelKey, src: `${SPINE_BASE}/${charName}/export/${charName}-pro.skel` })
      PIXI.Assets.add({ alias: atlasKey, src: `${SPINE_BASE}/${charName}/export/${charName}-pma.atlas` })
    }

    keysToLoad.push(skelKey, atlasKey)
  }

  if (keysToLoad.length > 0) {
    await PIXI.Assets.load(keysToLoad)
  }
}

/**
 * [Phase 2] 가디언들을 스폰하고 반환합니다.
 * - 픽셀리프 코어 은하: 12마리, CONTEXT 그룹
 * - 다른 은하: MBTI 16단계 순환 (100마리 목표)
 *
 * 에셋은 Phase 1에서 이미 캐시되어 있으므로 인스턴스 생성만 수행합니다.
 */
export async function initGuardians(
  effectLayer: PIXI.Container,
  partnerCode: string | undefined,
  galaxyGroup: PersonaGroup
): Promise<GuardianResult> {
  // 스위치가 꺼진 경우 에셋 로드 및 swimmer 생성을 완전히 스킵하여 리소스 소모를 방지합니다.
  if (!ENABLE_GUARDIANS) {
    return { swimmers: [], cleanup: () => {} }
  }

  // Phase 1: 에셋 사전 로드 (4종 × 2파일 = 8 HTTP 요청, 병렬)
  await preloadGuardianSpineAssets()

  // Phase 2: 인스턴스 생성 (에셋은 캐시 히트)
  const swimmers: PixelySwimmer[] = []

  // [LOCALIZE] 모든 그룹이 엔진상으론 (0,0) 주변을 유영
  const gBounds = { minX: -100000, maxX: 100000, minY: -100000, maxY: 100000 }

  if (partnerCode === 'pixelyf') {
    // 픽셀리프 코어 은하: 12마리 PIXELYF_CORE 유형 가디언 스폰
    for (let i = 0; i < 12; i++) {
      const prefix = K_CONNECT_PREFIXES[Math.floor(Math.random() * K_CONNECT_PREFIXES.length)]
      const nickname = `${prefix} 가디언-${(i + 1).toString().padStart(2, '0')}`
      const spawnX = gBounds.minX + Math.random() * (gBounds.maxX - gBounds.minX)
      const spawnY = gBounds.minY + Math.random() * (gBounds.maxY - gBounds.minY)

      const swimmer = new PixelySwimmer('PIXELYF_CORE', nickname, spawnX, spawnY, 'CONTEXT')
      effectLayer.addChild(swimmer)
      swimmers.push(swimmer)
    }
  } else {
    for (let i = 0; i < MBTI_TYPES.length; i++) {
      const mbti = MBTI_TYPES[i]
      const prefix = PREFIXES[Math.floor(Math.random() * PREFIXES.length)]
      const nickname = `${prefix} ${mbti}` // 일련번호 제거하고 깔끔하게 표기

      const spawnX = gBounds.minX + Math.random() * (gBounds.maxX - gBounds.minX)
      const spawnY = gBounds.minY + Math.random() * (gBounds.maxY - gBounds.minY)

      const swimmer = new PixelySwimmer(mbti, nickname, spawnX, spawnY, galaxyGroup)
      effectLayer.addChild(swimmer)
      swimmers.push(swimmer)
    }
  }

  const cleanup = () => {
    swimmers.forEach(s => {
      if (!s.destroyed) s.destroy({ children: true })
    })
    swimmers.length = 0
  }

  return { swimmers, cleanup }
}

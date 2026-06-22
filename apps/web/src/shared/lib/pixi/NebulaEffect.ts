import * as PIXI from 'pixi.js'

/**
 * [NebulaEffect v4 — 과학적 성운 렌더러]
 *
 * ■ 천문학적 근거:
 *   - 방출 성운 (Emission): Hα 이온화 수소 발광 → 적색/핑크
 *   - 반사 성운 (Reflection): 먼지의 별빛 산란 → 청색/시안
 *   - 암흑 성운 (Dark/Absorption): 고밀도 먼지의 빛 흡수 → 검은 실루엣
 *
 * ■ 수학적 기법:
 *   1. 2단 도메인 왜곡 체인: f(p) = fbm(p + fbm(p + fbm(p)))
 *   2. Curl Noise: 발산-프리 벡터장 → 비압축 유체 소용돌이
 *   3. Ridged Multifractal: 날카로운 필라멘트/먼지 레인
 *   4. 비등방성(Anisotropic) 타원 감쇠: 각 blob마다 고유 종횡비 + 회전
 *   5. Hubble SHO(황-수소-산소) 팔레트 기반 색상
 *
 * ■ 렌더링 아키텍처:
 *   - 모든 noise 연산은 초기화 시 Canvas 2D에 pre-bake (런타임 FPS 영향 0)
 *   - pixiApp.stage 직접 자식 (카메라 변환 독립)
 *   - 이동 패럴랙스: vp.x/y × PARALLAX_FACTOR + 모듈러 래핑
 *   - 줌 패럴랙스: Math.pow(zoom / 0.1, NEBULA_Z * 7.5)
 */

// ═══════════════════════════════════════════
// §1. Noise 수학 함수
// ═══════════════════════════════════════════

function hash2d(ix: number, iy: number): number {
  let h = (ix * 374761393 + iy * 668265263) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h = h ^ (h >>> 16)
  return (h >>> 0) / 4294967296
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t)
}

function valueNoise(x: number, y: number): number {
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  const fx = smoothstep(x - ix)
  const fy = smoothstep(y - iy)
  const n00 = hash2d(ix, iy)
  const n10 = hash2d(ix + 1, iy)
  const n01 = hash2d(ix, iy + 1)
  const n11 = hash2d(ix + 1, iy + 1)
  return (n00 + (n10 - n00) * fx) + ((n01 + (n11 - n01) * fx) - (n00 + (n10 - n00) * fx)) * fy
}

/** 표준 fBM: 부드러운 구름 형태 */
function fbm(x: number, y: number, octaves = 6, persistence = 0.5, lacunarity = 2.0): number {
  let value = 0, amplitude = 1, frequency = 1, maxAmp = 0
  for (let i = 0; i < octaves; i++) {
    value += amplitude * valueNoise(x * frequency, y * frequency)
    maxAmp += amplitude
    amplitude *= persistence
    frequency *= lacunarity
  }
  return value / maxAmp
}

/**
 * Ridged Multifractal Noise: abs(noise)를 반전하여 "능선(ridge)" 생성.
 * → 실제 성운의 날카로운 필라멘트, 먼지 레인 구조를 재현합니다.
 * 일반 fBM이 "솜뭉치"라면, ridged noise는 "실타래"에 가깝습니다.
 */
function ridgedFbm(x: number, y: number, octaves = 5, lacunarity = 2.0, gain = 0.5): number {
  let value = 0, amplitude = 1, frequency = 1, weight = 1
  for (let i = 0; i < octaves; i++) {
    let signal = valueNoise(x * frequency, y * frequency)
    signal = 1.0 - Math.abs(signal * 2 - 1) // ridge 변환: |2n-1|를 뒤집음
    signal *= signal  // 제곱으로 명암 대비 강화
    signal *= weight  // 이전 옥타브의 영향
    weight = Math.min(1, Math.max(0, signal * gain)) // 가중치 연쇄
    value += signal * amplitude
    amplitude *= 0.5
    frequency *= lacunarity
  }
  return Math.min(1, value * 0.5) // 정규화
}

/**
 * [NEW] Curl Noise: 스칼라 노이즈 필드의 curl 연산 → 소용돌이 벡터
 * 발산-프리(divergence-free) 속성으로 비압축 유체의 소용돌이를 시뮬레이션.
 * 실제 성운 내부의 가스 난류 흐름을 표현합니다.
 */
function curlNoise(x: number, y: number, eps = 0.05): [number, number] {
  const dndx = (valueNoise(x + eps, y) - valueNoise(x - eps, y)) / (2 * eps)
  const dndy = (valueNoise(x, y + eps) - valueNoise(x, y - eps)) / (2 * eps)
  return [dndy, -dndx]  // 90° 회전 → 발산-프리 벡터장
}

/**
 * [NEW v4] 2단 도메인 왜곡 체인 + Curl Noise 소용돌이 혼합
 *
 * 기존: 1단 warp → fBM + ridged 단순 혼합
 * 신규: 2단 warp chain → curl distortion → fBM + ridged 강화 혼합
 *
 * 비율 변경: 구름 45% + 필라멘트 55% (기존 60:40)
 * → 필라멘트 구조를 강화하여 실제 성운의 섬유질 느낌 부각
 */
function nebulaField(x: number, y: number, warpStrength: number, curlStrength = 0.3): number {
  // 1단: 1차 도메인 왜곡 (저주파 대형 구조)
  const w1x = fbm(x + 1.7, y + 9.2, 3) * warpStrength * 0.5
  const w1y = fbm(x + 8.3, y + 2.8, 3) * warpStrength * 0.5

  // 2단: 2차 도메인 왜곡 (1단 결과를 입력으로 → 재귀적 복잡도)
  const warpX = fbm(x + w1x, y + w1y, 4) * warpStrength
  const warpY = fbm(x + 5.2 + w1x, y + 1.3 + w1y, 4) * warpStrength
  let wx = x + warpX
  let wy = y + warpY

  // Curl Noise 소용돌이 적용: 가스 난류의 회전 흐름
  const [cx, cy] = curlNoise(wx * 0.5, wy * 0.5)
  wx += cx * curlStrength
  wy += cy * curlStrength

  // fBM(부드러운 구름) + ridged(날카로운 필라멘트) 혼합
  const cloud = fbm(wx, wy, 6)
  const filament = ridgedFbm(wx + 3.7, wy + 2.1, 5)

  // 45% 구름 + 55% 필라멘트 → 날카로운 구조가 더 돋보이는 혼합
  return cloud * 0.45 + filament * 0.55
}

// ═══════════════════════════════════════════
// §2. 멀티컬러 가스 레이어 (Hubble SHO Palette + 3종 성운 분류)
// ═══════════════════════════════════════════

/**
 * 성운 유형별 천문학적 분류:
 * - emission: 이온화 수소 발광 (Hα 적색/핑크, S-II 황색, O-III 청색)
 * - reflection: 먼지의 별빛 산란 (레일리 산란 → 청색 우세)
 * - dark: 고밀도 먼지가 배경 빛 흡수 (검은 실루엣/먼지 레인)
 */
interface GasLayer {
  seedOffset: number
  color: [number, number, number]
  intensity: number
  warpStrength: number
  nebulaType: 'emission' | 'reflection' | 'dark'
}

/**
 * 각 프리셋의 형태 파라미터.
 * - aspectX / aspectY: 비등방성 종횡비 (1.0/1.0 = 원형, 1.0/0.4 = 가로로 기다란 타원)
 * - rotation: 성운 텍스처 회전각 (라디안)
 * - curlStrength: Curl Noise 소용돌이 강도
 */
interface PresetShape {
  aspectX: number
  aspectY: number
  rotation: number
  curlStrength: number
  layers: GasLayer[]
}

const GAS_PRESETS: PresetShape[] = [
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // A: 원형 방출 성운 (Orion Nebula 참조) — 중앙 배치용
  // 둥근 형태, 강한 Hα 발광, 암흑 먼지 레인 관통
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  {
    aspectX: 1.0, aspectY: 0.85, rotation: 0, curlStrength: 0.35,
    layers: [
      { seedOffset: 0, color: [0.08, 0.22, 0.72], intensity: 1.0, warpStrength: 2.2, nebulaType: 'emission' },     // O-III 청색 코어
      { seedOffset: 17, color: [0.04, 0.50, 0.55], intensity: 0.85, warpStrength: 1.6, nebulaType: 'reflection' },  // 틸 반사광
      { seedOffset: 31, color: [0.02, 0.02, 0.02], intensity: 0.60, warpStrength: 2.8, nebulaType: 'dark' },        // 암흑 먼지 레인
    ],
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // B: 기다란 필라멘트 성운 (Eagle Nebula 참조) — 근거리 배치용
  // 세로로 긴 타원, 강한 ridged 필라멘트, 기둥(Pillar) 구조
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  {
    aspectX: 0.45, aspectY: 1.0, rotation: Math.PI * 0.15, curlStrength: 0.2,
    layers: [
      { seedOffset: 5, color: [0.12, 0.18, 0.68], intensity: 1.0, warpStrength: 2.5, nebulaType: 'emission' },     // 인디고 Hα
      { seedOffset: 22, color: [0.50, 0.15, 0.45], intensity: 0.80, warpStrength: 1.8, nebulaType: 'emission' },    // 핑크 S-II
      { seedOffset: 38, color: [0.01, 0.01, 0.01], intensity: 0.55, warpStrength: 3.0, nebulaType: 'dark' },        // 암흑 기둥
    ],
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // C: 대각 타원 성운 (Carina Nebula 참조) — 외곽용
  // 45° 대각선 타원, 방출 + 반사 혼합
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  {
    aspectX: 0.55, aspectY: 1.0, rotation: Math.PI * 0.25, curlStrength: 0.4,
    layers: [
      { seedOffset: 10, color: [0.55, 0.12, 0.42], intensity: 1.0, warpStrength: 2.0, nebulaType: 'emission' },    // 로즈 Hα
      { seedOffset: 27, color: [0.08, 0.35, 0.62], intensity: 0.90, warpStrength: 2.3, nebulaType: 'reflection' }, // 스틸블루 반사
      { seedOffset: 44, color: [0.40, 0.30, 0.08], intensity: 0.70, warpStrength: 1.5, nebulaType: 'emission' },   // 앰버 S-II
    ],
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // D: 가로로 긴 성운 (Veil Nebula 참조) — 외곽용
  // 수평 타원, 강한 curl → 드레이프/커튼 구조
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  {
    aspectX: 1.0, aspectY: 0.35, rotation: Math.PI * -0.1, curlStrength: 0.5,
    layers: [
      { seedOffset: 15, color: [0.10, 0.30, 0.65], intensity: 1.0, warpStrength: 1.8, nebulaType: 'emission' },    // 코발트 O-III
      { seedOffset: 32, color: [0.60, 0.10, 0.30], intensity: 0.85, warpStrength: 2.4, nebulaType: 'emission' },   // 크림슨 Hα
      { seedOffset: 48, color: [0.02, 0.02, 0.02], intensity: 0.50, warpStrength: 2.0, nebulaType: 'dark' },       // 암흑 리본
    ],
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // E: 약간 타원형 반사 성운 (Pleiades 참조) — 중앙 근거리용
  // 부드러운 청색 안개, 약한 필라멘트, 순수 블루 계열
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  {
    aspectX: 1.0, aspectY: 0.65, rotation: Math.PI * 0.35, curlStrength: 0.25,
    layers: [
      { seedOffset: 20, color: [0.06, 0.18, 0.58], intensity: 1.0, warpStrength: 1.8, nebulaType: 'reflection' },  // 미드나잇 반사
      { seedOffset: 37, color: [0.12, 0.12, 0.65], intensity: 0.90, warpStrength: 2.2, nebulaType: 'reflection' }, // 퍼플블루 반사
      { seedOffset: 53, color: [0.06, 0.48, 0.28], intensity: 0.65, warpStrength: 1.5, nebulaType: 'emission' },   // 오로라 그린 O-III
    ],
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // F: 불규칙 필라멘트 성운 (Tarantula Nebula 참조) — 외곽용
  // 강한 비등방성, 다채로운 방출, 짙은 암흑 레인
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  {
    aspectX: 0.40, aspectY: 1.0, rotation: Math.PI * -0.3, curlStrength: 0.45,
    layers: [
      { seedOffset: 25, color: [0.08, 0.28, 0.62], intensity: 1.0, warpStrength: 2.5, nebulaType: 'emission' },    // 로열블루 O-III
      { seedOffset: 42, color: [0.55, 0.08, 0.48], intensity: 0.85, warpStrength: 1.8, nebulaType: 'emission' },   // 퓨샤 Hα
      { seedOffset: 58, color: [0.02, 0.01, 0.01], intensity: 0.65, warpStrength: 3.2, nebulaType: 'dark' },       // 암흑 코쿤
    ],
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // G: 레드+다크블루 혼합 성운 (Rosette Nebula 참조) — 중앙 근거리용
  // 강한 Hα 적색 발광 코어 + 깊은 O-III 다크블루 외곽,
  // 이온화 전선(Ionization Front)의 레드-블루 경계 재현
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  {
    aspectX: 0.75, aspectY: 1.0, rotation: Math.PI * 0.12, curlStrength: 0.38,
    layers: [
      { seedOffset: 30, color: [0.62, 0.08, 0.12], intensity: 1.0, warpStrength: 2.3, nebulaType: 'emission' },    // 딥레드 Hα 코어
      { seedOffset: 46, color: [0.06, 0.10, 0.48], intensity: 0.90, warpStrength: 2.0, nebulaType: 'emission' },   // 다크블루 O-III 외곽
      { seedOffset: 61, color: [0.02, 0.02, 0.02], intensity: 0.55, warpStrength: 2.6, nebulaType: 'dark' },       // 암흑 먼지 실루엣
    ],
  },
]

// ═══════════════════════════════════════════
// §3. NebulaEffect 클래스
// ═══════════════════════════════════════════

/** 이동 패럴랙스 계수 (배경별의 z≈0.02~0.03 범위와 유사) */
const PARALLAX_FACTOR = 0.003

/**
 * 줌 패럴랙스 깊이.
 * 배경별의 z=0.02~0.03에서 Math.pow(zoom/0.1, z*7.5)로 줌 반응.
 * 성운은 별과 픽셀 중간이므로 z=0.015 설정.
 */
const NEBULA_Z = 0.015

/** 성운 기본 alpha (이전 0.35 → 0.55로 밝기 증가) */
const BASE_ALPHA = 0.55

export class NebulaEffect extends PIXI.Container {
  private blobs: Array<{
    sprite: PIXI.Sprite
    anchor: { x: number; y: number }
    speedX: number
    speedY: number
    baseScale: number
    /** 변광성 맥동 위상 (0 ~ 2π) — 블롭별 비동기 호흡 */
    breathPhase: number
    /** 변광성 맥동 주기 (초) — 실제 변광성 주기 10⁵~10⁷년을 UX 압축 */
    breathPeriod: number
    /** 초기 회전각 (라디안) */
    baseRotation: number
    /** 각운동량 보존에 의한 회전 속도 (rad/s) */
    rotationSpeed: number
  }> = []

  private static _textureCache: Map<string, PIXI.Texture> = new Map()

  public static clearCache(): void {
    for (const texture of NebulaEffect._textureCache.values()) {
      texture.destroy(true)
    }
    NebulaEffect._textureCache.clear()
  }

  /**
   * [v4] 과학적 성운 텍스처 pre-bake.
   *
   * 주요 변경:
   *   1. 비등방성(Anisotropic) 타원 감쇠: 종횡비 + 회전 적용
   *   2. 2단 도메인 왜곡 + Curl Noise 소용돌이
   *   3. 3종 성운 혼합: emission(발광) + reflection(산란) + dark(흡수)
   *   4. 필라멘트 비율 강화 (55%)
   */
  private static _createNebulaTexture(seed: number, presetIdx: number): PIXI.Texture {
    const cacheKey = `nebula-v4-${seed}-${presetIdx}`
    if (NebulaEffect._textureCache.has(cacheKey)) {
      return NebulaEffect._textureCache.get(cacheKey)!
    }

    const resolution = 512
    const canvas = document.createElement('canvas')
    canvas.width = resolution
    canvas.height = resolution
    const ctx = canvas.getContext('2d')!
    const imageData = ctx.createImageData(resolution, resolution)
    const data = imageData.data

    const preset = GAS_PRESETS[presetIdx % GAS_PRESETS.length]
    const { aspectX, aspectY, rotation, curlStrength, layers: gasLayers } = preset
    const noiseScale = 3.0

    // ── 안개 헤일로(Fog Halo) 사전 계산 상수 ──
    // 첫 번째 방출/반사 레이어 색상을 안개색으로 사용 (일관된 색조 유지)
    const fogColorLayer = gasLayers.find(l => l.nebulaType !== 'dark') || gasLayers[0]
    const fogColor = fogColorLayer.color
    const fogAspectX = aspectX * 2.2   // 가로로 2.2배 넓게 확장
    const fogAspectY = aspectY * 1.3   // 세로는 약간만 확장
    const halfRes = resolution / 2

    // 회전 행렬 (비등방성 타원 감쇠용)
    const cos_r = Math.cos(rotation)
    const sin_r = Math.sin(rotation)

    for (let py = 0; py < resolution; py++) {
      for (let px = 0; px < resolution; px++) {
        // ── 비등방성 타원 감쇠 (Anisotropic Elliptical Vignette) ──
        // 각 blob의 고유 종횡비와 회전각으로 기다란 타원 형태를 만듦
        const dx = (px - halfRes) / halfRes
        const dy = (py - halfRes) / halfRes

        // 회전 후 비등방 스케일 적용
        const rx = (cos_r * dx + sin_r * dy) * (1.0 / aspectX)
        const ry = (-sin_r * dx + cos_r * dy) * (1.0 / aspectY)
        const dist = Math.sqrt(rx * rx + ry * ry)

        // 가우시안 감쇠 (타원형): 감쇠 폭을 넓혀 부드러운 가장자리
        let vignette = Math.exp(-dist * dist * 2.8)
        // Hard fade-out: dist 0.80~0.98 구간에서 0으로 강제 감쇠 (외곽 짤림 방지)
        if (dist > 0.80) vignette *= Math.max(0, 1 - ((dist - 0.80) / 0.18))

        // ── 3종 성운 레이어 Additive 블렌딩 ──
        let totalR = 0, totalG = 0, totalB = 0, totalA = 0
        let darkAccum = 0  // 암흑 성운 누적 마스크

        for (const layer of gasLayers) {
          const nx = (px / resolution) * noiseScale + (seed + layer.seedOffset) * 100
          const ny = (py / resolution) * noiseScale + (seed + layer.seedOffset) * 73

          // nebulaField v4: 2단 도메인 왜곡 + Curl Noise
          let density = nebulaField(nx, ny, layer.warpStrength, curlStrength)
          density *= vignette

          if (layer.nebulaType === 'dark') {
            // ── 암흑 성운: 밝기를 "감산(subtract)"하는 먼지 마스크 ──
            // 밀도가 높은 영역에서 기존 빛을 흡수 → 검은 실루엣/먼지 레인
            if (density > 0.15) {
              const darkStrength = Math.pow((density - 0.15) / 0.85, 0.6) * layer.intensity
              darkAccum += darkStrength * 0.4  // 40% 흡수율
            }
            continue
          }

          if (density < 0.08) continue

          // ── 방출/반사 성운: 가산(additive) 블렌딩 ──
          const strength = density * layer.intensity * 1.4

          // 반사 성운은 더 부드러운 감마 커브 (확산된 산란광 느낌)
          const gamma = layer.nebulaType === 'reflection' ? 0.85 : 0.7
          const alpha = Math.pow(strength, gamma) * 0.75

          totalR += layer.color[0] * strength * 255
          totalG += layer.color[1] * strength * 255
          totalB += layer.color[2] * strength * 255
          totalA = Math.max(totalA, alpha)
        }

        // 암흑 성운 감산 적용: 밝기를 줄이되 완전한 검정은 아닌 자연스러운 흡수
        const darkMask = Math.max(0, 1.0 - darkAccum)
        totalR *= darkMask
        totalG *= darkMask
        totalB *= darkMask

        // ── 안개 헤일로(Fog Halo): 성운 외곽에 좌우로 넓게 퍼지는 희미한 확산광 ──
        // 메인 성운이 사라지는 외곽 영역에 저주파 fBM으로 부드러운 안개 표현
        const fogRx = (cos_r * dx + sin_r * dy) * (1.0 / fogAspectX)
        const fogRy = (-sin_r * dx + cos_r * dy) * (1.0 / fogAspectY)
        const fogDist = Math.sqrt(fogRx * fogRx + fogRy * fogRy)
        let fogVignette = Math.exp(-fogDist * fogDist * 0.8)  // 매우 완만한 가우시안 감쇠
        if (fogDist > 0.95) fogVignette *= Math.max(0, 1 - ((fogDist - 0.95) / 0.05))

        // 안개는 코어 밖(vignette < 0.4)에서만 가시 → 코어 밝기 보존
        const fogMask = Math.max(0, 1 - vignette * 2.5)

        // 저주파 fBM: 3 옥타브 + 낮은 주파수 스케일 → 부드럽고 넓은 안개 질감
        const fogNx = (px / resolution) * noiseScale * 0.4 + (seed + 500) * 100
        const fogNy = (py / resolution) * noiseScale * 0.4 + (seed + 500) * 73
        const fogNoise = fbm(fogNx, fogNy, 3, 0.4)
        const fogDensity = fogNoise * fogVignette * fogMask

        if (fogDensity > 0.02) {
          const fogIntensity = fogDensity * 0.3
          totalR += fogColor[0] * fogIntensity * 255
          totalG += fogColor[1] * fogIntensity * 255
          totalB += fogColor[2] * fogIntensity * 255
          totalA = Math.max(totalA, fogDensity * 0.25)
        }

        const idx = (py * resolution + px) * 4
        data[idx] = Math.min(255, Math.round(totalR))
        data[idx + 1] = Math.min(255, Math.round(totalG))
        data[idx + 2] = Math.min(255, Math.round(totalB))
        data[idx + 3] = Math.round(Math.min(1, totalA * darkMask) * 255)
      }
    }

    ctx.putImageData(imageData, 0, 0)
    // [FIX] PixiJS v8 CanvasSource 사용법 준수하여 텍스처 소멸 방지
    const source = new PIXI.CanvasSource({ resource: canvas })
    const texture = new PIXI.Texture({ source })
    NebulaEffect._textureCache.set(cacheKey, texture)
    return texture
  }

  constructor() {
    super()
    this.filters = []

    // 중앙 2개 + 360° 원형 균등 배치 5개 (한쪽 몰림 방지)
    // 반경: 화면 크기 기준 상대적으로 설정 (뷰포트 중심 기준 분포)
    const R = 2500
    const anchorPositions = [
      { x: 0, y: 0 },                                  // 중앙 고정 (블루)
      { x: Math.cos(0) * R, y: Math.sin(0) * R },             //   0° (→)
      { x: Math.cos(Math.PI * 0.4) * R, y: Math.sin(Math.PI * 0.4) * R },   //  72° (↗)
      { x: Math.cos(Math.PI * 0.8) * R, y: Math.sin(Math.PI * 0.8) * R },   // 144° (↖)
      { x: Math.cos(Math.PI * 1.2) * R, y: Math.sin(Math.PI * 1.2) * R },   // 216° (↙)
      { x: Math.cos(Math.PI * 1.6) * R, y: Math.sin(Math.PI * 1.6) * R },   // 288° (↘)
      { x: -600, y: 450 },                             // 중앙 근처 (레드+다크블루)
    ]

    // 프리셋 배치 순서: 중앙/근거리에 블루 계열, 외곽에 다채로운 방출 성운
    // index: [0]=중앙, [1]=0°(→), [2]=72°(↗), [3]=144°(↖), [4]=216°(↙), [5]=288°(↘)
    //
    // [0] 중앙 → A: 원형 방출(Orion, 블루)
    // [1] →   → E: 타원 반사(Pleiades, 블루)
    // [2] ↗   → C: 대각 타원(Carina, 로즈+블루)
    // [3] ↖   → B: 세로 필라멘트(Eagle, 인디고+핑크)
    // [4] ↙   → F: 불규칙 필라멘트(Tarantula, 로열블루+퓨샤)
    // [5] ↘   → D: 가로 커튼(Veil, 코발트+크림슨)
    const presetOrder = [0, 4, 2, 1, 5, 3, 6]

    // 초기 뷰포트 중심 (첫 렌더 시 화면 중심에 배치)
    const initCx = (typeof window !== 'undefined' ? window.innerWidth : 1920) / 2
    const initCy = (typeof window !== 'undefined' ? window.innerHeight : 1080) / 2

    for (let i = 0; i < 7; i++) {
      const texture = NebulaEffect._createNebulaTexture(i + 1, presetOrder[i])

      const sprite = new PIXI.Sprite(texture)
      sprite.anchor.set(0.5)
      sprite.blendMode = 'screen'

      const sizeMultiplier = 2.4 + Math.random() * 3.1
      sprite.scale.set(sizeMultiplier)
      sprite.alpha = BASE_ALPHA

      const anchor = anchorPositions[i]
      // 초기 배치: 뷰포트 중심 + anchor 오프셋 (update() 호출 전에도 보이도록)
      sprite.x = initCx + anchor.x
      sprite.y = initCy + anchor.y

      this.addChild(sprite)
      this.blobs.push({
        sprite,
        anchor,
        // 궤도 드리프트 속도: 1주기 ≈ 180~520초 (느리고 우아한 표류)
        speedX: (Math.random() - 0.5) * 0.035 + 0.012,
        speedY: (Math.random() - 0.5) * 0.035 + 0.012,
        baseScale: sizeMultiplier,
        // ── 변광성 맥동 파라미터 ──
        // 실제 변광성(세페이드/미라)의 광도 주기를 UX 타임스케일로 압축
        // 각 블롭이 서로 다른 위상·주기로 비동기 호흡 → 생동감
        breathPhase: Math.random() * Math.PI * 2,
        breathPeriod: 8 + Math.random() * 12,  // 8~20초 주기 (체감 가능)
        // ── 각운동량 보존 ──
        // 성운 가스 구름은 중력 수축 시 각운동량을 보존하며 매우 느리게 회전
        baseRotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 0.04,  // ±0.02 rad/s (약 5분에 1회전)
      })
    }
  }

  /**
   * [v4] 뷰포트 중심 기준 배치 + 이동/줌 패럴랙스
   *
   * [BUG FIX] 기존 래핑(modulo) + 페이드 존 로직 완전 제거.
   * 근본 원인: 블롭의 anchor 좌표(0, 2500 등)가 래핑 도메인(4000px) 경계에 걸려
   * 래핑 후 페이드 존(dist>0.7 → alpha→0)에 빠져 성운이 "잠깐 나왔다가 사라지는" 현상 발생.
   *
   * 수정: 성운 블롭을 항상 **뷰포트 중심(화면 중앙)** 기준으로 배치.
   * - NebulaEffect는 pixiApp.stage의 직접 자식 (카메라 변환 무관)
   * - 블롭 위치 = 뷰포트 중심 + anchor 오프셋 + 패럴랙스 + 궤도 드리프트
   * - 래핑/페이드 불필요: 성운 텍스처 자체에 가우시안 비네트가 내장되어 있으므로
   *   가장자리는 자연스럽게 소멸됨
   *
   * @param timeSec - 현재 시간 (초)
   * @param vx - 카메라 뷰포트 x
   * @param vy - 카메라 뷰포트 y
   * @param zoom - 카메라 줌 레벨 (기본 0.1)
   */
  public update(timeSec: number, vx = 0, vy = 0, zoom = 0.1, canvasWidth?: number, canvasHeight?: number) {
    // 뷰포트 중심 (NebulaEffect는 stage 자식이므로 화면 좌표계)
    const cx = (canvasWidth ?? (typeof window !== 'undefined' ? window.innerWidth : 1920)) / 2
    const cy = (canvasHeight ?? (typeof window !== 'undefined' ? window.innerHeight : 1080)) / 2

    // 줌 패럴랙스: 배경별과 동일 공식 (Math.pow(zoom/0.1, z * 7.5))
    const zoomScale = Math.pow(zoom / 0.1, NEBULA_Z * 7.5)

    // ── [NEW] 줌 반응 광채 (Inverse Square Law 근사) ──
    // 실제 천문학: 점광원의 겉보기 밝기 ∝ 1/d²
    // 성운은 면광원이라 표면휘도는 거리 독립이지만,
    // 줌인 시 망원경 집광력 증가(구경 효과)로 미세 광도 상승을 시뮬레이션.
    // zoom 0.03(최원) → 0.7배, zoom 0.5(근접) → 1.3배
    const zoomAlphaFactor = 0.7 + 0.6 * Math.min(1, zoom / 0.5)

    for (let i = 0; i < this.blobs.length; i++) {
      const b = this.blobs[i]

      // ── 궤도 드리프트 (기존 유지) ──
      const orbitX = b.anchor.x + Math.sin(timeSec * b.speedX) * 600
      const orbitY = b.anchor.y + Math.cos(timeSec * b.speedY) * 600

      // 뷰포트 중심 + anchor 오프셋 + 패럴랙스 (래핑 없음)
      b.sprite.x = cx + orbitX - vx * PARALLAX_FACTOR
      b.sprite.y = cy + orbitY - vy * PARALLAX_FACTOR

      // ── [NEW] 1. 변광성 조명 맥동 (Variable Star Illumination) ──
      // 천문학적 근거: 중심 이온화 항성(O/B형)의 UV 광도 변화 →
      // Strömgren sphere 경계 진동 → 성운 형광(Hα) 밝기 맥동.
      // 세페이드 변광성: 주기-광도 관계(Leavitt's Law)
      // UX 압축: 실제 10⁵~10⁷년 주기 → 15~40초로 시간 스케일 압축
      //
      // alpha 맥동: BASE_ALPHA ± 0.12 (약 ±22% 변동) — 체감 가능 수준
      // scale 맥동: ×1.7배 더 긴 주기, ±5% (열팽창-수축은 광도 변화보다 느림)
      const breathAlpha = Math.sin(timeSec / b.breathPeriod * Math.PI * 2 + b.breathPhase) * 0.20
      const breathScale = Math.sin(timeSec / (b.breathPeriod * 1.7) * Math.PI * 2 + b.breathPhase) * 0.10

      // ── 스케일: 줌 패럴랙스 × 호흡 맥동 ──
      b.sprite.scale.set(b.baseScale * zoomScale * (1 + breathScale))

      // ── 알파: 기본 × 호흡 맥동 × 줌 광채 ──
      b.sprite.alpha = (BASE_ALPHA + breathAlpha) * zoomAlphaFactor

      // ── [NEW] 2. 각운동량 보존 (Angular Momentum Conservation) ──
      // 천문학적 근거: 성운 가스 구름은 중력 수축 과정에서
      // 각운동량을 보존하며 매우 느리게 회전 (케플러 법칙).
      // 실제 회전 속도 ~1 km/s, 반경 ~수 pc → 주기 ~10⁶년
      // UX 압축: ±0.008 rad/s (약 13분에 1회전)
      b.sprite.rotation = b.baseRotation + timeSec * b.rotationSpeed
    }
  }
}

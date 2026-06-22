import * as PIXI from 'pixi.js'
import { gsap } from 'gsap'
import type { PixelData } from '@/stores/galaxyStore'
import { DEFAULT_MOOD_ID } from '@/stores/galaxyStore'
import { LODLevel, LOD_CONFIG } from '@/shared/lib/pixi/lod'
import { SUPERNOVA_TIERS } from '@/shared/constants/supernova'
import { getHexPoints } from '@/shared/lib/pixi/geometry'
import { useUserStore } from '@/entities/user/model/useUserStore'
import { getMoodColors } from '@/shared/constants/moods'
import { PixelSkinSpine } from './PixelSkinSpine'

const DEFAULT_AVATAR = '/avatars/avatar_01.svg'

// [OPT] getHexPoints(50) 결과 캐싱 — 4곳에서 호출되는 동일 계산 1회로 축소
const HEX_POINTS_50 = getHexPoints(50)

export const NAMEPLATE_TEXT_STYLE = {
  fill: '#FFD700', // Gold (string format for better mobile compatibility)
  fontSize: 48,
  fontWeight: '900' as const,
  fontFamily: "'Outfit', 'Pretendard', sans-serif",
  stroke: {
    color: '#000000',
    width: 8
  },
  dropShadow: {
    color: '#000000',
    blur: 4,
    distance: 2,
    alpha: 0.8
  }
}

export class PixelSprite {
  container: PIXI.Container
  innerContainer: PIXI.Container
  avatarSprite: PIXI.Sprite
  avatarMask: PIXI.Graphics | null = null
  nicknameText: PIXI.Text | null = null
  personaBadgeBg: PIXI.Graphics | null = null
  personaBadgeText: PIXI.Text | null = null

  nicknameContainer: PIXI.Container | null = null // [NEW] 별칭 컨테이너
  auraRingsContainer: PIXI.Container | null = null
  satellitesContainer: PIXI.Container | null = null
  ownerMarker: PIXI.Container | null = null
  private glowGraphics: PIXI.Graphics
  private starGlowSprite: PIXI.Sprite  // [COSMIC] 방사형 후광 스프라이트

  public currentData: PixelData | null = null

  private currentLod: LODLevel | 0 = 0

  /**
   * [업계 표준 - 방어적 상태 캡슐화]
   * 현재 스프라이트의 LOD 상태를 안전하게 조회합니다.
   * 객체 풀링(updateData) 교체 시점 등 currentLod가 과도기 상태(0)일 때는
   * 렌더러 크래시 방지를 위해 안전한 기본 사양(LODLevel 4)을 보장합니다.
   */
  private get activeLod(): LODLevel {
    return (this.currentLod === 0 ? 4 : this.currentLod) as LODLevel
  }

  private hoverIntensity: number = 0
  private targetHoverIntensity: number = 0
  private driftTime: number = 0
  private timeOffset: number = 0
  private isAi: boolean = false
  public isAiInteracting: boolean = false
  private lastFiltering: { isMatch: boolean; isFiltering: boolean } | null = null

  // [PERF v2] LOD 전환 Ticker 보간 — GSAP 인스턴스 대량 생성/소멸 제거
  private _targetAvatarAlpha = 0
  private _targetGlowAlpha = 0.85
  private _targetStarGlowAlpha = 0
  private _targetNicknameAlpha = 0
  private _cachedPixelScale = 0.333  // LOD 변경 시만 갱신

  // [SKIN DEMO] 프리미엄 꾸미기 아이템 데모
  private characterSkin: PixelSkinSpine | null = null;
  private holoSweep: PIXI.Graphics | null = null;

  private static _rainbowTexture: PIXI.Texture | null = null
  private static _rainbowMatrix: PIXI.Matrix | null = null
  private static _starGlowTexture: PIXI.Texture | null = null  // [COSMIC] 공유 글로우 텍스처
  private static _avatarCache: Map<string, PIXI.Texture> = new Map()
  private static _loadingMap: Map<string, Promise<PIXI.Texture>> = new Map()

  /**
   * [COSMIC] 별처럼 빛나는 방사형 글로우 텍스처를 생성하고 캐싱합니다.
   * 모든 PixelSprite 인스턴스가 하나의 256x256 텍스처를 공유하여
   * GPU 메모리 사용량을 최소화합니다.
   */
  private static _ensureStarGlowTexture(): PIXI.Texture {
    if (PixelSprite._starGlowTexture) return PixelSprite._starGlowTexture
    const size = 256
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')!
    const gradient = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2)
    // 중심부 밝고 → 가장자리로 부드럽게 소멸하는 별빛 프로파일
    gradient.addColorStop(0, 'rgba(255,255,255,1.0)')
    gradient.addColorStop(0.05, 'rgba(255,255,255,0.85)')
    gradient.addColorStop(0.12, 'rgba(255,255,255,0.4)')
    gradient.addColorStop(0.25, 'rgba(255,255,255,0.12)')
    gradient.addColorStop(0.4, 'rgba(255,255,255,0.03)')
    gradient.addColorStop(0.5, 'rgba(255,255,255,0.0)')
    gradient.addColorStop(1.0, 'rgba(255,255,255,0.0)')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, size, size)
    
    // [FIX] PixiJS v8 CanvasSource 사용법 준수
    const source = new PIXI.CanvasSource({ resource: canvas })
    PixelSprite._starGlowTexture = new PIXI.Texture({ source })
    return PixelSprite._starGlowTexture
  }

  constructor(data?: PixelData) {
    this.container = new PIXI.Container()
    this.container.eventMode = 'none'
    this.container.hitArea = new PIXI.Circle(0, 0, 100)

    this.container.on('pointerover', () => {
      this.container.zIndex = 9999
    })
    this.container.on('pointerout', () => {
      this.container.zIndex = 0
    })

    this.innerContainer = new PIXI.Container()
    this.container.addChild(this.innerContainer)

    // [COSMIC] 1. 방사형 글로우 스프라이트 (가장 아래 레이어 — 별의 후광)
    this.starGlowSprite = new PIXI.Sprite(PixelSprite._ensureStarGlowTexture())
    this.starGlowSprite.anchor.set(0.5)
    this.innerContainer.addChild(this.starGlowSprite)

    // [COSMIC] 2. 코어 그래픽스 (글로우 위에 위치 — 아바타 배경)
    this.glowGraphics = new PIXI.Graphics()
    this.innerContainer.addChild(this.glowGraphics)

    this.avatarSprite = new PIXI.Sprite(PIXI.Texture.EMPTY)
    this.avatarSprite.anchor.set(0.5)

    // [COSMIC] 아바타 마스크: 육각형 유지하되 크기를 축소하여 '코어' 느낌
    this.avatarMask = new PIXI.Graphics()
    this.avatarMask.poly(HEX_POINTS_50).fill(0xffffff)
    this.innerContainer.addChild(this.avatarMask)
    this.avatarSprite.mask = this.avatarMask

    this.innerContainer.addChild(this.avatarSprite)

    this.timeOffset = Math.random() * 100
    this.driftTime = Math.random() * 100

    // data가 있으면 즉시 초기화 (기존 호환), 없으면 숨김 상태 (Lazy Pool)
    if (data) {
      this.currentData = data
      this._applyAuraColor(data.glowColorPrimary, data.glowColorSecondary)
      this.innerContainer.scale.set(data.zDepth ?? 1.0)
      this.setPosition(data.coordX, data.coordY)
      this.isAi = !!data.personaCode
    } else {
      this.container.visible = false
      this.container.renderable = false
    }
  }

  // [OPT] 마지막으로 적용된 아우라 키를 저장하여 불필요한 재그리기 방지
  private _lastAuraKey: string = ''
  // [09-플랜][QA#5] 마지막으로 그린 뱃지 키 캐싱 — 별점/뱃지 값 변경 시만 redraw
  private _lastBadgeKey: string = ''

  private _applyAuraColor(primary: string, secondary: string): void {
    // [OPT] 색상+ES+mood가 동일하면 재그리기 스킵
    const es = this.currentData?.evolutionScore || 0
    const moodId = this.currentData?.moodId || DEFAULT_MOOD_ID
    const auraKey = `${primary}|${secondary}|${es}|${moodId}|${this.currentData?.supernovaTier || ''}`
    if (this._lastAuraKey === auraKey) return
    this._lastAuraKey = auraKey

    const primaryColor = parseInt(primary.replace('#', ''), 16)
    const secondaryColor = parseInt(secondary.replace('#', ''), 16)

    this.glowGraphics.clear()

    const glowSize = 160 + Math.min(es * 8, 160)    // ES 연속: 160~320px
    const glowAlpha = 0.5 + Math.min(es * 0.025, 0.5) // ES 연속: α 0.5~1.0

    // [EVOLUTION] 글로우 = 생각상태(mood) 색상 tint
    const moodColors = getMoodColors(moodId)
    const moodColor = parseInt(moodColors.primary.replace('#', ''), 16)
    this.starGlowSprite.tint = moodColor
    
    // [FIX] Canvas 텍스처 생성 직후 width 프로퍼티가 0일 때 접근 시
    // 명시적 원본 크기(256)를 기준으로 scale을 직접 설정합니다.
    // [FIX] 코어 육각형(50) 밖으로 부드러운 후광이 자연스럽게 배어 나오도록 1.4배 스케일 업 (눈부심 방지)
    const glowScale = Math.max((glowSize * 1.4) / 256, 3.0); // [FIX-AURA] 최소 3.0 보장 → 모든 픽셀에 성운 안개 기본 표시
    this.starGlowSprite.scale.set(glowScale)
    this.starGlowSprite.alpha = 1.0 // [FIX-AURA] 성운 항상 최대 밝기

    // [EVOLUTION] 이중 글로우 (ES ≥ 5): 보조색 깊이 추가
    if (es >= 5) {
      const doubleGlowAlpha = Math.min((es - 5) * 0.01, 0.08)
      this.glowGraphics.circle(0, 0, (glowSize / 2) * 0.9).fill({
        color: secondaryColor,
        alpha: doubleGlowAlpha
      })
    }

    // [SUPERNOVA] 초신성 유저: 핵폭발급 글로우 부스트 (유료 시스템, ES와 별도)
    if (this.currentData?.supernovaTier && this.currentData?.supernovaExpiresAt) {
      const expiresAt = new Date(this.currentData.supernovaExpiresAt)
      if (expiresAt > new Date()) {
        const tier = SUPERNOVA_TIERS.find(t => t.id === this.currentData?.supernovaTier)
        if (tier) {
          const boost = tier.activityBoost
          const boostScale = (glowSize * boost) / 256;
          this.starGlowSprite.scale.set(boostScale)
          this.starGlowSprite.alpha = 1.0
        }
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // [EVOLUTION] 코어 육각형 = 성격(persona) 색상 (고정 정체성)
    // ═══════════════════════════════════════════════════════════════
    this.glowGraphics.poly(HEX_POINTS_50).fill({ color: primaryColor, alpha: 1.0 })

    this._lazyLoadAvatar()
  }

  /**
   * [OPT] 아바타 지연 로딩 (Lazy Loading)
   * 현재 픽셀이 줌인 레벨(showAvatarDetail)이면서 뷰포트 내에 실시간 렌더링 중(visible && renderable)일 때에만
   * 비동기로 아바타 이미지를 다운로드하여 CPU/GPU 메모리 및 네트워크 오버헤드를 원천적으로 방지합니다.
   */
  private _lazyLoadAvatar(): void {
    const avatarUrl = this.currentData?.avatarUrl
    if (!avatarUrl) {
      if (this.avatarSprite && !this.avatarSprite.destroyed) {
        this.avatarSprite.texture = PIXI.Texture.EMPTY
        this.avatarSprite.visible = false
      }
      return
    }

    // 지연 로딩 검사:
    // 1. 현재 LOD가 아바타의 상세 이미지를 요구하는 줌인 단계여야 함
    // 2. 현재 스프라이트가 컬링되지 않고 화면 내 활성(visible/renderable) 상태여야 함
    const config = LOD_CONFIG[this.activeLod]
    const isHighLOD = config ? config.showAvatarDetail : false
    const isActiveInViewport = this.container.visible === true && this.container.renderable === true

    if (!isHighLOD || !isActiveInViewport) {
      // 조건을 만족하지 못하는 경우 리소스를 가져오지 않고 비워둠
      this.avatarSprite.texture = PIXI.Texture.EMPTY
      this.avatarSprite.visible = false
      return
    }

    // 캐시 존재 시 즉시 로드
    if (PixelSprite._avatarCache.has(avatarUrl)) {
      const texture = PixelSprite._avatarCache.get(avatarUrl)!
      this.avatarSprite.texture = texture

      try {
        if (texture && typeof texture.width === 'number' && texture.width > 0) {
          const scale = 100 / Math.min(texture.width, texture.height)
          this.avatarSprite.scale.set(scale)
        } else {
          this.avatarSprite.scale.set(1)
        }
      } catch (e) {
        this.avatarSprite.scale.set(1)
      }

      const hasSpineSkin = !!this.currentData?.skinCode && this.currentData.skinCode !== 'none'
      this.avatarSprite.visible = !hasSpineSkin
      if (this.avatarSprite.alpha === 0) this.avatarSprite.alpha = 1
      this.innerContainer.addChild(this.avatarSprite)
    } else {
      // 로딩 중이 아니라면 로드 요청 큐에 삽입
      if (!PixelSprite._avatarCache.has(avatarUrl) && !PixelSprite._loadingMap.has(avatarUrl)) {
        // @ts-ignore - Pixi 8 internal settings for silencing cache warnings
        if (PIXI.Assets.settings) PIXI.Assets.settings.unresolvedAssetLogWarnings = false

        const loadPromise = PIXI.Assets.load({ src: avatarUrl, parser: 'loadTextures' })
          .then(texture => {
            PixelSprite._avatarCache.set(avatarUrl, texture)
            PixelSprite._loadingMap.delete(avatarUrl)
            return texture
          })
          .catch(() => {
            PixelSprite._avatarCache.set(avatarUrl, PIXI.Texture.EMPTY)
            PixelSprite._loadingMap.delete(avatarUrl)
            return PIXI.Texture.EMPTY
          })

        PixelSprite._loadingMap.set(avatarUrl, loadPromise)
      }

      this.avatarSprite.texture = PIXI.Texture.EMPTY
      this.avatarSprite.visible = false
      this.avatarSprite.alpha = 0

      // 로딩 완료 콜백 바인딩
      PixelSprite._loadingMap.get(avatarUrl)?.then(texture => {
        // 생존 여부 및 URL 일치 여부, 뷰포트 내 잔존 여부 최종 확인 후 바인딩
        if (this.avatarSprite && !this.avatarSprite.destroyed &&
          this.currentData?.avatarUrl === avatarUrl &&
          this.container.visible === true &&
          this.container.renderable === true) {

          this.avatarSprite.texture = texture

          try {
            if (texture && typeof texture.width === 'number' && texture.width > 0) {
              const scale = 100 / Math.min(texture.width, texture.height)
              this.avatarSprite.scale.set(scale)
            } else {
              this.avatarSprite.scale.set(1)
            }
          } catch (e) {
            this.avatarSprite.scale.set(1)
          }

          const hasSpineSkin = !!this.currentData?.skinCode && this.currentData.skinCode !== 'none'
          const isStillHighLOD = LOD_CONFIG[this.activeLod]?.showAvatarDetail ?? false
          
          this.avatarSprite.visible = isStillHighLOD && !hasSpineSkin

          if (this.avatarSprite.visible) {
            gsap.to(this.avatarSprite, { alpha: 1, duration: 0.5, ease: 'sine.out' })
          } else {
            this.avatarSprite.alpha = 0
          }

          this.innerContainer.addChild(this.avatarSprite)
        }
      })
    }
  }

  private _ensureHighLODComponents(): void {
    if (!this.nicknameContainer) {
      this.nicknameContainer = new PIXI.Container()
      this.innerContainer.addChild(this.nicknameContainer)

      const displayName = this.currentData?.displayName || ''
      const rank = this.currentData?.rank
      const textVal = rank ? `[#${rank}] ${displayName}` : displayName

      this.nicknameText = new PIXI.Text({
        text: textVal,
        style: {
          fill: 0xf1f5f9,
          fontSize: 14, 
          fontFamily: "'Outfit', 'Pretendard', sans-serif", // [UX FIX] 프로젝트 메인 폰트인 Outfit 적용 후 Pretendard 폴백
          padding: 4, 
        },
        resolution: Math.max(3, window.devicePixelRatio || 2), 
        roundPixels: true, 
      })
      this.nicknameText.anchor.set(0.5)
      this.nicknameText.y = 0
      this.nicknameContainer.addChild(this.nicknameText)

      // Persona Badge (e.g. ENFP)
      this.personaBadgeBg = new PIXI.Graphics()
      this.nicknameContainer.addChild(this.personaBadgeBg)

      this.personaBadgeText = new PIXI.Text({
        text: this.currentData?.personaCode || '',
        style: {
          fill: 0xffffff,
          fontSize: 10,
          fontWeight: 'bold',
          fontFamily: "'Outfit', 'Pretendard', sans-serif",
        },
        resolution: Math.max(3, window.devicePixelRatio || 2),
        roundPixels: true,
      })
      this.personaBadgeText.anchor.set(0.5)
      this.nicknameContainer.addChild(this.personaBadgeText)

      this._updatePersonaBadge()
    }
  }

  private _updatePersonaBadge(): void {
    if (this.personaBadgeText && this.personaBadgeBg && this.currentData) {
      // [09-플랜] 1. 매장 픽셀: 별점 베이지안 평활화값 (★ 4.8) + 활동 상태(glowColorPrimary) 배경
      if (this.currentData.isStore && this.currentData.storeRating) {
        const rating = this.currentData.storeRating ?? 4.0
        const badgeKey = `store|${rating.toFixed(1)}|${this.currentData.glowColorPrimary}`
        if (this._lastBadgeKey === badgeKey) return  // [QA#5] 변화 없으면 Redraw 스킵
        this._lastBadgeKey = badgeKey

        this.personaBadgeText.text = `★ ${rating.toFixed(1)}`
        this.personaBadgeText.visible = true
        this.personaBadgeBg.visible = true

        const textWidth = this.personaBadgeText.width || 30
        const textHeight = this.personaBadgeText.height || 14
        const paddingX = 6
        const paddingY = 2
        const primaryColor = parseInt((this.currentData.glowColorPrimary || '#4f46e5').replace('#', ''), 16)

        this.personaBadgeBg.clear()
        this.personaBadgeBg.roundRect(
          -(textWidth / 2) - paddingX,
          -(textHeight / 2) - paddingY,
          textWidth + paddingX * 2,
          textHeight + paddingY * 2,
          6
        ).fill({ color: primaryColor, alpha: 0.95 })

        this.personaBadgeBg.y = 26
        this.personaBadgeText.y = 26
      }
      // [09-플랜] 2. 일반 유저: 기존 MBTI 므주인 뱃지
      else {
        const pCode = this.currentData.personaCode
        const badgeKey = `persona|${pCode ?? ''}|${this.currentData.glowColorPrimary}`
        if (this._lastBadgeKey === badgeKey) return  // [QA#5] 변화 없으면 Redraw 스킵
        this._lastBadgeKey = badgeKey

        if (pCode && pCode !== 'STARTER') {
          this.personaBadgeText.text = pCode
          this.personaBadgeText.visible = true
          this.personaBadgeBg.visible = true

          // Draw background pill
          // Use a tiny delay to ensure Pixi measures the text bounds correctly
          const textWidth = this.personaBadgeText.width || 30
          const textHeight = this.personaBadgeText.height || 14
          const paddingX = 6
          const paddingY = 2
          const primaryColor = parseInt((this.currentData.glowColorPrimary || '#4f46e5').replace('#', ''), 16)
          
          this.personaBadgeBg.clear()
          this.personaBadgeBg.roundRect(
            -(textWidth / 2) - paddingX,
            -(textHeight / 2) - paddingY,
            textWidth + paddingX * 2,
            textHeight + paddingY * 2,
            6
          ).fill({ color: primaryColor, alpha: 0.8 }) // Match pixel color

          // Position it below the nickname
          this.personaBadgeBg.y = 26
          this.personaBadgeText.y = 26
        } else {
          this.personaBadgeText.visible = false
          this.personaBadgeBg.visible = false
        }
      }
    }
  }



  /**
   * 닉네임이 코어 영역(38px)을 벗어나지 않도록 스케일을 자동 조절합니다.
   */

  private _ensurePingComponents(): void {
    if (!this.satellitesContainer) {
      this.satellitesContainer = new PIXI.Container()
      this.innerContainer.addChild(this.satellitesContainer) // Moved to top
    }

    if (!this.auraRingsContainer) {
      this.auraRingsContainer = new PIXI.Container()
      this.innerContainer.addChildAt(this.auraRingsContainer, 0) // Keep at bottom
    }

    this._updatePingVisuals()
    this._updateOwnerVisuals()
  }

  private _ensureOwnerMarker(): void {
    if (!this.ownerMarker) {
      this.ownerMarker = new PIXI.Container()
      this.ownerMarker.label = 'ownerMarkerContainer'

      try {
        const label = new PIXI.Text({
          text: this.currentData?.displayName || '', // Owner nickname
          style: NAMEPLATE_TEXT_STYLE,
          resolution: 2
        })
        label.anchor.set(0.5, 1.0)
        label.label = 'ownerText'

        this.ownerMarker.addChild(label)
      } catch (e) {
        console.warn('[PixelSprite] Failed to create owner text marker:', e)
      }
      this.innerContainer.addChild(this.ownerMarker) // Attach to innerContainer for movement sync
    } else {
      const label = this.ownerMarker.children.find(c => c.label === 'ownerText') as PIXI.Text
      if (label) {
        label.text = this.currentData?.displayName || ''
      }
    }
  }

  private _updateOwnerVisuals(): void {
    // [FIX] require() 제거 → 모듈 최상위 import 사용, pixel_id → id(UUID) 수정
    const currentUser = useUserStore.getState().user?.id || null
    const isOwner = this.currentData?.pixelId === currentUser

    if (isOwner) {
      this._ensureOwnerMarker()
      if (this.ownerMarker) {
        // [UX] 기본 닉네임 표지판이 보이지 않는 축소(Zoom Out) 상태에서 내 위치를 표시
        const config = LOD_CONFIG[this.activeLod]
        this.ownerMarker.visible = config ? !config.showNickname : true
      }
    } else {
      if (this.ownerMarker) this.ownerMarker.visible = false
    }
  }

  private _updatePingVisuals(): void {
    if (this.currentLod !== 1) return;
    const { pingCount = 0, pingTypes = [] } = this.currentData || {}

    // 1. 공전 궤도 위성 (1+ Pings) - 태동 단계
    if (this.satellitesContainer) {
      this.satellitesContainer.removeChildren().forEach(child => child.destroy())

      if (pingCount >= 1 && pingTypes.length > 0) {
        const radius = 65 // [COSMIC] 코어(50) 바로 바깥 궤도
        // [COSMIC] 궤도 원 테두리 완전 제거 — 페트리접시 느낌의 원흉이었음

        // [EVOLUTION Phase 1] Binary Star 시스템: 위성을 최대 3개로 제한
        // 핑 유형 전체를 다 그리면 시각적 노이즈가 폭증하므로,
        // 상위 빈도 3개 타입만 추출하여 의미 있는 동반성(Companion Star)으로 표현합니다.
        const MAX_SATELLITES = 3
        const limitedTypes = pingTypes.slice(0, MAX_SATELLITES)
        const angleStep = (Math.PI * 2) / limitedTypes.length

        limitedTypes.forEach((type, index) => {
          let color = 0xffffff
          // 1. 공감/위로 (Comfort/Empathy)
          if (type === 'hug') color = 0x4FC3F7 // Sky Blue
          else if (type === 'tear') color = 0x2196F3 // Blue
          else if (type === 'protect') color = 0x3F51B5 // Indigo
          else if (type === 'rest') color = 0x4CAF50 // Green
          // 2. 응원/에너지 (Support/Energy)
          else if (type === 'heart') color = 0xE91E63 // Rose
          else if (type === 'cheer') color = 0xFF9800 // Orange
          else if (type === 'applaud') color = 0xFFEB3B // Yellow
          else if (type === 'blessing') color = 0xFFD54F // Amber
          // 3. 연결/관심 (Connection/Interest)
          else if (type === 'starlight') color = 0x9C27B0 // Purple
          else if (type === 'magic') color = 0x7E57C2 // Violet
          else if (type === 'connect') color = 0x00BCD4 // Cyan
          else if (type === 'care') color = 0x607D8B // Slate

          const angle = index * angleStep
          const satellite = new PIXI.Graphics()

          // [EVOLUTION Phase 1] 위성 크기 정밀 축소: 더 섬세한 우주 먼지 느낌
          satellite.circle(0, 0, 2).fill({ color, alpha: 1.0 })     // 코어: 매우 작고 선명 (4 → 2)
          satellite.circle(0, 0, 5).fill({ color, alpha: 0.22 })    // 글로우: 가볍게 (10 → 5)

          satellite.x = Math.cos(angle) * radius
          satellite.y = Math.sin(angle) * radius

          this.satellitesContainer!.addChild(satellite)
        })
        this.satellitesContainer.visible = true
      } else {
        this.satellitesContainer.visible = false
      }
    }

    // 2. [EVOLUTION] 아우라 링 — 지수적 임계값 스케일링 (인플레이션 제어)
    if (this.auraRingsContainer) {
      this.auraRingsContainer.removeChildren().forEach(child => child.destroy())

      const es = this.currentData?.evolutionScore || 0
      // [P-03 OPTIMIZATION] 등비급수 임계값 (×5.6배): 최대 등급 ~90일 (일 50점 기준)
      let ringCount = 0
      if (es >= 4500) ringCount = 4       // ~90일
      else if (es >= 800) ringCount = 3   // ~16일
      else if (es >= 150) ringCount = 2   // ~3일
      else if (es >= 25) ringCount = 1    // ~12시간

      if (ringCount > 0) {
        const primaryColor = parseInt(this.currentData?.glowColorPrimary.replace('#', '') || 'ffffff', 16)
        const secondaryColor = parseInt(this.currentData?.glowColorSecondary.replace('#', '') || 'ffffff', 16)

        for (let i = 0; i < ringCount; i++) {
          const ring = new PIXI.Graphics()
          const radius = 90 + (i * 12)
          const baseAlpha = Math.max(0.1, 0.6 * Math.pow(0.5, i))
          const color = i % 2 === 0 ? primaryColor : secondaryColor
          // [EVOLUTION] 아우라 링 실제 렌더링: 원형 글로우
          ring.circle(0, 0, radius).fill({ color, alpha: baseAlpha * 0.15 })
          ring.scale.set(1.0 - (i * 0.01))
          this.auraRingsContainer.addChild(ring)
        }

        this.auraRingsContainer.visible = true
      } else {
        this.auraRingsContainer.visible = false
      }
    }
  }

  private _initDemoSkins(): void {
    if (this.characterSkin) return;
    // skinCode를 전달하여 DB 데이터 기반 캐릭터 선택
    const seed = this.currentData?.pixelId || 'default';
    const skinCode = this.currentData?.skinCode;
    this.characterSkin = new PixelSkinSpine(this.innerContainer, seed, skinCode);
  }

  /**
   * 객체 풀링(Object Pooling)을 위한 데이터 갱신 메서드
   * 새로운 PixelData를 주입받아 시각적 상태와 위치를 업데이트합니다.
   */
  updateData(data: PixelData): void {
    // [09-플랜] 객체 풀링 재사용 시 캐시 가드 상태 리셋
    this._lastAuraKey = ''
    this._lastBadgeKey = ''

    // [FIX] 객체 풀링 재사용 시 찰나의 이전 닉네임/아바타 잔상 노출을 원천 차단하기 위해
    // 가시성 플래그와 알파값들을 동기식으로 즉각 초기 리셋합니다.
    this.avatarSprite.visible = false
    this.avatarSprite.alpha = 0
    if (this.nicknameContainer) {
      this.nicknameContainer.visible = false
      this.nicknameContainer.alpha = 0
    }
    if (this.satellitesContainer) {
      this.satellitesContainer.visible = false
      this.satellitesContainer.alpha = 0
    }
    if (this.auraRingsContainer) {
      this.auraRingsContainer.visible = false
      this.auraRingsContainer.alpha = 0
    }
    if (this.ownerMarker) {
      this.ownerMarker.visible = false
    }

    this.currentData = data
    this.currentLod = 0
    this.container.alpha = 1.0
    this.lastFiltering = null
    this.glowGraphics.scale.set(1.0)

    // [FIX] 풀링 교체 시 기존 Spine 인스턴스 정리 (메모리 누수 방지)
    if (this.characterSkin) {
      this.characterSkin.destroy()
      this.characterSkin = null
    }

    this.innerContainer.scale.set(data.zDepth ?? 1.0)

    this.isAi = !!data.personaCode // [NEW] 데이터 갱신 시 AI 여부 재확인
    if (!this.isAi) {
      // AI가 아닌 일반 유저로 교체된 경우 위치/회전값 초기화
      this.innerContainer.position.set(0, 0)
      this.innerContainer.rotation = 0
    }

    this._applyAuraColor(data.glowColorPrimary, data.glowColorSecondary)

    // [OPT] avatarMask는 항상 동일한 50px 육각형 → 최초 생성 후 재그리기 불필요
    // (생성자에서 이미 그려짐, 모양 변경 없음)

    // Refresh High-LOD components if they exist
    if (this.nicknameText) {
      const displayName = data.displayName || ''
      this.nicknameText.text = data.rank ? `[#${data.rank}] ${displayName}` : displayName
    }
    
    this._updatePersonaBadge()



    if (this.auraRingsContainer || this.satellitesContainer) {
      this._updatePingVisuals()
    }
    this._updateOwnerVisuals()

    this.setPosition(data.coordX, data.coordY)

    // [LAZY POOL] 생성자에서 숨김 상태로 시작한 경우 활성화
    this.container.visible = true
    this.container.renderable = true

    this._lazyLoadAvatar() // [NEW] 풀에서 활성화되어 화면 가시성이 켜지는 시점에 지연 로딩 검사 및 트리거
  }

  applyLOD(lodLevel: LODLevel): void {
    if (this.currentLod === lodLevel) return
    const prevLod = this.currentLod
    this.currentLod = lodLevel as LODLevel
    const config = LOD_CONFIG[lodLevel]

    // [PERF v2] pixelScale 캐싱 — update() 루프에서 매 프레임 LOD_CONFIG 접근 제거
    this._cachedPixelScale = config.pixelScale

    // [PERF v2] GSAP killTweensOf 완전 제거 — Ticker 보간으로 대체
    // 기존: gsap.killTweensOf([7개 타깃]) + gsap.to() 최대 8개 생성
    // 신규: 목표값만 설정, update()에서 매 프레임 보간

    // [CLEAN ROOM] 첫 LOD 적용(prevLod === 0): 즉시 설정 (Atomic Render 시 800개 동시)
    const immediate = prevLod === 0

    this.container.scale.set(config.pixelScale)

    if (config.showAvatarDetail) {
      this._ensureHighLODComponents()
      this._lazyLoadAvatar()

      const hasSpineSkin = !!this.currentData?.skinCode && this.currentData.skinCode !== 'none'
      
      if (!hasSpineSkin) {
        this.avatarSprite.visible = true
        this._targetAvatarAlpha = 1
        if (immediate) this.avatarSprite.alpha = 1
      } else {
        this.avatarSprite.visible = false
        this._targetAvatarAlpha = 0
        this.avatarSprite.alpha = 0
      }

      if (config.showNickname) {
        this._ensurePingComponents()
        if (this.nicknameContainer) {
          this.nicknameContainer.visible = true
          this._targetNicknameAlpha = 1
          if (immediate) this.nicknameContainer.alpha = 1
        }
        if (this.satellitesContainer) {
          this.satellitesContainer.visible = true
          if (immediate) this.satellitesContainer.alpha = 1
        }
        if (this.auraRingsContainer) {
          this.auraRingsContainer.visible = true
          if (immediate) this.auraRingsContainer.alpha = 1
        }
      } else {
        this._targetNicknameAlpha = 0
        if (immediate) {
          if (this.nicknameContainer) { this.nicknameContainer.alpha = 0; this.nicknameContainer.visible = false }
          if (this.auraRingsContainer) { this.auraRingsContainer.alpha = 0; this.auraRingsContainer.visible = false }
          if (this.satellitesContainer) { this.satellitesContainer.alpha = 0; this.satellitesContainer.visible = false }
        }
        // non-immediate: update() 보간이 alpha를 0으로 내린 후 visible=false 설정
      }

      this._targetGlowAlpha = 0.85
      this._targetStarGlowAlpha = 0.9
      if (immediate) {
        this.glowGraphics.alpha = 0.85
        this.starGlowSprite.alpha = 0.9
      }
      this.glowGraphics.visible = true
      this.starGlowSprite.visible = true
    } else {
      // LOD 3-4: 아바타/닉네임 숨김
      this._targetAvatarAlpha = 0
      this._targetNicknameAlpha = 0
      this._targetGlowAlpha = 0.85
      // [PERF FIX] LOD 3~4(줌아웃): starGlowSprite 비활성화
      this._targetStarGlowAlpha = 0

      if (immediate) {
        this.avatarSprite.alpha = 0
        this.avatarSprite.visible = false
        if (this.nicknameContainer) { this.nicknameContainer.alpha = 0; this.nicknameContainer.visible = false }
        if (this.auraRingsContainer) { this.auraRingsContainer.alpha = 0; this.auraRingsContainer.visible = false }
        if (this.satellitesContainer) { this.satellitesContainer.alpha = 0; this.satellitesContainer.visible = false }
        this.glowGraphics.alpha = 0.85
        this.starGlowSprite.visible = false
        this.starGlowSprite.alpha = 0
      }
      this.glowGraphics.visible = true
    }

    this.container.eventMode = config.showAvatarDetail ? 'static' : 'none'
    this.container.cursor = config.showAvatarDetail ? 'pointer' : 'default'

    if (!config.showAvatarDetail) {
      const baseZ = this.currentData?.zDepth ?? 1.0
      if (immediate) {
        this.innerContainer.scale.set(baseZ)
      } else {
        gsap.to(this.innerContainer.scale, { x: baseZ, y: baseZ, duration: 0.2, ease: 'power2.out' })
      }
    }

    // [FIX] LOD 변경 시마다 ownerMarker의 가시성을 정확히 갱신합니다.
    this._updateOwnerVisuals()
  }


  // ============================================================================
  // UPDATE LOOP
  // ============================================================================
  update(deltaFactor: number, zoom: number): void {
    if (!this.currentData) return

    // deltaFactor is delta seconds
    this.timeOffset += deltaFactor * 1.5 // Speed of breathing

    // [PERF v2] 캐싱된 pixelScale 사용 — LOD_CONFIG 객체 접근 제거
    this.container.scale.set(this._cachedPixelScale);

    // ═══════════════════════════════════════════════════════════════
    // [PERF v2] LOD 전환 Ticker 보간 — GSAP 인스턴스 대량 생성/소멸 제거
    // 기존 hoverIntensity 보간과 동일한 검증된 패턴
    // ═══════════════════════════════════════════════════════════════
    const lerpSpeed = Math.min(1, deltaFactor * 8)  // ~0.125초 동등
    const SNAP_THRESHOLD = 0.01

    // 아바타 알파 보간
    if (Math.abs(this.avatarSprite.alpha - this._targetAvatarAlpha) > SNAP_THRESHOLD) {
      this.avatarSprite.alpha += (this._targetAvatarAlpha - this.avatarSprite.alpha) * lerpSpeed
    } else if (this.avatarSprite.alpha !== this._targetAvatarAlpha) {
      this.avatarSprite.alpha = this._targetAvatarAlpha
      if (this._targetAvatarAlpha === 0) this.avatarSprite.visible = false
    }

    // 글로우 알파 보간
    if (Math.abs(this.glowGraphics.alpha - this._targetGlowAlpha) > SNAP_THRESHOLD) {
      this.glowGraphics.alpha += (this._targetGlowAlpha - this.glowGraphics.alpha) * lerpSpeed
    } else {
      this.glowGraphics.alpha = this._targetGlowAlpha
    }

    // 스타 글로우 알파 보간
    if (Math.abs(this.starGlowSprite.alpha - this._targetStarGlowAlpha) > SNAP_THRESHOLD) {
      this.starGlowSprite.alpha += (this._targetStarGlowAlpha - this.starGlowSprite.alpha) * lerpSpeed
    } else if (this.starGlowSprite.alpha !== this._targetStarGlowAlpha) {
      this.starGlowSprite.alpha = this._targetStarGlowAlpha
      if (this._targetStarGlowAlpha === 0) this.starGlowSprite.visible = false
    }

    // 닉네임 알파 보간
    if (this.nicknameContainer) {
      if (Math.abs(this.nicknameContainer.alpha - this._targetNicknameAlpha) > SNAP_THRESHOLD) {
        this.nicknameContainer.alpha += (this._targetNicknameAlpha - this.nicknameContainer.alpha) * lerpSpeed
        if (this.satellitesContainer) this.satellitesContainer.alpha = this.nicknameContainer.alpha
        if (this.auraRingsContainer) this.auraRingsContainer.alpha = this.nicknameContainer.alpha
      } else if (this.nicknameContainer.alpha !== this._targetNicknameAlpha) {
        this.nicknameContainer.alpha = this._targetNicknameAlpha
        if (this.satellitesContainer) this.satellitesContainer.alpha = this._targetNicknameAlpha
        if (this.auraRingsContainer) this.auraRingsContainer.alpha = this._targetNicknameAlpha
        if (this._targetNicknameAlpha === 0) {
          this.nicknameContainer.visible = false
          if (this.satellitesContainer) this.satellitesContainer.visible = false
          if (this.auraRingsContainer) this.auraRingsContainer.visible = false
        }
      }
    }
    // skinCode가 있는 유저만 Spine 캐릭터 표시 (데모 반경 제한 제거)
    const hasSpineSkin = !!this.currentData?.skinCode && this.currentData.skinCode !== 'none'
    const isHighZoom = this.currentLod === 1 || this.currentLod === 2;
    
    if (isHighZoom && hasSpineSkin) {
        this._initDemoSkins();
        
        // [UX 개선] 스킨이 있는 캐릭터는 6각 도형을 절대 보여주지 않음 (즉시 숨김)
        // 로딩 중에는 PixelSkinSpine 내부의 홀로그램 스피너가 대신 노출됨
        this.glowGraphics.visible = false;
        if (this.avatarSprite) this.avatarSprite.visible = false;

        // 위임된 클래스의 update 로직 호출
        if (this.characterSkin) {
            this.characterSkin.setVisible(true);
            this.characterSkin.update(this.timeOffset);
        }
    } else {
        if (this.characterSkin) this.characterSkin.setVisible(false);
        this.glowGraphics.visible = true; // Spine 미보유 또는 축소 시 기본 모양 복구
    }


    // [REFINED] Satellites Rotation
    // [EVOLUTION Phase 1] 위성 회전 6배 감속: 어지러움 해소 → 우아한 공전
    if (this.currentLod === 1 && this.satellitesContainer && this.satellitesContainer.visible) {
      this.satellitesContainer.rotation += 0.08 * deltaFactor // 기존 0.5 → 0.08
    }

    // [REFINED] Circular Aura Rings Breathing (우아한 정원 맥동)
    if (this.currentLod === 1 && this.auraRingsContainer && this.auraRingsContainer.visible) {
      this.auraRingsContainer.children.forEach((ring, index) => {
        // 회전 대신 부드러운 스케일/알파 맥동 (Ripple Effect)
        // 바깥 고리일수록 리플이 약간 늦게 퍼지는 느낌
        const rippleTime = this.timeOffset - (index * 0.5)
        const scalePulse = 1.0 + Math.sin(rippleTime) * 0.01 // 50% reduction (0.02 -> 0.01)
        ring.scale.set(scalePulse)

        // [GLOW SURGE] Hover 시 휘도 상승 효과 적용 (기본 0.9~1.1 + Hover 시 추가 0.2~0.3 부스트)
        const baseRingAlpha = 0.9 + Math.cos(rippleTime) * 0.1
        ring.alpha = baseRingAlpha + (this.hoverIntensity * 0.3)
      })
    }

    // [EVOLUTION] ES 기반 연속 호흡(Breathing) 효과
    const es = this.currentData?.evolutionScore || 0;
    const hasSupernova = !!this.currentData?.supernovaTier && new Date(this.currentData?.supernovaExpiresAt || 0) > new Date();

    // [EVOLUTION] LOD 3(줌아웃)에서 호흡 연산 완전 차단 → FPS 60 방어
    if (this.currentLod === 1 && (es > 0 || hasSupernova)) {
      const boost = (this.isAiInteracting ? 1.25 : 1.0) * (hasSupernova ? 1.3 : 1.0);
      // ES 연속 호흡 진폭: 0 ~ 0.06
      const breathAmp = Math.min(es * 0.003, 0.06) * boost;
      const scale = 1.0 + Math.sin(this.timeOffset) * breathAmp;
      this.glowGraphics.scale.set(scale);
    } else if (this.currentLod === 2 && hasSupernova) {
      const scale = 1.0 + Math.sin(this.timeOffset) * 0.02;
      this.glowGraphics.scale.set(scale);
    }

    // [FIX] 핑(Ping) 개수와 상관없이 모든 유저의 닉네임과 말풍선은 항상 올바른 위치와 스케일을 가져야 합니다.
    if (this.currentLod === 1 || this.currentLod === 2) {
      if (this.nicknameContainer && this.nicknameContainer.visible) {
        // [UX FIX] 텍스트가 화면상에서 항상 1배율(14px)로 고정되도록 완벽히 역보정
        // 픽셀 자체의 크기(zDepth)가 커지더라도 텍스트 크기는 동일하게 유지되어야 합니다.
        const baseZ = this.currentData?.zDepth ?? 1.0;
        const fixedScreenScale = 1.0 / (Math.max(zoom, 0.1) * 0.333 * baseZ);
        
        // [UX FIX] 텍스트 사이즈 동적 스케일링: 캐릭터 등장 시점(zoom 0.15)에는 0.5배율로 작게 시작하여, 원래 노출 단계였던 줌인(zoom 0.4) 시 1.0배율로 부드럽게 커짐
        let textScaleMultiplier = 1.0;
        if (zoom < 0.4) {
          const progress = Math.max(0, (zoom - 0.15) / 0.25); // zoom 0.15 -> 0, zoom 0.4 -> 1
          textScaleMultiplier = 0.5 + (0.5 * progress);       // 0.5 ~ 1.0
        }
        
        const finalScale = fixedScreenScale * textScaleMultiplier;
        
        this.nicknameContainer.scale.set(finalScale);
        // [FIX] 텍스트 위치: 아바타 발밑(로컬 y=40)을 기준으로 잡고, 스케일에 비례하여 여백을 띄웁니다.
        this.nicknameContainer.y = 40 + (12 * finalScale);
        // [UX FIX] 줌 아웃 시 이름표들이 겹쳐서 화면을 가리지 않도록 자연스럽게 페이드아웃
        // 아바타/스파인이 나타나는 zoom 0.15 구간부터 글씨도 함께 페이드인 되도록 범위를 (0.15 ~ 0.3)으로 변경
        let textAlpha = 1.0;
        if (zoom < 0.3) {
          textAlpha = Math.max(0, (zoom - 0.15) / 0.15); 
        }

        if (this.nicknameText) {
          this.nicknameText.alpha = textAlpha;
        }
        if (this.personaBadgeBg) this.personaBadgeBg.alpha = textAlpha;
        if (this.personaBadgeText) this.personaBadgeText.alpha = textAlpha;
      }

      // [GLOW SURGE] Hover 시 메인 글로우 휘도 부스트 (alpha 조절)
      const targetGlowAlpha = 0.8 + (this.hoverIntensity * 0.2);
      this.glowGraphics.alpha = targetGlowAlpha;
    }

    // [NEW] AI 캐릭터 전용 우주 유영 (Space Swimming) 전용 로직
    // LOD 1, 2(고화질/중화질)에서만 부드럽게 표류하며, AI와 교감 시 움직임이 약간 더 활발해집니다.
    if (this.isAi && (this.currentLod === 1 || this.currentLod === 2)) {
      this.driftTime += deltaFactor * (this.isAiInteracting ? 1.0 : 0.6)

      // Lissajous Curve 기반 우측-상하 표류 (진폭 8~12)
      const driftX = Math.sin(this.driftTime * 0.5) * 12
      const driftY = Math.cos(this.driftTime * 0.35) * 8

      // Steering Tilt (이동 방향에 따른 미세한 기울기 표현)
      // X축 속도(미분값)인 Cosine을 활용하여 자연스러운 틸트 구현
      const targetRotation = Math.cos(this.driftTime * 0.5) * 0.12

      this.innerContainer.x = driftX
      this.innerContainer.y = driftY
      this.innerContainer.rotation = targetRotation
    } else {
      // AI가 아니거나 저화질 모드(LOD 3)일 경우 위치 리셋 (최적화)
      if (this.innerContainer.x !== 0 || this.innerContainer.rotation !== 0) {
        this.innerContainer.position.set(0, 0)
        this.innerContainer.rotation = 0
      }
    }


    // [NEW] Owner Marker Float Animation
    if (this.ownerMarker && this.ownerMarker.visible) {
      // Scale based on zoom to keep it readable, minimum zoom clamp to prevent extreme scaling
      const invZoom = 1.0 / Math.max(zoom, 0.05)
      const baseZ = this.currentData?.zDepth ?? 1.0
      const pixelScale = LOD_CONFIG[this.activeLod].pixelScale
      const targetScale = (invZoom * 0.3) / (baseZ * pixelScale)
      this.ownerMarker.scale.set(targetScale)
      // Base height offset * scale, plus a small floating animation
      this.ownerMarker.y = -60 * targetScale + Math.sin(this.timeOffset * 0.5) * 10 * targetScale
    }

    // [NEW] Hover Intensity Smooth Interpolation (GSAP 대체)
    if (this.hoverIntensity !== this.targetHoverIntensity) {
      // deltaFactor가 0이거나 비정상적일 경우를 대비한 가드
      const safeDelta = Math.min(deltaFactor, 0.1);
      const lerpFactor = 1 - Math.pow(0.001, safeDelta);

      this.hoverIntensity += (this.targetHoverIntensity - this.hoverIntensity) * lerpFactor;

      // 부동소수점 오차 임계값 도달 시 강제 확정 (Zeno's paradox 방지)
      if (Math.abs(this.hoverIntensity - this.targetHoverIntensity) < 0.0001) {
        this.hoverIntensity = this.targetHoverIntensity;
      }
    }
  }

  setHovered(isHovered: boolean): void {
    // [OPTIMIZED] GSAP 인스턴스 생성을 제거하고 티커에서 보간할 목표값만 설정
    this.targetHoverIntensity = isHovered ? 1.0 : 0.0;
  }

  /**
   * [NEW] AI 상호작용 상태 설정 (상세 드로어와 연동)
   */
  setAiInteracting(isInteracting: boolean): void {
    this.isAiInteracting = isInteracting;
  }

  /**
   * 감정 필터링 상태 적용
   * @param isMatch 필터링 중인 감정과 일치 여부
   * @param isFiltering 현재 필터링이 활성화 상태인지 여부
   */
  setFiltered(isMatch: boolean, isFiltering: boolean): void {
    // [BugFix] State guard to prevent creating GSAP tweens every frame (Performance Leak)
    if (
      this.lastFiltering &&
      this.lastFiltering.isMatch === isMatch &&
      this.lastFiltering.isFiltering === isFiltering
    ) {
      return
    }
    this.lastFiltering = { isMatch, isFiltering }

    const targetAlpha = isFiltering ? (isMatch ? 1.0 : 0.1) : 1.0
    gsap.to(this.container, {
      alpha: targetAlpha,
      duration: 0.8,
      ease: 'power3.out'
    })
  }

  playAuraWave(color: string): void {
    const wave = new PIXI.Graphics()
    const colorHex = parseInt(color.replace('#', ''), 16)
    this.container.addChild(wave)


    // 픽셀 코어와 비슷한 크기에서 시작
    wave.poly(HEX_POINTS_50).stroke({ width: 3, color: colorHex, alpha: 0.6 }).fill({ color: colorHex, alpha: 0.08 }) // [COSMIC] 축소된 코어에 맞춤

    gsap.to(wave.scale, {
      x: 1.3, // [REFINED] 주변 픽셀을 침범하지 않도록 축소
      y: 1.3,
      duration: 0.8, // 범위가 좁아진 만큼 더 경쾌하게
      ease: 'power2.out',
    })

    gsap.to(wave, {
      alpha: 0,
      duration: 0.8,
      ease: 'power2.out',
      onComplete: () => {
        this.container.removeChild(wave)
        wave.destroy()
      },
    })
  }

  setPosition(coordX: number, coordY: number, animate: boolean = false): void {
    if (animate) {
      // [DYNAMIC] GSAP cinematic transition for activity-based repositioning
      gsap.to(this.container, {
        x: coordX,
        y: coordY,
        duration: 2.5 + Math.random() * 2, // 2.5s ~ 4.5s organic float
        ease: 'power2.inOut'
      })
    } else {
      this.container.x = coordX
      this.container.y = coordY
    }
  }

  destroy(): void {
    this.resetAnimations();
    if (this.characterSkin) {
      this.characterSkin.destroy();
      this.characterSkin = null;
    }
    this.container.destroy({ children: true })
  }

  /**
   * [NEW] 객체 풀링(Object Pooling) 회수 시 모든 애니메이션과 비동기 작업을 즉시 중단합니다.
   * 메모리 누수 및 이전 유저 데이터의 잔상이 남는 현상을 방지합니다.
   */
  resetAnimations(): void {
    // [WIDE KILL] 컨테이너 계층 전체의 트윈 사살 (LOD 변경 트윈 포함)
    gsap.killTweensOf(this);
    gsap.killTweensOf(this.avatarSprite);
    gsap.killTweensOf(this.glowGraphics);
    gsap.killTweensOf(this.starGlowSprite);
    gsap.killTweensOf(this.container);
    gsap.killTweensOf(this.innerContainer);
    if (this.innerContainer?.scale) gsap.killTweensOf(this.innerContainer.scale);
    if (this.nicknameText) gsap.killTweensOf(this.nicknameText);
    if (this.auraRingsContainer) {
      gsap.killTweensOf(this.auraRingsContainer);
      this.auraRingsContainer.children.forEach(c => gsap.killTweensOf(c));
    }
    if (this.satellitesContainer) {
      gsap.killTweensOf(this.satellitesContainer);
    }

    // 내부 상태 초기화
    this.hoverIntensity = 0;
    this.targetHoverIntensity = 0;
    this.isAiInteracting = false; // [BugFix] 객체 풀 회수 시 상호작용 상태 초기화 누락 수정
    this.timeOffset = Math.random() * 100;
    this.driftTime = Math.random() * 100;
    this.innerContainer?.position?.set(0, 0);
    if (this.innerContainer) this.innerContainer.rotation = 0;

    // [FIX] 객체 풀 회수 시 가시성 컴포넌트들의 가시성 동기적 완전 리셋 보증
    this.avatarSprite.texture = PIXI.Texture.EMPTY;
    this.avatarSprite.alpha = 0;
    this.avatarSprite.visible = false;
    if (this.nicknameContainer) {
      this.nicknameContainer.visible = false;
      this.nicknameContainer.alpha = 0;
    }
    if (this.satellitesContainer) {
      this.satellitesContainer.visible = false;
      this.satellitesContainer.alpha = 0;
    }
    if (this.auraRingsContainer) {
      this.auraRingsContainer.visible = false;
      this.auraRingsContainer.alpha = 0;
    }
    if (this.ownerMarker) {
      this.ownerMarker.visible = false;
    }
  }
}

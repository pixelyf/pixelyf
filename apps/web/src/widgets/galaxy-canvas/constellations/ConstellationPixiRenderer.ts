/**
 * [별자리 PixiJS 렌더러]
 *
 * 아키텍처:
 *   - 별자리의 별(노드)을 실제 PixelSprite(아바타) 인스턴스로 생성하여 100% 동일하게 렌더링
 *   - 연결선(간선)은 PIXI.Graphics로 렌더링
 *   - worldContainer에 직접 추가하므로 카메라 이동/줌 자동 적용, 클리핑 없음
 */

import * as PIXI from 'pixi.js'
import { PixelSprite, NAMEPLATE_TEXT_STYLE } from '@/entities/user/ui/PixelSprite'
import type { PixelData } from '@/stores/galaxyStore'
import { getLODLevel } from '@/shared/lib/pixi/lod'
import { VISUAL_SCALE } from '@/shared/constants/personas'
import { galaxyAlert } from '@/stores/dialogStore'

import { type ConstellationDef } from './constellationData'

// ============================================================================
// 렌더러 클래스
// ============================================================================

export class ConstellationPixiRenderer {
  private container: PIXI.Container
  private lineContainer: PIXI.Container
  private lineGraphics: PIXI.Graphics
  private pixelSprites: PixelSprite[] = []
  private nameLabels: PIXI.Text[] = []
  private timeOffset: number = 0

  constructor(
    private worldContainer: PIXI.Container,
    private constellationData: ConstellationDef[]
  ) {
    this.container = new PIXI.Container()
    this.container.label = 'ConstellationLayer'
    
    // 알파 애니메이션 버그 방지를 위해 독립된 컨테이너 사용
    this.lineContainer = new PIXI.Container()
    this.lineGraphics = new PIXI.Graphics()
    this.lineContainer.addChild(this.lineGraphics)
    
    // 연결선을 아래 레이어에 배치
    this.container.addChild(this.lineContainer)

    // worldContainer의 pixel 레이어 인덱스를 찾아서 같은 레이어 혹은 근처에 배치
    const pixelLayerIndex = worldContainer.children.findIndex(
      (c) => (c as any).sortableChildren === true
    )
    if (pixelLayerIndex > 0) {
      worldContainer.addChildAt(this.container, pixelLayerIndex)
    } else {
      worldContainer.addChild(this.container)
    }

    this._buildAll()
  }

  /** 별자리 레이어 전체의 가시성 제어 */
  public setVisible(visible: boolean): void {
    this.container.visible = visible
  }

  private _buildAll(): void {
    for (const data of this.constellationData) {
      const { centerX, centerY } = data
      const lineColorNum = parseInt(data.color.replace('#', ''), 16)

      // ── 별(노드) 생성 — 실제 PixelSprite 인스턴스 사용 ──
      for (let i = 0; i < data.stars.length; i++) {
        const star = data.stars[i]
        const isEmptySlot = !star.assignedPixelId
        
        // 별자리 전용 기본값 (하드코딩 제거 — 별자리 고유 스타일)
        const constellationPixelData: PixelData = {
          pixelId: star.assignedPixelId || `constellation_${data.id}_${i}`,
          coordX: centerX + star.x,
          coordY: centerY + star.y,
          displayName: star.name,
          glowColorPrimary: data.color,
          glowColorSecondary: '#FFFFFF',
          personaCode: undefined,
          evolutionScore: isEmptySlot ? 50 : 100,
          moodId: isEmptySlot ? 'calm' : 'shining',
          statusMessage: isEmptySlot ? `${data.name} • 빈 슬롯` : `${data.name}의 빛나는 별`,
          pingCount: Math.floor(star.brightness * 10),
        }

        const pixelSprite = new PixelSprite(constellationPixelData)
        pixelSprite.container.zIndex = 10
        
        // 빈 슬롯은 약한 글로우, 할당 슬롯은 밝은 글로우
        pixelSprite.container.alpha = isEmptySlot
          ? 0.6 + star.brightness * 0.15
          : 0.8 + star.brightness * 0.2

        // 빈 슬롯 클릭 시 공통 알럿 팝업
        if (isEmptySlot) {
          pixelSprite.container.eventMode = 'static'
          pixelSprite.container.cursor = 'pointer'
          pixelSprite.container.on('pointerdown', (e: any) => {
            if (e.nativeEvent && (e.nativeEvent.target as Element).tagName !== 'CANVAS') return
            galaxyAlert({
              title: data.name,
              message: '참여한 사용자가 없습니다.',
              variant: 'info',
            })
          })
        }

        this.container.addChild(pixelSprite.container)
        this.pixelSprites.push(pixelSprite)
      }

      // ── 별자리 이름 출력 (내 픽셀 100% 동일 스타일) ──
      const nameLabel = new PIXI.Text({
        text: data.name,
        style: NAMEPLATE_TEXT_STYLE,
        resolution: 2
      })
      nameLabel.anchor.set(0.5, 1.0)
      
      // 별자리의 맨 위쪽 별의 y좌표를 찾아서 그 위로 배치
      const topY = Math.min(...data.stars.map(s => s.y))
      
      // 나중에 update 함수에서 inverse scaling을 위해 기본 좌표 저장
      ;(nameLabel as any).baseX = centerX;
      ;(nameLabel as any).baseY = centerY + topY - 150;
      
      nameLabel.x = centerX
      nameLabel.y = centerY + topY - 150
      nameLabel.zIndex = 100
      
      this.container.addChild(nameLabel)
      this.nameLabels.push(nameLabel)
    }
  }

  /** Ticker 안에서 매 프레임 호출하여 아바타 애니메이션(호버 등) 업데이트 */
  public update(dt: number, zoom: number): void {
    this.timeOffset += dt * 0.05
    // 네온 글로우 전체가 부드럽게 숨쉬는 듯한 맥동 애니메이션 (기존의 50% 수준인 0.3 ~ 0.4)
    this.lineContainer.alpha = 0.35 + 0.05 * Math.sin(this.timeOffset)

    // [Inverse Scaling] 줌에 반비례하여 선의 두께 유지
    const invZoom = 1.0 / Math.max(zoom, 0.05)
    
    // 줌 레벨에 맞춰 네온 연결선을 다시 그립니다.
    this.lineGraphics.clear()
    
    const auraWidth = 8 * invZoom // 12 -> 8
    const midWidth = 3 * invZoom // 4 -> 3
    const coreWidth = 1.2 * invZoom // 2.0 -> 1.2
    
    for (const data of this.constellationData) {
      const { centerX, centerY } = data
      const lineColorNum = parseInt(data.color.replace('#', ''), 16)
      
      for (const [a, b] of data.edges) {
        const sa = data.stars[a], sb = data.stars[b]
        const ax = centerX + sa.x, ay = centerY + sa.y
        const bx = centerX + sb.x, by = centerY + sb.y

        // 1. 은은한 아우라
        this.lineGraphics
          .moveTo(ax, ay)
          .lineTo(bx, by)
          .stroke({ width: auraWidth, color: lineColorNum, alpha: 0.05 })

        // 2. 미들 글로우
        this.lineGraphics
          .moveTo(ax, ay)
          .lineTo(bx, by)
          .stroke({ width: midWidth, color: lineColorNum, alpha: 0.15 })

        // 3. 코어 (흰색 대신 고유 색상으로 변경, 알파 0.35)
        this.lineGraphics
          .moveTo(ax, ay)
          .lineTo(bx, by)
          .stroke({ width: coreWidth, color: lineColorNum, alpha: 0.35 })
      }
    }

    const currentLod = getLODLevel(zoom)
    for (let i = 0; i < this.pixelSprites.length; i++) {
      this.pixelSprites[i].applyLOD(currentLod)
      this.pixelSprites[i].update(dt, zoom)
    }

    // [Inverse Scaling] 내 픽셀(ownerMarker)과 100% 동일한 스케일링 공식
    const targetScale = invZoom * 0.3

    for (let i = 0; i < this.nameLabels.length; i++) {
      const label = this.nameLabels[i]
      label.scale.set(targetScale)
      // ownerMarker의 부유 애니메이션(-60 * targetScale + Math.sin...)은 생략하거나 추가할 수 있지만, 
      // 별자리 이름이므로 위치는 고정하고 스케일만 맞춥니다.
    }
  }

  public destroy(): void {
    for (const sprite of this.pixelSprites) {
      sprite.destroy()
    }
    this.pixelSprites = []

    // 네임 라벨 개별 destroy (메모리 안전성)
    for (const label of this.nameLabels) {
      label.destroy()
    }
    this.nameLabels = []

    // 라인 그래픽스 참조 정리
    this.lineGraphics.destroy()
    this.lineContainer.destroy({ children: true })

    this.container.destroy({ children: true })
  }
}

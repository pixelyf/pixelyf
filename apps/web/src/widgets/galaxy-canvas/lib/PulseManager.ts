import * as PIXI from 'pixi.js';
import { gsap } from 'gsap';

/**
 * [Phase 6.2] Galaxy Pulse Manager
 * 실시간 파동(Shockwave) 연출 및 객체 풀링을 관리합니다.
 */
export class PulseManager {
  private pool: PIXI.Graphics[] = [];
  private activePulses: PIXI.Graphics[] = [];
  private container: PIXI.Container;
  private app: PIXI.Application;
  private swimmers: any[] = []; // [SWIMMER RESONANCE] 유영 캐릭터 레퍼런스 리스트

  // 티어별 파동 색상 매핑
  private tierColors: Record<string, number> = {
    CHALLENGER: 0x00FFFF, // Cyan
    GRANDMASTER: 0xFF0000, // Red
    MASTER: 0x9D4EDD, // Purple
    DIAMOND: 0x4CC9F0, // Blue
    EMERALD: 0x2ECC71, // Green
    PLATINUM: 0x3FC1C0, // Teal
    GOLD: 0xFFD700, // Gold
    SILVER: 0xC0C0C0, // Silver
    BRONZE: 0xCD7F32, // Bronze
    IRON: 0x434343, // Dark Gray
  };

  constructor(app: PIXI.Application, container: PIXI.Container) {
    this.app = app;
    this.container = container;
  }

  /**
   * [SWIMMER RESONANCE] 유영 캐릭터(가디언) 레퍼런스 주입
   */
  public setSwimmers(swimmers: any[]) {
    this.swimmers = swimmers;
  }

  /**
   * 새로운 파동 발생 시 호출
   */
  public triggerPulse(x: number, y: number, tier: string, power: number = 1.0) {
    // 1. Viewport Culling Check (성능 최적화)
    const bounds = this.app.screen;
    const stage = this.container.parent;
    const globalPos = this.container.toGlobal(new PIXI.Point(x, y));
    
    // 화면 밖 일정 마진(200px) 이상이면 생성하지 않음
    if (globalPos.x < -200 || globalPos.x > bounds.width + 200 ||
        globalPos.y < -200 || globalPos.y > bounds.height + 200) {
      return;
    }

    // 2. Pool에서 객체 가져오기
    let pulse = this.pool.pop();
    if (!pulse) {
      pulse = new PIXI.Graphics();
    }

    const color = this.tierColors[tier.toUpperCase()] || 0xFFFFFF;

    // 3. 그래픽 초기화 및 애니메이션 [FIX: PixiJS v8 API 전환]
    pulse.clear();
    pulse.circle(0, 0, 10);
    pulse.stroke({ width: 2, color, alpha: 0.8 });
    pulse.position.set(x, y);
    pulse.scale.set(0.1);
    pulse.alpha = 1;

    this.container.addChild(pulse);
    this.activePulses.push(pulse);

    // GSAP 팽창 애니메이션
    gsap.to(pulse.scale, {
      x: 3 * power,
      y: 3 * power,
      duration: 1.5,
      ease: "power2.out"
    });

    gsap.to(pulse, {
      alpha: 0,
      duration: 1.5,
      ease: "power2.in",
      onComplete: () => {
        this.container.removeChild(pulse!);
        this.activePulses = this.activePulses.filter(p => p !== pulse);
        this.pool.push(pulse!); // Pool로 반환
      }
    });

    // [SWIMMER RESONANCE] 파동 생성 시 영향 반경 내 유영 캐릭터(가디언)에게 충격 전달
    if (this.swimmers && this.swimmers.length > 0) {
      this.swimmers.forEach(swimmer => {
        if (swimmer && typeof swimmer.onPulse === 'function') {
          swimmer.onPulse(x, y, power);
        }
      });
    }

    // 카메라 진동 (Screen Shake) 트리거 콜백 (반환값으로 표현 가능)
    return { x, y, distance: Math.sqrt(Math.pow(globalPos.x - bounds.width/2, 2) + Math.pow(globalPos.y - bounds.height/2, 2)) };
  }

  public clear() {
    this.activePulses.forEach(p => this.container.removeChild(p));
    this.pool = [...this.pool, ...this.activePulses];
    this.activePulses = [];
  }
}

import * as PIXI from 'pixi.js'

/**
 * 픽셀 꾸미기 스킨: 홀로그램 프로젝터 (Holographic Avatar Projection)
 * 사용자 아바타를 중앙에 띄우고, 공상과학(Sci-Fi) 영화처럼 바닥에서 빛의 기둥과 스캔라인이 아바타를 투사하는 고급 연출입니다.
 */
export class PixelSkin3DCharacter {
  public container: PIXI.Container;
  private pedestal: PIXI.Graphics | null = null;
  private hologramBeam: PIXI.Graphics | null = null;
  private characterSprite: PIXI.Sprite | null = null;
  private scanline: PIXI.Graphics | null = null;
  private particles: PIXI.Graphics[] = [];

  constructor(parent: PIXI.Container, avatarUrl: string | null) {
    this.container = new PIXI.Container();
    parent.addChild(this.container);
    
    this._init(avatarUrl);
  }

  private _init(avatarUrl: string | null): void {
    // 1. 홀로그램 프로젝터 바닥 장치 (Pedestal)
    this.pedestal = new PIXI.Graphics();
    this.pedestal.ellipse(0, 15, 30, 8).fill({color: 0x0F172A, alpha: 0.9}); // 짙은 네이비 기계장치 바닥
    this.pedestal.ellipse(0, 13, 25, 6).fill({color: 0x38BDF8, alpha: 0.8}); // 밝게 빛나는 스카이블루 코어
    this.container.addChild(this.pedestal);

    // 2. 바닥에서 솟구치는 반투명 홀로그램 빛의 기둥 (Beam)
    this.hologramBeam = new PIXI.Graphics();
    // 바닥(넓음)에서 위(좁아짐 혹은 넓어짐)로 퍼지는 사다리꼴 빛기둥
    this.hologramBeam.poly([-25, 13, 25, 13, 40, -60, -40, -60]).fill({color: 0x0EA5E9, alpha: 0.15});
    this.container.addChild(this.hologramBeam);

    // 3. 중앙 사용자 아바타 (Hologram Projection)
    this.characterSprite = new PIXI.Sprite();
    if (avatarUrl) {
        PIXI.Assets.load(avatarUrl).then((texture) => {
            if (this.characterSprite) {
                this.characterSprite.texture = texture;
                this.characterSprite.anchor.set(0.5, 0.5); // 정중앙 기준
                this.characterSprite.y = -20; // 빔 한가운데에 배치
                
                // 어떤 크기의 아바타 이미지든 60x60 사이즈에 맞게 자동 비율 조정
                const maxDim = Math.max(texture.width, texture.height);
                const targetSize = 60; 
                this.characterSprite.scale.set(targetSize / maxDim);
                
                // 홀로그램 특유의 디지털 느낌을 위한 틴트(색상 덧씌움) 및 투명도
                this.characterSprite.tint = 0x7DD3FC; // 연한 하늘색 틴트
                this.characterSprite.alpha = 0.85;
            }
        });
    }
    this.container.addChild(this.characterSprite);

    // 4. 위아래로 훑고 지나가는 스캔라인 (Scanline)
    this.scanline = new PIXI.Graphics();
    this.scanline.rect(-35, 0, 70, 2).fill({color: 0xBAE6FD, alpha: 0.8});
    try {
        const glowBlur = new PIXI.BlurFilter();
        glowBlur.blur = 2;
        this.scanline.filters = [glowBlur];
    } catch(e) {}
    this.container.addChild(this.scanline);

    // 5. 기기 주변을 도는 소수의 디지털 데이터 조각 (사각형 입자)
    for(let i = 0; i < 3; i++) {
        const particle = new PIXI.Graphics().rect(0, 0, 4, 4).fill({color: 0x38BDF8, alpha: 0.7});
        this.particles.push(particle);
        this.container.addChild(particle);
    }
  }

  public setVisible(visible: boolean): void {
    this.container.visible = visible;
  }

  public update(timeOffset: number): void {
    if (!this.container.visible) return;

    // 1. 홀로그램 아바타 부유 및 미세한 글리치 효과
    if (this.characterSprite) {
        // 어지럽지 않도록 매우 느리게 위아래로 부유
        this.characterSprite.y = -20 + Math.sin(timeOffset * 0.8) * 4;
        // 프로젝터가 쏘아올리는 느낌의 미세한 투명도 진동
        this.characterSprite.alpha = 0.75 + Math.random() * 0.15;
    }

    // 2. 빛기둥의 은은한 호흡
    if (this.hologramBeam) {
        this.hologramBeam.alpha = 0.15 + Math.sin(timeOffset * 1.2) * 0.05;
    }

    // 3. 스캔라인 상하 이동
    if (this.scanline) {
        // 아바타 높이 영역(-45 ~ 5)을 부드럽게 스캔
        this.scanline.y = -20 + Math.sin(timeOffset * 1.5) * 25;
    }

    // 4. 데이터 입자의 극단적으로 느린 공전 (어지러움 완벽 해결: 0.15 속도)
    this.particles.forEach((p, i) => {
        const orbitSpeed = timeOffset * 0.15; 
        const angle = orbitSpeed + (i * ((Math.PI * 2) / 3));
        const radiusX = 35;
        const radiusY = 10; 
        
        p.x = Math.cos(angle) * radiusX - 2;
        p.y = (Math.sin(angle) * radiusY) + 13;
        
        const zIndex = Math.sin(angle);
        p.alpha = 0.2 + (zIndex * 0.5); // 뒤로 가면 거의 사라짐
        
        // Z축 정렬
        if (zIndex < 0) {
            this.container.setChildIndex(p, 1); // 빔 뒤쪽으로
        } else {
            this.container.setChildIndex(p, this.container.children.length - 1); // 맨 앞으로
        }
    });
  }

  public destroy(): void {
    this.container.destroy({ children: true });
  }
}

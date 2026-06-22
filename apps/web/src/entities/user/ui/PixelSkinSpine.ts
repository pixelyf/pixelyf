import * as PIXI from 'pixi.js'
import { Spine, Skin } from '@esotericsoftware/spine-pixi-v8'
import gsap from 'gsap'
/** Supabase Storage 기반 Spine 에셋 URL 생성 */
const STORAGE_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/avatar-skins`
  : 'https://api.pixelyf.com/storage/v1/object/public/avatar-skins'

/** 캐릭터 에셋 정의 (items.spine_asset_path 기반 매핑) */
interface CharacterDef {
  name: string
  skin: string
  scale: number
}

/** skin code → roster 매핑 (ROSTER 키 = Spine 에셋 디렉토리명 + DB item_code 별칭) */
const ROSTER: Record<string, CharacterDef[]> = {
  // Spine 에셋 디렉토리명 기반 키
  spineboy: [
    { name: 'spineboy', skin: 'default', scale: 0.15 },
  ],
  'mix-and-match': [
    { name: 'mix-and-match', skin: 'full-skins/girl', scale: 0.18 },
    { name: 'mix-and-match', skin: 'full-skins/girl-blue-cape', scale: 0.18 },
    { name: 'mix-and-match', skin: 'full-skins/girl-spring-dress', scale: 0.18 },
  ],
  raptor: [
    { name: 'raptor', skin: 'default', scale: 0.1 },
  ],
  alien: [
    { name: 'alien', skin: 'default', scale: 0.18 },
  ],
  // dragon: Essential skel 형식이라 Pro 런타임 비호환 — 제거
  coin: [
    { name: 'coin', skin: 'default', scale: 0.2 },
  ],
  stretchyman: [
    { name: 'stretchyman', skin: 'default', scale: 0.15 },
  ],
  // DB item_code 별칭 (user_avatar_config.base_character에 저장되는 값)
  char_spineboy: [
    { name: 'spineboy', skin: 'default', scale: 0.15 },
  ],
  char_girl: [
    { name: 'mix-and-match', skin: 'full-skins/girl', scale: 0.18 },
    { name: 'mix-and-match', skin: 'full-skins/girl-blue-cape', scale: 0.18 },
    { name: 'mix-and-match', skin: 'full-skins/girl-spring-dress', scale: 0.18 },
  ],
  char_raptor: [
    { name: 'raptor', skin: 'default', scale: 0.1 },
  ],
  char_alien: [
    { name: 'alien', skin: 'default', scale: 0.18 },
  ],
  char_dragon: [
    { name: 'mix-and-match', skin: 'full-skins/girl-blue-cape', scale: 0.18 },
  ],
  char_coin: [
    { name: 'coin', skin: 'default', scale: 0.2 },
  ],
  char_stretchyman: [
    { name: 'stretchyman', skin: 'default', scale: 0.15 },
  ],
}

/** 전체 roster 평탄화 (해시 기반 선택용) */
const FLAT_ROSTER: CharacterDef[] = [
  { name: 'spineboy', skin: 'default', scale: 0.15 },
  { name: 'mix-and-match', skin: 'full-skins/girl', scale: 0.18 },
  { name: 'raptor', skin: 'default', scale: 0.1 },
  { name: 'mix-and-match', skin: 'full-skins/girl-blue-cape', scale: 0.18 },
  { name: 'alien', skin: 'default', scale: 0.18 },
  { name: 'mix-and-match', skin: 'full-skins/girl-spring-dress', scale: 0.18 },
  { name: 'mix-and-match', skin: 'full-skins/girl-blue-cape', scale: 0.18 },
  { name: 'coin', skin: 'default', scale: 0.2 },
  { name: 'stretchyman', skin: 'default', scale: 0.15 },
]

/**
 * 픽셀 꾸미기 스킨: Spine 2D 애니메이션 (프로덕션 버전)
 * 
 * - Supabase avatar-skins 버킷에서 에셋 로드
 * - skinCode 기반 캐릭터 선택 (DB 연동)
 * - fallback 처리 (에셋 로딩 실패 시 기본 아바타)
 */
export class PixelSkinSpine {
  public container: PIXI.Container;
  private pedestal: PIXI.Graphics | null = null;
  private loadingSpinner: PIXI.Graphics | null = null;
  private spineInstance: Spine | null = null;
  private isLoaded = false;
  private isInteractive = false;
  private seed: string;
  private skinCode: string | undefined;
  private equippedSlots: Record<string, string> | undefined;
  private isDestroyed = false; // 컴포넌트 언마운트 후 비동기 로드 시 크래시 방어

  constructor(parent: PIXI.Container, seed: string, skinCode?: string, equippedSlots?: Record<string, string>) {
    this.seed = seed;
    this.skinCode = skinCode;
    this.equippedSlots = equippedSlots;
    this.container = new PIXI.Container();
    parent.addChild(this.container);
    
    this._init();
  }

  private async _init(): Promise<void> {
    // seed 기반 해시 생성
    let hash = 0;
    for (let i = 0; i < this.seed.length; i++) hash = this.seed.charCodeAt(i) + ((hash << 5) - hash);
    const colorHex = (Math.abs(hash) & 0xFFFFFF);

    // 1. 무대(페데스탈) 생성
    this.pedestal = new PIXI.Graphics();
    this.pedestal.ellipse(0, 15, 35, 10).fill({color: 0x1E293B, alpha: 0.9}); 
    this.pedestal.ellipse(0, 13, 30, 8).fill({color: colorHex, alpha: 0.6});
    this.container.addChild(this.pedestal);

    // [LOADING MOTION] 홀로그램 소환 스피너 생성
    this.loadingSpinner = new PIXI.Graphics();
    // 반원을 그려서 회전할 때 눈에 잘 띄게 함
    this.loadingSpinner.arc(0, 0, 18, 0, Math.PI * 1.5).stroke({ color: colorHex, width: 2, alpha: 0.8, cap: 'round' });
    this.loadingSpinner.y = -5;
    this.container.addChild(this.loadingSpinner);
    
    // 2. 캐릭터 결정: skinCode 기반 또는 해시 기반 fallback
    let charDef: CharacterDef;
    
    if (this.skinCode && ROSTER[this.skinCode]) {
      // DB 데이터 기반 캐릭터 선택
      const variants = ROSTER[this.skinCode];
      charDef = variants[Math.abs(hash) % variants.length];
    } else {
      // fallback: 해시 기반 무작위 선택
      charDef = FLAT_ROSTER[Math.abs(hash) % FLAT_ROSTER.length];
    }

    // 3. Supabase Storage에서 에셋 로드
    try {
      const charName = charDef.name;
      const CACHE_VERSION = 'v4.3_fix1'; // 브라우저 캐시 우회용
      const skelUrl = `${STORAGE_BASE}/${charName}/${charName}-pro.skel?v=${CACHE_VERSION}`;
      const atlasUrl = `${STORAGE_BASE}/${charName}/${charName}-pma.atlas?v=${CACHE_VERSION}`;
        
      const skelKey = `${charName}Skel`;
      const atlasKey = `${charName}Atlas`;

      // PIXI 8 Asset 시스템에 중복 등록 방지
      if (!PIXI.Assets.resolver.hasKey(skelKey)) {
        PIXI.Assets.add({ alias: skelKey, src: skelUrl, data: { spineAtlasFile: atlasUrl } });
        PIXI.Assets.add({ alias: atlasKey, src: atlasUrl });
      }
        
      await PIXI.Assets.load([skelKey, atlasKey]);
      
      // 비동기 로딩 중 컴포넌트가 파괴되었다면 즉시 중단 (Batcher.ts clear 에러 방지)
      if (this.isDestroyed || this.container.destroyed) return;
        
      // 4. Spine 객체 생성
      this.spineInstance = Spine.from({ skeleton: skelKey, atlas: atlasKey, darkTint: false });
      this.spineInstance.scale.set(charDef.scale);
      const tintColor = 0xDDDDDD + (colorHex & 0x222222);

      // 스킨 적용 (베이스 스킨 + 장착된 파츠 스킨 조합)
      if ((charDef.skin && charDef.skin !== 'default') || (this.equippedSlots && Object.keys(this.equippedSlots).length > 0)) {
        try {
          const newSkin = new Skin("custom-skin");
          
          // 베이스 스킨 추가
          if (charDef.skin && charDef.skin !== 'default') {
            const baseSkin = this.spineInstance.skeleton.data.findSkin(charDef.skin);
            if (baseSkin) newSkin.addSkin(baseSkin);
          } else {
            const defaultSkin = this.spineInstance.skeleton.data.findSkin('default');
            if (defaultSkin) newSkin.addSkin(defaultSkin);
          }

          // 장착된 슬롯 아이템 스킨 추가
          if (this.equippedSlots) {
            Object.values(this.equippedSlots).forEach(skinName => {
              const partSkin = this.spineInstance!.skeleton.data.findSkin(skinName);
              if (partSkin) newSkin.addSkin(partSkin);
            });
          }

          this.spineInstance.skeleton.setSkin(newSkin);
          this.spineInstance.skeleton.setupPoseSlots();
        } catch (e) {
          console.warn(`Spine Skin Error: Failed to apply custom skin on ${charName}`, e);
        }
      }

      // [FIX] spine-pixi-v8 DarkTintBatcher crash 회피를 위해 ColorMatrixFilter 사용
      const r = ((tintColor >> 16) & 0xFF) / 255;
      const g = ((tintColor >> 8) & 0xFF) / 255;
      const b = (tintColor & 0xFF) / 255;
      const filter = new PIXI.ColorMatrixFilter();
      filter.matrix = [
          r, 0, 0, 0, 0,
          0, g, 0, 0, 0,
          0, 0, b, 0, 0,
          0, 0, 0, 1, 0
      ];
      this.spineInstance.filters = [filter];
      this.spineInstance.y = 15; 
        
      // 애니메이션 재생
      const anims = this.spineInstance.skeleton?.data?.animations || [];
      if (anims.length > 0) {
        const animIndex = Math.abs(hash) % Math.min(3, anims.length);
        this.spineInstance.state.setAnimation(0, anims[animIndex].name, true);
      }
        
      // 좌우 반전
      if (hash % 2 === 0) this.spineInstance.scale.x *= -1;
        
      this.container.addChild(this.spineInstance);
      this.isLoaded = true;

      // [LOADING MOTION] 로딩 완료 시 스피너 제거 및 페이드 인 적용
      if (this.loadingSpinner && !this.loadingSpinner.destroyed) {
        this.loadingSpinner.visible = false;
      }
      this.spineInstance.alpha = 0;
      gsap.to(this.spineInstance, { alpha: 1, duration: 0.5, ease: 'sine.out' });

      // 인터랙션 — hitArea를 명시하여 다른 픽셀 클릭 가로챔 방지
      this.container.eventMode = 'static';
      this.container.hitArea = new PIXI.Circle(0, 0, 50);
      this.container.cursor = 'pointer';
      this.container.on('pointerdown', () => this.triggerAction());

      // [HOVER Z-LIFT] 마우스 오버 시 최상단으로 끌어올림 (Spine 캐릭터 겹침 해소)
      // Spine container → innerContainer → PixelSprite.container (layers.pixel 직접 자식)
      const pixelContainer = this.container.parent?.parent;
      if (pixelContainer) {
        this.container.on('pointerover', () => {
          pixelContainer.zIndex = 9999;
        });
        this.container.on('pointerout', () => {
          pixelContainer.zIndex = 0;
        });
      }
        
    } catch (e) {
      // Next.js 개발 오버레이 방지를 위해 error 대신 warn 사용
      console.warn("[PixelSkinSpine] Spine 에셋 로드 실패 (avatar-skins 버킷 또는 에셋 호환성 확인 필요):", e);
      // fallback: 에셋 로딩 실패 시 컨테이너를 숨기고 기본 아바타로 복원
      this.container.visible = false;
    }
  }

  public setVisible(visible: boolean): void {
    this.container.visible = visible;
  }

  public getIsLoaded(): boolean {
    return this.isLoaded;
  }

  public update(timeOffset: number): void {
    if (!this.container.visible) return;
    
    if (this.pedestal) {
      this.pedestal.alpha = 0.8 + Math.sin(timeOffset * 2.0) * 0.2;
    }

    // [LOADING MOTION] 비동기 다운로드 중 홀로그램 스피너 회전
    if (!this.isLoaded && this.loadingSpinner && !this.loadingSpinner.destroyed) {
      this.loadingSpinner.rotation += 0.15;
      this.loadingSpinner.alpha = 0.5 + Math.sin(timeOffset * 5.0) * 0.5;
    }
  }

  public triggerAction(): void {
    if (!this.spineInstance || this.isInteractive) return;
    this.isInteractive = true;

    const anims = this.spineInstance.skeleton?.data?.animations || [];
    if (anims.length > 0) {
      const jumpAnim = anims[Math.min(anims.length - 1, 4)].name;
      const idleAnim = anims[0].name;
      
      this.spineInstance.state.setAnimation(0, jumpAnim, false);
      this.spineInstance.state.addAnimation(0, idleAnim, true, 0);
    }

    setTimeout(() => {
      this.isInteractive = false;
    }, 3500);
  }

  public destroy(): void {
    this.isDestroyed = true;
    
    // [SPINE GC LEAK FIX] 부모 트리에서 물리적으로 떼어낸 후 안전하게 독립 소멸 (Double Destroy 크래시 방어)
    if (this.spineInstance) {
      try {
        if (this.spineInstance.parent) {
          this.spineInstance.parent.removeChild(this.spineInstance);
        }
        this.spineInstance.destroy({ children: true, texture: false });
      } catch (e) {
        console.warn('[PixelSkinSpine] Spine destroy failed:', e);
      }
      this.spineInstance = null;
    }
    
    this.pedestal = null;
    if (this.container && !this.container.destroyed) {
      if (this.container.parent) this.container.removeFromParent();
      this.container.destroy({ children: true });
    }
  }
}

import * as PIXI from 'pixi.js';
import { gsap } from 'gsap';
import { Spine } from '@esotericsoftware/spine-pixi-v8';

/**
 * [NEW] 16인 가디언 캐릭터 시스템 (v2)
 * 16개 MBTI 페르소나 전체를 초기 로딩 시 단 1회 생성하여 영구히 유영하도록 함.
 * GSAP Timeline 대신 Ticker와 수학 직접 연산(Procedural) 사용.
 */

// 16개 MBTI 전체 목록
export const MBTI_LIST = [
  'INTJ', 'INTP', 'ENTJ', 'ENTP', // NT: Analysts
  'INFJ', 'INFP', 'ENFJ', 'ENFP', // NF: Diplomats
  'ISTJ', 'ISFJ', 'ESTJ', 'ESFJ', // SJ: Guardians
  'ISTP', 'ISFP', 'ESTP', 'ESFP'  // SP: Explorers
] as const;

export type MBTI = typeof MBTI_LIST[number];

export type PersonaGroup = 'NT' | 'NF' | 'SJ' | 'SP' | 'CONTEXT';

interface SwimConfig {
  speed: number;        // 유영 속도
  curvature: number;    // 회전 곡률 (노이즈 강도)
  wobbleFreq: number;   // 몸체 흔들림 빈도
  glowIntensity: number; // 맥동 강도
}

// 그룹별 유영 특성 정의 (Step 1 시나리오 반영)
const GROUP_CONFIGS: Record<PersonaGroup, SwimConfig> = {
  NT: { speed: 1.2, curvature: 0.5, wobbleFreq: 0.05, glowIntensity: 0.8 },
  NF: { speed: 0.8, curvature: 1.2, wobbleFreq: 0.08, glowIntensity: 1.2 },
  SJ: { speed: 1.0, curvature: 0.3, wobbleFreq: 0.03, glowIntensity: 0.6 },
  SP: { speed: 1.5, curvature: 1.8, wobbleFreq: 0.12, glowIntensity: 1.5 },
  CONTEXT: { speed: 1.0, curvature: 0.2, wobbleFreq: 0.04, glowIntensity: 1.0 }
};

/** MBTI 코드 → PersonaGroup 매핑 (16타입 정확 분류) */
const PERSONA_TO_GROUP = (mbti: string): PersonaGroup => {
  if (['INTJ','INTP','ENTJ','ENTP'].includes(mbti)) return 'NT'
  if (['INFJ','INFP','ENFJ','ENFP'].includes(mbti)) return 'NF'
  if (['ISTJ','ISFJ','ESTJ','ESFJ'].includes(mbti)) return 'SJ'
  if (['ISTP','ISFP','ESTP','ESFP'].includes(mbti)) return 'SP'
  return 'NT' // fallback
};

/** 16개 MBTI 타입 + 픽셀리프 코어 가디언 컬러 매핑 (모든 타입 완성) */
const PERSONA_COLORS: Record<string, number> = {
  // NT — Analyst (보라/남색 계열)
  INTJ: 0x6366F1, INTP: 0x818CF8, ENTJ: 0x4F46E5, ENTP: 0xA78BFA,
  // NF — Diplomat (민트/에메랄드 계열)
  INFJ: 0x34D399, INFP: 0x6EE7B7, ENFJ: 0x10B981, ENFP: 0x2DD4BF,
  // SJ — Sentinel (파랑/시안 계열)
  ISTJ: 0x3B82F6, ISFJ: 0x60A5FA, ESTJ: 0x2563EB, ESFJ: 0x93C5FD,
  // SP — Explorer (황금/앰버 계열)
  ISTP: 0xE4AE3A, ISFP: 0xFBBF24, ESTP: 0xF59E0B, ESFP: 0xFCD34D,
  // Core
  PIXELYF_CORE: 0xA855F7,
};
export class PixelySwimmer extends PIXI.Container {
  public personaCode: string = '';
  public nickname: string = '';
  public group: PersonaGroup;
  public config: SwimConfig;
  
  private avatarSprite: PIXI.Sprite;
  private innerContainer: PIXI.Container; // [NEW] 회전 전용 컨테이너
  private nicknameText: PIXI.Text | null = null;
  private nicknameContainer: PIXI.Container | null = null;

  private lastZoom: number = 0.1;
  private timeOffset: number = Math.random() * 1000;
  private _isTextureReady: boolean = false;
  private spineInstance: Spine | null = null;
  private spineBaseScale: number = 0.12;
  private _lastWaveX: number = 0;
  private warpFreezeTimer: number = 0; // [FIX v14] 워프 직후 흔들림 방지용 타이머
  private entryEase: number = 0;        // [FIX v15] 워프 후 애니메이션 소프트 엔트리 (0 -> 1)

  private velocity: { x: number, y: number } = { x: 0, y: 0 };
  private targetPos: { x: number, y: number } | null = null;
  private maxSpeed: number = 2.0;
  private steeringForce: number = 0.05;
  private friction: number = 0.98;
  private speedVariation: number = 0.8 + Math.random() * 0.4; // 80% ~ 120% 속도 편차
  private phaseOffset: number = Math.random() * Math.PI * 2;
  
  // [NEW v22] 은하 그룹별 절대 좌표 경계값 (Clustering Fix)
  private roamingBounds: { minX: number, maxX: number, minY: number, maxY: number } = { minX: -100000, maxX: 100000, minY: -100000, maxY: 100000 };

  constructor(personaCode: string, nickname: string, startX: number, startY: number, galaxyGroup: PersonaGroup = 'NT', config?: SwimConfig) {
    super();
    this.personaCode = personaCode;
    this.nickname = nickname;
    this.group = galaxyGroup; // [FIX] 명시적으로 주입된 은하 그룹 사용
    this.config = { ...(config || GROUP_CONFIGS[this.group]) };
    
    // 은하 그룹별 절대 좌표 바운더리 설정 (분할점 100k)
    this._setRoamingBounds(galaxyGroup);
    
    // [Speed Slow] 사용자 요청에 따라 속도 대폭 감축 (12 -> 6)
    this.maxSpeed = this.config.speed * 6; 
    // 저속 항해에 최적화된 부드러운 조향력
    this.steeringForce = this.group === 'NT' ? 0.15 : 0.05; 
    
    this.x = startX;
    this.y = startY;

    // [FIX v10] 초기 스케일 팝업 완전 봉쇄: 투명도 0 및 가시성 false로 시작
    this.lastZoom = 0.1; 
    this.scale.set(0); 
    this.alpha = 0; 
    this.visible = false; 

    // [NEW] 회전 전용 내부 컨테이너 생성 (본체는 회전하지 않음)
    this.innerContainer = new PIXI.Container();
    this.addChild(this.innerContainer);
    
    this.avatarSprite = new PIXI.Sprite();
    this.avatarSprite.anchor.set(0.5);
    this.avatarSprite.scale.set(0); 
    this.innerContainer.addChild(this.avatarSprite);

    this.drawPersonaShape();
    this.isFirstVoyage = true; 
    this.setNewTarget(startX, startY, 0.1); 
  }

  private isFirstVoyage: boolean = true;

  private _setRoamingBounds(group: PersonaGroup) {
      // [LOCALIZE] 엔진 아키텍처가 부동 소수점 정밀도 해결을 위해 로컬 원점(0,0) 중심으로 
      // 정규화되었으므로, 모든 가디언은 소속 그룹과 관계없이 로컬 ±100,000 범위 내에서 유영합니다.
      this.roamingBounds = { minX: -100000, maxX: 100000, minY: -100000, maxY: 100000 };
  }

  /**
   * [Step 1] 16인 가디언 Spine 2D 렌더링
   */
  private async drawPersonaShape() {
    // 무작위 속성 생성을 위해 시드 기반 해시 사용
    const seed = this.personaCode + this.nickname;
    let hash = 0;
    for (let i = 0; i < seed.length; i++) hash = seed.charCodeAt(i) + ((hash << 5) - hash);
    const colorHex = (Math.abs(hash) & 0xFFFFFF);

    // [ROSTER EXPANSION] 멋진 인간 여성 캐릭터(mix-and-match) 비율을 약 50%로 끌어올린 배열
    const roster = [
        { name: 'spineboy', skin: 'default', scale: 0.18 },
        { name: 'mix-and-match', skin: 'full-skins/girl', scale: 0.22 }, // 기본 여성 폼
        { name: 'raptor', skin: 'default', scale: 0.12 },
        { name: 'mix-and-match', skin: 'full-skins/girl-blue-cape', scale: 0.22 }, // 블루 망토 여성
        { name: 'alien', skin: 'default', scale: 0.22 },
        { name: 'mix-and-match', skin: 'full-skins/girl-spring-dress', scale: 0.22 }, // 봄 원피스 여성
        { name: 'spineboy', skin: 'default', scale: 0.18 },
        { name: 'mix-and-match', skin: 'full-skins/girl', scale: 0.22 }
    ];

    const charIndex = Math.abs(hash) % roster.length;
    const charDef = roster[charIndex];
    const charName = charDef.name;
    this.spineBaseScale = charDef.scale;

    const skelUrl = `https://esotericsoftware.com/files/examples/4.3/${charName}/export/${charName}-pro.skel`;
    const atlasUrl = `https://esotericsoftware.com/files/examples/4.3/${charName}/export/${charName}-pma.atlas`;
    
    const skelKey = `${charName}Skel`;
    const atlasKey = `${charName}Atlas`;

    try {
        if (!PIXI.Assets.resolver.hasKey(skelKey)) {
            PIXI.Assets.add({ alias: skelKey, src: skelUrl });
            PIXI.Assets.add({ alias: atlasKey, src: atlasUrl });
        }
        
        await PIXI.Assets.load([skelKey, atlasKey]);
        
        if (this.destroyed) return;

        this.spineInstance = Spine.from({ skeleton: skelKey, atlas: atlasKey, darkTint: false });
        
        // 스케일 및 색상(틴트) 설정
        this.spineInstance.scale.set(this.spineBaseScale);
        
        // [FIX] spine-pixi-v8 4.2.x + pixi.js 8.17.x 호환성 문제 (DarkTintBatcher 크래시) 회피
        // this.spineInstance.tint = 0xDDDDDD + (colorHex & 0x222222); 대신 ColorMatrixFilter 사용
        const tintColor = 0xDDDDDD + (colorHex & 0x222222);
        const r = ((tintColor >> 16) & 0xFF) / 255;
        const g = ((tintColor >> 8) & 0xFF) / 255;
        const b = (tintColor & 0xFF) / 255;
        
        const filter = new PIXI.ColorMatrixFilter();
        // tint 효과를 시뮬레이션: (원본 * 1) * tintColor
        // 매트릭스: [R_scale, 0, 0, 0, 0,  0, G_scale, 0, 0, 0,  0, 0, B_scale, 0, 0,  0, 0, 0, 1, 0]
        filter.matrix = [
            r, 0, 0, 0, 0,
            0, g, 0, 0, 0,
            0, 0, b, 0, 0,
            0, 0, 0, 1, 0
        ];
        this.spineInstance.filters = [filter];
        
        // 스킨(여성/남성 등) 적용 (default 스킨이라도 setupPoseSlots가 필요할 수 있음)
        if (charDef.skin) {
            try {
                this.spineInstance.skeleton.setSkin(charDef.skin);
                this.spineInstance.skeleton.setupPoseSlots();
            } catch (e) {
                console.warn(`Spine Skin Error: ${charDef.skin} not found on ${charName}`);
            }
        }
        
        // 떠다니는 모션(run 또는 walk) 실행
        const anims = this.spineInstance.skeleton?.data?.animations || [];
        if (anims.length > 0) {
            // 주로 이동형 모션을 선택하도록 (끝에서부터 탐색)
            const moveAnim = anims[Math.max(0, anims.length - 1)].name;
            this.spineInstance.state.setAnimation(0, moveAnim, true);
        }

        // 기존 SVG 아바타 숨기고 Spine 인스턴스 부착
        this.avatarSprite.visible = false;
        this.innerContainer.addChild(this.spineInstance);

        this._isTextureReady = true;
        this.visible = true;
        this.alpha = 0; 
    } catch (e) {
        // Next.js 개발 오버레이 방지를 위해 error 대신 warn 사용
        console.warn(`[PixelySwimmer] Spine load failed for ${this.personaCode}. Falling back to 2D avatar.`);
        
        // 에러 발생 시 Spine 대신 기본 2D 아바타(avatarSprite)로 대체
        this.avatarSprite.visible = true;
        this.avatarSprite.scale.set(this.spineBaseScale);
        
        this._isTextureReady = true;
        this.visible = true;
        this.alpha = 0;
    }
  }

  /**
   * [High-End] 은하계 전역 내 무작위 장거리 목적지 설정
   */
  /**
   * [v5] 카메라 시야 기반의 동적 목적지 설정
   * @param camX 카메라 중심 X
   * @param camY 카메라 중심 Y
   * @param zoom 현재 줌 레벨
   */
  public setNewTarget(camX: number, camY: number, zoom: number) {
    // [FIX v22 Neutral Roaming] 줌 레벨이나 카메라 위치(Magnetic Attraction)에 의존하지 않고 
    // 은하 구역 전체를 자유롭게 유영하도록 목적지 설정 (절대 좌표 바운더리 내 무작위)
    this.targetPos = {
      x: this.roamingBounds.minX + Math.random() * (this.roamingBounds.maxX - this.roamingBounds.minX),
      y: this.roamingBounds.minY + Math.random() * (this.roamingBounds.maxY - this.roamingBounds.minY)
    };
    this.isFirstVoyage = false;
  }

  /**
   * [High-End v5] 카메라 시야 기반 항해 엔진
   */
  public update(dt: number, zoom: number, camX: number, camY: number) {
    if (this.destroyed || !this.targetPos) return;
    this.lastZoom = zoom;


    // 1. LOD 기반 스케일링 (확대 시 가디언이 너무 작아지는 현상 방지)
    const baseScale = 1.0; 
    // 줌 인(2.0) 하더라도 최소 0.75배는 유지하여 시각적 수축 방지
    const scaleCap = Math.max(0.75, 0.875 / zoom);
    const finalScale = Math.min(baseScale, scaleCap);
    this.scale.set(finalScale);

    // [LOD] 닉네임 표시 제어 (0.3 이상에서만 노출)
    if (zoom >= 0.3) {
      this._ensureNickname();
      if (this.nicknameContainer) {
        // [FIX] 본체는 회전하지 않으므로 이제 상대 좌표만 유지하면 가독성 문제 해결
        this.nicknameContainer.position.set(0, 90); 
        this.nicknameContainer.visible = true;
        this.nicknameContainer.alpha = Math.min(1, (zoom - 0.3) * 10); // 0.3에서 시작해 0.4에서 투명도 1(100%) 도달
      }
    } else if (this.nicknameContainer) {
      this.nicknameContainer.visible = false;
    }

    // 첫 프레임 스케일링 준비 완료 후 가시화 (Fade-in은 update 루프에서 처리)
    if (this.visible === false && zoom > 0) {
      this.visible = true;
    }


    // [FIX] 줌 레벨에 따라 요동치지 않는 절대적인 워프 임계값 설정
    const distFromCam = Math.hypot(this.x - camX, this.y - camY);
    // 은하계 중심에서 80,000 유닛 이상 멀어졌을 때만 '길을 잃었다'고 판단하고 재배치
    const warpThreshold = 80000; 

    if (distFromCam > warpThreshold) {
      this.relocate(camX, camY, zoom);
      return;
    }

    // 2. 목적지 근처 도달 시 새로운 목적지 설정 (시야 반경 기반)
    const dx = this.targetPos.x - this.x;
    const dy = this.targetPos.y - this.y;
    const dist = Math.hypot(dx, dy);

    if (dist < 2000) {
      this.setNewTarget(camX, camY, zoom);
      return;
    }

    // [Mechanism] 줌 레벨에 비례하여 이동 속도를 동적으로 감속 (확대 시 눈으로 감상할 수 있도록)
    // zoom값이 0.5 이하(줌아웃)일 때는 정상 속도(1.0), 2.0(줌인)일 때는 속도를 20% 수준으로 대폭 늦춤
    const zoomSlowdown = Math.max(0.15, Math.min(1.0, 0.5 / zoom));
    const currentMaxSpeed = (this.config.speed * 6) * zoomSlowdown; 
    
    // Spine 애니메이션 재생 속도도 이동 속도에 맞춰 조금 느리게 조절 (다리가 너무 빨리 움직이는 것 방지)
    if (this.spineInstance && this.spineInstance.state) {
        this.spineInstance.state.timeScale = 0.5 + (zoomSlowdown * 0.5);
    }

    const localMaxSpeed = currentMaxSpeed * this.speedVariation;
    const desiredX = (dx / dist) * localMaxSpeed;
    const desiredY = (dy / dist) * localMaxSpeed;
    
    // 조향(Steering)만 부드럽게 적용하여 방향만 바꿈 (60Hz 기준 dt=1/60이므로 60*dt로 보정)
    const dtCorrection = 60 * dt;
    this.velocity.x += (desiredX - this.velocity.x) * (this.steeringForce * 0.5 * dtCorrection);
    this.velocity.y += (desiredY - this.velocity.y) * (this.steeringForce * 0.5 * dtCorrection);
    
    // 2. 물리 연산
    this.timeOffset += dt;
    const jitterGuard = this.entryEase; 

    // [Magnetic Tether 제거] 줌 인 시 가디언들이 중앙으로 모여 우글거리는 원인이므로 삭제함.
    // 대신 시야에서 완전히 사라졌을 때의 워프 로직만 남김.

    // 마찰력 제거: 에너지를 잃지 않고 항해 유지
    this.x += this.velocity.x * (60 * dt);
    this.y += this.velocity.y * (60 * dt);

    // [FIX v15] 애니메이션 소프트 엔트리 (워프 후 1초간 서서히 흔들림 및 페이드인 적용)
    if (this.entryEase < 1) {
      this.entryEase = Math.min(1, this.entryEase + dt); 
      this.alpha = this.entryEase; // [NEW v21] Cinematic Fade-in
    }

    // 3. 향하는 방향으로 몸체 회전 및 뱅킹(Banking) - [FIX] 내부 컨테이너만 회전
    const moveAngle = Math.atan2(this.velocity.y, this.velocity.x);
    const speedScale = Math.hypot(this.velocity.x, this.velocity.y) / this.maxSpeed;
    
    // 외교형(NF)은 선회 시 더 깊게 기움
    const bankFreq = this.group === 'NF' ? 0.3 : 0.1;
    // [FIX v16] jitterGuard를 적용하여 화면 진입 전 흔들림 완벽 제거
    const shake = Math.sin(this.timeOffset * 10 + this.phaseOffset);
    
    if (this.spineInstance) {
        // Spine 2.5D 캐릭터는 항상 직립을 유지하며, 이동 방향에 따라 좌우 스케일 반전
        const direction = this.velocity.x > 0 ? 1 : -1;
        this.spineInstance.scale.x = direction * Math.abs(this.spineInstance.scale.x);
        // 몸체가 비행기처럼 90도 꺾이지 않고 살짝(10도 내외)만 기울어짐
        this.innerContainer.rotation = direction * (shake * bankFreq * speedScale * jitterGuard);
    } else {
        // 구형 SVG 방식의 회전
        this.innerContainer.rotation = moveAngle + (Math.PI / 2) + shake * bankFreq * speedScale * jitterGuard;
    }

    // 4. 맥동 및 미세 흔들림
    const pulseBase = this.spineInstance ? this.spineBaseScale : (80 / 256);
    // [FIX v16] jitterGuard 적용
    const pulseOffset = Math.sin(this.timeOffset * 3 + this.phaseOffset);
    const pulse = 1 + pulseOffset * 0.1 * this.config.glowIntensity * jitterGuard;
    
    if (this.spineInstance) {
        this.spineInstance.scale.y = pulseBase * pulse;
        this.spineInstance.scale.x = Math.sign(this.spineInstance.scale.x) * (pulseBase * pulse);
    } else {
        this.avatarSprite.scale.set(pulseBase * pulse);
    }
  }

  private _ensureNickname() {
    if (this.nicknameContainer) return;
    
    this.nicknameContainer = new PIXI.Container();
    try {
      this.nicknameText = new PIXI.Text({
        text: this.nickname,
        style: {
          fontFamily: 'Inter, sans-serif',
          fontSize: 24,
          fill: '#ffffff',
          fontWeight: 'bold',
          stroke: { color: '#000000', width: 4 },
          dropShadow: { color: '#000000', alpha: 0.5, blur: 4, distance: 2 },
          padding: 4,
        },
        resolution: Math.max(3, window.devicePixelRatio || 2), // 고해상도 렌더링
        roundPixels: true, // 물결/흔들림 현상 방지
      });
      this.nicknameText.anchor.set(0.5, 0);
      this.nicknameText.y = 60; // 캐릭터 하단 배치
      
      this.nicknameContainer.addChild(this.nicknameText);
    } catch (e) {
      console.warn('[PixelySwimmer] Failed to create nickname text:', e);
    }
    this.addChild(this.nicknameContainer);
  }

  /**
   * [Real-time Pulse] 외부 파동 신호에 반응
   */
  public onPulse(originX: number, originY: number, power: number = 1.0) {
    if (this.destroyed) return;
    
    // 파동원과의 거리 계산
    const dist = Math.hypot(this.x - originX, this.y - originY);
    // 일정 범위 내(예: 8,000 유닛)에 있을 때만 반응
    if (dist < 8000) {
        const delay = dist / 2500; 
        const baseConfig = GROUP_CONFIGS[this.group];

        // [STABILITY Fix] GSAP 트윈 충돌 및 참조 오류 방지용 객체 복제 및 보호
        // 기존 진행 중인 트윈 강제 제거 및 원본 설정 상태에서 재시작
        gsap.killTweensOf(this.config);

        gsap.to(this.config, {
            glowIntensity: (baseConfig.glowIntensity || 1.0) * 3.0 * power,
            speed: (baseConfig.speed || 1.0) * 2.5 * power,
            duration: 0.8,
            delay: delay,
            yoyo: true,
            repeat: 1,
            ease: 'power2.inOut',
            onComplete: () => {
                if (this.destroyed) return;
                // 명시적으로 기본값 복구하여 표류 방지
                this.config.glowIntensity = baseConfig.glowIntensity;
                this.config.speed = baseConfig.speed;
            }
        });

        // 가속 충격 (Vector Kick)
        const angle = Math.atan2(this.y - originY, this.x - originX);
        const impulse = 12 * power * (1 - dist / 8000);
        this.velocity.x += Math.cos(angle) * impulse;
        this.velocity.y += Math.sin(angle) * impulse;
    }
  }

  // relocate는 v3에서 초기 좌표 부여 용으로만 사용 (이후 고정 anchor 시스템 폐기)
  /**
   * [v7] 화면 외곽 랜덤 스폰 및 자연스러운 진입
   */
  public relocate(camX: number, camY: number, zoom: number) {
    // [FIX] 화면 밖에서의 리로케이트 범위 상향 평준화
    const baseRadius = (window.innerWidth / 2) / Math.max(0.05, zoom);
    const warpDist = Math.max(15000, baseRadius * 1.2);
    
    const angle = Math.random() * Math.PI * 2;
    const dist = warpDist + Math.random() * 5000;
    
    this.x = camX + Math.cos(angle) * dist;
    this.y = camY + Math.sin(angle) * dist;
    
    // [FIX v18 Warp-Sync] 나타나는 첫 프레임부터 목표를 향해 정방향으로 달리게 함
    this.setNewTarget(camX, camY, zoom);
    if (this.targetPos) {
      const dx = this.targetPos.x - this.x;
      const dy = this.targetPos.y - this.y;
      const moveAngle = Math.atan2(dy, dx);
      // [FIX v20 Warp-Variety] 정규화된 방향에 약간의 무작위 편차 추가하여 겹침 방지
      const randomHeadway = (Math.random() - 0.5) * 0.2;
      const finalAngle = moveAngle + randomHeadway;
      
      this.innerContainer.rotation = finalAngle + (Math.PI / 2);
      const localMaxSpeed = (this.config.speed * 6) * this.speedVariation;
      this.velocity.x = Math.cos(finalAngle) * localMaxSpeed;
      this.velocity.y = Math.sin(finalAngle) * localMaxSpeed;
      
      // 상태 즉시 복구 (물리 데이터 하드 리셋 및 위상 무작위화)
      this.timeOffset = Math.random() * 100; // 위상(Phase) 무작위화
      this.speedVariation = 0.8 + Math.random() * 0.4; // 항해마다 속도 스타일 변경
      this.entryEase = 0; // 흔들림 및 페이드인 시작
      this.alpha = 0;     // [NEW v21] 투명에서 시작
      this.visible = true;
      // [FIX v19] 렌더링 시점 지터 방지를 위해 강제 스케일 동기화
      if (this.spineInstance) {
          this.spineInstance.scale.set(this.spineBaseScale);
      } else {
          this.avatarSprite.scale.set(80/256);
      }
    }
  }

  /**
   * [SPINE GC LEAK FIX] Swimmer 언마운트 시 Spine 텍스처 버퍼 강제 해제 및 소멸
   */
  public destroy(options?: any): void {
    // GSAP 트윈 인스턴스 소멸
    gsap.killTweensOf(this.config);
    gsap.killTweensOf(this);

    // 부모인 innerContainer에서 떼어낸 뒤 독립 파괴 (Double Destroy 크래시 방어)
    if (this.spineInstance) {
      try {
        if (this.spineInstance.parent) {
          this.spineInstance.parent.removeChild(this.spineInstance);
        }
        this.spineInstance.destroy({ children: true, texture: false });
      } catch (e) {
        console.warn('[PixelySwimmer] Spine destroy failed:', e);
      }
      this.spineInstance = null;
    }

    super.destroy(options);
  }
}

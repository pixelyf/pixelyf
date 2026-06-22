/**
 * [카메라 초기화 모듈]
 * 카메라 인스턴스 생성, 초기 위치 설정, 시네마틱 진입 연출을 담당합니다.
 * 24단계 히스토리: deepWarp, ACCUMULATIVE ZOOM FIX 알고리즘 보존.
 */
import * as PIXI from 'pixi.js'
import { GalaxyCamera } from '@/shared/lib/pixi/camera'
import { VISUAL_SCALE } from '@/shared/constants/personas'
import type { UserProfile } from '@/entities/user/model/useUserStore'
import { useGalaxyStore } from '@/stores/galaxyStore'

const CAMERA_DEFAULT_X = -2000 * VISUAL_SCALE
const CAMERA_DEFAULT_Y = -2000 * VISUAL_SCALE

export interface CameraResult {
  camera: GalaxyCamera
  entranceTimeout: ReturnType<typeof setTimeout> | null
}

/**
 * 카메라를 초기화하고 초기 위치/시네마틱 진입 연출을 세팅합니다.
 */
export function initCamera(
  worldContainer: PIXI.Container,
  partnerCode: string | undefined,
  currentUser: UserProfile | null,
  targetCoord: { x: number; y: number }
): CameraResult {
  const camera = new GalaxyCamera(worldContainer)
  let entranceTimeout: ReturnType<typeof setTimeout> | null = null

  // [BUG FIX] 무조건 요청된 은하의 중심(targetCoord)으로 초기화하여 라우팅 꼬임 방지
  // (유저 좌표로의 이동은 공간 데이터 로딩이 완료된 이후 개별적으로 처리되어야 함)
  camera.warpTo(targetCoord.x * VISUAL_SCALE, targetCoord.y * VISUAL_SCALE)
  
  if (partnerCode === 'pixelyf') {
    camera.zoomTo(0.03, 0)
  } else {
    camera.zoomTo(0.05, 0)
  }

  return { camera, entranceTimeout }
}

/**
 * [ACCUMULATIVE ZOOM FIX — 24단계 검증 완료]
 * 휠 핸들러를 생성합니다. 누적형 wheelTargetZoom으로 줌 역주행 문제를 해결합니다.
 */
export function createWheelHandler(
  cameraRef: { current: GalaxyCamera | null },
  entranceRef: { current: ReturnType<typeof setTimeout> | null }
) {
  let wheelTargetZoom: number | null = null
  let wheelTimeout: NodeJS.Timeout | null = null

  const handleWheel = (e: WheelEvent) => {
    const cam = cameraRef.current
    if (!cam) return
    e.preventDefault()

    // 사용자 휠 조작 시 예약된 자동 진입 연출(deepWarp) 즉시 취소
    if (entranceRef.current !== null) {
      clearTimeout(entranceRef.current)
      entranceRef.current = null
    }

    // [ACCUMULATIVE ZOOM] 애니메이션 중간값이 아닌 누적 목적지 사용
    if (wheelTargetZoom === null) {
      wheelTargetZoom = cam.viewport.zoom
    }

    wheelTargetZoom *= (1 - e.deltaY * 0.005)
    const isGraph = useGalaxyStore.getState().viewMode === 'thoughtGraph';
    const minZoom = isGraph ? 0.031 : 0.031;
    const maxZoom = isGraph ? 6.3 : 6.3;
    wheelTargetZoom = Math.max(minZoom, Math.min(maxZoom, wheelTargetZoom))
    cam.zoomTo(wheelTargetZoom, 0.2)

    // 휠 조작이 멈추면 누적 목적지 초기화 (250ms)
    if (wheelTimeout) clearTimeout(wheelTimeout)
    wheelTimeout = setTimeout(() => {
      wheelTargetZoom = null
      wheelTimeout = null
    }, 250)
  }

  /** 외부에서 wheelTargetZoom을 확인하기 위한 getter */
  const isWheelActive = () => wheelTargetZoom !== null

  const cleanup = () => {
    if (wheelTimeout) clearTimeout(wheelTimeout)
  }

  return { handleWheel, isWheelActive, cleanup }
}

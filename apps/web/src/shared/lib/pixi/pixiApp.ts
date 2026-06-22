import * as PIXI from 'pixi.js'

export async function createPixiApp(
  canvas: HTMLCanvasElement,
  width?: number,
  height?: number,
): Promise<PIXI.Application> {
  const app = new PIXI.Application()

  // 디스플레이 픽셀 비율(DPR)을 기반으로 해상도 설정 (최대 2)
  const resolution = Math.min(window.devicePixelRatio, 2)

  await app.init({
    canvas,
    width: width ?? window.innerWidth,
    height: height ?? window.innerHeight,
    background: '#020617', // V8 syntax for background color
    clearBeforeRender: true,
    antialias: true,
    resolution: resolution,
    roundPixels: true, // [FIX] 구형 GPU 서브픽셀 렌더링 아티팩트 방지
    powerPreference: 'high-performance',
    autoDensity: true,
    preference: 'webgl', // [FIX] spine-pixi-v8 DarkTintBatcher crash in WebGPU
  })

  return app
}

import * as PIXI from 'pixi.js'

const fragment = `
    varying vec2 vTextureCoord;
    uniform sampler2D uTexture;
    uniform vec2 uWarpCenter;
    uniform float uWarpProgress;
    uniform float uWarpRadius;

    void main(void) {
        vec2 uv = vTextureCoord;
        
        // 탭 왜곡 중심점으로부터의 거리 및 방향 벡터 계산
        vec2 dir = uv - uWarpCenter;
        float dist = length(dir);
        
        if (dist < uWarpRadius && uWarpProgress > 0.001) {
            // 정규화된 굴절 방향
            vec2 normDir = normalize(dir);
            
            // 중력 아인슈타인 링 왜곡 곡선 (감쇠 파동형 아날로그 굴절 식)
            // progress에 맞춰 팽창했다가 스무스하게 소멸
            float strength = uWarpProgress * 0.08;
            float falloff = smoothstep(uWarpRadius, 0.0, dist);
            float wave = sin(dist * 24.0 - uTimeFactor * 8.0) * strength * falloff;
            
            uv += normDir * wave;
        }

        gl_FragColor = texture2D(uTexture, uv);
    }
`.replace('uTimeFactor', 'uWarpProgress'); // Uniform 네이밍 매핑 안전 조치

export class SpaceTimeWarpFilter extends PIXI.Filter {
    constructor() {
        const warpUniforms = new PIXI.UniformGroup({
            uWarpCenter: { value: new Float32Array([0.5, 0.5]), type: 'vec2<f32>' },
            uWarpProgress: { value: 0.0, type: 'f32' },
            uWarpRadius: { value: 0.45, type: 'f32' },
        });

        super({
            glProgram: PIXI.GlProgram.from({
                fragment,
                vertex: PIXI.defaultFilterVert,
            }),
            resources: {
                warpUniforms,
            },
        });
    }

    get warpCenter(): [number, number] {
        const arr = (this.resources.warpUniforms as any).uniforms.uWarpCenter;
        return [arr[0], arr[1]];
    }

    set warpCenter(center: [number, number]) {
        const arr = (this.resources.warpUniforms as any).uniforms.uWarpCenter;
        arr[0] = center[0];
        arr[1] = center[1];
    }

    get warpProgress(): number {
        return (this.resources.warpUniforms as any).uniforms.uWarpProgress;
    }

    set warpProgress(progress: number) {
        (this.resources.warpUniforms as any).uniforms.uWarpProgress = progress;
    }

    get warpRadius(): number {
        return (this.resources.warpUniforms as any).uniforms.uWarpRadius;
    }

    set warpRadius(radius: number) {
        (this.resources.warpUniforms as any).uniforms.uWarpRadius = radius;
    }
}

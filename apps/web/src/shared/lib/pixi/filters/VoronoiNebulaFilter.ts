import * as PIXI from 'pixi.js'

const fragment = `
    varying vec2 vTextureCoord;
    uniform sampler2D uTexture;
    uniform float uTime;
    uniform float uIntensity;
    uniform vec3 uColor;

    // GPU 의사 랜덤 노이즈 해시 함수
    vec2 hash2(vec2 p) {
        return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453);
    }

    // GPU 보로노이 노이즈 (Fluid Cell) 연산
    float voronoi(vec2 x) {
        vec2 n = floor(x);
        vec2 f = fract(x);
        float mDist = 8.0;
        
        for (int j = -1; j <= 1; j++) {
            for (int i = -1; i <= 1; i++) {
                vec2 g = vec2(float(i), float(j));
                vec2 o = hash2(n + g);
                // 시간 흐름에 맞춰 요동치게 보정
                o = 0.5 + 0.5 * sin(uTime * 1.2 + o * 6.2831);
                vec2 r = g - f + o;
                float d = dot(r, r);
                if (d < mDist) {
                    mDist = d;
                }
            }
        }
        return sqrt(mDist);
    }

    void main(void) {
        vec4 texColor = texture2D(uTexture, vTextureCoord);
        
        vec2 uv = vTextureCoord;
        vec2 center = vec2(0.5, 0.5);
        float dist = distance(uv, center);
        
        // 성운 테두리 아웃라인 사각형 크래시 방지용 부드러운 감쇄
        float edgeFade = smoothstep(0.5, 0.32, dist);
        
        // 보로노이 노이즈 유체 필드 (시간 틱으로 GPU 가동)
        // 텍스처 좌표 스케일을 4.0배로 넓혀 촘촘한 성운 결 생성
        float noise = voronoi(uv * 4.2 + vec2(uTime * 0.15));
        
        // 노이즈 밀도 조절로 에너지 결 형성
        float density = smoothstep(0.1, 0.85, noise);
        
        // 엇박자 맥동 아우라 강도 계산
        float pulse = sin(uTime * 2.2) * 0.12 + 0.88;
        float aura = exp(-dist * 9.0) * uIntensity * density * pulse * edgeFade;
        
        vec3 finalColor = texColor.rgb + uColor * aura;
        float finalAlpha = min(texColor.a + aura * 0.85, 1.0);
        
        // Premultiplied alpha 버그 방지 가드
        finalColor = min(finalColor, vec3(finalAlpha));

        gl_FragColor = vec4(finalColor, finalAlpha);
    }
`;

export class VoronoiNebulaFilter extends PIXI.Filter {
    constructor() {
        const nebulaUniforms = new PIXI.UniformGroup({
            uTime: { value: 0.0, type: 'f32' },
            uIntensity: { value: 1.0, type: 'f32' },
            uColor: { value: new Float32Array([0.5, 0.3, 1.0]), type: 'vec3<f32>' },
        });

        super({
            glProgram: PIXI.GlProgram.from({
                fragment,
                vertex: PIXI.defaultFilterVert,
            }),
            resources: {
                nebulaUniforms,
            },
        });

        this.padding = 32;
    }

    get time(): number {
        return (this.resources.nebulaUniforms as any).uniforms.uTime;
    }

    set time(v: number) {
        (this.resources.nebulaUniforms as any).uniforms.uTime = v;
    }

    get intensity(): number {
        return (this.resources.nebulaUniforms as any).uniforms.uIntensity;
    }

    set intensity(v: number) {
        (this.resources.nebulaUniforms as any).uniforms.uIntensity = v;
    }

    get color(): [number, number, number] {
        const arr = (this.resources.nebulaUniforms as any).uniforms.uColor;
        return [arr[0], arr[1], arr[2]];
    }

    set color(rgb: [number, number, number]) {
        const arr = (this.resources.nebulaUniforms as any).uniforms.uColor;
        arr[0] = rgb[0];
        arr[1] = rgb[1];
        arr[2] = rgb[2];
    }
}

import * as PIXI from 'pixi.js'

const fragment = `
    varying vec2 vTextureCoord;
    uniform float uTime;
    uniform vec2 uCameraPos;
    uniform vec2 uResolution;

    float hash(vec2 p) {
        return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
    }

    void main(void) {
        vec2 uv = vTextureCoord * uResolution;
        vec3 color = vec3(0.003, 0.005, 0.015); 
        
        // Parallax offset
        vec2 pos = uv + (uCameraPos * 0.00005);
        
        float stars1 = hash(pos * 1200.0);
        if (stars1 > 0.9992) {
            color += vec3(0.5);
        }

        float stars2 = hash(pos * 600.0 + uTime * 0.01);
        if (stars2 > 0.9985) {
            float twinkle = sin(uTime * 2.0 + stars2 * 100.0) * 0.4 + 0.6;
            color += vec3(0.9, 0.95, 1.0) * twinkle;
        }

        float nebula = 0.5 + 0.5 * sin(pos.x * 3.0 + pos.y * 2.0 + uTime * 0.1);
        color += vec3(0.03, 0.01, 0.08) * nebula * 0.2;

        gl_FragColor = vec4(color, 1.0);
    }
`;

export class StarfieldFilter extends PIXI.Filter {
    constructor() {
        const timeUniforms = new PIXI.UniformGroup({
            uTime: { value: 0.0, type: 'f32' },
            uCameraPos: { value: new Float32Array([0, 0]), type: 'vec2<f32>' },
            uResolution: { value: new Float32Array([1920, 1080]), type: 'vec2<f32>' },
        });

        super({
            glProgram: PIXI.GlProgram.from({
                fragment,
                vertex: PIXI.defaultFilterVert,
            }),
            resources: {
                timeUniforms,
            },
        });
    }

    get time(): number {
        return (this.resources.timeUniforms as any).uniforms.uTime;
    }

    set time(value: number) {
        (this.resources.timeUniforms as any).uniforms.uTime = value;
    }

    set cameraPos(pos: [number, number]) {
        const arr = (this.resources.timeUniforms as any).uniforms.uCameraPos;
        arr[0] = pos[0];
        arr[1] = pos[1];
    }
    
    set customResolution(res: [number, number]) {
        const arr = (this.resources.timeUniforms as any).uniforms.uResolution;
        arr[0] = res[0];
        arr[1] = res[1];
    }
}

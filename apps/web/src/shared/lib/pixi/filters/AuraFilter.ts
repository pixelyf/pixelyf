import * as PIXI from 'pixi.js'

const fragment = `
    varying vec2 vTextureCoord;
    uniform sampler2D uTexture;
    uniform float uTime;
    uniform float uIntensity;
    uniform vec3 uColor;

    void main(void) {
        vec4 color = texture2D(uTexture, vTextureCoord);
        
        // Distance from center of the sprite
        vec2 center = vec2(0.5, 0.5);
        float dist = distance(vTextureCoord, center);
        
        // Edge fade ensures the aura is exactly 0.0 at the filter bounds, preventing any square cutoff artifacts
        float edgeFade = smoothstep(0.5, 0.35, dist);
        
        // Aura glow calculation: exponential decay from center
        // Intensity pulses slightly over time
        float pulse = sin(uTime * 5.0) * 0.1 + 0.9;
        float aura = exp(-dist * 12.0) * uIntensity * pulse * edgeFade;
        
        // Combine pixel color with aura using proper pre-multiplied alpha math
        vec3 auraColor = uColor * aura;
        vec3 finalRGB = color.rgb + auraColor;
        float finalAlpha = min(color.a + aura, 1.0);
        
        // Clamp RGB to prevent R > A (which breaks premultiplied alpha and causes white squares)
        finalRGB = min(finalRGB, vec3(finalAlpha));
        
        // Output with expanded alpha for the glow area
        gl_FragColor = vec4(finalRGB, finalAlpha);
    }
`;

export class AuraFilter extends PIXI.Filter {
    constructor() {
        const auraUniforms = new PIXI.UniformGroup({
            uTime: { value: 0, type: 'f32' },
            uIntensity: { value: 0, type: 'f32' },
            uColor: { value: new Float32Array([0.2, 0.5, 1.0]), type: 'vec3<f32>' },
        });

        super({
            glProgram: PIXI.GlProgram.from({
                fragment,
                vertex: PIXI.defaultFilterVert,
            }),
            resources: {
                auraUniforms,
            },
        });

        // [PREMIUM] Padding allows aura to breathe without rectangular clipping
        this.padding = 64;
    }

    get time(): number {
        return (this.resources.auraUniforms as any).uniforms.uTime;
    }
    set time(v: number) {
        (this.resources.auraUniforms as any).uniforms.uTime = v;
    }

    get intensity(): number {
        return (this.resources.auraUniforms as any).uniforms.uIntensity;
    }
    set intensity(v: number) {
        (this.resources.auraUniforms as any).uniforms.uIntensity = v;
    }

    get color(): [number, number, number] {
        const colorArr = (this.resources.auraUniforms as any).uniforms.uColor;
        return [colorArr[0], colorArr[1], colorArr[2]];
    }

    set color(rgb: [number, number, number]) {
        const colorArr = (this.resources.auraUniforms as any).uniforms.uColor;
        colorArr[0] = rgb[0];
        colorArr[1] = rgb[1];
        colorArr[2] = rgb[2];
    }
}

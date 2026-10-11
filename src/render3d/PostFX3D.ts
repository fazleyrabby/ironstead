import { HalfFloatType, Vector2, WebGLRenderTarget } from "three";
import type { PerspectiveCamera, Scene, WebGLRenderer } from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { VIEW3D } from "../config/atmosphere";
import type { Quality } from "./quality";

// Tilt-shift blur (golden-angle disc), then saturation and vignette.
const TiltShiftShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTexel: { value: new Vector2(1, 1) },
    uBlur: { value: 0 },
    uFocus: { value: 0.5 },
    uBand: { value: 0.2 },
    uVignette: { value: 0 },
    uSaturation: { value: 1 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform vec2 uTexel;
    uniform float uBlur;
    uniform float uFocus;
    uniform float uBand;
    uniform float uVignette;
    uniform float uSaturation;
    varying vec2 vUv;

    const int TAPS = 16;
    const float GOLDEN = 2.39996323;

    void main() {
      vec2 screenUv = vec2(vUv.x, 1.0 - vUv.y);
      float amount = smoothstep(uBand, 0.5, abs(screenUv.y - uFocus));
      float radius = amount * uBlur;

      vec4 base = texture2D(tDiffuse, vUv);
      vec3 sum = base.rgb;
      for (int i = 0; i < TAPS; i += 1) {
        float fi = float(i);
        float r = sqrt((fi + 0.5) / float(TAPS));
        vec2 dir = vec2(cos(fi * GOLDEN), sin(fi * GOLDEN)) * r;
        sum += texture2D(tDiffuse, vUv + dir * radius * uTexel).rgb;
      }
      vec3 color = sum / float(TAPS + 1);

      float grey = dot(color, vec3(0.2126, 0.7152, 0.0722));
      color = mix(vec3(grey), color, uSaturation);

      vec2 centred = screenUv - 0.5;
      float vignette = smoothstep(0.35, 0.95, length(centred * vec2(1.0, 1.15)));
      color *= 1.0 - vignette * uVignette;

      gl_FragColor = vec4(color, base.a);
    }
  `,
};

// Bloom + tilt-shift chain. Only built when the quality tier asks for it;
// otherwise the scene renders straight to the canvas.
export class PostFX3D {
  private readonly composer: EffectComposer;
  private readonly tiltShift?: ShaderPass;

  constructor(renderer: WebGLRenderer, scene: Scene, camera: PerspectiveCamera, quality: Quality) {
    const { bloom, tiltShift, grade } = VIEW3D;
    const target = new WebGLRenderTarget(256, 256, { type: HalfFloatType, samples: quality.msaa });
    this.composer = new EffectComposer(renderer, target);
    this.composer.addPass(new RenderPass(scene, camera));

    if (quality.bloom) {
      this.composer.addPass(
        new UnrealBloomPass(new Vector2(256, 256), bloom.strength, bloom.radius, bloom.threshold),
      );
    }

    if (quality.tiltShift) {
      this.tiltShift = new ShaderPass(TiltShiftShader);
      this.tiltShift.uniforms.uFocus.value = tiltShift.focus;
      this.tiltShift.uniforms.uBand.value = tiltShift.band;
      this.tiltShift.uniforms.uVignette.value = grade.vignette;
      this.tiltShift.uniforms.uSaturation.value = grade.saturation;
      this.composer.addPass(this.tiltShift);
    }

    this.composer.addPass(new OutputPass());
  }

  resize(width: number, height: number, pixelRatio: number): void {
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(width, height);
    this.tiltShift?.uniforms.uTexel.value.set(1 / width, 1 / height);
  }

  render(zoom: number): void {
    if (this.tiltShift) {
      const { tiltShift } = VIEW3D;
      const factor = Math.min(1, Math.max(tiltShift.minZoomFactor, zoom / tiltShift.fullZoom));
      this.tiltShift.uniforms.uBlur.value = tiltShift.maxBlur * factor;
    }
    this.composer.render();
  }
}

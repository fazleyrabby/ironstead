import { Filter, GlProgram } from "pixi.js";
import { ATMOSPHERE } from "../config/atmosphere";

const vertex = `
in vec2 aPosition;
out vec2 vTextureCoord;
out vec2 vScreenUv;
out vec2 vTexel;
out vec4 vClamp;

uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;
uniform vec4 uInputClamp;

void main(void) {
  vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
  position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
  position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
  gl_Position = vec4(position, 0.0, 1.0);
  vTextureCoord = aPosition * (uOutputFrame.zw * uInputSize.zw);
  // Filter-system uniforms are only read here; the fragment stage gets varyings.
  vScreenUv = aPosition;
  vTexel = uInputSize.zw;
  vClamp = uInputClamp;
}
`;

// Single pass: tilt-shift blur + bloom share one golden-angle disc of taps,
// then grade and vignette.
const fragment = `
in vec2 vTextureCoord;
in vec2 vScreenUv;
in vec2 vTexel;
in vec4 vClamp;
out vec4 finalColor;

uniform sampler2D uTexture;

uniform float uBlur;
uniform float uFocus;
uniform float uBand;
uniform float uBloom;
uniform float uBloomThreshold;
uniform float uBloomRadius;
uniform float uVignette;
uniform float uContrast;
uniform float uSaturation;

const int TAPS = 16;
const float GOLDEN = 2.39996323;

void main(void) {
  vec2 screenUv = vScreenUv;
  float amount = smoothstep(uBand, 0.5, abs(screenUv.y - uFocus));
  float radius = amount * uBlur;

  vec4 base = texture(uTexture, vTextureCoord);
  vec3 sum = base.rgb;
  vec3 glow = vec3(0.0);

  for (int i = 0; i < TAPS; i += 1) {
    float fi = float(i);
    float r = sqrt((fi + 0.5) / float(TAPS));
    vec2 dir = vec2(cos(fi * GOLDEN), sin(fi * GOLDEN)) * r;

    vec2 blurUv = clamp(vTextureCoord + dir * radius * vTexel, vClamp.xy, vClamp.zw);
    sum += texture(uTexture, blurUv).rgb;

    vec2 glowUv = clamp(vTextureCoord + dir * uBloomRadius * vTexel, vClamp.xy, vClamp.zw);
    vec3 g = texture(uTexture, glowUv).rgb;
    float luma = dot(g, vec3(0.299, 0.587, 0.114));
    glow += g * smoothstep(uBloomThreshold, 1.0, luma) * (1.0 - r * 0.6);
  }

  vec3 color = sum / float(TAPS + 1);
  color += glow / float(TAPS) * uBloom;

  float grey = dot(color, vec3(0.299, 0.587, 0.114));
  color = mix(vec3(grey), color, uSaturation);
  color = (color - 0.5) * uContrast + 0.5;

  vec2 centred = screenUv - 0.5;
  float vignette = smoothstep(0.35, 0.95, length(centred * vec2(1.0, 1.15)));
  color *= 1.0 - vignette * uVignette;

  finalColor = vec4(clamp(color, 0.0, 1.0), base.a);
}
`;

interface PostUniforms {
  uBlur: number;
}

export class PostFX {
  readonly filter: Filter;

  constructor(resolution: number) {
    const { tiltShift, bloom, grade } = ATMOSPHERE;
    this.filter = new Filter({
      glProgram: GlProgram.from({ vertex, fragment, name: "post-fx" }),
      resources: {
        postUniforms: {
          uBlur: { value: tiltShift.maxBlur, type: "f32" },
          uFocus: { value: tiltShift.focus, type: "f32" },
          uBand: { value: tiltShift.band, type: "f32" },
          uBloom: { value: bloom.strength, type: "f32" },
          uBloomThreshold: { value: bloom.threshold, type: "f32" },
          uBloomRadius: { value: bloom.radius, type: "f32" },
          uVignette: { value: grade.vignette, type: "f32" },
          uContrast: { value: grade.contrast, type: "f32" },
          uSaturation: { value: grade.saturation, type: "f32" },
        },
      },
      resolution,
      antialias: "inherit",
    });
  }

  update(zoom: number): void {
    const { tiltShift } = ATMOSPHERE;
    const factor = Math.min(1, Math.max(tiltShift.minZoomFactor, zoom / tiltShift.fullZoom));
    const uniforms = this.filter.resources.postUniforms.uniforms as PostUniforms;
    uniforms.uBlur = tiltShift.maxBlur * factor;
  }
}

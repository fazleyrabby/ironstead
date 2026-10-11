export type QualityTier = "low" | "medium" | "high";

export interface Quality {
  tier: QualityTier;
  // Upper bound for the canvas device-pixel ratio.
  pixelRatio: number;
  shadows: boolean;
  shadowMap: number;
  unitShadows: boolean;
  msaa: number;
  bloom: boolean;
  tiltShift: boolean;
  pointLights: number;
  // Ground texture px per world unit.
  groundResolution: number;
  // Fraction of decorative trees/rocks that are instanced.
  propDensity: number;
}

const PRESETS: Record<QualityTier, Omit<Quality, "tier" | "pixelRatio"> & { maxPixelRatio: number }> = {
  high: {
    maxPixelRatio: 2,
    shadows: true,
    shadowMap: 2048,
    unitShadows: true,
    msaa: 4,
    bloom: true,
    tiltShift: true,
    pointLights: 6,
    groundResolution: 1.5,
    propDensity: 1,
  },
  medium: {
    maxPixelRatio: 1.5,
    shadows: true,
    shadowMap: 1024,
    unitShadows: true,
    msaa: 2,
    bloom: true,
    tiltShift: true,
    pointLights: 3,
    groundResolution: 1,
    propDensity: 0.7,
  },
  low: {
    maxPixelRatio: 1,
    shadows: false,
    shadowMap: 512,
    unitShadows: false,
    msaa: 0,
    bloom: false,
    tiltShift: false,
    pointLights: 0,
    groundResolution: 1,
    propDensity: 0.4,
  },
};

function gpuName(): string {
  try {
    const gl = document.createElement("canvas").getContext("webgl");
    if (!gl) return "";
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    const name = info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return String(name ?? "").toLowerCase();
  } catch {
    return "";
  }
}

function detectTier(): QualityTier {
  const override = new URLSearchParams(window.location.search).get("quality");
  if (override === "low" || override === "medium" || override === "high") return override;

  const gpu = gpuName();
  if (/swiftshader|llvmpipe|software|basic render/.test(gpu)) return "low";

  const cores = navigator.hardwareConcurrency || 4;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
  const touch = window.matchMedia("(pointer: coarse)").matches;

  if (touch) return cores <= 4 || memory <= 3 ? "low" : "medium";
  if (cores <= 2 || memory <= 2) return "low";
  if (cores <= 4 || memory <= 4 || /intel|mali|adreno|powervr/.test(gpu)) return "medium";
  return "high";
}

// Picks a starting tier from device hints; `?quality=low|medium|high` overrides.
// The scene then adapts resolution at runtime from measured frame times.
export function detectQuality(): Quality {
  const tier = detectTier();
  const { maxPixelRatio, ...preset } = PRESETS[tier];
  return { tier, pixelRatio: Math.min(window.devicePixelRatio || 1, maxPixelRatio), ...preset };
}

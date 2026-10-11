// HD-2D style "diorama" look: tilt-shift blur, bloom, dusk lighting, fireflies.
// Everything here is render-only; the sim never reads it.
export const ATMOSPHERE = {
  enabled: true,

  tiltShift: {
    // Max blur radius in screen px at the top/bottom edge of the viewport.
    maxBlur: 7,
    // Vertical centre of the sharp band (0 = top, 1 = bottom).
    focus: 0.52,
    // Half-height of the fully sharp band, as a fraction of the viewport.
    band: 0.2,
    // Blur fades out as the camera zooms out so armies stay readable.
    fullZoom: 1.1,
    minZoomFactor: 0.3,
  },

  bloom: {
    strength: 0.55,
    threshold: 0.72,
    radius: 14,
  },

  grade: {
    vignette: 0.42,
    contrast: 1.08,
    saturation: 1.12,
  },

  lighting: {
    // Multiplied over the world; lights punch back towards white.
    ambient: 0x7c84b4,
    buildingLight: 0xffc27a,
    unitLight: 0xffd9a8,
    unitRadius: 78,
    unitIntensity: 0.4,
    // Light map resolution relative to world px.
    mapScale: 0.25,
  },

  fireflies: 70,
} as const;

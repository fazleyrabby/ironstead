// Diorama look for the 3D renderer: tilted perspective camera, low-poly
// models, dusk lighting, tilt-shift and bloom. Render-only; the sim never
// reads it.
export const VIEW3D = {
  camera: {
    fov: 30,
    // Degrees down from the horizon.
    pitch: 42,
    startZoom: 1.15,
  },

  slab: {
    depth: 150,
  },

  tiltShift: {
    // Max blur radius in CSS px at the top/bottom edge of the viewport.
    maxBlur: 6,
    // Vertical centre of the sharp band (0 = top, 1 = bottom).
    focus: 0.55,
    // Half-height of the fully sharp band, as a fraction of the viewport.
    band: 0.2,
    // Close-up only: no blur at play zoom so the whole battlefield stays sharp;
    // it ramps in between these zoom levels.
    startZoom: 1.8,
    fullZoom: 2.5,
  },

  bloom: {
    strength: 0.32,
    radius: 0.55,
    threshold: 0.9,
  },

  grade: {
    vignette: 0.4,
    saturation: 1.1,
  },

  lighting: {
    // Matches the fog-of-war colour so the void and unexplored land read as one.
    background: 0x070912,
    haze: 0x1a2140,
    sky: 0x9aa8e8,
    ground: 0x55486a,
    hemisphere: 2.1,
    sun: 0xffb877,
    sunIntensity: 2.6,
    // Direction the light travels from (x, up, z); low and from the south-west.
    sunFrom: [-0.62, 0.58, 0.52],
    buildingLight: 0xffb060,
  },

  fireflies: 70,
} as const;

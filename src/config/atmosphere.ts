// Toy-diorama look for the 3D renderer: tilted perspective camera, chunky
// models, bright daylight, tilt-shift and bloom. Render-only; the sim never
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
    strength: 0.2,
    radius: 0.5,
    threshold: 0.96,
  },

  grade: {
    vignette: 0.3,
    saturation: 1.18,
  },

  lighting: {
    // Matches the fog-of-war colour so the void and unexplored land read as one.
    background: 0x070912,
    haze: 0x6f9fc8,
    // Blue sky fill gives the shadows their cool tint; green bounce from grass.
    sky: 0xd6e8ff,
    ground: 0x8cab6c,
    hemisphere: 1.85,
    sun: 0xfff0d2,
    sunIntensity: 2.7,
    // Direction the light travels from (x, up, z); mid-morning from the south-west.
    sunFrom: [-0.5, 0.9, 0.42],
    buildingLight: 0xffc070,
    // Window glow is only a hint in daylight.
    buildingLightStrength: 0.25,
  },

  // Drifting pollen motes.
  fireflies: 36,
} as const;

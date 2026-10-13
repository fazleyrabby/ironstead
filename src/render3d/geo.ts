import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  IcosahedronGeometry,
  MeshLambertMaterial,
} from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

// Chunky toy-style modelling helpers. Every part is a non-indexed geometry
// with a flat per-vertex colour so a whole model merges into one mesh and one
// draw call. Shapes are smooth-shaded and big boxes get bevelled edges.

const scratch = new Color();

function paint(geometry: BufferGeometry, color: number): BufferGeometry {
  const flat = geometry.index ? geometry.toNonIndexed() : geometry;
  flat.deleteAttribute("uv");
  scratch.set(color);
  const count = flat.attributes.position.count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) colors.set([scratch.r, scratch.g, scratch.b], i * 3);
  flat.setAttribute("color", new BufferAttribute(colors, 3));
  return flat;
}

// Box standing on y; x/z are its centre.
export function box(w: number, h: number, d: number, color: number, x = 0, y = 0, z = 0): BufferGeometry {
  const thin = Math.min(w, h, d);
  // Only chunky parts are bevelled; thin trim stays a plain (cheap) box.
  const geometry =
    thin >= 3 ? new RoundedBoxGeometry(w, h, d, 1, Math.min(1.5, thin * 0.24)) : new BoxGeometry(w, h, d);
  return paint(geometry, color).translate(x, y + h / 2, z);
}

// Upright cylinder (or frustum) standing on y.
export function cyl(
  rTop: number,
  rBottom: number,
  h: number,
  color: number,
  x = 0,
  y = 0,
  z = 0,
  sides = 10,
): BufferGeometry {
  return paint(new CylinderGeometry(rTop, rBottom, h, sides), color).translate(x, y + h / 2, z);
}

// Cone standing on y. Four sides gives a pyramid whose base edges are axis-aligned.
export function cone(r: number, h: number, color: number, x = 0, y = 0, z = 0, sides = 9): BufferGeometry {
  const geometry = new ConeGeometry(r, h, sides);
  if (sides === 4) geometry.rotateY(Math.PI / 4);
  return paint(geometry, color).translate(x, y + h / 2, z);
}

// Faceted blob centred on (x, y, z), optionally squashed.
export function blob(
  r: number,
  color: number,
  x = 0,
  y = 0,
  z = 0,
  squash = 1,
  detail = 1,
): BufferGeometry {
  return paint(new IcosahedronGeometry(r, detail), color).scale(1, squash, 1).translate(x, y, z);
}

export function rock(r: number, color: number, x = 0, y = 0, z = 0, squash = 0.7, turn = 0): BufferGeometry {
  return paint(new DodecahedronGeometry(r, 0), color).rotateY(turn).scale(1, squash, 1).translate(x, y, z);
}

// Gable roof: a triangular prism sitting on y, ridge along X (or Z when alongZ).
export function gable(
  length: number,
  span: number,
  h: number,
  color: number,
  x = 0,
  y = 0,
  z = 0,
  alongZ = false,
): BufferGeometry {
  const prism = new CylinderGeometry(1, 1, 1, 3);
  // Lay the prism along X with one edge pointing straight up.
  prism.rotateZ(Math.PI / 2).rotateX(-Math.PI / 2);
  prism.translate(0, 0.5, 0).scale(length, h / 1.5, span / 2 / 0.866);
  if (alongZ) prism.rotateY(Math.PI / 2);
  return paint(prism, color).translate(x, y, z);
}

const PRIMS = {
  box: () => new RoundedBoxGeometry(1, 1, 1, 1, 0.22),
  // Plain box for thin plates and blades where a bevel would not read.
  slab: () => new BoxGeometry(1, 1, 1),
  ball: () => new IcosahedronGeometry(1, 1),
  // Rounder sphere for heads and other focal shapes.
  orb: () => new IcosahedronGeometry(1, 2),
  tube: () => new CylinderGeometry(1, 1, 1, 10),
  cone: () => new ConeGeometry(1, 1, 9),
};

// Unit primitive centred on the origin, then scaled, tilted about X and moved.
export function prim(
  kind: keyof typeof PRIMS,
  color: number,
  sx: number,
  sy: number,
  sz: number,
  x: number,
  y: number,
  z: number,
  tiltX = 0,
  tiltZ = 0,
): BufferGeometry {
  const geometry = paint(PRIMS[kind](), color).scale(sx, sy, sz);
  if (tiltX !== 0) geometry.rotateX(tiltX);
  if (tiltZ !== 0) geometry.rotateZ(tiltZ);
  return geometry.translate(x, y, z);
}

export function merge(parts: BufferGeometry[]): BufferGeometry {
  const merged = mergeGeometries(parts, false);
  if (!merged) throw new Error("Failed to merge model parts");
  for (const part of parts) part.dispose();
  return merged;
}

// Shared clock for the foliage sway shader; the scene advances it each frame.
export const swayTime = { value: 0 };

// Toy-like shading: smooth Lambert plus a soft rim that brightens silhouettes.
// `sway` adds a wind bend for instanced foliage.
function toonMaterial(sway: boolean): MeshLambertMaterial {
  const material = new MeshLambertMaterial({ vertexColors: true });
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <envmap_fragment>",
      `float rim = pow(1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0), 2.4);
      outgoingLight += diffuseColor.rgb * rim * 0.42;
      #include <envmap_fragment>`,
    );
    if (!sway) return;
    shader.uniforms.uSwayTime = swayTime;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uSwayTime;")
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          float swayPhase = uSwayTime * 1.7 + instanceMatrix[3].x * 0.031 + instanceMatrix[3].z * 0.047;
          float bend = transformed.y * transformed.y * 0.03;
          transformed.x += sin(swayPhase) * bend;
          transformed.z += cos(swayPhase * 0.8) * bend * 0.6;
        #endif`,
      );
  };
  // Distinct programs for the sway and non-sway variants.
  material.customProgramCacheKey = () => (sway ? "toon-sway" : "toon");
  return material;
}

let shared: MeshLambertMaterial | undefined;
let swaying: MeshLambertMaterial | undefined;

// One lit, vertex-coloured material for every model.
export function modelMaterial(): MeshLambertMaterial {
  shared ??= toonMaterial(false);
  return shared;
}

export function foliageMaterial(): MeshLambertMaterial {
  swaying ??= toonMaterial(true);
  return swaying;
}

// Cartoon silhouette: flares the base and swells the top of a model so it
// reads as chunky and slightly top-heavy. Leaves the footprint centred.
export function chunkify(geometry: BufferGeometry, height: number, flare = 0.09, swell = 0.07): BufferGeometry {
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i += 1) {
    const t = Math.min(1, Math.max(0, position.getY(i) / height));
    const k = 1 + flare * (1 - t) * (1 - t) + swell * t * t;
    position.setX(i, position.getX(i) * k);
    position.setZ(i, position.getZ(i) * k);
  }
  position.needsUpdate = true;
  return geometry;
}

// Damped spring toward a target; the source of every jelly wobble.
export class Spring {
  x: number;
  v = 0;
  target: number;

  constructor(start = 0, target = 0) {
    this.x = start;
    this.target = target;
  }

  kick(impulse: number): void {
    this.v += impulse;
  }

  step(dt: number, stiffness = 170, damping = 11): number {
    const step = Math.min(dt, 1 / 30);
    this.v += (-stiffness * (this.x - this.target) - damping * this.v) * step;
    this.x += this.v * step;
    return this.x;
  }
}

// Deterministic PRNG so models and scatter look the same every run.
export function seeded(seed: number): () => number {
  let s = seed | 0 || 1;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

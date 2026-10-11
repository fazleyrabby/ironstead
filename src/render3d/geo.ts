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
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

// Low-poly modelling helpers. Every part is a non-indexed geometry with a flat
// per-vertex colour so a whole model merges into one mesh and one draw call.

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
  return paint(new BoxGeometry(w, h, d), color).translate(x, y + h / 2, z);
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
  sides = 7,
): BufferGeometry {
  return paint(new CylinderGeometry(rTop, rBottom, h, sides), color).translate(x, y + h / 2, z);
}

// Cone standing on y. Four sides gives a pyramid whose base edges are axis-aligned.
export function cone(r: number, h: number, color: number, x = 0, y = 0, z = 0, sides = 7): BufferGeometry {
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

export function merge(parts: BufferGeometry[]): BufferGeometry {
  const merged = mergeGeometries(parts, false);
  if (!merged) throw new Error("Failed to merge model parts");
  for (const part of parts) part.dispose();
  return merged;
}

let shared: MeshLambertMaterial | undefined;

// One lit, flat-shaded, vertex-coloured material for every static model.
export function modelMaterial(): MeshLambertMaterial {
  shared ??= new MeshLambertMaterial({ vertexColors: true, flatShading: true });
  return shared;
}

// Deterministic PRNG so models and scatter look the same every run.
export function seeded(seed: number): () => number {
  let s = seed | 0 || 1;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

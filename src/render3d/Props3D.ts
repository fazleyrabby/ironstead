import { Color, InstancedMesh, Matrix4, Quaternion, Vector3 } from "three";
import type { BufferGeometry, Scene } from "three";
import type { PropInstance, PropKind } from "../render/WorldScene";
import { blob, box, cone, cyl, foliageMaterial, merge, modelMaterial, rock, seeded } from "./geo";
import { TOON } from "./palette";
import type { Quality } from "./quality";

// Models are built at unit size; an instance is scaled by its 2D prop size.
const TREE_SCALE = 1.35;
const SMALL_SCALE = 1.7;
const TREES: ReadonlySet<PropKind> = new Set<PropKind>(["round", "round_autumn", "pine", "birch", "dead"]);
// Rigid things stay put; everything leafy bends in the wind.
const RIGID: ReadonlySet<PropKind> = new Set<PropKind>(["rock", "boulder", "stump", "mushroom", "dead"]);

export function pineModel(): BufferGeometry {
  return merge([
    cyl(0.07, 0.12, 0.55, TOON.woodDark, 0, 0, 0, 5),
    cone(0.16, 0.14, TOON.woodDark, 0, 0, 0, 5),
    cone(0.64, 0.8, TOON.leafDark, 0, 0.36, 0, 7),
    cone(0.54, 0.75, 0x45993a, 0, 0.74, 0, 7).rotateY(0.5),
    cone(0.43, 0.7, TOON.leaf, 0, 1.1, 0, 7),
    cone(0.31, 0.62, 0x5cb84a, 0, 1.45, 0, 7).rotateY(0.5),
    cone(0.18, 0.5, TOON.leafLight, 0, 1.8, 0, 6),
  ]);
}

function roundTree(leaf: number, light: number, dark: number): BufferGeometry {
  return merge([
    cyl(0.09, 0.14, 0.95, TOON.woodDark, 0, 0, 0, 6),
    // Root flare and a couple of boughs.
    cone(0.22, 0.2, TOON.woodDark, 0, 0, 0, 6),
    cyl(0.04, 0.07, 0.5, TOON.woodDark, 0, 0, 0, 4).rotateZ(0.85).translate(0, 0.72, 0),
    cyl(0.04, 0.07, 0.46, TOON.woodDark, 0, 0, 0, 4).rotateZ(-0.8).rotateY(1.2).translate(0, 0.8, 0),
    blob(0.6, leaf, 0, 1.32, 0, 0.92),
    blob(0.42, light, -0.3, 1.64, 0.14, 0.9, 0),
    blob(0.44, dark, 0.34, 1.12, -0.16, 0.85, 0),
    blob(0.36, leaf, 0.16, 1.5, 0.36, 0.9, 0),
    blob(0.34, dark, -0.34, 1.06, -0.26, 0.9, 0),
    blob(0.26, light, 0.1, 1.86, -0.1, 0.9, 0),
    blob(0.3, leaf, -0.12, 1.18, 0.42, 0.85, 0),
  ]);
}

function model(kind: PropKind): BufferGeometry {
  switch (kind) {
    case "round":
      return roundTree(TOON.leaf, TOON.leafLight, TOON.leafDark);
    case "round_autumn":
      return roundTree(TOON.autumn, TOON.autumnLight, TOON.autumnDark);
    case "pine":
      return pineModel();
    case "birch":
      return merge([
        cyl(0.055, 0.09, 1.2, 0xf0ebe0, 0, 0, 0, 6),
        // Bark scars.
        box(0.1, 0.035, 0.04, 0x3a3a3a, 0.02, 0.24, 0.07),
        box(0.08, 0.035, 0.04, 0x3a3a3a, -0.03, 0.52, 0.065),
        box(0.09, 0.035, 0.04, 0x3a3a3a, 0.01, 0.84, 0.055),
        box(0.04, 0.035, 0.09, 0x3a3a3a, 0.07, 0.4, 0),
        cyl(0.025, 0.045, 0.42, 0xe4ddd0, 0, 0, 0, 4).rotateZ(0.7).translate(0, 0.9, 0),
        blob(0.46, TOON.leafLight, 0, 1.46, 0, 1.2),
        blob(0.3, 0xa4e08c, 0.2, 1.82, 0.1, 1, 0),
        blob(0.28, 0x86cf6e, -0.26, 1.3, 0.12, 1.1, 0),
        blob(0.26, TOON.leafLight, 0.12, 1.2, -0.28, 1.1, 0),
        blob(0.2, 0xb8ea9c, -0.1, 1.96, -0.06, 1, 0),
      ]);
    case "dead":
      return merge([
        cyl(0.05, 0.12, 1.2, TOON.woodDark, 0, 0, 0, 6),
        cone(0.2, 0.16, TOON.woodDark, 0, 0, 0, 6),
        cyl(0.025, 0.05, 0.6, TOON.woodDark, 0, 0, 0, 4).rotateZ(0.9).translate(-0.05, 0.7, 0),
        cyl(0.015, 0.03, 0.3, TOON.woodDark, 0, 0, 0, 4).rotateZ(0.3).translate(-0.5, 1.06, 0),
        cyl(0.025, 0.05, 0.5, TOON.woodDark, 0, 0, 0, 4).rotateZ(-0.8).translate(0.05, 0.5, 0.02),
        cyl(0.015, 0.03, 0.28, TOON.woodDark, 0, 0, 0, 4).rotateZ(-0.2).translate(0.4, 0.84, 0.02),
        cyl(0.02, 0.04, 0.4, TOON.woodDark, 0, 0, 0, 4).rotateX(0.8).translate(0, 0.9, 0),
        cyl(0.02, 0.04, 0.36, TOON.woodDark, 0, 0, 0, 4).rotateX(-0.9).translate(0, 0.62, 0),
        // Hollow and a bracket fungus.
        box(0.07, 0.12, 0.04, 0x241a12, 0, 0.4, 0.09),
        blob(0.09, 0xd8c8a0, 0.1, 0.56, 0.04, 0.4, 0),
      ]);
    case "bush":
      return merge([
        blob(0.5, TOON.leaf, 0, 0.3, 0, 0.72),
        blob(0.32, TOON.leafLight, 0.28, 0.36, 0.14, 0.75, 0),
        blob(0.3, TOON.leafDark, -0.3, 0.26, -0.1, 0.75, 0),
        blob(0.24, TOON.leaf, -0.08, 0.3, 0.36, 0.8, 0),
        blob(0.06, TOON.flowerPink, 0.2, 0.62, 0.3, 1, 0),
        blob(0.06, TOON.flowerPink, -0.22, 0.52, 0.2, 1, 0),
        blob(0.06, TOON.mushroom, 0.02, 0.66, -0.04, 1, 0),
        blob(0.05, TOON.mushroom, 0.4, 0.5, -0.02, 1, 0),
      ]);
    case "rock":
      return merge([
        rock(0.6, TOON.stone, 0, 0.26, 0, 0.7, 0.4),
        rock(0.3, TOON.stoneLight, 0.4, 0.14, 0.25, 0.7, 1.1),
        rock(0.2, TOON.stoneDark, -0.44, 0.1, 0.22, 0.7, 2.3),
        rock(0.12, TOON.stoneLight, 0.1, 0.06, 0.56, 0.7, 0.2),
        blob(0.2, TOON.leafDark, -0.1, 0.62, -0.06, 0.3, 0),
      ]);
    case "boulder":
      return merge([
        rock(0.85, TOON.stone, 0, 0.42, 0, 0.78, 0.2),
        rock(0.45, TOON.stoneLight, -0.55, 0.22, 0.4, 0.7, 0.9),
        rock(0.36, TOON.stoneDark, 0.6, 0.18, 0.3, 0.7, 1.7),
        rock(0.2, TOON.stone, 0.3, 0.1, 0.72, 0.7, 2.9),
        blob(0.3, TOON.leafDark, -0.12, 0.98, 0.1, 0.35, 0),
        blob(0.2, TOON.leaf, 0.24, 0.9, -0.16, 0.35, 0),
        cone(0.05, 0.3, TOON.leafDark, -0.8, 0, 0.1, 3),
        cone(0.05, 0.26, TOON.leaf, -0.9, 0, 0.2, 3),
      ]);
    case "stump":
      return merge([
        cyl(0.36, 0.46, 0.34, TOON.woodDark, 0, 0, 0, 8),
        cyl(0.33, 0.33, 0.04, TOON.woodLight, 0, 0.34, 0, 8),
        cyl(0.2, 0.2, 0.045, TOON.wood, 0, 0.34, 0, 8),
        cyl(0.08, 0.08, 0.05, TOON.woodDark, 0, 0.34, 0, 6),
        // Roots, a sprout and a mushroom.
        cone(0.14, 0.2, TOON.woodDark, 0.4, 0, 0.1, 4),
        cone(0.14, 0.2, TOON.woodDark, -0.34, 0, 0.26, 4),
        cone(0.14, 0.2, TOON.woodDark, -0.1, 0, -0.42, 4),
        cyl(0.02, 0.02, 0.2, TOON.leaf, 0.16, 0.36, -0.1, 4),
        blob(0.08, TOON.leafLight, 0.16, 0.6, -0.1, 0.6, 0),
        cyl(0.03, 0.04, 0.14, 0xf0e6d0, -0.46, 0, -0.1, 5),
        blob(0.11, TOON.mushroom, -0.46, 0.16, -0.1, 0.55, 0),
      ]);
    case "mushroom":
      return merge([
        cyl(0.1, 0.14, 0.42, 0xf0e6d0, 0, 0, 0, 6),
        blob(0.5, TOON.mushroom, 0, 0.44, 0, 0.55, 1),
        cyl(0.42, 0.44, 0.04, 0xf0e6d0, 0, 0.4, 0, 8),
        blob(0.09, 0xffffff, -0.2, 0.64, 0.16, 0.5, 0),
        blob(0.07, 0xffffff, 0.2, 0.62, 0.1, 0.5, 0),
        blob(0.08, 0xffffff, 0.02, 0.7, -0.14, 0.5, 0),
        blob(0.06, 0xffffff, -0.06, 0.56, 0.36, 0.5, 0),
        // Smaller sibling.
        cyl(0.05, 0.07, 0.2, 0xf0e6d0, 0.46, 0, 0.2, 5),
        blob(0.2, TOON.mushroom, 0.46, 0.22, 0.2, 0.55, 0),
      ]);
    case "tall_grass":
      return merge([
        cone(0.07, 0.95, TOON.leafDark, -0.14, 0, 0.03, 3).rotateZ(0.12),
        cone(0.07, 1.1, TOON.leaf, 0.02, 0, -0.06, 3),
        cone(0.07, 0.85, TOON.leafDark, 0.16, 0, 0.05, 3).rotateZ(-0.14),
        cone(0.06, 0.7, TOON.leafLight, 0.05, 0, 0.14, 3).rotateX(0.16),
        cone(0.06, 0.8, TOON.leaf, -0.06, 0, -0.16, 3).rotateX(-0.14),
        cone(0.05, 0.6, TOON.leafLight, 0.24, 0, -0.1, 3).rotateZ(-0.24),
        cone(0.05, 0.64, TOON.leafDark, -0.26, 0, -0.04, 3).rotateZ(0.26),
        blob(0.05, TOON.flowerWhite, 0.02, 1.12, -0.06, 1, 0),
      ]);
    case "reed":
      return merge([
        cyl(0.04, 0.05, 1, TOON.leafDark, 0, 0, 0, 4),
        cyl(0.09, 0.09, 0.26, TOON.wood, 0, 0.9, 0, 5),
        cyl(0.035, 0.045, 0.8, TOON.leaf, 0.16, 0, 0.06, 4).rotateZ(-0.1),
        cyl(0.08, 0.08, 0.22, TOON.woodDark, 0.24, 0.72, 0.06, 5),
        cyl(0.035, 0.045, 0.66, TOON.leafDark, -0.14, 0, -0.08, 4).rotateZ(0.12),
        cyl(0.075, 0.075, 0.2, TOON.wood, -0.22, 0.6, -0.08, 5),
        cone(0.05, 0.7, TOON.leaf, 0.04, 0, 0.16, 3).rotateX(0.3),
        cone(0.05, 0.6, TOON.leafLight, -0.04, 0, -0.18, 3).rotateX(-0.3),
      ]);
  }
}

// Every tree, rock and reed on the map as instanced low-poly meshes.
export function addProps(scene: Scene, props: PropInstance[], quality: Quality): void {
  const byKind = new Map<PropKind, PropInstance[]>();
  const keep = seeded(77);
  for (const prop of props) {
    // Thin out decoration on weaker devices; these props never affect play.
    if (keep() > quality.propDensity) continue;
    const list = byKind.get(prop.kind) ?? [];
    list.push(prop);
    byKind.set(prop.kind, list);
  }

  const rand = seeded(2024);
  const matrix = new Matrix4();
  const position = new Vector3();
  const scale = new Vector3();
  const turn = new Quaternion();
  const up = new Vector3(0, 1, 0);
  const tint = new Color();

  for (const [kind, list] of byKind) {
    const mesh = new InstancedMesh(model(kind), RIGID.has(kind) ? modelMaterial() : foliageMaterial(), list.length);
    mesh.castShadow = quality.shadows;
    mesh.receiveShadow = quality.shadows;
    mesh.frustumCulled = false;

    const base = TREES.has(kind) ? TREE_SCALE : SMALL_SCALE;
    list.forEach((prop, i) => {
      const s = prop.size * base * (0.88 + rand() * 0.24);
      position.set(prop.x, 0, prop.y);
      turn.setFromAxisAngle(up, rand() * Math.PI * 2);
      scale.set(s, s * (0.92 + rand() * 0.2), s);
      mesh.setMatrixAt(i, matrix.compose(position, turn, scale));
      // Per-instance tint so no two neighbours are quite the same shade.
      const shade = 0.82 + rand() * 0.3;
      mesh.setColorAt(i, tint.setRGB(shade * (0.94 + rand() * 0.12), shade, shade * (0.9 + rand() * 0.14)));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    scene.add(mesh);
  }
}

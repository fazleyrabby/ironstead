import { InstancedMesh, Matrix4, Quaternion, Vector3 } from "three";
import type { BufferGeometry, Scene } from "three";
import { STYLE } from "../render/style";
import type { PropInstance, PropKind } from "../render/WorldScene";
import { blob, cone, cyl, merge, modelMaterial, rock, seeded } from "./geo";
import type { Quality } from "./quality";

// Models are built at unit size; an instance is scaled by its 2D prop size.
const TREE_SCALE = 1.35;
const SMALL_SCALE = 1.7;
const TREES: ReadonlySet<PropKind> = new Set<PropKind>(["round", "round_autumn", "pine", "birch", "dead"]);

export function pineModel(): BufferGeometry {
  return merge([
    cyl(0.08, 0.11, 0.5, STYLE.woodDark, 0, 0, 0, 5),
    cone(0.62, 0.95, STYLE.leafDark, 0, 0.38, 0, 7),
    cone(0.48, 0.85, STYLE.leaf, 0, 0.92, 0, 7),
    cone(0.32, 0.75, STYLE.leafLight, 0, 1.45, 0, 7),
  ]);
}

function roundTree(leaf: number, light: number, dark: number): BufferGeometry {
  return merge([
    cyl(0.09, 0.13, 0.95, STYLE.woodDark, 0, 0, 0, 5),
    blob(0.62, leaf, 0, 1.3, 0, 0.92),
    blob(0.4, light, -0.26, 1.62, 0.12, 0.9, 0),
    blob(0.42, dark, 0.3, 1.12, -0.14, 0.85, 0),
  ]);
}

function model(kind: PropKind): BufferGeometry {
  switch (kind) {
    case "round":
      return roundTree(STYLE.leaf, STYLE.leafLight, STYLE.leafDark);
    case "round_autumn":
      return roundTree(STYLE.autumn, STYLE.autumnLight, STYLE.autumnDark);
    case "pine":
      return pineModel();
    case "birch":
      return merge([
        cyl(0.06, 0.09, 1.15, 0xf0ebe0, 0, 0, 0, 5),
        blob(0.5, STYLE.leafLight, 0, 1.45, 0, 1.2),
        blob(0.3, 0xa4e08c, 0.18, 1.8, 0.1, 1, 0),
      ]);
    case "dead":
      return merge([
        cyl(0.05, 0.11, 1.2, STYLE.woodDark, 0, 0, 0, 5),
        cyl(0.025, 0.05, 0.6, STYLE.woodDark, 0, 0, 0, 4).rotateZ(0.9).translate(-0.05, 0.7, 0),
        cyl(0.025, 0.05, 0.5, STYLE.woodDark, 0, 0, 0, 4).rotateZ(-0.8).translate(0.05, 0.5, 0.02),
        cyl(0.02, 0.04, 0.4, STYLE.woodDark, 0, 0, 0, 4).rotateX(0.8).translate(0, 0.9, 0),
      ]);
    case "bush":
      return merge([
        blob(0.5, STYLE.leaf, 0, 0.3, 0, 0.72),
        blob(0.32, STYLE.leafLight, 0.28, 0.36, 0.14, 0.75, 0),
        blob(0.07, STYLE.flowerPink, 0.2, 0.62, 0.3, 1, 0),
      ]);
    case "rock":
      return merge([rock(0.6, STYLE.stone, 0, 0.26, 0, 0.7, 0.4), rock(0.3, STYLE.stoneLight, 0.4, 0.14, 0.25, 0.7, 1.1)]);
    case "boulder":
      return merge([
        rock(0.85, STYLE.stone, 0, 0.42, 0, 0.78, 0.2),
        rock(0.45, STYLE.stoneLight, -0.55, 0.22, 0.4, 0.7, 0.9),
        blob(0.24, STYLE.leafDark, -0.12, 0.98, 0.1, 0.4, 0),
      ]);
    case "stump":
      return merge([cyl(0.36, 0.44, 0.34, STYLE.woodDark), cyl(0.33, 0.33, 0.04, STYLE.woodLight, 0, 0.34)]);
    case "mushroom":
      return merge([cyl(0.1, 0.14, 0.42, 0xf0e6d0, 0, 0, 0, 6), blob(0.5, STYLE.mushroom, 0, 0.44, 0, 0.55, 0)]);
    case "tall_grass":
      return merge([
        cone(0.07, 0.95, STYLE.leafDark, -0.14, 0, 0.03, 3),
        cone(0.07, 1.1, STYLE.leaf, 0.02, 0, -0.06, 3),
        cone(0.07, 0.85, STYLE.leafDark, 0.16, 0, 0.05, 3),
        cone(0.06, 0.7, STYLE.leafLight, 0.05, 0, 0.14, 3),
      ]);
    case "reed":
      return merge([cyl(0.04, 0.05, 1, STYLE.leafDark, 0, 0, 0, 4), cyl(0.09, 0.09, 0.26, STYLE.wood, 0, 0.9, 0, 5)]);
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

  for (const [kind, list] of byKind) {
    const mesh = new InstancedMesh(model(kind), modelMaterial(), list.length);
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
    });
    mesh.instanceMatrix.needsUpdate = true;
    scene.add(mesh);
  }
}

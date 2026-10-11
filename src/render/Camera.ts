import { MathUtils, PerspectiveCamera, Plane, Raycaster, Vector2, Vector3 } from "three";
import { VIEW3D } from "../config/atmosphere";
import { CAMERA, WORLD_HEIGHT, WORLD_WIDTH } from "../config/world";

// Sim space is 2D (x, y); in the scene that maps to (x, 0, z = y) with +Y up.
// The camera sits south of its target looking north and down at a fixed pitch.
export class Camera {
  readonly three: PerspectiveCamera;
  readonly target = new Vector3(WORLD_WIDTH / 2, 0, WORLD_HEIGHT / 2);

  private viewportW = 1;
  private viewportH = 1;
  private zoom = 1;
  private dragging = false;
  private lastX = 0;
  private lastY = 0;
  private readonly keys = new Set<string>();
  private readonly raycaster = new Raycaster();
  private readonly ground = new Plane(new Vector3(0, 1, 0), 0);
  private readonly ndc = new Vector2();
  private readonly hit = new Vector3();
  private readonly projected = new Vector3();

  constructor() {
    this.three = new PerspectiveCamera(VIEW3D.camera.fov, 1, 20, 12000);
    this.apply();
  }

  resize(width: number, height: number): void {
    this.viewportW = Math.max(1, width);
    this.viewportH = Math.max(1, height);
    this.three.aspect = this.viewportW / this.viewportH;
    this.three.updateProjectionMatrix();
    this.apply();
  }

  centerOn(worldX: number, worldY: number, zoom = 1): void {
    this.zoom = Math.min(CAMERA.maxZoom, Math.max(CAMERA.minZoom, zoom));
    this.target.set(worldX, 0, worldY);
    this.apply();
  }

  screenToWorld(screenX: number, screenY: number): { x: number; y: number } {
    this.ndc.set((screenX / this.viewportW) * 2 - 1, -(screenY / this.viewportH) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.three);
    const point = this.raycaster.ray.intersectPlane(this.ground, this.hit);
    if (!point) return { x: this.target.x, y: this.target.z };
    return { x: point.x, y: point.z };
  }

  worldToScreen(worldX: number, worldY: number, height = 0): { x: number; y: number } {
    this.projected.set(worldX, height, worldY).project(this.three);
    return {
      x: (this.projected.x * 0.5 + 0.5) * this.viewportW,
      y: (-this.projected.y * 0.5 + 0.5) * this.viewportH,
    };
  }

  zoomLevel(): number {
    return this.zoom;
  }

  // Distance from the camera to its target; one world unit there spans `zoom` px.
  distance(): number {
    const halfFov = MathUtils.degToRad(VIEW3D.camera.fov / 2);
    return this.viewportH / 2 / Math.tan(halfFov) / this.zoom;
  }

  // Axis-aligned box around the visible ground trapezoid.
  viewBounds(): { x: number; y: number; width: number; height: number } {
    const corners = [
      this.screenToWorld(0, 0),
      this.screenToWorld(this.viewportW, 0),
      this.screenToWorld(0, this.viewportH),
      this.screenToWorld(this.viewportW, this.viewportH),
    ];
    const minX = Math.min(...corners.map((c) => c.x));
    const maxX = Math.max(...corners.map((c) => c.x));
    const minY = Math.min(...corners.map((c) => c.y));
    const maxY = Math.max(...corners.map((c) => c.y));
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  }

  setPanKey(code: string, down: boolean): void {
    if (down) this.keys.add(code);
    else this.keys.delete(code);
  }

  zoomAt(screenX: number, screenY: number, deltaY: number): void {
    const factor = Math.exp(-deltaY * 0.0012);
    const next = Math.min(CAMERA.maxZoom, Math.max(CAMERA.minZoom, this.zoom * factor));
    if (next === this.zoom) return;

    const before = this.screenToWorld(screenX, screenY);
    this.zoom = next;
    this.apply();
    const after = this.screenToWorld(screenX, screenY);
    this.target.x += before.x - after.x;
    this.target.z += before.y - after.y;
    this.apply();
  }

  beginDrag(screenX: number, screenY: number): void {
    this.dragging = true;
    this.lastX = screenX;
    this.lastY = screenY;
  }

  moveDrag(screenX: number, screenY: number): void {
    if (!this.dragging) return;
    const from = this.screenToWorld(this.lastX, this.lastY);
    const to = this.screenToWorld(screenX, screenY);
    this.target.x += from.x - to.x;
    this.target.z += from.y - to.y;
    this.lastX = screenX;
    this.lastY = screenY;
    this.apply();
  }

  endDrag(): void {
    this.dragging = false;
  }

  update(dt: number): void {
    let dx = 0;
    let dy = 0;
    if (this.keys.has("KeyW") || this.keys.has("ArrowUp")) dy -= 1;
    if (this.keys.has("KeyS") || this.keys.has("ArrowDown")) dy += 1;
    if (this.keys.has("KeyA") || this.keys.has("ArrowLeft")) dx -= 1;
    if (this.keys.has("KeyD") || this.keys.has("ArrowRight")) dx += 1;
    if (dx === 0 && dy === 0) return;

    const len = Math.hypot(dx, dy) || 1;
    this.target.x += (dx / len) * CAMERA.panSpeed * dt;
    this.target.z += (dy / len) * CAMERA.panSpeed * dt;
    this.apply();
  }

  private apply(): void {
    this.target.x = Math.min(WORLD_WIDTH, Math.max(0, this.target.x));
    this.target.z = Math.min(WORLD_HEIGHT, Math.max(0, this.target.z));

    const pitch = MathUtils.degToRad(VIEW3D.camera.pitch);
    const distance = this.distance();
    this.three.position.set(
      this.target.x,
      Math.sin(pitch) * distance,
      this.target.z + Math.cos(pitch) * distance,
    );
    this.three.lookAt(this.target);
    this.three.far = distance * 3 + 6000;
    this.three.updateProjectionMatrix();
    this.three.updateMatrixWorld();
  }
}

// First-person walking: mouse look (pointer lock) + WASD / arrows on a
// desktop; on touch screens drag the left half to walk (virtual stick) and
// the right half to look around.

export class Walker {
  yaw = 0;          // radians, three.js rotation.y (0 = looking north, -z)
  pitch = 0;
  private keys = new Set<string>();
  private stick = { id: -1, x0: 0, y0: 0, dx: 0, dy: 0 };
  private look = { id: -1, x: 0, y: 0 };
  onFirstInput: () => void = () => {};

  constructor(el: HTMLElement, private stickEl: HTMLElement) {
    addEventListener("keydown", (e) => { this.keys.add(e.code); this.onFirstInput(); });
    addEventListener("keyup", (e) => this.keys.delete(e.code));
    addEventListener("blur", () => this.keys.clear());
    el.addEventListener("click", () => {
      if (matchMedia("(pointer: fine)").matches) el.requestPointerLock?.();
      this.onFirstInput();
    });
    addEventListener("mousemove", (e) => {
      if (document.pointerLockElement !== el) return;
      this.turn(e.movementX * 0.0022, e.movementY * 0.0022);
    });
    el.addEventListener("pointerdown", (e) => this.down(e));
    el.addEventListener("pointermove", (e) => this.move(e));
    el.addEventListener("pointerup", (e) => this.up(e));
    el.addEventListener("pointercancel", (e) => this.up(e));
  }

  private turn(dx: number, dy: number): void {
    this.yaw -= dx;
    this.pitch = Math.max(-1.3, Math.min(1.3, this.pitch - dy));
  }

  private down(e: PointerEvent): void {
    if (e.pointerType === "mouse") return;
    this.onFirstInput();
    if (e.clientX < innerWidth / 2 && this.stick.id < 0) {
      this.stick = { id: e.pointerId, x0: e.clientX, y0: e.clientY, dx: 0, dy: 0 };
      Object.assign(this.stickEl.style, { display: "block", left: `${e.clientX - 60}px`, top: `${e.clientY - 60}px` });
    } else if (this.look.id < 0) {
      this.look = { id: e.pointerId, x: e.clientX, y: e.clientY };
    }
  }

  private move(e: PointerEvent): void {
    if (e.pointerId === this.stick.id) {
      this.stick.dx = Math.max(-1, Math.min(1, (e.clientX - this.stick.x0) / 60));
      this.stick.dy = Math.max(-1, Math.min(1, (e.clientY - this.stick.y0) / 60));
    } else if (e.pointerId === this.look.id) {
      this.turn((e.clientX - this.look.x) * 0.005, (e.clientY - this.look.y) * 0.005);
      this.look.x = e.clientX;
      this.look.y = e.clientY;
    }
  }

  private up(e: PointerEvent): void {
    if (e.pointerId === this.stick.id) { this.stick.id = -1; this.stick.dx = this.stick.dy = 0; this.stickEl.style.display = "none"; }
    if (e.pointerId === this.look.id) this.look.id = -1;
  }

  /** Desired walking direction in the plan frame (x east, z south), length 0..1. */
  intent(): [number, number] {
    const k = this.keys;
    let f = (k.has("KeyW") || k.has("ArrowUp") ? 1 : 0) - (k.has("KeyS") || k.has("ArrowDown") ? 1 : 0);
    let s = (k.has("KeyD") || k.has("ArrowRight") ? 1 : 0) - (k.has("KeyA") || k.has("ArrowLeft") ? 1 : 0);
    if (k.has("KeyQ")) this.yaw += 0.03;
    if (k.has("KeyE")) this.yaw -= 0.03;
    if (this.stick.id >= 0) { f = -this.stick.dy; s = this.stick.dx; }
    const len = Math.hypot(f, s);
    if (len > 1) { f /= len; s /= len; }
    // forward = (-sin yaw, -cos yaw), right = (cos yaw, -sin yaw)
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    return [-sy * f + cy * s, -cy * f - sy * s];
  }

  get running(): boolean { return this.keys.has("ShiftLeft") || this.keys.has("ShiftRight"); }
}

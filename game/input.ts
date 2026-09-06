export class Input {
  private down = new Set<string>();
  private pressed = new Set<string>();
  /** Pointer target in game space, or null when the player is on the keyboard. */
  pointer: { x: number; y: number } | null = null;
  pointerDown = false;
  /** True only on frames the mouse actually moved, so a resting cursor cannot
   *  fight the arrow keys for the selection. */
  pointerMoved = false;

  private onKeyDown = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();
    if (["arrowup", "arrowdown", "arrowleft", "arrowright", " ", "tab"].includes(k)) e.preventDefault();
    if (!this.down.has(k)) this.pressed.add(k);
    this.down.add(k);
  };
  private onKeyUp = (e: KeyboardEvent) => this.down.delete(e.key.toLowerCase());
  private onBlur = () => this.down.clear();

  attach(el: HTMLElement, toGame: (cx: number, cy: number) => { x: number; y: number }) {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
    el.addEventListener("pointermove", (e) => {
      const next = toGame(e.clientX, e.clientY);
      if (!this.pointer || Math.hypot(next.x - this.pointer.x, next.y - this.pointer.y) > 0.5)
        this.pointerMoved = true;
      this.pointer = next;
    });
    el.addEventListener("pointerleave", () => (this.pointer = null));
    el.addEventListener("pointerdown", (e) => {
      this.pointer = toGame(e.clientX, e.clientY);
      this.pointerDown = true;
      this.pointerMoved = true;
      this.pressed.add("pointer");
    });
    window.addEventListener("pointerup", () => (this.pointerDown = false));
  }

  detach() {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
  }

  held(...keys: string[]) { return keys.some((k) => this.down.has(k)); }
  once(...keys: string[]) { return keys.some((k) => this.pressed.has(k)); }
  /** Call at the end of every frame. */
  flush() { this.pressed.clear(); this.pointerMoved = false; }

  axis() {
    let x = 0, y = 0;
    if (this.held("arrowleft", "a")) x -= 1;
    if (this.held("arrowright", "d")) x += 1;
    if (this.held("arrowup", "w")) y -= 1;
    if (this.held("arrowdown", "s")) y += 1;
    const len = Math.hypot(x, y);
    return len > 0 ? { x: x / len, y: y / len } : { x: 0, y: 0 };
  }
}

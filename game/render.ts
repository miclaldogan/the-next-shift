import { GAME_W, GAME_H, type Frame } from "./types";
import type { Assets } from "./assets";
import type { SceneDef } from "./world";
import type { BitmapFont } from "./font";

export const PAL = {
  ink: "#e9e5d6",
  dim: "#9aa39a",
  gold: "#e8c46a",
  blood: "#c05a4a",
  green: "#8fbf7a",
  panel: "rgba(8,11,10,0.90)",
  panelEdge: "#3d4a41",
};

export interface Drawable {
  frame: Frame;
  x: number;
  y: number;
  scale: number;
  flip?: boolean;
  /** 0..1, shrinks the contact shadow */
  shadow?: number;
  alpha?: number;
}

interface Drop { x: number; y: number; len: number; speed: number; drift: number }

export class Renderer {
  private drops: Drop[] = [];
  private splashes: { x: number; y: number; life: number }[] = [];
  private grain: HTMLCanvasElement;
  private vignette: CanvasGradient | null = null;
  private flashT = 0;
  private nextFlash = 8 + Math.random() * 14;

  constructor(
    public ctx: CanvasRenderingContext2D,
    public assets: Assets,
    public font: BitmapFont,
  ) {
    for (let i = 0; i < 220; i++) this.drops.push(this.newDrop(Math.random() * GAME_H));
    this.grain = document.createElement("canvas");
    this.grain.width = this.grain.height = 128;
    const g = this.grain.getContext("2d")!;
    const img = g.createImageData(128, 128);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 120 + Math.random() * 135;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }

  private newDrop(y = -10): Drop {
    return {
      x: Math.random() * (GAME_W + 90) - 45,
      y,
      len: 5 + Math.random() * 11,
      speed: 260 + Math.random() * 220,
      drift: 26 + Math.random() * 24,
    };
  }

  // ------------------------------------------------------------ sprites --
  sprite(d: Drawable) {
    const { ctx } = this;
    const s = Math.max(0.2, Math.round(d.scale * 20) / 20);
    const w = Math.round(d.frame.w * s);
    const h = Math.round(d.frame.h * s);
    const ax = d.frame.ax * s;
    const ay = d.frame.ay * s;
    const dx = Math.round(d.x - (d.flip ? w - ax : ax));
    const dy = Math.round(d.y - ay);

    if (d.shadow !== 0) {
      const r = (w * 0.42) * (d.shadow ?? 1);
      ctx.save();
      ctx.globalAlpha = 0.34 * (d.shadow ?? 1);
      ctx.fillStyle = "#000";
      ctx.beginPath();
      ctx.ellipse(Math.round(d.x), Math.round(d.y) - 1, r, Math.max(1.5, r * 0.26), 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    ctx.save();
    if (d.alpha !== undefined) ctx.globalAlpha = d.alpha;
    if (d.flip) {
      ctx.translate(dx + w, dy);
      ctx.scale(-1, 1);
      ctx.drawImage(this.assets.atlas, d.frame.x, d.frame.y, d.frame.w, d.frame.h, 0, 0, w, h);
    } else {
      ctx.drawImage(this.assets.atlas, d.frame.x, d.frame.y, d.frame.w, d.frame.h, dx, dy, w, h);
    }
    ctx.restore();
  }

  background(scene: SceneDef) {
    this.ctx.drawImage(this.assets.bg[scene.bg], 0, 0);
  }

  // ------------------------------------------------------------ weather --
  weather(scene: SceneDef, dt: number, t: number) {
    if (scene.weather !== "rain") return;
    const { ctx } = this;
    ctx.save();
    ctx.strokeStyle = "rgba(186,206,220,0.34)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const d of this.drops) {
      d.y += d.speed * dt;
      d.x += d.drift * dt;
      if (d.y > GAME_H) {
        if (Math.random() < 0.5)
          this.splashes.push({ x: d.x, y: scene.floor.bottom + Math.random() * 40, life: 0.32 });
        Object.assign(d, this.newDrop(-12));
      }
      ctx.moveTo(d.x, d.y);
      ctx.lineTo(d.x - d.drift * 0.03, d.y + d.len);
    }
    ctx.stroke();

    ctx.strokeStyle = "rgba(200,220,235,0.30)";
    for (let i = this.splashes.length - 1; i >= 0; i--) {
      const s = this.splashes[i];
      s.life -= dt;
      if (s.life <= 0) { this.splashes.splice(i, 1); continue; }
      const r = (0.32 - s.life) * 26;
      ctx.globalAlpha = s.life / 0.32;
      ctx.beginPath();
      ctx.ellipse(s.x, s.y, r, r * 0.3, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();

    // lightning
    this.nextFlash -= dt;
    if (this.nextFlash <= 0) { this.flashT = 0.42; this.nextFlash = 11 + Math.random() * 22; }
    if (this.flashT > 0) {
      this.flashT -= dt;
      const k = Math.max(0, this.flashT / 0.42);
      const pulse = k > 0.75 ? 1 : k > 0.5 ? 0.25 : k * 0.5;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = `rgba(150,175,205,${0.30 * pulse})`;
      ctx.fillRect(0, 0, GAME_W, GAME_H);
      ctx.restore();
    }
  }

  /** True on the frame lightning strikes, so the engine can fire thunder. */
  consumeThunder() {
    if (this.flashT > 0.40) { this.flashT = 0.399; return true; }
    return false;
  }

  // ----------------------------------------------------------- lighting --
  lights(scene: SceneDef, t: number) {
    const { ctx } = this;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < scene.lights.length; i++) {
      const [x, y, r, s] = scene.lights[i];
      if (s <= 0) continue;
      // fluorescent tubes stutter; each one on its own rhythm
      const n = Math.sin(t * (7.3 + i * 2.1)) * Math.sin(t * (2.7 + i)) ;
      const flicker = scene.ambience === "corridor" || scene.ambience === "room"
        ? 0.82 + 0.18 * n + (Math.random() < 0.006 ? -0.55 : 0)
        : 0.94 + 0.06 * Math.sin(t * 1.7 + i);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(255,226,158,${0.20 * s * flicker})`);
      g.addColorStop(0.45, `rgba(255,208,132,${0.09 * s * flicker})`);
      g.addColorStop(1, "rgba(255,200,120,0)");
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    ctx.restore();
  }

  /**
   * Vignette, scanlines, film grain and a night grade. `mood` (0..100) pulls the
   * whole image with it: low mood closes the vignette in, drains the colour and
   * lifts the grain; high mood opens it back up and warms it slightly.
   */
  grade(t: number, warmth = 0, mood = 55) {
    const { ctx } = this;
    if (!this.vignette) {
      const g = ctx.createRadialGradient(GAME_W / 2, GAME_H / 2, GAME_H * 0.28,
                                         GAME_W / 2, GAME_H / 2, GAME_H * 0.86);
      g.addColorStop(0, "rgba(0,0,0,0)");
      g.addColorStop(1, "rgba(0,0,0,0.62)");
      this.vignette = g;
    }
    const m = Math.max(0, Math.min(1, mood / 100));
    ctx.save();
    ctx.fillStyle = this.vignette;
    ctx.fillRect(0, 0, GAME_W, GAME_H);

    // the room closes in when you are running on empty
    if (m < 0.5) {
      const k = (0.5 - m) * 2;
      const g = ctx.createRadialGradient(GAME_W / 2, GAME_H / 2, GAME_H * (0.30 - 0.16 * k),
                                         GAME_W / 2, GAME_H / 2, GAME_H * 0.80);
      g.addColorStop(0, "rgba(0,0,0,0)");
      g.addColorStop(1, `rgba(2,6,10,${0.55 * k})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, GAME_W, GAME_H);
      ctx.globalCompositeOperation = "saturation";
      ctx.fillStyle = `rgba(128,128,128,${0.5 * k})`;
      ctx.fillRect(0, 0, GAME_W, GAME_H);
      ctx.globalCompositeOperation = "source-over";
    } else if (m > 0.7) {
      const k = (m - 0.7) / 0.3;
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = `rgba(64,50,26,${0.07 * k})`;
      ctx.fillRect(0, 0, GAME_W, GAME_H);
      ctx.globalCompositeOperation = "source-over";
    }

    if (warmth > 0) {
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = `rgba(90,60,20,${0.10 * warmth})`;
      ctx.fillRect(0, 0, GAME_W, GAME_H);
      ctx.globalCompositeOperation = "source-over";
    }

    ctx.globalAlpha = 0.05 + 0.07 * Math.max(0, 0.5 - m) * 2;
    ctx.globalCompositeOperation = "overlay";
    ctx.drawImage(this.grain, -Math.random() * 60, -Math.random() * 60, 256, 256);
    ctx.drawImage(this.grain, 200 - Math.random() * 60, 150 - Math.random() * 60, 256, 256);
    ctx.globalCompositeOperation = "source-over";

    ctx.globalAlpha = 1;
    ctx.fillStyle = "rgba(0,0,0,0.14)";
    for (let y = 0; y < GAME_H; y += 2) ctx.fillRect(0, y, GAME_W, 1);
    ctx.restore();
  }

  fade(a: number) {
    if (a <= 0) return;
    this.ctx.save();
    this.ctx.fillStyle = `rgba(0,0,0,${Math.min(1, a)})`;
    this.ctx.fillRect(0, 0, GAME_W, GAME_H);
    this.ctx.restore();
  }

  // --------------------------------------------------------------- ui ----
  panel(x: number, y: number, w: number, h: number) {
    const { ctx } = this;
    ctx.save();
    ctx.fillStyle = PAL.panel;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = PAL.panelEdge;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    ctx.fillStyle = "rgba(233,229,214,0.10)";
    ctx.fillRect(x + 1, y + 1, w - 2, 1);
    ctx.restore();
  }

  bar(x: number, y: number, w: number, value: number, color: string) {
    const { ctx } = this;
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(x, y, w, 4);
    ctx.fillStyle = color;
    ctx.fillRect(x, y, Math.round(w * Math.max(0, Math.min(1, value))), 4);
    ctx.strokeStyle = "rgba(233,229,214,0.22)";
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, 3);
  }
}

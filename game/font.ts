export interface Glyph { w: number; h: number; adv: number; ox: number; oy: number; x: number; y: number }
export interface FontData { size: number; lineHeight: number; ascent: number; glyphs: Record<string, Glyph> }

export class BitmapFont {
  private tinted = new Map<string, HTMLCanvasElement>();
  constructor(private img: HTMLImageElement, public data: FontData) {}

  static async load(): Promise<BitmapFont> {
    const [img, data] = await Promise.all([
      new Promise<HTMLImageElement>((res, rej) => {
        const i = new Image();
        i.onload = () => res(i);
        i.onerror = () => rej(new Error("font.png"));
        i.src = "/assets/font.png";
      }),
      fetch("/assets/font.json").then((r) => r.json() as Promise<FontData>),
    ]);
    return new BitmapFont(img, data);
  }

  /** The atlas is white; tint once per colour and cache the result. */
  private sheet(color: string) {
    let c = this.tinted.get(color);
    if (c) return c;
    c = document.createElement("canvas");
    c.width = this.img.width; c.height = this.img.height;
    const g = c.getContext("2d")!;
    g.drawImage(this.img, 0, 0);
    g.globalCompositeOperation = "source-in";
    g.fillStyle = color;
    g.fillRect(0, 0, c.width, c.height);
    this.tinted.set(color, c);
    return c;
  }

  width(text: string) {
    let w = 0;
    for (const ch of text) w += (this.data.glyphs[ch] ?? this.data.glyphs[" "]).adv;
    return w;
  }

  draw(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color = "#e8e4d8") {
    const sheet = this.sheet(color);
    let cx = Math.round(x);
    for (const ch of text) {
      const g = this.data.glyphs[ch];
      if (!g) { cx += this.data.glyphs[" "].adv; continue; }
      if (g.w) ctx.drawImage(sheet, g.x, g.y, g.w, g.h, cx + g.ox, Math.round(y) + g.oy, g.w, g.h);
      cx += g.adv;
    }
    return cx - Math.round(x);
  }

  /** Draw with a 1px dark outline so text survives busy backgrounds. */
  drawShadow(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color = "#e8e4d8") {
    this.draw(ctx, text, x + 1, y + 1, "rgba(0,0,0,0.85)");
    return this.draw(ctx, text, x, y, color);
  }

  wrap(text: string, maxWidth: number): string[] {
    const out: string[] = [];
    for (const para of text.split("\n")) {
      let line = "";
      for (const word of para.split(" ")) {
        const probe = line ? `${line} ${word}` : word;
        if (this.width(probe) > maxWidth && line) { out.push(line); line = word; }
        else line = probe;
      }
      out.push(line);
    }
    return out;
  }
}

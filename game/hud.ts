import { GAME_W, GAME_H, SHIFT_END_MIN, type GameState } from "./types";
import { Renderer, PAL } from "./render";
import { UI, END_STEPS } from "./content";

export function clockText(minute: number) {
  const h = Math.floor(minute / 60) % 24;
  const m = Math.floor(minute % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

const PANEL_W = 176;

export function drawHUD(r: Renderer, s: GameState) {
  const { ctx, font } = r;
  const rows: [string, number, string][] = [
    [UI.hud.hunger, s.hunger / 100, s.hunger < 25 ? PAL.blood : "#7fa86a"],
    [UI.hud.fatigue, s.fatigue / 100, s.fatigue > 75 ? PAL.blood : "#b08a4a"],
    [UI.hud.mood, s.mood / 100, s.mood < 30 ? PAL.blood : s.mood > 70 ? "#8fbf7a" : "#6f96b0"],
  ];
  const top = 6;
  const h = 22 + rows.length * 13 + 4;
  r.panel(6, top, PANEL_W, h);

  const urgent = SHIFT_END_MIN - s.minute < 30;
  font.draw(ctx, clockText(s.minute), 14, top + 6, urgent ? PAL.blood : PAL.ink);
  const coins = `${s.coins}¢`;
  font.draw(ctx, coins, 6 + PANEL_W - 12 - font.width(coins), top + 6, PAL.gold);

  // one column for labels, one for bars, so nothing can collide
  const labelX = 14;
  const barX = labelX + 44;
  const barW = 6 + PANEL_W - 12 - barX;
  rows.forEach(([label, value, colour], i) => {
    const y = top + 23 + i * 13;
    font.draw(ctx, label, labelX, y, PAL.dim);
    r.bar(barX, y + 4, barW, value, colour);
  });

  let y = top + h + 4;
  // after 06:00 the mop tasks are over; the strip carries the one remaining
  // instruction instead, because nothing else tells the player what to do
  const endStep = END_STEPS[s.phase];
  const task = s.tasks.find((t) => !t.complete);
  if (endStep) {
    const w = font.width(endStep.text) + 24;
    r.panel(6, y, w, 16);
    font.draw(ctx, "▸", 13, y + 4, PAL.gold);
    font.draw(ctx, endStep.text, 24, y + 4, PAL.ink);
    y += 20;
  } else if (task) {
    const label = task.need > 1 ? `${task.brief}  ${task.done}/${task.need}` : task.brief;
    const w = font.width(label) + 24;
    r.panel(6, y, w, 16);
    font.draw(ctx, "▪", 13, y + 4, PAL.gold);
    font.draw(ctx, label, 24, y + 4, "#c8cdbe");
    y += 20;
  }
  if (s.carrying) {
    const t = `${s.carrying} · ${UI.carrying}`;
    const w = font.width(t) + 18;
    r.panel(6, y, w, 15);
    font.draw(ctx, t, 14, y + 4, PAL.gold);
    y += 19;
  }

  for (const t of s.toasts) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, t.life * 2);
    const col = t.tone === "good" ? PAL.gold : t.tone === "bad" ? PAL.blood : PAL.ink;
    font.drawShadow(ctx, t.text, 14, y, col);
    ctx.restore();
    y += 13;
  }
}

/** The ledger of the night: one line per person, read at 06:00. */
export function drawLedger(r: Renderer, entries: { person: string; line: string }[]) {
  const { ctx, font } = r;
  ctx.save();
  ctx.fillStyle = "rgba(3,5,6,0.90)";
  ctx.fillRect(0, 0, GAME_W, GAME_H);

  font.draw(ctx, UI.ledgerTitle, (GAME_W - font.width(UI.ledgerTitle)) / 2, 26, PAL.gold);
  ctx.fillStyle = PAL.panelEdge;
  ctx.fillRect(60, 44, GAME_W - 120, 1);

  if (!entries.length) {
    font.draw(ctx, UI.ledgerEmpty, (GAME_W - font.width(UI.ledgerEmpty)) / 2, 160, PAL.dim);
  } else {
    // as many as fit; the last person you dealt with matters most, so keep the tail
    const maxRows = 9;
    const shown = entries.slice(-maxRows);
    let y = 58;
    for (const e of shown) {
      font.draw(ctx, e.person, 62, y, PAL.ink);
      y += 13;
      for (const l of font.wrap(e.line, GAME_W - 160)) {
        font.draw(ctx, l, 76, y, PAL.dim);
        y += 13;
      }
      y += 5;
    }
    if (entries.length > maxRows) {
      const more = `…and ${entries.length - maxRows} more`;
      font.draw(ctx, more, 76, y, "#5c655c");
    }
  }

  if (Math.sin(performance.now() / 260) > -0.2)
    font.draw(ctx, UI.ledgerMore, (GAME_W - font.width(UI.ledgerMore)) / 2, GAME_H - 22, PAL.gold);
  ctx.restore();
}

export function drawPrompt(r: Renderer, x: number, y: number, label: string) {
  const { ctx, font } = r;
  const w = font.width(label) + 20;
  const bob = Math.sin(performance.now() / 260) * 1.4;
  const bx = Math.round(Math.max(4, Math.min(GAME_W - w - 4, x - w / 2)));
  const by = Math.round(y + bob);
  r.panel(bx, by, w, 15);
  font.draw(ctx, "E", bx + 5, by + 3, PAL.gold);
  font.draw(ctx, label, bx + 16, by + 3, PAL.ink);
}

/** A pulse over the one thing worth walking to. */
export function drawBeacon(r: Renderer, x: number, y: number) {
  const { ctx } = r;
  const t = performance.now() / 620;
  const pulse = 0.5 + 0.5 * Math.sin(t * Math.PI * 2);
  const cx = Math.round(x);
  const cy = Math.round(y - pulse * 3);

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const g = ctx.createRadialGradient(cx, cy + 6, 0, cx, cy + 6, 26);
  g.addColorStop(0, `rgba(232,196,106,${0.20 + 0.10 * pulse})`);
  g.addColorStop(1, "rgba(232,196,106,0)");
  ctx.fillStyle = g;
  ctx.fillRect(cx - 26, cy - 20, 52, 52);
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = 0.65 + 0.35 * pulse;
  ctx.fillStyle = PAL.gold;
  ctx.beginPath();                 // a chevron pointing down at the thing
  ctx.moveTo(cx - 5, cy - 5);
  ctx.lineTo(cx + 5, cy - 5);
  ctx.lineTo(cx, cy + 2);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/* ---------------------------------------------------------------- speech -- */

export interface SpeechView {
  name?: string;
  portrait?: HTMLImageElement | null;
  text: string;
  visible: number;
  more: boolean;
  /** bottom edge of the box; the choice panel pushes it up */
  bottom?: number;
}

const SPEECH_H = 80;

export function drawSpeech(r: Renderer, d: SpeechView) {
  const { ctx, font } = r;
  const y = (d.bottom ?? GAME_H - 6) - SPEECH_H;
  r.panel(6, y, GAME_W - 12, SPEECH_H);

  let tx = 14;
  if (d.portrait) {
    const s = 58;
    ctx.drawImage(d.portrait, 12, y + 11, s, s);
    ctx.strokeStyle = PAL.panelEdge;
    ctx.strokeRect(12.5, y + 11.5, s - 1, s - 1);
    tx = 12 + s + 10;
  }

  let ty = y + 11;
  if (d.name) { font.draw(ctx, d.name, tx, ty, PAL.gold); ty += 15; }

  let shown = d.visible;
  for (const line of font.wrap(d.text, GAME_W - tx - 22)) {
    if (shown <= 0) break;
    font.draw(ctx, line.slice(0, shown), tx, ty, PAL.ink);
    shown -= line.length + 1;
    ty += 14;
  }

  if (d.more && Math.sin(performance.now() / 200) > -0.2)
    font.draw(ctx, "▸", GAME_W - 24, y + SPEECH_H - 17, PAL.gold);
}

/* --------------------------------------------------------------- choices -- */

export interface Option {
  text: string;
  hint?: string;
  enabled: boolean;
}

/** Shared by the drawing and the mouse hit-test so they cannot drift apart. */
export function choiceLayout(n: number) {
  const rowH = 16;
  const h = 24 + n * rowH + 6;
  const y = GAME_H - h - 6;
  return { x: 6, y, w: GAME_W - 12, h, rowH, firstY: y + 22 };
}

export function choiceAt(n: number, mx: number, my: number): number | null {
  const l = choiceLayout(n);
  if (mx < l.x || mx > l.x + l.w) return null;
  const i = Math.floor((my - l.firstY + 3) / l.rowH);
  return i >= 0 && i < n ? i : null;
}

export function drawChoices(r: Renderer, header: string, options: Option[], selected: number, locked: boolean) {
  const { ctx, font } = r;
  const l = choiceLayout(options.length);
  r.panel(l.x, l.y, l.w, l.h);

  ctx.fillStyle = "rgba(232,196,106,0.07)";
  ctx.fillRect(l.x + 1, l.y + 1, l.w - 2, 17);
  font.draw(ctx, header, l.x + 9, l.y + 5, locked ? "#7a6a44" : PAL.gold);

  options.forEach((c, i) => {
    const oy = l.firstY + i * l.rowH;
    const on = i === selected;
    if (on && !locked) {
      ctx.fillStyle = "rgba(232,196,106,0.14)";
      ctx.fillRect(l.x + 1, oy - 3, l.w - 2, l.rowH);
      font.draw(ctx, "▸", l.x + 8, oy, PAL.gold);
    }
    const col = !c.enabled ? "#5c655c" : on && !locked ? PAL.ink : PAL.dim;
    font.draw(ctx, c.text, l.x + 20, oy, col);
    if (c.hint) {
      const hw = font.width(c.hint);
      font.draw(ctx, c.hint, l.x + l.w - 10 - hw, oy, c.enabled ? PAL.gold : "#5c655c");
    }
  });
  return l;
}

/* ------------------------------------------------------------- narration -- */

export function drawNarration(r: Renderer, text: string, visible: number, more: boolean) {
  const { ctx, font } = r;
  const lines = font.wrap(text, 460);
  const h = lines.length * 15 + 22;
  const y = GAME_H - h - 24;
  r.panel(88, y, 464, h);
  let ty = y + 11;
  let shown = visible;
  for (const line of lines) {
    if (shown <= 0) break;
    font.draw(ctx, line.slice(0, shown), 100, ty, "#cfd6c8");
    shown -= line.length + 1;
    ty += 15;
  }
  if (more && Math.sin(performance.now() / 200) > -0.2)
    font.draw(ctx, "▸", 530, y + h - 16, PAL.gold);
}

export function drawTitle(r: Renderer, t: number, ready: boolean, s: GameState) {
  const { ctx, font } = r;
  ctx.fillStyle = "#05070a";
  ctx.fillRect(0, 0, GAME_W, GAME_H);

  const title = UI.title;
  const w = font.width(title);
  const jitter = Math.random() < 0.04 ? 1 : 0;
  ctx.save();
  for (let i = 0; i < 3; i++) {
    ctx.globalAlpha = 0.12;
    font.draw(ctx, title, (GAME_W - w) / 2 + (i - 1) * 2 + jitter, 74, i === 0 ? "#4aa0c0" : "#c05a4a");
  }
  ctx.globalAlpha = 1;
  font.draw(ctx, title, (GAME_W - w) / 2 + jitter, 74, "#e9e5d6");
  ctx.restore();

  const sub = UI.subtitle;
  font.draw(ctx, sub, (GAME_W - font.width(sub)) / 2, 94, PAL.dim);

  if (s.inheritedShift > 0) {
    const l = `shift #${s.inheritedShift} · ${s.inheritedCoins} coins were left for you`;
    font.draw(ctx, l, (GAME_W - font.width(l)) / 2, 128, PAL.gold);
  }

  // the handovers this one hangs off, read back off the chain
  if (s.chain.length) {
    const head = s.chainVerified ? UI.chainTitle : `${UI.chainTitle} · ${UI.chainBroken}`;
    font.draw(ctx, head, 106, 158, s.chainVerified ? "#5d6a5d" : PAL.blood);
    ctx.fillStyle = PAL.panelEdge;
    ctx.fillRect(106, 172, GAME_W - 212, 1);
    let y = 180;
    for (const rec of s.chain.slice(0, 4)) {
      font.draw(ctx, `#${rec.shift}`, 106, y, PAL.dim);
      const left = `left ${rec.leftCoins}`;
      font.draw(ctx, left, 140, y, rec.leftCoins > 0 ? PAL.gold : "#5c655c");
      const room = GAME_W - 212 - 92;
      let quote = rec.msg ? `"${rec.msg}"` : "—";
      while (font.width(quote) > room && quote.length > 4) quote = `${quote.slice(0, -5)}…"`;
      font.draw(ctx, quote, 198, y, "#7d8a7d");
      y += 13;
    }
  }

  const msg = ready ? UI.press : UI.loading;
  if (!ready || Math.sin(t * 4) > -0.3)
    font.draw(ctx, msg, (GAME_W - font.width(msg)) / 2, 266, ready ? PAL.ink : PAL.dim);

  font.draw(ctx, UI.hint, (GAME_W - font.width(UI.hint)) / 2, 330, "#4d5850");
  r.grade(t);
}

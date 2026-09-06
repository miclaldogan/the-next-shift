import type { SpriteManifest, Anim, Frame } from "./types";

const BG_NAMES = ["corridor", "fire_exit", "outside", "locker_room"] as const;
const PORTRAIT_NAMES = ["father", "nurse", "oldman", "stranger", "intern"] as const;

export interface Assets {
  atlas: HTMLImageElement;
  manifest: SpriteManifest;
  bg: Record<string, HTMLImageElement>;
  portraits: Record<string, HTMLImageElement>;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`failed to load ${src}`));
    img.src = src;
  });
}

export async function loadAssets(onProgress?: (p: number) => void): Promise<Assets> {
  const manifest: SpriteManifest = await fetch("/assets/sprites.json").then((r) => r.json());
  const jobs: Promise<unknown>[] = [];
  let done = 0;
  const total = 1 + BG_NAMES.length + PORTRAIT_NAMES.length;
  const tick = <T,>(p: Promise<T>) =>
    p.then((v) => {
      done++;
      onProgress?.(done / total);
      return v;
    });

  const atlasP = tick(loadImage("/assets/sprites.png"));
  jobs.push(atlasP);

  const bg: Record<string, HTMLImageElement> = {};
  for (const n of BG_NAMES) jobs.push(tick(loadImage(`/assets/bg/${n}.png`)).then((i) => (bg[n] = i)));

  const portraits: Record<string, HTMLImageElement> = {};
  for (const n of PORTRAIT_NAMES)
    jobs.push(tick(loadImage(`/assets/portraits/${n}.png`)).then((i) => (portraits[n] = i)));

  await Promise.all(jobs);
  return { atlas: await atlasP, manifest, bg, portraits };
}

export function anim(a: Assets, key: string): Anim {
  const found = a.manifest.anims[key];
  if (!found) throw new Error(`unknown animation "${key}"`);
  return found;
}

/** Frame for a looping animation at a given elapsed time. */
export function frameAt(a: Anim, t: number): Frame {
  const i = Math.floor(t * a.fps) % a.frames.length;
  return a.frames[i];
}

/** Frame for a one-shot animation; clamps on the last frame. */
export function frameOnce(a: Anim, t: number): Frame {
  const i = Math.min(a.frames.length - 1, Math.floor(t * a.fps));
  return a.frames[i];
}

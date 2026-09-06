import type { CarriableId, SceneId } from "./types";
import type { Pose } from "./content";

export interface Floor { top: number; bottom: number; left: number; right: number }

export interface Exit {
  x: number; y: number; w: number; h: number;
  to: SceneId;
  /** where the player lands in the destination -- keep it clear of that
   *  scene's own exit rectangles or the prompt fires the moment you arrive */
  landing: { x: number; y: number };
  label: string;
}

/**
 * A place a person can be, rather than a person. Stories are dealt into these
 * over the course of the night, so the corridor is never full at 02:00.
 */
export interface Slot {
  id: string;
  pose: Pose;
  /** floor position: drives scale, sorting and how close you have to stand */
  x: number; y: number;
  /** pixels to raise the sprite so it sits on furniture instead of the floor */
  lift?: number;
  flip?: boolean;
  /**
   * The slot only exists while this carryable is in the scene, and it follows
   * the thing around: move the chair and the next person sits where you put it.
   */
  needsProp?: CarriableId;
}

export interface Prop { anim: string; x: number; y: number; flip?: boolean }

export type Interaction = "vending" | "rest" | "locker" | "mirror" | "radio" | "air";

export interface Hotspot {
  id: string;
  kind: Interaction;
  x: number; y: number; w: number; h: number;
  label: string;
}

export interface SceneDef {
  id: SceneId;
  bg: string;
  floor: Floor;
  weather: "rain" | "none";
  ambience: "corridor" | "rain" | "street" | "room";
  /**
   * The four backgrounds are not painted at the same human scale -- the locker
   * room is a much closer shot than the street -- so each scene sizes its
   * people against its own architecture.
   */
  charScale: number;
  exits: Exit[];
  slots: Slot[];
  props: Prop[];
  hotspots: Hotspot[];
  /** spills only appear where there is a reason for them */
  spillArea?: Floor;
  /** warm light sources for the bloom pass: [x, y, radius, strength] */
  lights: [number, number, number, number][];
}

export const SCENES: Record<SceneId, SceneDef> = {
  corridor: {
    id: "corridor",
    bg: "corridor",
    floor: { top: 274, bottom: 348, left: 18, right: 622 },
    weather: "none",
    ambience: "corridor",
    charScale: 1.0,
    exits: [
      { x: 16, y: 268, w: 66, h: 84, to: "locker_room", landing: { x: 120, y: 330 }, label: "STAFF" },
      { x: 556, y: 268, w: 70, h: 84, to: "fire_exit", landing: { x: 180, y: 250 }, label: "FIRE EXIT" },
    ],
    slots: [
      { id: "bench_l", pose: "sit", x: 388, y: 276, lift: 16 },
      { id: "bench_r", pose: "sit", x: 456, y: 276, lift: 16 },
      { id: "chair", pose: "sit", x: 324, y: 302, lift: 3, needsProp: "chair" },
      { id: "floor", pose: "kneel", x: 200, y: 338 },
      { id: "mid", pose: "stand", x: 258, y: 328 },
      { id: "near_exit", pose: "stand", x: 520, y: 322 },
    ],
    props: [],
    hotspots: [
      { id: "vending", kind: "vending", x: 124, y: 262, w: 72, h: 46, label: "COLD DRINKS" },
      { id: "bench", kind: "rest", x: 352, y: 262, w: 140, h: 40, label: "SIT" },
    ],
    spillArea: { top: 288, bottom: 344, left: 60, right: 600 },
    lights: [
      [72, 60, 96, 0.55], [400, 58, 96, 0.5], [590, 60, 96, 0.5],
      [160, 170, 46, 0.35],
    ],
  },

  fire_exit: {
    id: "fire_exit",
    bg: "fire_exit",
    floor: { top: 220, bottom: 266, left: 30, right: 486 },
    weather: "rain",
    ambience: "rain",
    charScale: 1.0,
    exits: [
      { x: 60, y: 208, w: 78, h: 60, to: "corridor", landing: { x: 500, y: 322 }, label: "INSIDE" },
      { x: 452, y: 214, w: 60, h: 56, to: "outside", landing: { x: 430, y: 250 }, label: "DOWN" },
    ],
    slots: [
      { id: "rail", pose: "stand", x: 392, y: 258, flip: true },
      { id: "crouch", pose: "sit", x: 296, y: 262 },
      { id: "pipe", pose: "low", x: 340, y: 264 },
      { id: "door", pose: "stand", x: 178, y: 252 },
    ],
    props: [],
    spillArea: { top: 234, bottom: 262, left: 90, right: 440 },
    hotspots: [],
    lights: [[86, 42, 70, 0.5], [372, 128, 40, 0.3], [478, 128, 34, 0.28]],
  },

  outside: {
    id: "outside",
    bg: "outside",
    floor: { top: 220, bottom: 256, left: 12, right: 628 },
    weather: "rain",
    ambience: "street",
    charScale: 0.84,
    exits: [
      { x: 512, y: 200, w: 110, h: 60, to: "corridor", landing: { x: 500, y: 330 }, label: "EMERGENCY" },
    ],
    slots: [
      { id: "shelter", pose: "sit", x: 52, y: 252, lift: 12 },
      { id: "lamp", pose: "stand", x: 208, y: 250 },
      { id: "kerb", pose: "sit", x: 344, y: 256 },
    ],
    props: [],
    hotspots: [{ id: "lamp_air", kind: "air", x: 138, y: 214, w: 62, h: 44, label: "BREATHE" }],
    lights: [[166, 60, 110, 0.6], [560, 128, 90, 0.45]],
  },

  locker_room: {
    id: "locker_room",
    bg: "locker_room",
    floor: { top: 300, bottom: 350, left: 24, right: 614 },
    weather: "none",
    ambience: "room",
    charScale: 1.42,
    exits: [
      { x: 20, y: 292, w: 66, h: 62, to: "corridor", landing: { x: 120, y: 322 }, label: "CORRIDOR" },
    ],
    slots: [],
    props: [],
    hotspots: [
      { id: "locker", kind: "locker", x: 248, y: 250, w: 78, h: 60, label: "LOCKER 14" },
      { id: "mirror", kind: "mirror", x: 384, y: 268, w: 60, h: 44, label: "MIRROR" },
      { id: "radio", kind: "radio", x: 446, y: 268, w: 56, h: 44, label: "WALKIE" },
      { id: "bench2", kind: "rest", x: 100, y: 274, w: 100, h: 36, label: "SIT" },
    ],
    lights: [[500, 60, 120, 0.7], [500, 160, 60, 0.4]],
  },
};

/** Where the carryable props start the night. */
export const CARRIABLES: Record<CarriableId, { anim: string; scene: SceneId; x: number; y: number }> = {
  sign: { anim: "prop.wet_sign", scene: "corridor", x: 92, y: 344 },
  cart: { anim: "prop.cart", scene: "fire_exit", x: 232, y: 262 },
  chair: { anim: "prop.chair", scene: "corridor", x: 320, y: 301 },
};

export function depthScale(scene: SceneDef, y: number) {
  const f = scene.floor;
  const t = Math.max(0, Math.min(1, (y - f.top) / Math.max(1, f.bottom - f.top)));
  return (0.86 + 0.14 * t) * scene.charScale;
}

export function clampToFloor(f: Floor, x: number, y: number) {
  return {
    x: Math.max(f.left, Math.min(f.right, x)),
    y: Math.max(f.top, Math.min(f.bottom, y)),
  };
}

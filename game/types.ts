export const GAME_W = 640;
export const GAME_H = 360;

/** 02:00 -> 06:00 across this many real seconds. */
export const SHIFT_SECONDS = 420;
export const SHIFT_START_MIN = 2 * 60;
export const SHIFT_END_MIN = 6 * 60;

export type SceneId = "corridor" | "fire_exit" | "outside" | "locker_room";
export type ActionTaken = "helped" | "ignored" | "exploited";

export interface Frame { x: number; y: number; w: number; h: number; ax: number; ay: number }
export interface Anim { fps: number; frames: Frame[] }
export interface SpriteManifest {
  atlas: string;
  atlasSize: [number, number];
  gameSize: [number, number];
  anims: Record<string, Anim>;
}

export interface DecisionLog {
  npcId: string;
  actionTaken: ActionTaken;
  coinDelta: number;
  /** game-minutes burned on this choice */
  timeSpent: number;
  timestamp: string;
  note: string;
}

export type TaskKind = "mop" | "sign" | "visit" | "cart";
export type CarriableId = "sign" | "cart" | "chair";

/** One story from the pool, currently standing in one slot of one scene. */
export interface ActiveStory {
  storyId: string;
  slotId: string;
  scene: SceneId;
  spawnedAt: number;
  resolvedAt?: number;
}

export interface ActiveTask {
  id: string;
  kind: TaskKind;
  brief: string;
  scene?: SceneId;
  need: number;
  done: number;
  reward: number;
  complete: boolean;
}

export interface CarriedProp {
  id: CarriableId;
  anim: string;
  scene: SceneId;
  x: number;
  y: number;
}

export interface Spill {
  id: number;
  scene: SceneId;
  x: number;
  y: number;
  /** 0..1, 1 = untouched */
  amount: number;
  reward: number;
}

export interface GameState {
  phase: "boot" | "intro" | "play" | "shift_end" | "verdict" | "handover" | "done";
  minute: number;              // 120 .. 360
  elapsed: number;             // real seconds inside the shift
  hunger: number;              // 0..100, 0 is starving
  fatigue: number;             // 0..100, 100 is collapsing
  /**
   * 0..100. The night wears it down on its own; what you do to people moves it
   * far more than anything else, and it changes how the whole screen looks.
   */
  mood: number;
  coins: number;
  earned: number;
  spentOnSelf: number;
  spentOnOthers: number;
  scene: SceneId;
  spills: Spill[];
  nextSpillId: number;
  spillTimer: number;
  /** stories on stage right now, and the ones already spent */
  stories: ActiveStory[];
  usedStories: string[];
  storyTimer: number;
  tasks: ActiveTask[];
  props: CarriedProp[];
  carrying: CarriableId | null;
  flags: Record<string, boolean>;
  /** game-minute each flag was raised, so a story can come back "an hour later" */
  flagTimes: Record<string, number>;
  /** mood thresholds already narrated, so they only land once */
  moodMarks: string[];
  /** one line per person, assembled for the 06:00 ledger */
  ledger: { person: string; line: string }[];
  decisions: DecisionLog[];
  inheritedCoins: number;
  inheritedMessage: string;
  inheritedShift: number;
  toasts: { text: string; life: number; tone: "good" | "bad" | "info" }[];
}

export interface ShiftRecord {
  app: "the-next-shift";
  shift: number;
  leftCoins: number;
  msg: string;
  signature?: string;
  explorer?: string;
  simulated?: boolean;
}

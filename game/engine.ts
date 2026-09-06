import {
  GAME_W, GAME_H, SHIFT_SECONDS, SHIFT_START_MIN, SHIFT_END_MIN,
  type GameState, type SceneId, type Spill, type ShiftRecord,
  type ActiveStory, type ActiveTask, type CarriableId, type ShiftChain,
} from "./types";
import { loadAssets, anim, frameAt, frameOnce, type Assets } from "./assets";
import { BitmapFont } from "./font";
import { Renderer, PAL, type Drawable } from "./render";
import { Input } from "./input";
import { audio } from "./audio";
import {
  SCENES, CARRIABLES, depthScale, clampToFloor,
  type SceneDef, type Slot, type Hotspot, type Exit,
} from "./world";
import {
  STORIES, CAST_POSES, CAST_PORTRAITS, CAST_NAMES, TASKS, RADIO_FLAVOUR, VENDING, MOOD_MARKS,
  INTRO, UI, END_STEPS, localVerdict, type Story, type Choice, type VendingItem,
} from "./content";
import {
  drawHUD, drawPrompt, drawSpeech, drawChoices, drawNarration, drawTitle, drawLedger, drawBeacon,
  choiceAt, clockText, type Option,
} from "./hud";

const STORY_BY_ID: Record<string, Story> = Object.fromEntries(STORIES.map((s) => [s.id, s]));
const TYPE_CPS = 46;
/** Stops a mashed E from picking the first option the instant it appears. */
const CHOICE_LOCK = 0.32;

type Target =
  | { kind: "story"; active: ActiveStory; x: number; y: number; label: string }
  | { kind: "hotspot"; spot: Hotspot; x: number; y: number; label: string }
  | { kind: "exit"; exit: Exit; x: number; y: number; label: string }
  | { kind: "prop"; id: CarriableId; x: number; y: number; label: string };

interface Player {
  x: number; y: number; facing: 1 | -1;
  moving: boolean; mopping: boolean;
  t: number; mopT: number; stepT: number;
  civ: boolean;
}

export interface GameHooks {
  onPhase?: (phase: GameState["phase"]) => void;
  onHandover?: (state: GameState) => void;
  onLoaded?: () => void;
  onStatus?: (line: string) => void;
}

export class Game {
  private ctx: CanvasRenderingContext2D;
  private r!: Renderer;
  private assets!: Assets;
  private font!: BitmapFont;
  private input = new Input();
  private raf = 0;
  private last = 0;
  private time = 0;
  private running = false;

  state: GameState = freshState();
  private player: Player = {
    x: 300, y: 330, facing: 1, moving: false, mopping: false, t: 0, mopT: 0, stepT: 0, civ: false,
  };
  private fade = 1;
  private fadeDir: 0 | 1 | -1 = -1;
  private pendingScene: { to: SceneId; x: number; y: number } | null = null;

  /** Someone is speaking, or the game is narrating. */
  private dlg: {
    kind: "speech" | "narration";
    name?: string;
    portrait?: string | null;
    lines: string[];
    idx: number;
    chars: number;
    onDone?: () => void;
  } | null = null;

  /** A list the player has to pick from: story choices, or the vending machine. */
  private menu: {
    header: string;
    options: Option[];
    selected: number;
    lock: number;
    onPick: (i: number) => void;
    cancellable: boolean;
  } | null = null;

  private firedRadio = new Set<number>();
  private target: Target | null = null;
  private cutscene: { kind: "undress"; t: number } | null = null;
  private ready = false;
  private titleT = 0;
  private ledgerOpen = false;
  private ledgerNext: (() => void) | null = null;
  private finalRecord: ShiftRecord | null = null;

  constructor(private canvas: HTMLCanvasElement, private hooks: GameHooks = {}) {
    const c = canvas.getContext("2d", { alpha: false });
    if (!c) throw new Error("no 2d context");
    this.ctx = c;
    this.ctx.imageSmoothingEnabled = false;
  }

  // ------------------------------------------------------------- boot ----
  async boot() {
    [this.assets, this.font] = await Promise.all([loadAssets(), BitmapFont.load()]);
    this.r = new Renderer(this.ctx, this.assets, this.font);
    this.input.attach(this.canvas, (cx, cy) => {
      const b = this.canvas.getBoundingClientRect();
      return { x: ((cx - b.left) / b.width) * GAME_W, y: ((cy - b.top) / b.height) * GAME_H };
    });
    this.ready = true;
    this.hooks.onLoaded?.();
    this.loadShift();
    this.running = true;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.tick);
  }

  destroy() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.input.detach();
  }

  private async loadShift() {
    const s = this.state;
    try {
      const res = await fetch("/api/solana/shift");
      const j = (await res.json()) as ShiftRecord & { error?: string };
      if (!j.error) {
        s.inheritedCoins = j.leftCoins ?? 12;
        s.inheritedMessage = j.msg ?? "";
        s.inheritedShift = j.shift ?? 1;
        s.inheritedSignature = j.signature ?? "";
        s.coins = s.inheritedCoins;
        if (j.simulated) this.hooks.onStatus?.("devnet not configured — running on a local ledger");
        // the voice takes a second to come back; ask for it before it is needed
        if (s.inheritedMessage) void this.speak(s.inheritedMessage, "previous", true);
      }
    } catch {
      this.hooks.onStatus?.("devnet unreachable — running on a local ledger");
    }

    try {
      const chain = (await fetch("/api/solana/chain").then((r) => r.json())) as ShiftChain;
      s.chain = chain.shifts ?? [];
      s.chainVerified = chain.verified ?? false;
    } catch { /* the title screen simply shows nothing */ }
  }

  // ------------------------------------------------------------- loop ----
  private tick = (now: number) => {
    if (!this.running) return;
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.time += dt;
    this.update(dt);
    this.draw(dt);
    this.input.flush();
    this.raf = requestAnimationFrame(this.tick);
  };

  private scene(): SceneDef { return SCENES[this.state.scene]; }

  private update(dt: number) {
    const s = this.state;

    if (this.fadeDir === 1) {
      this.fade = Math.min(1, this.fade + dt * 2.6);
      if (this.fade >= 1 && this.pendingScene) {
        s.scene = this.pendingScene.to;
        this.player.x = this.pendingScene.x;
        this.player.y = this.pendingScene.y;
        this.pendingScene = null;
        audio.setAmbience(this.scene().ambience);
        this.fadeDir = -1;
      }
    } else if (this.fadeDir === -1) {
      this.fade = Math.max(0, this.fade - dt * 2.2);
      if (this.fade <= 0) this.fadeDir = 0;
    }

    if (s.phase === "boot") {
      this.titleT += dt;
      if (this.ready && this.input.once("enter", " ", "pointer")) this.beginIntro();
      return;
    }

    for (let i = s.toasts.length - 1; i >= 0; i--) {
      s.toasts[i].life -= dt;
      if (s.toasts[i].life <= 0) s.toasts.splice(i, 1);
    }

    if (this.ledgerOpen) {
      if (this.input.once("e", "enter", " ", "pointer")) {
        this.ledgerOpen = false;
        const next = this.ledgerNext;
        this.ledgerNext = null;
        next?.();
      }
      return;
    }
    if (this.menu) { this.updateMenu(dt); return; }
    if (this.dlg) { this.updateDialogue(dt); return; }
    if (this.cutscene) { this.updateCutscene(dt); return; }

    if (s.phase === "play") this.updateShift(dt);
    else this.updatePlayer(dt, false);
  }

  // ------------------------------------------------------------ shift ----
  private updateShift(dt: number) {
    const s = this.state;
    s.elapsed += dt;
    s.minute = SHIFT_START_MIN + (s.elapsed / SHIFT_SECONDS) * (SHIFT_END_MIN - SHIFT_START_MIN);

    s.hunger = Math.max(0, s.hunger - dt * (100 / SHIFT_SECONDS) * 1.25);
    const effort = (this.player.moving ? 1 : 0.35) + (this.player.mopping ? 1.6 : 0);
    s.fatigue = Math.min(100, s.fatigue + dt * (100 / SHIFT_SECONDS) * 0.75 * effort);

    // the night takes mood off you on its own, and takes more when you are
    // hungry or wrecked; people are what puts it back
    const grind = 0.42 + (s.hunger < 20 ? 0.3 : 0) + (s.fatigue > 85 ? 0.3 : 0);
    s.mood = Math.max(0, s.mood - dt * (100 / SHIFT_SECONDS) * grind);
    this.checkMoodMarks();

    this.updateTasks();
    this.updateStories(dt);
    this.updateSpills(dt);
    this.updatePlayer(dt, false);

    if (s.minute >= SHIFT_END_MIN) this.endShift();
  }

  /* --------------------------------------------------------------- mood -- */

  private setFlag(name: string) {
    const s = this.state;
    if (s.flags[name]) return;
    s.flags[name] = true;
    s.flagTimes[name] = s.minute;
  }

  private adjustMood(delta: number) {
    if (!delta) return;
    const s = this.state;
    s.mood = Math.max(0, Math.min(100, s.mood + delta));
  }

  /** Narrate a threshold the first time the player crosses it. */
  private checkMoodMarks() {
    const s = this.state;
    if (this.dlg || this.menu) return;
    for (const m of MOOD_MARKS) {
      if (s.moodMarks.includes(m.id)) continue;
      const hit =
        (m.below !== undefined && s.mood <= m.below) ||
        (m.above !== undefined && s.mood >= m.above);
      if (!hit) continue;
      s.moodMarks.push(m.id);
      this.narrate(m.lines);
      return;
    }
  }

  /**
   * Where a slot actually is. A slot tied to a carryable follows it around, so
   * moving the corridor chair moves the person who will sit in it -- and while
   * the chair is in your hands the slot does not exist at all.
   */
  private slotPos(sceneId: SceneId, slot: Slot): { x: number; y: number; lift: number } | null {
    const lift = slot.lift ?? 0;
    if (!slot.needsProp) return { x: slot.x, y: slot.y, lift };
    const pr = this.state.props.find((p) => p.id === slot.needsProp);
    if (!pr || pr.scene !== sceneId || this.state.carrying === slot.needsProp) return null;
    return { x: pr.x + 4, y: pr.y + 1, lift };
  }

  /** Is anyone using this slot right now? */
  private slotOccupied(slotId: string) {
    return this.state.stories.some((a) => a.slotId === slotId);
  }

  /* ------------------------------------------------------------ stories -- */

  /**
   * The night fills up gradually: a scene holds at most one or two people, and
   * whoever you have already dealt with wanders off after a while so somebody
   * else can take the slot.
   */
  private updateStories(dt: number) {
    const s = this.state;
    s.stories = s.stories.filter(
      (a) => a.resolvedAt === undefined || s.minute < a.resolvedAt + 24,
    );
    s.storyTimer -= dt;
    if (s.storyTimer > 0) return;
    s.storyTimer = 8 + Math.random() * 8;
    this.trySpawnStory();
  }

  private trySpawnStory(force?: SceneId) {
    const s = this.state;
    const scenes: SceneId[] = force ? [force] : ["corridor", "fire_exit", "outside"];
    for (const id of scenes) {
      const scene = SCENES[id];
      const live = s.stories.filter((a) => a.scene === id && a.resolvedAt === undefined);
      if (live.length >= (id === "corridor" ? 2 : 1)) continue;

      // one sprite is one person: they cannot be on two benches at once, in
      // this scene or any other
      const busy = new Set(
        s.stories.map((a) => STORY_BY_ID[a.storyId]?.cast).filter(Boolean) as string[],
      );
      const taken = new Set(s.stories.filter((a) => a.scene === id).map((a) => a.slotId));
      const free = scene.slots.filter((sl) => !taken.has(sl.id) && this.slotPos(id, sl));
      const flagReady = (st: Story) => {
        if (!st.needsFlag) return true;
        if (!s.flags[st.needsFlag]) return false;
        return s.minute >= (s.flagTimes[st.needsFlag] ?? 0) + (st.delayAfterFlag ?? 0);
      };
      const pool = STORIES.filter(
        (st) =>
          st.scene === id &&
          !busy.has(st.cast) &&
          !s.usedStories.includes(st.id) &&
          (st.fromMinute ?? 0) <= s.minute &&
          flagReady(st) &&
          (!st.blockedByFlag || !s.flags[st.blockedByFlag]) &&
          free.some((sl) => sl.pose === st.pose),
      );
      if (!pool.length) continue;

      const st = pool[Math.floor(Math.random() * pool.length)];
      const slot = free.find((sl) => sl.pose === st.pose)!;
      s.stories.push({ storyId: st.id, slotId: slot.id, scene: id, spawnedAt: s.minute });
      s.usedStories.push(st.id);
      return true;
    }
    return false;
  }

  /* -------------------------------------------------------------- tasks -- */

  private updateTasks() {
    const s = this.state;
    for (const def of TASKS) {
      if (s.minute < def.at || s.tasks.some((t) => t.id === def.id)) continue;
      s.tasks.push({
        id: def.id, kind: def.kind, brief: def.brief, scene: def.scene,
        need: def.count ?? 1, done: 0, reward: def.reward, complete: false,
      });
      this.radio(def.radio);
      return;
    }
    for (const f of RADIO_FLAVOUR) {
      if (s.minute >= f.at && !this.firedRadio.has(f.at)) {
        this.firedRadio.add(f.at);
        this.radio(f.text);
        return;
      }
    }
    for (const t of s.tasks)
      if (!t.complete && t.kind === "visit" && t.scene === s.scene) this.completeTask(t);
  }

  private completeTask(t: ActiveTask) {
    t.complete = true;
    t.done = t.need;
    this.state.coins += t.reward;
    this.state.earned += t.reward;
    this.adjustMood(3);
    audio.coin();
    this.toast(`${UI.taskDone} · +${t.reward}¢`, "good");
  }

  private creditTask(kind: ActiveTask["kind"], scene?: SceneId) {
    for (const t of this.state.tasks) {
      if (t.complete || t.kind !== kind) continue;
      if (t.scene && scene && t.scene !== scene) continue;
      t.done++;
      if (t.done >= t.need) this.completeTask(t);
      return;
    }
  }

  /* ------------------------------------------------------------- spills -- */

  private updateSpills(dt: number) {
    const s = this.state;
    const area = this.scene().spillArea;
    s.spillTimer -= dt;
    if (area && s.spillTimer <= 0) {
      s.spillTimer = 11 + Math.random() * 10;
      if (s.spills.filter((p) => p.scene === s.scene).length < 3) {
        s.spills.push({
          id: s.nextSpillId++,
          scene: s.scene,
          x: area.left + Math.random() * (area.right - area.left),
          y: area.top + Math.random() * (area.bottom - area.top),
          amount: 1,
          reward: 2 + Math.floor(Math.random() * 3),
        });
      }
    }
  }

  private nearestSpill(): Spill | null {
    const p = this.player;
    let best: Spill | null = null;
    let bd = 34;
    for (const sp of this.state.spills) {
      if (sp.scene !== this.state.scene) continue;
      const d = Math.hypot(sp.x - p.x, (sp.y - p.y) * 2);
      if (d < bd) { bd = d; best = sp; }
    }
    return best;
  }

  /* ------------------------------------------------------------- player -- */

  private updatePlayer(dt: number, frozen: boolean) {
    const p = this.player;
    const sc = this.scene();
    const s = this.state;

    const drag = 1 - (s.fatigue > 80 ? 0.28 : 0) - (s.hunger < 15 ? 0.2 : 0) - (s.mood < 20 ? 0.12 : 0);
    const speed = 96 * Math.max(0.45, drag) * (s.carrying === "cart" ? 0.8 : 1);

    const ax = frozen ? { x: 0, y: 0 } : this.input.axis();
    p.moving = ax.x !== 0 || ax.y !== 0;
    if (ax.x !== 0) p.facing = ax.x > 0 ? 1 : -1;
    if (p.moving) {
      const moved = clampToFloor(sc.floor, p.x + ax.x * speed * dt, p.y + ax.y * speed * 0.62 * dt);
      p.x = moved.x; p.y = moved.y;
      p.stepT += dt;
      if (p.stepT > 0.28) { p.stepT = 0; audio.step(); }
    }
    p.t += dt;

    const spill = this.nearestSpill();
    p.mopping = false;
    if (!frozen && spill && this.input.held(" ") && s.phase === "play") {
      p.mopping = true;
      p.mopT += dt;
      spill.amount -= dt * 0.55;
      if (p.mopT > 0.34) { p.mopT = 0; audio.mop(); }
      if (spill.amount <= 0) {
        s.spills = s.spills.filter((x) => x !== spill);
        s.coins += spill.reward;
        s.earned += spill.reward;
        s.fatigue = Math.min(100, s.fatigue + 3);
        audio.coin();
        this.toast(`+${spill.reward}¢`, "good");
        this.creditTask("mop", s.scene);
      }
    }

    this.target = this.findTarget();
    if (frozen) return;
    if (this.input.once("e", "enter")) {
      if (this.target) this.activate(this.target);
      else if (s.carrying) this.setDown();
    }
  }

  /* ------------------------------------------------------------ targets -- */

  private findTarget(): Target | null {
    const p = this.player;
    const sc = this.scene();
    const s = this.state;
    let best: Target | null = null;
    let bd = 999;

    const consider = (t: Target, reach = 54) => {
      const d = Math.hypot(t.x - p.x, (t.y - p.y) * 1.6);
      if (d < reach && d < bd) { bd = d; best = t; }
    };

    if (s.phase === "play") {
      for (const a of s.stories) {
        if (a.scene !== s.scene) continue;
        const slot = sc.slots.find((x) => x.id === a.slotId);
        const st = STORY_BY_ID[a.storyId];
        const pos = slot ? this.slotPos(s.scene, slot) : null;
        if (!st || !pos) continue;
        consider({
          kind: "story", active: a, x: pos.x, y: pos.y,
          label: a.resolvedAt === undefined ? CAST_NAMES[st.cast] : "talk",
        });
      }
      for (const pr of s.props) {
        if (pr.scene !== s.scene || s.carrying === pr.id) continue;
        consider({ kind: "prop", id: pr.id, x: pr.x, y: pr.y, label: `PICK UP ${pr.id.toUpperCase()}` }, 44);
      }
    }
    for (const h of sc.hotspots) consider({ kind: "hotspot", spot: h, x: h.x + h.w / 2, y: h.y + h.h, label: h.label });
    for (const e of sc.exits) {
      if (s.phase !== "play") continue;
      consider({ kind: "exit", exit: e, x: e.x + e.w / 2, y: e.y + e.h, label: e.label });
    }
    return best;
  }

  private activate(t: Target) {
    audio.click();
    if (t.kind === "exit") return this.goTo(t.exit.to, t.exit.landing.x, t.exit.landing.y);
    if (t.kind === "story") return this.startStory(t.active);
    if (t.kind === "prop") return this.pickUp(t.id);
    this.useHotspot(t.spot);
  }

  /* ---------------------------------------------------------- carriables -- */

  private pickUp(id: CarriableId) {
    const s = this.state;
    const holder = SCENES[s.scene].slots.find((sl) => sl.needsProp === id);
    if (holder && this.slotOccupied(holder.id)) return this.toast(UI.occupied, "bad");
    if (s.carrying) this.setDown();
    s.carrying = id;
    this.toast(`picked up the ${id}`, "info");
  }

  private setDown() {
    const s = this.state;
    const id = s.carrying;
    if (!id) return;
    const prop = s.props.find((p) => p.id === id)!;
    prop.scene = s.scene;
    prop.x = this.player.x + this.player.facing * 16;
    prop.y = this.player.y;
    s.carrying = null;
    audio.click();

    if (id === "sign") {
      const near = s.spills.some(
        (sp) => sp.scene === s.scene && Math.hypot(sp.x - prop.x, (sp.y - prop.y) * 2) < 70,
      );
      if (near) this.creditTask("sign", s.scene);
      else this.toast("nobody is going to slip there", "info");
    }
    if (id === "cart" && s.scene === "locker_room") this.creditTask("cart");
  }

  /* ----------------------------------------------------------- hotspots -- */

  private useHotspot(h: Hotspot) {
    const s = this.state;
    switch (h.kind) {
      case "vending": return this.openVending();
      case "rest":
        s.fatigue = Math.max(0, s.fatigue - 30);
        this.adjustMood(2);
        this.spendTime(20);
        this.toast("-20 min · you sit down", "info");
        return;
      case "air":
        s.fatigue = Math.max(0, s.fatigue - 18);
        this.adjustMood(4);
        this.spendTime(12);
        this.narrate([
          "You stand under the lamp and let the rain hit your face for a while.",
          "Four floors of windows above you. Two of them are still lit.",
        ]);
        return;
      case "radio":
        if (s.phase === "handover") return this.hooks.onHandover?.(s);
        audio.walkie();
        return this.narrate(
          s.inheritedMessage
            ? ["The set only receives. It plays the same thing every night:", `"${s.inheritedMessage}"`]
            : ["The set only receives. Tonight there is nothing on it but carrier hiss."],
        );
      case "locker":
        if (s.phase === "shift_end") { this.cutscene = { kind: "undress", t: 0 }; return; }
        return this.narrate(["Locker 14. Yours until somebody else needs it."]);
      case "mirror":
        if (s.phase === "verdict") return this.startVerdict();
        return this.narrate([
          "The crack runs from your left eye to the corner of the frame.",
          "You have stopped noticing it.",
        ]);
    }
  }

  private openVending() {
    const s = this.state;
    const options: Option[] = VENDING.map((v) => ({
      text: `${v.label} — ${v.blurb}`,
      hint: `${v.price}¢`,
      enabled: v.price <= s.coins,
    }));
    options.push({ text: UI.leave, enabled: true });
    this.menu = {
      header: UI.vending,
      options,
      selected: 0,
      lock: 0.2,
      cancellable: true,
      onPick: (i) => { if (i < VENDING.length) this.buy(VENDING[i]); },
    };
  }

  private buy(v: VendingItem) {
    const s = this.state;
    s.coins -= v.price;
    s.spentOnSelf += v.price;
    this.spendTime(5);
    audio.spend();
    // the machine that eats coins: the memo the last player left warns about it
    if (Math.random() < 0.16) {
      this.setFlag("machine_ate");
      this.adjustMood(-4);
      return this.toast(UI.machineAte, "bad");
    }
    if (v.hunger) s.hunger = Math.min(100, s.hunger + v.hunger);
    if (v.fatigue) s.fatigue = Math.max(0, Math.min(100, s.fatigue + v.fatigue));
    this.adjustMood(v.mood ?? 0);
    this.toast(`-${v.price}¢ · ${UI.ate}`, "info");
  }

  private spendTime(minutes: number) {
    this.state.elapsed += (minutes / (SHIFT_END_MIN - SHIFT_START_MIN)) * SHIFT_SECONDS;
  }

  private toast(text: string, tone: "good" | "bad" | "info") {
    this.state.toasts.push({ text, life: 2.8, tone });
    if (this.state.toasts.length > 4) this.state.toasts.shift();
  }

  private goTo(to: SceneId, x: number, y: number) {
    audio.door();
    this.pendingScene = { to, x, y };
    this.fadeDir = 1;
  }

  /* ----------------------------------------------------------- dialogue -- */

  private narrate(lines: string[], onDone?: () => void) {
    this.dlg = { kind: "narration", lines, idx: 0, chars: 0, onDone };
  }

  private radio(text: string) {
    audio.walkie();
    this.narrate([`◤ RADIO ◢  ${text}`]);
    this.speak(text, "nurse");
  }

  /** The story is told first; the question comes after it, on its own panel. */
  private startStory(active: ActiveStory) {
    const st = STORY_BY_ID[active.storyId];
    if (!st) return;
    const done = active.resolvedAt !== undefined;
    if (!done && st.mood) this.adjustMood(st.mood);
    const portrait = CAST_PORTRAITS[st.cast] ?? null;
    this.dlg = {
      // the cat has no portrait and no voice, so it is narrated about
      kind: portrait ? "speech" : "narration",
      name: CAST_NAMES[st.cast],
      portrait,
      lines: done ? st.resolved : st.lines,
      idx: 0,
      chars: 0,
      onDone: done ? undefined : () => this.askChoice(st, active),
    };
  }

  private askChoice(st: Story, active: ActiveStory) {
    const s = this.state;
    this.menu = {
      header: st.prompt ? st.prompt.toUpperCase() : UI.whatDo,
      selected: 0,
      lock: CHOICE_LOCK,
      cancellable: false,
      options: st.choices.map((c) => ({
        text: c.text,
        enabled: (c.coinCost ?? 0) <= s.coins,
        hint: c.coinCost ? `-${c.coinCost}¢` : c.coinGain ? `+${c.coinGain}¢` : c.timeCost ? `${c.timeCost}m` : undefined,
      })),
      onPick: (i) => this.applyChoice(st, active, st.choices[i]),
    };
  }

  private applyChoice(st: Story, active: ActiveStory, c: Choice) {
    const s = this.state;
    if (c.coinCost) { s.coins -= c.coinCost; s.spentOnOthers += c.coinCost; audio.spend(); }
    if (c.coinGain) { s.coins += c.coinGain; s.earned += c.coinGain; audio.coin(); }
    if (c.hungerCost) s.hunger = Math.max(0, s.hunger - c.hungerCost);
    if (c.timeCost) this.spendTime(c.timeCost);
    for (const f of c.sets ?? []) this.setFlag(f);
    this.adjustMood(c.mood ?? 0);
    if (c.toast) this.toast(c.toast, c.coinGain ? "good" : "info");

    // the ledger keeps one line per person: a follow-up overwrites the first
    // account of them, because it is the one that turned out to be true
    const line = c.outcome ?? c.note;
    const person = CAST_NAMES[st.cast];
    const seen = s.ledger.findIndex((e) => e.person === person);
    if (seen >= 0) s.ledger[seen] = { person, line };
    else s.ledger.push({ person, line });

    s.decisions.push({
      npcId: st.id,
      actionTaken: c.action,
      coinDelta: (c.coinGain ?? 0) - (c.coinCost ?? 0),
      timeSpent: c.timeCost ?? 0,
      timestamp: clockText(s.minute),
      note: c.note,
    });

    active.resolvedAt = s.minute;

    const replyPortrait = CAST_PORTRAITS[st.cast] ?? null;
    this.dlg = {
      kind: replyPortrait ? "speech" : "narration",
      name: CAST_NAMES[st.cast],
      portrait: replyPortrait,
      lines: c.reply,
      idx: 0,
      chars: 0,
    };
  }

  private updateDialogue(dt: number) {
    const d = this.dlg!;
    const line = d.lines[d.idx] ?? "";
    if (d.chars < line.length) {
      const before = Math.floor(d.chars);
      d.chars = Math.min(line.length, d.chars + TYPE_CPS * dt);
      if (Math.floor(d.chars) > before && Math.floor(d.chars) % 3 === 0) audio.type();
      if (this.input.once("e", " ", "enter", "pointer")) d.chars = line.length;
      return;
    }
    if (this.input.once("e", " ", "enter", "pointer")) {
      if (d.idx < d.lines.length - 1) { d.idx++; d.chars = 0; return; }
      const cb = d.onDone;
      this.dlg = null;
      cb?.();
    }
  }

  private updateMenu(dt: number) {
    const m = this.menu!;
    if (m.lock > 0) { m.lock -= dt; return; }
    const n = m.options.length;

    const p = this.input.pointer;
    const hovered = p ? choiceAt(n, p.x, p.y) : null;
    if (this.input.pointerMoved && hovered !== null && hovered !== m.selected) {
      m.selected = hovered;
      audio.click();
    }

    if (this.input.once("arrowdown", "s")) { m.selected = (m.selected + 1) % n; audio.click(); }
    if (this.input.once("arrowup", "w")) { m.selected = (m.selected + n - 1) % n; audio.click(); }
    if (m.cancellable && this.input.once("escape")) { this.menu = null; return; }

    const clicked = this.input.once("pointer") && hovered !== null;
    if (!clicked && !this.input.once("e", "enter", " ")) return;

    if (!m.options[m.selected].enabled) {
      audio.spend();
      return this.toast(UI.noCoins, "bad");
    }
    const i = m.selected;
    const pick = m.onPick;
    this.menu = null;
    pick(i);
  }

  /* --------------------------------------------------------------- end --- */

  private endShift() {
    const s = this.state;
    s.phase = "shift_end";
    this.hooks.onPhase?.(s.phase);
    s.spills = [];
    if (s.carrying) this.setDown();   // don't let the trolley vanish at 06:00
    this.goTo("locker_room", 214, 332);   // a few steps from locker 14, not across the room
    audio.walkie();
    window.setTimeout(() => {
      this.narrate([
        "◤ RADIO ◢  Desk to cleaning. That's the shift. Go home. Thank you.",
        "Six in the morning. The corridor lights go up one notch and everything looks worse.",
        "Locker 14 is still open.",
      ]);
    }, 900);
  }

  private updateCutscene(dt: number) {
    const c = this.cutscene!;
    c.t += dt;
    if (c.t > 2.6) {
      this.cutscene = null;
      this.player.civ = true;
      this.state.phase = "verdict";
      this.hooks.onPhase?.("verdict");
      this.narrate([
        "The overalls go in the bag by the door. Somebody washes them. You've never met them.",
        "There is a mirror over the sink, with a crack in it.",
      ]);
    }
  }

  private async startVerdict() {
    const s = this.state;
    this.narrate(["You look up."]);
    let lines = localVerdict(s);
    try {
      const res = await fetch("/api/gemini/verdict", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          earned: s.earned,
          spent_on_self: s.spentOnSelf,
          spent_on_others: s.spentOnOthers,
          final_balance: s.coins,
          inherited: s.inheritedCoins,
          shift: s.inheritedShift,
          how_they_feel: Math.round(s.mood),
          decisions: s.decisions.map((d) => `${d.timestamp} ${d.note}`),
          how_it_turned_out: s.ledger.map((e) => `${e.person}: ${e.line}`),
        }),
      });
      const j = await res.json();
      if (j.lines?.length) lines = j.lines;
    } catch { /* the mirror falls back to what it already knows */ }

    this.speak(lines.join(" "), "mirror");
    this.narrate(lines, () => this.openLedger(() => {
      s.phase = "handover";
      this.hooks.onPhase?.("handover");
      this.narrate(
        [
          "The walkie-talkie on the desk still has a charge in it.",
          "Whoever opens this locker next will hear whatever you leave on it.",
        ],
        () => this.hooks.onHandover?.(s),
      );
    }));
  }

  private openLedger(next: () => void) {
    this.ledgerNext = next;
    this.ledgerOpen = true;
  }

  /** Called by the React overlay when the player commits their legacy. */
  async submitHandover(leftCoins: number, msg: string) {
    const s = this.state;
    this.hooks.onStatus?.("writing to solana devnet…");
    try {
      const res = await fetch("/api/solana/shift", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          leftCoins, msg,
          shift: s.inheritedShift + 1,
          prev: s.inheritedSignature || undefined,
        }),
      });
      this.finalRecord = await res.json();
    } catch {
      this.finalRecord = {
        app: "the-next-shift", shift: s.inheritedShift + 1, leftCoins, msg,
        prev: s.inheritedSignature || undefined, simulated: true,
      };
    }
    s.coins -= leftCoins;
    s.phase = "done";
    this.hooks.onPhase?.("done");
    this.hooks.onStatus?.("");
    audio.walkie();
  }

  get record() { return this.finalRecord; }

  private beginIntro() {
    const s = this.state;
    s.phase = "intro";
    this.hooks.onPhase?.("intro");
    audio.start().then(() => audio.setAmbience("room"));
    this.fade = 1;
    this.fadeDir = -1;
    const lines = [...INTRO, `You count it. ${s.inheritedCoins} coins.`];
    if (s.inheritedMessage) lines.push(`The radio crackles once, and says: "${s.inheritedMessage}"`);
    lines.push("02:00. Corridor B is a swamp.");
    this.narrate(lines, () => {
      s.flags.intro_done = true;
      s.phase = "play";
      this.hooks.onPhase?.("play");
      this.trySpawnStory("corridor");   // don't start the night in an empty corridor
    });
    if (s.inheritedMessage) void this.speak(s.inheritedMessage, "previous");
  }

  /** `warmOnly` fetches and caches the clip server-side without playing it. */
  private async speak(text: string, voice: string, warmOnly = false) {
    try {
      const res = await fetch("/api/elevenlabs/tts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text, voice }),
      });
      if (!res.ok) return;
      const buf = await res.arrayBuffer();
      if (warmOnly) return;
      if (buf.byteLength > 512) await audio.speak(buf, voice !== "mirror");
    } catch { /* silence is in character */ }
  }

  // ------------------------------------------------------------ draw -----
  private draw(dt: number) {
    const s = this.state;
    if (s.phase === "boot") {
      drawTitle(this.r, this.titleT, this.ready, s);
      return;
    }

    const sc = this.scene();
    this.r.background(sc);
    this.drawSpills();

    const items: (Drawable & { sortY: number })[] = [];

    for (const p of sc.props) {
      const a = anim(this.assets, p.anim);
      items.push({
        frame: frameAt(a, this.time), x: p.x, y: p.y,
        scale: depthScale(sc, p.y), flip: p.flip, shadow: 0.5, sortY: p.y,
      });
    }
    for (const pr of s.props) {
      if (pr.scene !== s.scene || s.carrying === pr.id) continue;
      const a = anim(this.assets, pr.anim);
      items.push({
        frame: frameAt(a, this.time), x: pr.x, y: pr.y,
        scale: depthScale(sc, pr.y), shadow: 0.6, sortY: pr.y,
      });
    }
    for (const a of s.stories) {
      if (a.scene !== s.scene) continue;
      const st = STORY_BY_ID[a.storyId];
      const slot = sc.slots.find((x) => x.id === a.slotId);
      const pos = slot ? this.slotPos(s.scene, slot) : null;
      if (!st || !slot || !pos) continue;
      const poses = CAST_POSES[st.cast];
      const key = poses[st.pose] ?? Object.values(poses)[0]!;
      const an = anim(this.assets, key);
      items.push({
        frame: frameAt(an, this.time + pos.x),
        x: pos.x, y: pos.y - pos.lift,
        scale: depthScale(sc, pos.y), flip: slot.flip,
        shadow: pos.lift ? 0 : 0.8, sortY: pos.y,
      });
    }

    items.push({ ...this.playerDrawable(), sortY: this.player.y });
    if (s.carrying) {
      const pr = s.props.find((p) => p.id === s.carrying)!;
      const a = anim(this.assets, pr.anim);
      items.push({
        frame: frameAt(a, this.time),
        x: this.player.x + this.player.facing * 18,
        y: this.player.y - 2,
        scale: depthScale(sc, this.player.y) * 0.9,
        shadow: 0.4,
        sortY: this.player.y + 0.5,
      });
    }

    items.sort((a, b) => a.sortY - b.sortY);
    for (const it of items) this.r.sprite(it);

    this.r.weather(sc, dt, this.time);
    if (this.r.consumeThunder()) audio.thunder();
    this.r.lights(sc, this.time);
    this.r.grade(this.time, sc.ambience === "room" ? 1 : 0, s.mood);

    if (s.phase !== "intro" && s.phase !== "done") drawHUD(this.r, s);

    const step = END_STEPS[s.phase];
    if (step && !this.dlg && !this.menu && !this.ledgerOpen) {
      const h = sc.hotspots.find((x) => x.id === step.hotspotId);
      if (h) drawBeacon(this.r, h.x + h.w / 2, h.y - 8);
    }

    if (!this.dlg && !this.menu && !this.cutscene) {
      if (this.target)
        drawPrompt(this.r, this.target.x, Math.min(this.target.y - 74, GAME_H - 130), this.target.label);
      else if (s.carrying)
        drawPrompt(this.r, this.player.x, this.player.y - 74, "SET DOWN");
      const spill = this.nearestSpill();
      if (spill) drawPrompt(this.r, spill.x, spill.y - 56, "SPACE  mop");
    }

    if (this.ledgerOpen) drawLedger(this.r, s.ledger);
    if (this.dlg) this.drawDialogueBox();
    if (this.menu) this.drawMenu();
    if (s.phase === "done") this.drawEndCard();

    this.r.fade(this.fade);
  }

  private playerDrawable(): Drawable {
    const p = this.player;
    const sc = this.scene();
    if (this.cutscene) {
      const a = anim(this.assets, "mc.undress");
      return {
        frame: frameOnce(a, this.cutscene.t), x: p.x, y: p.y,
        scale: depthScale(sc, p.y), flip: p.facing < 0,
      };
    }
    const key = p.civ
      ? (p.moving ? "civ.walk" : "civ.idle")
      : p.mopping
        ? "mc.mop"
        : p.moving ? "mc.walk_mop" : "mc.idle_mop";
    return {
      frame: frameAt(anim(this.assets, key), p.t), x: p.x, y: p.y,
      scale: depthScale(sc, p.y), flip: p.facing < 0,
    };
  }

  private drawSpills() {
    const { ctx } = this;
    const sc = this.scene();
    ctx.save();
    for (const sp of this.state.spills) {
      if (sp.scene !== this.state.scene) continue;
      const s = depthScale(sc, sp.y);
      const w = 26 * s * (0.55 + sp.amount * 0.45);
      ctx.globalAlpha = 0.2 + 0.4 * sp.amount;
      ctx.fillStyle = "#12303a";
      ctx.beginPath();
      ctx.ellipse(sp.x, sp.y, w, w * 0.34, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.25 * sp.amount;
      ctx.fillStyle = "#9fd8e6";
      ctx.beginPath();
      ctx.ellipse(sp.x - w * 0.25, sp.y - w * 0.09, w * 0.4, w * 0.11, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawDialogueBox() {
    const d = this.dlg!;
    const text = d.lines[d.idx] ?? "";
    if (d.kind === "narration") {
      drawNarration(this.r, text, Math.floor(d.chars), true);
      return;
    }
    drawSpeech(this.r, {
      name: d.name,
      portrait: d.portrait ? this.assets.portraits[d.portrait] : null,
      text,
      visible: Math.floor(d.chars),
      more: true,
    });
  }

  private drawMenu() {
    const m = this.menu!;
    drawChoices(this.r, m.header, m.options, m.selected, m.lock > 0);
  }

  private drawEndCard() {
    const { ctx, font } = this.r;
    const rec = this.finalRecord;
    ctx.save();
    ctx.fillStyle = "rgba(4,6,8,0.86)";
    ctx.fillRect(0, 0, GAME_W, GAME_H);
    const lines = [
      `SHIFT #${rec?.shift ?? "?"} CLOSED`,
      "",
      `you were handed      ${this.state.inheritedCoins}`,
      `you earned           ${this.state.earned}`,
      `you spent on you     ${this.state.spentOnSelf}`,
      `you spent on others  ${this.state.spentOnOthers}`,
      `you left behind      ${rec?.leftCoins ?? 0}`,
      "",
      rec?.simulated ? "recorded on a local ledger" : "recorded on solana devnet",
    ];
    let y = 92;
    for (const l of lines) {
      font.draw(ctx, l, (GAME_W - font.width(l)) / 2, y, l.startsWith("SHIFT") ? PAL.gold : PAL.ink);
      y += 16;
    }
    if (rec?.msg) {
      for (const l of font.wrap(`"${rec.msg}"`, 440)) {
        font.draw(ctx, l, (GAME_W - font.width(l)) / 2, y, PAL.dim);
        y += 14;
      }
    }
    ctx.restore();
  }
}

export function freshState(): GameState {
  return {
    phase: "boot",
    minute: SHIFT_START_MIN,
    elapsed: 0,
    hunger: 62,
    fatigue: 18,
    mood: 52,
    coins: 12,
    earned: 0,
    spentOnSelf: 0,
    spentOnOthers: 0,
    scene: "locker_room",
    spills: [],
    nextSpillId: 1,
    spillTimer: 6,
    stories: [],
    usedStories: [],
    storyTimer: 4,
    tasks: [],
    props: (Object.keys(CARRIABLES) as CarriableId[]).map((id) => ({
      id, anim: CARRIABLES[id].anim, scene: CARRIABLES[id].scene,
      x: CARRIABLES[id].x, y: CARRIABLES[id].y,
    })),
    carrying: null,
    flags: {},
    flagTimes: {},
    moodMarks: [],
    ledger: [],
    decisions: [],
    inheritedCoins: 12,
    inheritedMessage: "",
    inheritedShift: 1,
    inheritedSignature: "",
    chain: [],
    chainVerified: false,
    toasts: [],
  };
}

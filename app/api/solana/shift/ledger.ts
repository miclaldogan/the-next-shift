import type { ShiftChain, ShiftRecord } from "@/game/types";

/**
 * Stand-in ledger for when devnet is not configured. It keeps the same shape as
 * the real thing -- including the `prev` links -- so the game and the UI behave
 * identically; it is always marked `simulated` so nothing pretends otherwise.
 * In-process only: it resets when the server does.
 */
const SEED: ShiftRecord = {
  app: "the-next-shift",
  shift: 1,
  leftCoins: 12,
  msg: "Machine eats coins on the second try. The old man on the bench is not lying.",
  signature: "local-1",
  simulated: true,
};

let ledger: ShiftRecord[] = [SEED];   // newest first
let counter = 1;                      // monotonic, so signatures never collide

export function localLatest(): ShiftRecord {
  return ledger[0];
}

export function localChain(limit = 6): ShiftChain {
  const shifts = ledger.slice(0, limit);
  let verified = true;
  for (let i = 0; i < shifts.length - 1; i++) {
    if (shifts[i].prev !== shifts[i + 1].signature) { verified = false; break; }
  }
  return { shifts, verified, simulated: true };
}

export function localAppend(rec: Omit<ShiftRecord, "app" | "signature">): ShiftRecord {
  const entry: ShiftRecord = {
    app: "the-next-shift",
    ...rec,
    signature: `local-${++counter}`,
    simulated: true,
  };
  ledger = [entry, ...ledger].slice(0, 24);
  return entry;
}

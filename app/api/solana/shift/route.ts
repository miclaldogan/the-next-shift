import { NextResponse } from "next/server";
import { readLatestShift, writeShift } from "@/lib/solana";
import type { ShiftRecord } from "@/game/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * When devnet is not configured the game still has to be playable, so an
 * in-process ledger stands in. It is marked `simulated` so the UI can say so
 * rather than quietly pretending it wrote to a chain.
 */
const SEED: ShiftRecord = {
  app: "the-next-shift",
  shift: 1,
  leftCoins: 12,
  msg: "Machine eats coins on the second try. The old man on the bench is not lying.",
  simulated: true,
};
let localLedger: ShiftRecord = SEED;

export async function GET() {
  try {
    const rec = await readLatestShift();
    if (rec) return NextResponse.json(rec);
  } catch (e) {
    console.warn("[solana] read failed:", (e as Error).message);
  }
  return NextResponse.json(localLedger);
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const leftCoins = Math.max(0, Math.min(9999, Math.round(Number(body.leftCoins) || 0)));
  const msg = String(body.msg ?? "").slice(0, 140);
  const shift = Math.max(1, Math.round(Number(body.shift) || 1));

  try {
    const rec = await writeShift({ shift, leftCoins, msg });
    localLedger = rec;
    return NextResponse.json(rec);
  } catch (e) {
    console.warn("[solana] write failed:", (e as Error).message);
    localLedger = { app: "the-next-shift", shift, leftCoins, msg, simulated: true };
    return NextResponse.json(localLedger);
  }
}

import { NextResponse } from "next/server";
import { readLatestShift, writeShift } from "@/lib/solana";
import { localAppend, localLatest } from "./ledger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const rec = await readLatestShift();
    if (rec) return NextResponse.json(rec);
  } catch (e) {
    console.warn("[solana] read failed:", (e as Error).message);
  }
  return NextResponse.json(localLatest());
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const leftCoins = Math.max(0, Math.min(9999, Math.round(Number(body.leftCoins) || 0)));
  const msg = String(body.msg ?? "").slice(0, 140);
  const shift = Math.max(1, Math.round(Number(body.shift) || 1));
  // the client hands back the signature it inherited, which becomes this
  // record's parent link
  const prev = typeof body.prev === "string" && body.prev ? body.prev.slice(0, 128) : undefined;

  try {
    const rec = await writeShift({ shift, leftCoins, msg, prev });
    return NextResponse.json(rec);
  } catch (e) {
    console.warn("[solana] write failed:", (e as Error).message);
    return NextResponse.json(localAppend({ shift, leftCoins, msg, prev }));
  }
}

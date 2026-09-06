import { NextResponse } from "next/server";
import { readChain } from "@/lib/solana";
import { localChain } from "../shift/ledger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * The handovers before this one, newest first, with `verified` set when every
 * record's `prev` matches the signature of the one before it. This is the whole
 * point of the `prev` field: the ordering is provable from the memos themselves
 * rather than trusted from whatever order the RPC happened to return.
 */
export async function GET() {
  try {
    const chain = await readChain(6);
    // an operator key that has never handed anything over reads as an empty
    // chain, which would leave the title screen blank on a fresh deployment;
    // fall through to the seeded local ledger and say so
    if (chain?.shifts.length) return NextResponse.json(chain);
  } catch (e) {
    console.warn("[solana] chain read failed:", (e as Error).message);
  }
  return NextResponse.json(localChain(6));
}

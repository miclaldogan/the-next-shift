import {
  Connection, Keypair, PublicKey, SystemProgram,
  Transaction, TransactionInstruction, LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import type { ShiftRecord } from "@/game/types";

export const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
const RPC = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";

/** bs58 decode, so the operator key can be pasted in either common format. */
function bs58Decode(s: string): Uint8Array {
  const A = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  const bytes: number[] = [];
  for (const ch of s) {
    let carry = A.indexOf(ch);
    if (carry < 0) throw new Error("bad base58 character");
    for (let i = 0; i < bytes.length; i++) {
      carry += bytes[i] * 58;
      bytes[i] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) { bytes.push(carry & 0xff); carry >>= 8; }
  }
  for (const ch of s) { if (ch !== "1") break; bytes.push(0); }
  return Uint8Array.from(bytes.reverse());
}

export function operator(): Keypair | null {
  const raw = process.env.SOLANA_SECRET_KEY?.trim();
  if (!raw) return null;
  try {
    const bytes = raw.startsWith("[")
      ? Uint8Array.from(JSON.parse(raw) as number[])
      : bs58Decode(raw);
    return Keypair.fromSecretKey(bytes);
  } catch {
    return null;
  }
}

export function connection() {
  return new Connection(RPC, "confirmed");
}

/**
 * The shift ledger is the account's own memo history: every player's handover
 * is one transaction, and the newest one that parses as ours is what the next
 * player inherits.
 */
export async function readLatestShift(): Promise<ShiftRecord | null> {
  const kp = operator();
  if (!kp) return null;
  const conn = connection();
  const sigs = await conn.getSignaturesForAddress(kp.publicKey, { limit: 30 });
  for (const s of sigs) {
    if (s.err) continue;
    const memo = s.memo?.replace(/^\[\d+\]\s*/, "");
    if (!memo) continue;
    try {
      const parsed = JSON.parse(memo);
      if (parsed?.app === "the-next-shift") {
        return {
          ...parsed,
          signature: s.signature,
          explorer: `https://explorer.solana.com/tx/${s.signature}?cluster=devnet`,
        } as ShiftRecord;
      }
    } catch { /* somebody else's memo */ }
  }
  return null;
}

export async function writeShift(rec: Omit<ShiftRecord, "app">): Promise<ShiftRecord> {
  const kp = operator();
  if (!kp) throw new Error("no operator key");
  const conn = connection();

  const balance = await conn.getBalance(kp.publicKey);
  if (balance < 0.005 * LAMPORTS_PER_SOL) {
    // devnet faucets are rate limited; if it refuses we still try to send
    try {
      const sig = await conn.requestAirdrop(kp.publicKey, LAMPORTS_PER_SOL);
      await conn.confirmTransaction(sig, "confirmed");
    } catch { /* fall through and let the send fail loudly */ }
  }

  const payload: ShiftRecord = { app: "the-next-shift", ...rec };
  const memo = JSON.stringify({
    app: payload.app, shift: payload.shift,
    leftCoins: payload.leftCoins, msg: payload.msg,
  });

  const tx = new Transaction().add(
    // symbolic: the coins move, one lamport per coin, so the handover shows up
    // as value transferred and not only as text
    SystemProgram.transfer({
      fromPubkey: kp.publicKey,
      toPubkey: kp.publicKey,
      lamports: Math.max(1, Math.round(payload.leftCoins)),
    }),
    new TransactionInstruction({
      keys: [{ pubkey: kp.publicKey, isSigner: true, isWritable: true }],
      programId: MEMO_PROGRAM_ID,
      data: Buffer.from(memo, "utf8"),
    }),
  );

  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.feePayer = kp.publicKey;
  tx.sign(kp);
  const signature = await conn.sendRawTransaction(tx.serialize(), { maxRetries: 3 });
  await conn.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed");

  return {
    ...payload,
    signature,
    explorer: `https://explorer.solana.com/tx/${signature}?cluster=devnet`,
  };
}

#!/usr/bin/env node
/**
 * Mint the operator keypair for the shift ledger, and fund it.
 *
 * Solana devnet needs no API key -- the RPC is public. What it needs is a
 * *signing* key, which is generated here rather than fetched from anyone. This
 * exists so you do not have to install the Solana CLI just to get one.
 *
 *   node tools/new-devnet-key.mjs                 generate, fund, print
 *   node tools/new-devnet-key.mjs --airdrop-only  fund the key already in env
 *
 * Devnet SOL is worthless play money. Never point SOLANA_SECRET_KEY at a
 * keypair that holds anything on mainnet.
 */
import { Connection, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";

const RPC = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
const AIRDROP_ONLY = process.argv.includes("--airdrop-only");

function load() {
  const raw = process.env.SOLANA_SECRET_KEY?.trim();
  if (!raw) throw new Error("SOLANA_SECRET_KEY is not set");
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
}

async function fund(conn, kp) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    const balance = await conn.getBalance(kp.publicKey);
    if (balance >= 0.5 * LAMPORTS_PER_SOL) {
      console.log(`  balance ${(balance / LAMPORTS_PER_SOL).toFixed(3)} SOL — enough`);
      return true;
    }
    try {
      process.stdout.write(`  airdrop attempt ${attempt}… `);
      const sig = await conn.requestAirdrop(kp.publicKey, LAMPORTS_PER_SOL);
      await conn.confirmTransaction(sig, "confirmed");
      console.log("ok");
      return true;
    } catch (e) {
      console.log(`refused (${String(e.message).split("\n")[0]})`);
      // the public faucet rate-limits hard; back off rather than hammer it
      await new Promise((r) => setTimeout(r, attempt * 2500));
    }
  }
  return false;
}

const conn = new Connection(RPC, "confirmed");
const kp = AIRDROP_ONLY ? load() : Keypair.generate();

console.log(`\nRPC      ${RPC}`);
console.log(`address  ${kp.publicKey.toBase58()}\n`);

const funded = await fund(conn, kp);
if (!funded) {
  console.log("\n  The public devnet faucet is rate limited. Either wait a few");
  console.log("  minutes, use https://faucet.solana.com with the address above,");
  console.log("  or set SOLANA_RPC_URL to a Helius/QuickNode devnet endpoint.");
}

if (!AIRDROP_ONLY) {
  console.log("\nPut this in .env.local:\n");
  console.log(`SOLANA_SECRET_KEY=${JSON.stringify(Array.from(kp.secretKey))}`);
  console.log(`SOLANA_RPC_URL=${RPC}\n`);
  console.log("Explorer:");
  console.log(`  https://explorer.solana.com/address/${kp.publicKey.toBase58()}?cluster=devnet\n`);
}

// Converts a JSON byte-array keypair file (the format solana-keygen and
// Anchor use) into a base58-encoded secret key (what Phantom/Solflare's
// "Import Private Key" and import-keypair.ts expect) — run entirely
// locally, your key is only printed to this terminal, never logged or
// sent anywhere.
//
// Usage:
//   npx tsx scripts/export-keypair.ts <path-to-keypair.json>
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import fs from "node:fs";

function main() {
  const inPath = process.argv[2];
  if (!inPath) {
    console.error("Usage: npx tsx scripts/export-keypair.ts <path-to-keypair.json>");
    process.exit(1);
  }

  const bytes = Uint8Array.from(JSON.parse(fs.readFileSync(inPath, "utf8")));
  const keypair = Keypair.fromSecretKey(bytes);

  console.log(`Public key: ${keypair.publicKey.toBase58()}`);
  console.log(`Base58 secret key: ${bs58.encode(keypair.secretKey)}`);
}

main();

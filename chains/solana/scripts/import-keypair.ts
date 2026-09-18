// Converts a base58-encoded secret key (what Phantom/Solflare's "Export
// Private Key" gives you) into the JSON byte-array format solana-keygen
// and Anchor expect, and writes it to a file — run entirely locally, your
// key is never printed, logged, or sent anywhere.
//
// Usage:
//   npx tsx scripts/import-keypair.ts <output-path>
// Then paste your base58 secret key when prompted (input is hidden).
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import readline from "node:readline";
import fs from "node:fs";

function promptHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    // @ts-expect-error - _writeToOutput is undocumented but the standard
    // way to suppress echo for a readline prompt in Node.
    rl._writeToOutput = (str: string) => {
      if (str.trim() === question.trim()) rl.output.write(str);
    };
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer.trim());
    });
  });
}

async function main() {
  const outPath = process.argv[2];
  if (!outPath) {
    console.error("Usage: npx tsx scripts/import-keypair.ts <output-path>");
    process.exit(1);
  }

  const secret = await promptHidden("Paste your base58 secret key: ");
  const bytes = bs58.decode(secret);
  const keypair = Keypair.fromSecretKey(bytes);

  fs.writeFileSync(outPath, JSON.stringify(Array.from(keypair.secretKey)));
  console.log(`Wrote keypair for ${keypair.publicKey.toBase58()} to ${outPath}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});

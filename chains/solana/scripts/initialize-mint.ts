// One-off setup script: creates the USD-X SPL mint and hands its mint
// authority to usdx_bridge's mint_authority PDA. Run once per cluster
// deploy — this is what produces the value that becomes
// core-ledger's USDX_MINT_ADDRESS.
//
// Usage:
//   npm install
//   ANCHOR_PROVIDER_URL=https://api.devnet.solana.com \
//   ANCHOR_WALLET=~/.config/solana/id.json \
//   npm run init-mint
import * as anchor from "@coral-xyz/anchor";
import { Keypair, PublicKey } from "@solana/web3.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const idlPath = path.join(__dirname, "../target/idl/usdx_bridge.json");
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf8"));
  const programId = new PublicKey(idl.address);
  const program = new anchor.Program(idl, provider);

  const [mintAuthority] = PublicKey.findProgramAddressSync(
    [Buffer.from("mint-authority")],
    programId,
  );

  const mint = Keypair.generate();

  console.log("payer:         ", provider.wallet.publicKey.toBase58());
  console.log("program:       ", programId.toBase58());
  console.log("mint_authority:", mintAuthority.toBase58());
  console.log("mint (new):    ", mint.publicKey.toBase58());

  const sig = await program.methods
    .initializeMintAuthority()
    .accounts({
      payer: provider.wallet.publicKey,
      mint: mint.publicKey,
      mintAuthority,
    })
    .signers([mint])
    .rpc();

  console.log("\ntx:", sig);
  console.log("\nUSDX_MINT_ADDRESS=" + mint.publicKey.toBase58());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

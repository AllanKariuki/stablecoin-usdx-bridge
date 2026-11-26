// One-off setup script: creates the BridgeConfig PDA (`bridge-config`) that
// holds the relayer pubkey, the admin, and the pause flag. Run once per
// deployment — in particular after a program upgrade that introduced
// BridgeConfig (P6/R6), because bridge_mint/bridge_burn read the relayer from
// this account and fail against a missing or mismatched one.
//
// The instruction seeds the relayer from the program's RELAYER_PUBKEY
// constant (default_relayer_pubkey() in constants.rs); it takes only `admin`.
// Rotating the relayer afterwards is `set_relayer`, signed by the config
// admin — that is the whole point of the account (R6).
//
// Idempotent: if the config already exists it is fetched and printed, nothing
// is sent. A relayer mismatch against the expected one (RELAYER_PUBKEY, or
// the relayer keypair) warns, names set_relayer, and exits non-zero.
//
// Usage:
//   npm install
//   ANCHOR_PROVIDER_URL=https://api.devnet.solana.com \
//   ANCHOR_WALLET=~/.config/solana/id.json \
//   npm run init-config
//
// Optional env:
//   ADMIN_PUBKEY                 admin for the config (default: provider wallet)
//   RELAYER_PUBKEY               expected relayer, overrides the keypair below
//   SOLANA_RELAYER_KEYPAIR_PATH  relayer keypair (default: ~/.config/solana/usdx-relayer.json)
import * as anchor from "@coral-xyz/anchor";
import { Keypair, PublicKey } from "@solana/web3.js";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import type { UsdxBridge } from "../target/types/usdx_bridge";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Mirrors CONFIG_SEED in programs/usdx_bridge/src/constants.rs.
const CONFIG_SEED = "bridge-config";

// Mirrors default_relayer_pubkey() in constants.rs. Only used to know what an
// existing config *should* say when this machine holds no relayer identity;
// the program itself is the authority on it during initialize_config.
const DEFAULT_RELAYER_PUBKEY = "257pTZ4CBDLmQrdwpSHC6ahrJkxSaQFFEohpeXD3H3FJ";

function expandHome(p: string): string {
  return p.startsWith("~/") ? path.join(os.homedir(), p.slice(2)) : p;
}

// The relayer this deployment is meant to use: an explicit RELAYER_PUBKEY,
// else the configured relayer keypair, else the program's compiled-in
// default. The source is printed so a mismatch is actionable.
function expectedRelayer(): { pubkey: PublicKey; source: string } {
  if (process.env.RELAYER_PUBKEY) {
    return { pubkey: new PublicKey(process.env.RELAYER_PUBKEY), source: "RELAYER_PUBKEY" };
  }

  const keypairPath = expandHome(
    process.env.SOLANA_RELAYER_KEYPAIR_PATH || path.join(os.homedir(), ".config", "solana", "usdx-relayer.json"),
  );
  if (fs.existsSync(keypairPath)) {
    const secret = JSON.parse(fs.readFileSync(keypairPath, "utf8"));
    const keypair = Keypair.fromSecretKey(Uint8Array.from(secret));
    return { pubkey: keypair.publicKey, source: keypairPath };
  }

  return { pubkey: new PublicKey(DEFAULT_RELAYER_PUBKEY), source: "program default (constants.rs)" };
}

// Devnet explorer by default (this project deploys to devnet); other clusters
// get their own suffix rather than a link that silently points at mainnet.
function explorerSuffix(endpoint: string): string {
  if (endpoint.includes("devnet")) return "?cluster=devnet";
  if (endpoint.includes("testnet")) return "?cluster=testnet";
  if (endpoint.includes("mainnet")) return "";
  return `?cluster=custom&customUrl=${encodeURIComponent(endpoint)}`;
}

function printConfig(config: any): void {
  console.log("admin:         ", config.admin.toBase58());
  console.log("relayer:       ", config.relayer.toBase58());
  console.log("paused:        ", config.paused);
}

function warnRelayerMismatch(actual: PublicKey, expected: PublicKey, source: string): void {
  console.warn("\nWARNING: BridgeConfig.relayer does not match the expected relayer.");
  console.warn(`  config:        ${actual.toBase58()}`);
  console.warn(`  expected:      ${expected.toBase58()}  (${source})`);
  console.warn("  Rotate it with `set_relayer`, signed by the config admin, before");
  console.warn("  bridge_mint/bridge_burn will accept the relayer.");
}

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const idlPath = path.join(__dirname, "../target/idl/usdx_bridge.json");
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf8"));
  const programId = new PublicKey(idl.address);
  const program = new anchor.Program<UsdxBridge>(idl, provider);

  const [configPda] = PublicKey.findProgramAddressSync(
    [Buffer.from(CONFIG_SEED)],
    programId,
  );

  const admin = process.env.ADMIN_PUBKEY
    ? new PublicKey(process.env.ADMIN_PUBKEY)
    : provider.wallet.publicKey;
  const expected = expectedRelayer();

  const endpoint = provider.connection.rpcEndpoint;
  const suffix = explorerSuffix(endpoint);

  console.log("payer:         ", provider.wallet.publicKey.toBase58());
  console.log("program:       ", programId.toBase58());
  console.log("config PDA:    ", configPda.toBase58());
  console.log("rpc:           ", endpoint);
  console.log("expected relayer:", expected.pubkey.toBase58(), `(${expected.source})`);

  const existing = await program.account.bridgeConfig.fetchNullable(configPda);

  if (existing) {
    console.log("\nBridgeConfig already exists — nothing sent.");
    printConfig(existing);
    console.log("\nexplorer:      ", `https://explorer.solana.com/address/${configPda.toBase58()}${suffix}`);

    const actualRelayer = existing.relayer as PublicKey;
    if (!actualRelayer.equals(expected.pubkey)) {
      warnRelayerMismatch(actualRelayer, expected.pubkey, expected.source);
      process.exit(1);
    }
    return;
  }

  console.log("admin:         ", admin.toBase58());

  const sig = await program.methods
    .initializeConfig(admin)
    .accountsPartial({
      payer: provider.wallet.publicKey,
      config: configPda,
    })
    .rpc();

  console.log("\ntx:            ", sig);
  console.log("explorer:      ", `https://explorer.solana.com/tx/${sig}${suffix}`);

  const created = await program.account.bridgeConfig.fetch(configPda);
  console.log("\nBridgeConfig initialised.");
  printConfig(created);

  // initialize_config seeds the relayer from the program constant, so a
  // deployment whose relayer key differs must rotate it explicitly.
  const createdRelayer = created.relayer as PublicKey;
  if (!createdRelayer.equals(expected.pubkey)) {
    warnRelayerMismatch(createdRelayer, expected.pubkey, expected.source);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

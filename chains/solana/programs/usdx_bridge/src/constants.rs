use anchor_lang::prelude::*;

#[constant]
pub const MINT_AUTHORITY_SEED: &[u8] = b"mint-authority";

#[constant]
pub const PROCESSED_SEED: &[u8] = b"processed";

#[constant]
pub const CONFIG_SEED: &[u8] = b"bridge-config";

// USD-X's decimal places on Solana. Must match USDX.sol's decimals()
// override on Ethereum (6, matching common stablecoin convention e.g.
// USDC) — a burn-N-mint-N cross-chain transfer only moves equal real
// value if both chains agree on this.
pub const USDX_DECIMALS: u8 = 6;

/// The relayer this program shipped with, used once — to seed BridgeConfig
/// on `initialize_config`.
///
/// It is no longer consulted by bridge_mint or bridge_burn. Those read
/// `BridgeConfig.relayer`, which is why rotating a key is now a transaction
/// rather than a program redeploy (R6). Keeping the constant means an
/// existing deployment can initialise its config without first having to know
/// a pubkey out of band; after that, `set_relayer` is the only way it changes.
pub fn default_relayer_pubkey() -> Pubkey {
    "257pTZ4CBDLmQrdwpSHC6ahrJkxSaQFFEohpeXD3H3FJ"
        .parse()
        .expect("RELAYER_PUBKEY must be a valid base58 pubkey")
}

use anchor_lang::prelude::*;

#[constant]
pub const MINT_AUTHORITY_SEED: &[u8] = b"mint-authority";

#[constant]
pub const PROCESSED_SEED: &[u8] = b"processed";

// USD-X's decimal places on Solana. Must match USDX.sol's decimals()
// override on Ethereum (6, matching common stablecoin convention e.g.
// USDC) — a burn-N-mint-N cross-chain transfer only moves equal real
// value if both chains agree on this.
pub const USDX_DECIMALS: u8 = 6;

// core-ledger's relayer — see SOLANA_RELAYER_KEYPAIR_PATH in
// core-ledger/.env.example. Only this account can call bridge_mint/
// bridge_burn. Parsed at runtime (not a `const`) since this anchor-lang
// version doesn't expose a compile-time base58 pubkey macro.
pub fn relayer_pubkey() -> Pubkey {
    "257pTZ4CBDLmQrdwpSHC6ahrJkxSaQFFEohpeXD3H3FJ"
        .parse()
        .expect("RELAYER_PUBKEY must be a valid base58 pubkey")
}

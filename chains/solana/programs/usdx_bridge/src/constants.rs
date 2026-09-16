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

// TODO: replace with the real relayer's pubkey before deploying — this is
// a placeholder (the System Program's address) chosen only because it's a
// valid base58 pubkey that compiles; it does NOT identify any real relayer,
// so bridge_mint's relayer constraint will reject every signer until this
// is swapped out.
pub const RELAYER_PUBKEY: Pubkey = anchor_lang::system_program::ID;

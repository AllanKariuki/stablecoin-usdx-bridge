use anchor_lang::prelude::*;

#[constant]
pub const MINT_AUTHORITY_SEED: &[u8] = b"mint-authority";

#[constant]
pub const PROCESSED_SEED: &[u8] = b"processed";

// USD-X's decimal places on Solana. This MUST match whatever decimals()
// ends up being on the Ethereum side (USDX.sol currently doesn't override
// ERC20Upgradeable.decimals(), so it defaults to 18) — otherwise a
// burn-N-mint-N cross-chain transfer moves different real value on each
// leg. Confirm the intended value before deploying; 6 is a placeholder
// (matches common stablecoin convention, e.g. USDC).
pub const USDX_DECIMALS: u8 = 6;

// TODO: replace with the real relayer's pubkey before deploying — this is
// a placeholder (the System Program's address) chosen only because it's a
// valid base58 pubkey that compiles; it does NOT identify any real relayer,
// so bridge_mint's relayer constraint will reject every signer until this
// is swapped out.
pub const RELAYER_PUBKEY: Pubkey = anchor_lang::system_program::ID;

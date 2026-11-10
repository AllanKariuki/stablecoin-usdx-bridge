use anchor_lang::prelude::*;

// Zero-data marker account. Its existence is the point: it's created via
// `init`, seeded by correlation_id, and Anchor's `init` constraint fails if
// the account already exists — so replaying a correlation_id on bridge_mint
// or bridge_burn fails closed instead of double-minting/double-burning.
#[account]
#[derive(InitSpace)]
pub struct ProcessedMarker {
    pub bump: u8,
}

/// BridgeConfig is what makes relayer rotation possible.
///
/// Before it, the relayer was a compile-time constant in constants.rs, which
/// meant rotating a key — the thing you do the moment one is suspected of
/// leaking — required rebuilding and redeploying the program, with a
/// governance window in between during which the compromised key still works.
/// The risk register calls it out as R6, and gates rotation on this account
/// existing.
///
/// Three fields, and each earns its place:
///
///   - `admin` can change the other two, and can hand over the admin role
///     itself. It is a Gnosis-Safe-equivalent multisig in production, a
///     single key in devnet.
///   - `relayer` is the only account bridge_mint/bridge_burn accept, read at
///     runtime rather than compiled in.
///   - `paused` halts minting and burning without a redeploy. Ethereum's
///     USDX has had a pause since it was written; Solana had no equivalent,
///     so a compromise there could only be answered by revoking the mint
///     authority, which is irreversible.
#[account]
#[derive(InitSpace)]
pub struct BridgeConfig {
    pub admin: Pubkey,
    pub relayer: Pubkey,
    pub paused: bool,
    pub bump: u8,
}

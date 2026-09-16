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

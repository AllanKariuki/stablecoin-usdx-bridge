// programs/usdx_bridge/src/lib.rs
use anchor_lang::prelude::*;

pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;

use instructions::*;

// Matches the program address anchor keys already assigned in Anchor.toml
// ([programs.localnet].usdx_bridge). Run `anchor keys sync` after any
// redeploy that changes the program's keypair, rather than editing this by
// hand — a mismatch here breaks `anchor build`/`anchor deploy` validation.
declare_id!("9GFGtYxGtZg8Smk4yyya7zAT6V3WcLDsB9XWWQbxMS8");

#[program]
pub mod usdx_bridge {
    use super::*;

    // PDA becomes the mint authority; the program signs on its behalf via
    // invoke_signed, so no keypair ever needs to exist for this role.
    pub fn initialize_mint_authority(ctx: Context<InitAuthority>) -> Result<()> {
        handle_init_authority(ctx)
    }

    pub fn bridge_mint(
        ctx: Context<BridgeMint>,
        amount: u64,
        correlation_id: [u8; 32],
    ) -> Result<()> {
        handle_bridge_mint(ctx, amount, correlation_id)
    }

    pub fn bridge_burn(
        ctx: Context<BridgeBurn>,
        amount: u64,
        correlation_id: [u8; 32],
    ) -> Result<()> {
        handle_bridge_burn(ctx, amount, correlation_id)
    }

    // Called by the user's own wallet (never the relayer) to authorize the
    // relayer-driven bridge_burn above.
    pub fn approve_bridge_delegate(ctx: Context<ApproveBridgeDelegate>, amount: u64) -> Result<()> {
        handle_approve_bridge_delegate(ctx, amount)
    }
}

#[event]
pub struct BridgeMinted {
    pub to: Pubkey,
    pub amount: u64,
    pub correlation_id: [u8; 32],
}

#[event]
pub struct BridgeBurned {
    pub from: Pubkey,
    pub amount: u64,
    pub correlation_id: [u8; 32],
}

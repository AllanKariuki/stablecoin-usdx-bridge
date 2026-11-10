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

    // ---- Configuration (P6) ------------------------------------------------
    //
    // These four exist so that the relayer is a value rather than a constant.
    // Before them, rotating a key — the thing you do the moment one is
    // suspected of leaking — meant rebuilding and redeploying the program,
    // with a window in between during which the compromised key still worked.
    // The risk register calls it R6 and gates rotation on exactly this.

    pub fn initialize_config(ctx: Context<InitializeConfig>, admin: Pubkey) -> Result<()> {
        handle_initialize_config(ctx, admin)
    }

    pub fn set_relayer(ctx: Context<AdminOnly>, new_relayer: Pubkey) -> Result<()> {
        handle_set_relayer(ctx, new_relayer)
    }

    pub fn set_admin(ctx: Context<AdminOnly>, new_admin: Pubkey) -> Result<()> {
        handle_set_admin(ctx, new_admin)
    }

    // Ethereum's USDX has had a pause since it was written. Solana had no
    // equivalent, so the only answer to a compromise was revoking the mint
    // authority — irreversible, and it takes the honest users with it.
    pub fn set_paused(ctx: Context<AdminOnly>, paused: bool) -> Result<()> {
        handle_set_paused(ctx, paused)
    }
}

#[event]
pub struct RelayerChanged {
    pub previous: Pubkey,
    pub current: Pubkey,
}

#[event]
pub struct AdminChanged {
    pub previous: Pubkey,
    pub current: Pubkey,
}

#[event]
pub struct PausedChanged {
    pub paused: bool,
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

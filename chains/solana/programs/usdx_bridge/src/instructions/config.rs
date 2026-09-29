use anchor_lang::prelude::*;

use crate::{constants::*, error::ErrorCode, state::BridgeConfig, AdminChanged, PausedChanged, RelayerChanged};

/// Creates the config account. Idempotent in practice because `init` fails if
/// it already exists — running it twice is an error, not a reset, which is
/// the correct behaviour for an account whose whole job is to say who may
/// change things.
#[derive(Accounts)]
pub struct InitializeConfig<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        init,
        payer = payer,
        space = 8 + BridgeConfig::INIT_SPACE,
        seeds = [CONFIG_SEED],
        bump,
    )]
    pub config: Account<'info, BridgeConfig>,

    pub system_program: Program<'info, System>,
}

pub fn handle_initialize_config(ctx: Context<InitializeConfig>, admin: Pubkey) -> Result<()> {
    // A zero admin would lock the config forever: nothing could ever satisfy
    // the admin constraint, so the relayer could never be rotated and the
    // bridge could never be paused. Rejecting it is cheap; recovering from it
    // is a redeploy.
    require!(admin != Pubkey::default(), ErrorCode::InvalidPubkey);

    let config = &mut ctx.accounts.config;
    config.admin = admin;
    // Seeded from the constant the program shipped with, so an existing
    // deployment can initialise without knowing a pubkey out of band. From
    // here on, set_relayer is the only way it changes.
    config.relayer = default_relayer_pubkey();
    config.paused = false;
    config.bump = ctx.bumps.config;
    Ok(())
}

// ---------------------------------------------------------------------------

#[derive(Accounts)]
pub struct AdminOnly<'info> {
    #[account(
        mut,
        seeds = [CONFIG_SEED],
        bump = config.bump,
        constraint = config.admin == admin.key() @ ErrorCode::InvalidAdmin,
    )]
    pub config: Account<'info, BridgeConfig>,

    pub admin: Signer<'info>,
}

/// Rotating the relayer. This is the instruction R6 was waiting for: what used
/// to be a program redeploy is now one transaction, so a suspected key can be
/// retired in the time it takes to sign.
pub fn handle_set_relayer(ctx: Context<AdminOnly>, new_relayer: Pubkey) -> Result<()> {
    // The default pubkey is nobody. Setting it would not "disable" the
    // relayer, it would leave an account nothing can satisfy — use `pause`
    // for that, which is reversible.
    require!(new_relayer != Pubkey::default(), ErrorCode::InvalidPubkey);

    let previous = ctx.accounts.config.relayer;
    ctx.accounts.config.relayer = new_relayer;

    emit!(RelayerChanged {
        previous,
        current: new_relayer,
    });
    Ok(())
}

/// Handing over the admin role.
///
/// A one-step transfer, deliberately not the two-step accept/claim pattern.
/// The counter-argument is real — a typo'd address bricks governance — but
/// the admin here is a multisig whose proposal is reviewed before it is
/// signed, and a two-step handover has its own failure mode: a pending
/// transfer that everyone forgets about and a second admin who does not know
/// they can claim it.
pub fn handle_set_admin(ctx: Context<AdminOnly>, new_admin: Pubkey) -> Result<()> {
    require!(new_admin != Pubkey::default(), ErrorCode::InvalidPubkey);

    let previous = ctx.accounts.config.admin;
    ctx.accounts.config.admin = new_admin;

    emit!(AdminChanged {
        previous,
        current: new_admin,
    });
    Ok(())
}

/// Pausing. Ethereum's USDX has had this since it was written; Solana had no
/// equivalent, so the only answer to a compromise was revoking the mint
/// authority — which is irreversible, and takes the honest users with it.
pub fn handle_set_paused(ctx: Context<AdminOnly>, paused: bool) -> Result<()> {
    ctx.accounts.config.paused = paused;
    emit!(PausedChanged { paused });
    Ok(())
}

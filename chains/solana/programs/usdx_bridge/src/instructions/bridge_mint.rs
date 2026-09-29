use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, MintTo, Token, TokenAccount};

use crate::{constants::*, error::ErrorCode, state::{BridgeConfig, ProcessedMarker}, BridgeMinted};

#[derive(Accounts)]
#[instruction(amount: u64, correlation_id: [u8; 32])]
pub struct BridgeMint<'info> {
    #[account(mut)]
    pub mint: Account<'info, Mint>,

    /// CHECK: PDA signer only, holds no data of its own.
    #[account(seeds = [MINT_AUTHORITY_SEED], bump)]
    pub mint_authority: UncheckedAccount<'info>,

    #[account(mut, constraint = destination.mint == mint.key())]
    pub destination: Account<'info, TokenAccount>,

    // Replay protection: fails to init (and so fails the whole instruction)
    // if this correlation_id has already been minted.
    #[account(
        init,
        payer = relayer,
        space = 8 + ProcessedMarker::INIT_SPACE,
        seeds = [PROCESSED_SEED, correlation_id.as_ref()],
        bump,
    )]
    pub processed_marker: Account<'info, ProcessedMarker>,

    // The relayer is read from BridgeConfig, not from a compile-time
    // constant. That is the whole of R6's fix: rotating a suspected key is a
    // transaction (set_relayer) rather than a program redeploy with a
    // governance window during which the compromised key still works.
    //
    // The pause check lives here too, so a paused bridge rejects at
    // constraint evaluation — before any token CPI is attempted.
    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump,
        constraint = !config.paused @ ErrorCode::BridgePaused,
    )]
    pub config: Account<'info, BridgeConfig>,

    #[account(mut, constraint = relayer.key() == config.relayer @ ErrorCode::InvalidRelayer)]
    pub relayer: Signer<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn handle_bridge_mint(
    ctx: Context<BridgeMint>,
    amount: u64,
    correlation_id: [u8; 32],
) -> Result<()> {
    ctx.accounts.processed_marker.bump = ctx.bumps.processed_marker;

    let seeds: &[&[u8]] = &[MINT_AUTHORITY_SEED, &[ctx.bumps.mint_authority]];
    let signer = &[seeds];

    token::mint_to(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.key(),
            MintTo {
                mint: ctx.accounts.mint.to_account_info(),
                to: ctx.accounts.destination.to_account_info(),
                authority: ctx.accounts.mint_authority.to_account_info(),
            },
            signer,
        ),
        amount,
    )?;

    emit!(BridgeMinted {
        to: ctx.accounts.destination.key(),
        amount,
        correlation_id,
    });
    Ok(())
}

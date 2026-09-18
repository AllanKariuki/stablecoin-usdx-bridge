use anchor_lang::prelude::*;
use anchor_lang::solana_program::program_option::COption;
use anchor_spl::token::{self, Burn, Mint, Token, TokenAccount};

use crate::{constants::*, error::ErrorCode, state::ProcessedMarker, BridgeBurned};

// Burns from `source` using the mint_authority PDA as the SPL *delegate*,
// not the token owner — the owner must have already called
// approve_bridge_delegate (see that file) to grant this. That's what lets
// the backend relayer drive this instruction unilaterally, the same trust
// model USDX.sol's relayer-gated bridgeBurn uses on Ethereum, without the
// relayer ever holding a user's Solana private key.
#[derive(Accounts)]
#[instruction(amount: u64, correlation_id: [u8; 32])]
pub struct BridgeBurn<'info> {
    #[account(mut)]
    pub mint: Account<'info, Mint>,

    /// CHECK: PDA signer/delegate only, holds no data of its own.
    #[account(seeds = [MINT_AUTHORITY_SEED], bump)]
    pub mint_authority: UncheckedAccount<'info>,

    #[account(
        mut,
        constraint = source.mint == mint.key(),
        constraint = source.delegate == COption::Some(mint_authority.key()) @ ErrorCode::NoDelegateApproval,
        constraint = source.delegated_amount >= amount @ ErrorCode::InsufficientDelegatedAmount,
    )]
    pub source: Account<'info, TokenAccount>,

    // Replay protection: fails to init (and so fails the whole instruction)
    // if this correlation_id has already been burned.
    #[account(
        init,
        payer = relayer,
        space = 8 + ProcessedMarker::INIT_SPACE,
        seeds = [PROCESSED_SEED, correlation_id.as_ref()],
        bump,
    )]
    pub processed_marker: Account<'info, ProcessedMarker>,

    #[account(mut, constraint = relayer.key() == relayer_pubkey() @ ErrorCode::InvalidRelayer)]
    pub relayer: Signer<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn handle_bridge_burn(
    ctx: Context<BridgeBurn>,
    amount: u64,
    correlation_id: [u8; 32],
) -> Result<()> {
    ctx.accounts.processed_marker.bump = ctx.bumps.processed_marker;

    let seeds: &[&[u8]] = &[MINT_AUTHORITY_SEED, &[ctx.bumps.mint_authority]];
    let signer = &[seeds];

    token::burn(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.key(),
            Burn {
                mint: ctx.accounts.mint.to_account_info(),
                from: ctx.accounts.source.to_account_info(),
                authority: ctx.accounts.mint_authority.to_account_info(),
            },
            signer,
        ),
        amount,
    )?;

    emit!(BridgeBurned {
        from: ctx.accounts.source.key(),
        amount,
        correlation_id,
    });
    Ok(())
}

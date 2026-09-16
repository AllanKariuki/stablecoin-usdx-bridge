use anchor_lang::prelude::*;
use anchor_spl::token::{self, Burn, Mint, Token, TokenAccount};

use crate::{constants::*, state::ProcessedMarker, BridgeBurned};

// NOTE: SPL's Burn instruction requires the token account's owner (or an
// approved delegate) as authority — a backend relayer holding no user
// private keys cannot sign this on a user's behalf the way USDX.sol's
// relayer-gated bridgeBurn does on Ethereum. As written, `owner` must sign,
// which means core-ledger's saga (designed to call BridgeBurn unilaterally
// from a background goroutine, see internal/bridge/saga.go) CANNOT drive
// this leg for a Solana source_chain without either (a) the user co-signing
// the burn transaction client-side, or (b) the user first delegating burn
// authority over this token account to `mint_authority` via SPL's Approve
// instruction, after which the relayer could sign in the owner's place.
// Neither exists yet — pick one before wiring the Solana source leg.
#[derive(Accounts)]
#[instruction(amount: u64, correlation_id: [u8; 32])]
pub struct BridgeBurn<'info> {
    #[account(mut)]
    pub mint: Account<'info, Mint>,

    #[account(mut, constraint = source.mint == mint.key())]
    pub source: Account<'info, TokenAccount>,

    #[account(mut)]
    pub owner: Signer<'info>,

    // Replay protection: fails to init (and so fails the whole instruction)
    // if this correlation_id has already been burned.
    #[account(
        init,
        payer = owner,
        space = 8 + ProcessedMarker::INIT_SPACE,
        seeds = [PROCESSED_SEED, correlation_id.as_ref()],
        bump,
    )]
    pub processed_marker: Account<'info, ProcessedMarker>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn handle_bridge_burn(
    ctx: Context<BridgeBurn>,
    amount: u64,
    correlation_id: [u8; 32],
) -> Result<()> {
    ctx.accounts.processed_marker.bump = ctx.bumps.processed_marker;

    token::burn(
        CpiContext::new(
            ctx.accounts.token_program.key(),
            Burn {
                mint: ctx.accounts.mint.to_account_info(),
                from: ctx.accounts.source.to_account_info(),
                authority: ctx.accounts.owner.to_account_info(),
            },
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

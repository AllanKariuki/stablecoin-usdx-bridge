use anchor_lang::prelude::*;
use anchor_spl::token::{self, Approve, Token, TokenAccount};

use crate::constants::*;

// One-time (or top-up) step a user's own wallet calls, client-side, before
// the backend relayer can burn on their behalf: delegates burn authority
// over `amount` to the mint_authority PDA. SPL's Burn instruction accepts
// either the account owner or an approved delegate as authority, and the
// PDA has no private key, so this delegation is the only way the relayer
// can later drive bridge_burn without the user's key — mirroring the trust
// USDX.sol's BRIDGE_ROLE grants on Ethereum, but via an explicit opt-in
// instead of an unconditional grant over arbitrary balances.
#[derive(Accounts)]
pub struct ApproveBridgeDelegate<'info> {
    pub owner: Signer<'info>,

    #[account(mut, constraint = source.owner == owner.key())]
    pub source: Account<'info, TokenAccount>,

    /// CHECK: PDA delegate target only, holds no data of its own.
    #[account(seeds = [MINT_AUTHORITY_SEED], bump)]
    pub mint_authority: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
}

pub fn handle_approve_bridge_delegate(ctx: Context<ApproveBridgeDelegate>, amount: u64) -> Result<()> {
    token::approve(
        CpiContext::new(
            ctx.accounts.token_program.key(),
            Approve {
                to: ctx.accounts.source.to_account_info(),
                delegate: ctx.accounts.mint_authority.to_account_info(),
                authority: ctx.accounts.owner.to_account_info(),
            },
        ),
        amount,
    )
}

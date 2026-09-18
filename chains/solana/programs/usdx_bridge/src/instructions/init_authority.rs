use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token};

use crate::constants::*;

#[derive(Accounts)]
pub struct InitAuthority<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    // Mint authority is a PDA, not a keypair — no private key exists for it,
    // so it can only ever sign via the program's own invoke_signed (seeds
    // below), which is what makes bridge_mint safe to run from a backend
    // relayer that never holds a chain-native signing key for this role.
    #[account(
        init,
        payer = payer,
        mint::decimals = USDX_DECIMALS,
        mint::authority = mint_authority,
    )]
    pub mint: Account<'info, Mint>,

    /// CHECK: PDA signer only, holds no data of its own.
    #[account(seeds = [MINT_AUTHORITY_SEED], bump)]
    pub mint_authority: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handle_init_authority(_ctx: Context<InitAuthority>) -> Result<()> {
    Ok(())
}

// programs/usdx_bridge/src/lib.rs
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Burn, Mint, MintTo, Token, TokenAccount};

declare_id!("YourProgramIdHere11111111111111111111111");

#[program]
pub mod usdx_bridge {
    use super::*;

    pub fn initialize_mint_authority(ctx: Context<InitAuthority>) -> Result<()> {
        // PDA becomes the mint authority; program signs on its behalf
        Ok(())
    }

    pub fn bridge_mint(
        ctx: Context<BridgeMint>,
        amount: u64,
        correlation_id: [u8; 32],
    ) -> Result<()> {
        let seeds = &[b"mint-authority".as_ref(), &[ctx.bumps.mint_authority]];
        let signer = &[&seeds[..]];

        token::mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                MintTo {
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.destination.to_account_info(),
                    authority: ctx.accounts.mint_authority.to_account_info(),
                },
                signer,
            ),
            amount,
        )?;

        emit!(BridgeMinted { to: ctx.accounts.destination.key(), amount, correlation_id });
        Ok(())
    }

    pub fn bridge_burn(
        ctx: Context<BridgeBurn>,
        amount: u64,
        correlation_id: [u8; 32],
    ) -> Result<()> {
        token::burn(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Burn {
                    mint: ctx.accounts.mint.to_account_info(),
                    from: ctx.accounts.source.to_account_info(),
                    authority: ctx.accounts.owner.to_account_info(),
                },
            ),
            amount,
        )?;

        emit!(BridgeBurned { from: ctx.accounts.source.key(), amount, correlation_id });
        Ok(())
    }
}

#[derive(Accounts)]
pub struct BridgeMint<'info> {
    #[account(mut)] pub mint: Account<'info, Mint>,
    #[account(seeds = [b"mint-authority"], bump)]
    /// CHECK: PDA signer only
    pub mint_authority: UncheckedAccount<'info>,
    #[account(mut)] pub destination: Account<'info, TokenAccount>,
    #[account(constraint = relayer.key() == RELAYER_PUBKEY)]
    pub relayer: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

#[event]
pub struct BridgeMinted { pub to: Pubkey, pub amount: u64, pub correlation_id: [u8; 32] }
#[event]
pub struct BridgeBurned { pub from: Pubkey, pub amount: u64, pub correlation_id: [u8; 32] }
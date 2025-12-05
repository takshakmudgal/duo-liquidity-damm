use crate::state::{ErrorCode, LendingPool};
use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

#[derive(Accounts)]
pub struct InitializeLendingPool<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    /// CHECK: Safe
    pub authority: UncheckedAccount<'info>,

    /// CHECK: Safe
    pub amm_pool: UncheckedAccount<'info>,

    pub token_a_mint: Account<'info, Mint>,
    pub token_b_mint: Account<'info, Mint>,

    #[account(
        init,
        payer = payer,
        space = LendingPool::LEN,
        seeds = [b"lending_pool", amm_pool.key().as_ref()],
        bump
    )]
    pub lending_pool: AccountLoader<'info, LendingPool>,

    #[account(
        init,
        payer = payer,
        token::mint = token_a_mint,
        token::authority = lending_pool,
        seeds = [b"token_a_vault", lending_pool.key().as_ref()],
        bump
    )]
    pub token_a_vault: Account<'info, TokenAccount>,

    #[account(
        init,
        payer = payer,
        token::mint = token_b_mint,
        token::authority = lending_pool,
        seeds = [b"token_b_vault", lending_pool.key().as_ref()],
        bump
    )]
    pub token_b_vault: Account<'info, TokenAccount>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
}

pub fn handle_initialize_lending_pool(
    ctx: Context<InitializeLendingPool>,
    min_collateral_ratio: u16,
    liquidation_threshold: u16,
    protocol_fee_bps: u16,
) -> Result<()> {
    require!(
        min_collateral_ratio >= 10000,
        ErrorCode::InsufficientCollateral
    );
    require!(
        liquidation_threshold < min_collateral_ratio,
        ErrorCode::InsufficientCollateral
    );
    require!(protocol_fee_bps <= 1000, ErrorCode::MathOverflow);

    let mut lending_pool = ctx.accounts.lending_pool.load_init()?;
    lending_pool.initialize(
        ctx.accounts.authority.key(),
        ctx.accounts.amm_pool.key(),
        ctx.accounts.token_a_mint.key(),
        ctx.accounts.token_b_mint.key(),
        ctx.accounts.token_a_vault.key(),
        ctx.accounts.token_b_vault.key(),
        min_collateral_ratio,
        liquidation_threshold,
        protocol_fee_bps,
        ctx.bumps.lending_pool,
    );
    Ok(())
}

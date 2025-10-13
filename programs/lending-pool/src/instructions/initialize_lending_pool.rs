use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

use crate::state::LendingPool;

#[derive(Accounts)]
pub struct InitializeLendingPool<'info> {
    #[account(
        init,
        payer = payer,
        space = LendingPool::LEN,
        seeds = [b"lending_pool", amm_pool.key().as_ref()],
        bump
    )]
    pub lending_pool: AccountLoader<'info, LendingPool>,

    /// CHECK: validated in CPI calls
    pub amm_pool: UncheckedAccount<'info>,

    pub token_a_mint: Account<'info, Mint>,

    pub token_b_mint: Account<'info, Mint>,

    #[account(
        init,
        payer = payer,
        token::mint = token_b_mint,
        token::authority = lending_pool,
        seeds = [b"token_b_vault", lending_pool.key().as_ref()],
        bump
    )]
    pub token_b_vault: Account<'info, TokenAccount>,

    pub authority: Signer<'info>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handle_initialize_lending_pool(
    ctx: Context<InitializeLendingPool>,
    min_collateral_ratio: u16,
    liquidation_threshold: u16,
    protocol_fee_bps: u16,
) -> Result<()> {
    require!(
        min_collateral_ratio >= 10000,
        crate::state::ErrorCode::InsufficientCollateral
    );
    require!(
        liquidation_threshold < min_collateral_ratio,
        crate::state::ErrorCode::InsufficientCollateral
    );
    require!(
        protocol_fee_bps <= 1000,
        crate::state::ErrorCode::MathOverflow
    );

    let mut lending_pool = ctx.accounts.lending_pool.load_init()?;
    let bump = ctx.bumps.lending_pool;

    lending_pool.initialize(
        ctx.accounts.authority.key(),
        ctx.accounts.amm_pool.key(),
        ctx.accounts.token_a_mint.key(),
        ctx.accounts.token_b_mint.key(),
        ctx.accounts.token_b_vault.key(),
        min_collateral_ratio,
        liquidation_threshold,
        protocol_fee_bps,
        bump,
    );

    Ok(())
}

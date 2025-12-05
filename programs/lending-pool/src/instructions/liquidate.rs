use crate::state::{ErrorCode, LendingPool, LiquidateParams, ShortPosition};
use anchor_lang::prelude::*;
use anchor_spl::token::{self, close_account, CloseAccount, Mint, Token, TokenAccount, Transfer};
use cp_amm::{cpi::accounts::SwapCtx as AmmSwapCtx, program::CpAmm, SwapParameters};

#[derive(Accounts)]
pub struct Liquidate<'info> {
    #[account(mut)]
    pub lending_pool: AccountLoader<'info, LendingPool>,

    #[account(
        mut,
        seeds = [
            b"short_position",
            lending_pool.key().as_ref(),
            short_position.owner.as_ref(),
        ],
        bump = short_position.bump,
        has_one = lending_pool
    )]
    pub short_position: Account<'info, ShortPosition>,

    /// CHECK: validated in CPI
    #[account(mut)]
    pub amm_pool: UncheckedAccount<'info>,
    /// CHECK: pool authority PDA
    pub pool_authority: UncheckedAccount<'info>,

    /// CHECK: validated in CPI
    pub event_authority: UncheckedAccount<'info>,

    pub token_a_mint: Account<'info, Mint>,
    pub token_b_mint: Account<'info, Mint>,

    #[account(mut)]
    pub amm_token_a_vault: Account<'info, TokenAccount>,
    #[account(mut)]
    pub amm_token_b_vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [b"token_a_vault", lending_pool.key().as_ref()],
        bump
    )]
    pub token_a_vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [b"token_b_vault", lending_pool.key().as_ref()],
        bump
    )]
    pub token_b_vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [b"temp_token_a", short_position.key().as_ref()],
        bump
    )]
    pub temp_token_a_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub liquidator_reward_account: Account<'info, TokenAccount>,

    pub liquidator: Signer<'info>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub cp_amm_program: Program<'info, CpAmm>,
    pub token_program: Program<'info, Token>,
}

pub fn handle_liquidate(ctx: Context<Liquidate>, params: LiquidateParams) -> Result<()> {
    require!(
        ctx.accounts.short_position.status == 0,
        ErrorCode::PositionNotActive
    );

    let (lending_pool_bump, liquidation_threshold) = {
        let pool = ctx.accounts.lending_pool.load()?;
        (pool.bump, pool.liquidation_threshold)
    };

    let amm_pool_data = ctx.accounts.amm_pool.try_borrow_data()?;
    let amm_pool_state = bytemuck::try_from_bytes::<cp_amm::state::Pool>(&amm_pool_data[8..])
        .map_err(|_| ErrorCode::MathOverflow)?;
    let current_sqrt_price = amm_pool_state.sqrt_price;
    drop(amm_pool_data);

    let ratio = ctx
        .accounts
        .short_position
        .get_collateral_ratio(current_sqrt_price)?;
    require!(
        ratio < liquidation_threshold as u128,
        ErrorCode::PositionHealthy
    );

    let amm_pool_key = ctx.accounts.amm_pool.key();
    let seeds = &[
        b"lending_pool".as_ref(),
        amm_pool_key.as_ref(),
        &[lending_pool_bump],
    ];
    let signer = &[&seeds[..]];

    let borrowed_amount = ctx.accounts.short_position.borrowed_amount;

    cp_amm::cpi::swap(
        CpiContext::new_with_signer(
            ctx.accounts.cp_amm_program.to_account_info(),
            AmmSwapCtx {
                pool_authority: ctx.accounts.pool_authority.to_account_info(),
                pool: ctx.accounts.amm_pool.to_account_info(),
                input_token_account: ctx.accounts.token_b_vault.to_account_info(),
                output_token_account: ctx.accounts.temp_token_a_account.to_account_info(),
                token_a_vault: ctx.accounts.amm_token_a_vault.to_account_info(),
                token_b_vault: ctx.accounts.amm_token_b_vault.to_account_info(),
                token_a_mint: ctx.accounts.token_a_mint.to_account_info(),
                token_b_mint: ctx.accounts.token_b_mint.to_account_info(),
                payer: ctx.accounts.lending_pool.to_account_info(),
                token_a_program: ctx.accounts.token_program.to_account_info(),
                token_b_program: ctx.accounts.token_program.to_account_info(),
                referral_token_account: None,
                event_authority: ctx.accounts.event_authority.to_account_info(),
                program: ctx.accounts.cp_amm_program.to_account_info(),
            },
            signer,
        ),
        SwapParameters {
            amount_in: params.max_sol_in,
            minimum_amount_out: borrowed_amount,
        },
    )?;

    ctx.accounts.temp_token_a_account.reload()?;
    let transfer_amount = ctx.accounts.temp_token_a_account.amount;

    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.temp_token_a_account.to_account_info(),
                to: ctx.accounts.token_a_vault.to_account_info(),
                authority: ctx.accounts.lending_pool.to_account_info(),
            },
            signer,
        ),
        transfer_amount,
    )?;

    let bonus = 1000;
    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.token_b_vault.to_account_info(),
                to: ctx.accounts.liquidator_reward_account.to_account_info(),
                authority: ctx.accounts.lending_pool.to_account_info(),
            },
            signer,
        ),
        bonus,
    )?;

    close_account(CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        CloseAccount {
            account: ctx.accounts.temp_token_a_account.to_account_info(),
            destination: ctx.accounts.payer.to_account_info(),
            authority: ctx.accounts.lending_pool.to_account_info(),
        },
        signer,
    ))?;

    let mut lending_pool = ctx.accounts.lending_pool.load_mut()?;
    ctx.accounts.short_position.status = 2;
    lending_pool.decrement_positions()?;
    lending_pool.remove_borrowed(borrowed_amount)?;

    Ok(())
}

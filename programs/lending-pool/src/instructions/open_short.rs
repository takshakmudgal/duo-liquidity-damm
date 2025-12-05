use crate::state::{ErrorCode, LendingPool, OpenShortParams, ShortPosition};
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};
use cp_amm::{cpi::accounts::SwapCtx as AmmSwapCtx, program::CpAmm, SwapParameters};

#[derive(Accounts)]
pub struct OpenShort<'info> {
    pub cp_amm_program: Program<'info, CpAmm>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,

    #[account(mut)]
    pub lending_pool: AccountLoader<'info, LendingPool>,

    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        init,
        payer = user,
        space = ShortPosition::LEN,
        seeds = [
            b"short_position",
            lending_pool.key().as_ref(),
            user.key().as_ref(),
        ],
        bump
    )]
    pub short_position: Account<'info, ShortPosition>,

    /// CHECK: validated in CPI
    #[account(mut)]
    pub amm_pool: UncheckedAccount<'info>,
    /// CHECK: pool authority PDA
    pub pool_authority: UncheckedAccount<'info>,

    pub token_a_mint: Account<'info, Mint>,
    pub token_b_mint: Account<'info, Mint>,

    /// CHECK: validated in CPI
    pub event_authority: UncheckedAccount<'info>,

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

    #[account(mut)]
    pub user_token_b_account: Account<'info, TokenAccount>,

    #[account(
        init,
        payer = user,
        token::mint = token_a_mint,
        token::authority = lending_pool,
        seeds = [b"temp_token_a", short_position.key().as_ref()],
        bump
    )]
    pub temp_token_a_account: Account<'info, TokenAccount>,
}

pub fn handle_open_short(ctx: Context<OpenShort>, params: OpenShortParams) -> Result<()> {
    let OpenShortParams {
        collateral_amount,
        borrow_amount,
        minimum_sol_out,
    } = params;

    let (protocol_fee_bps, lending_pool_bump, lending_pool_key) = {
        let lending_pool = ctx.accounts.lending_pool.load()?;
        (
            lending_pool.protocol_fee_bps,
            lending_pool.bump,
            ctx.accounts.lending_pool.key(),
        )
    };

    let protocol_fee = (collateral_amount as u128)
        .checked_mul(protocol_fee_bps as u128)
        .ok_or(ErrorCode::MathOverflow)?
        .checked_div(10000)
        .ok_or(ErrorCode::MathOverflow)? as u64;

    let net_collateral = collateral_amount
        .checked_sub(protocol_fee)
        .ok_or(ErrorCode::MathOverflow)?;

    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.user_token_b_account.to_account_info(),
                to: ctx.accounts.token_b_vault.to_account_info(),
                authority: ctx.accounts.user.to_account_info(),
            },
        ),
        collateral_amount,
    )?;

    let amm_pool_key = ctx.accounts.amm_pool.key();
    let seeds = &[
        b"lending_pool".as_ref(),
        amm_pool_key.as_ref(),
        &[lending_pool_bump],
    ];
    let signer = &[&seeds[..]];

    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.token_a_vault.to_account_info(),
                to: ctx.accounts.temp_token_a_account.to_account_info(),
                authority: ctx.accounts.lending_pool.to_account_info(),
            },
            signer,
        ),
        borrow_amount,
    )?;

    let swap_params = SwapParameters {
        amount_in: borrow_amount,
        minimum_amount_out: minimum_sol_out,
    };

    let amm_pool_data = ctx.accounts.amm_pool.try_borrow_data()?;
    let amm_pool_state = bytemuck::try_from_bytes::<cp_amm::state::Pool>(&amm_pool_data[8..])
        .map_err(|_| ErrorCode::MathOverflow)?;
    let entry_sqrt_price = amm_pool_state.sqrt_price;
    drop(amm_pool_data);

    cp_amm::cpi::swap(
        CpiContext::new_with_signer(
            ctx.accounts.cp_amm_program.to_account_info(),
            AmmSwapCtx {
                pool_authority: ctx.accounts.pool_authority.to_account_info(),
                pool: ctx.accounts.amm_pool.to_account_info(),
                input_token_account: ctx.accounts.temp_token_a_account.to_account_info(),
                output_token_account: ctx.accounts.token_b_vault.to_account_info(),
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
        swap_params,
    )?;

    let mut lending_pool = ctx.accounts.lending_pool.load_mut()?;
    lending_pool.add_reserves(net_collateral)?;
    lending_pool.add_borrowed(borrow_amount)?;
    lending_pool.increment_positions()?;

    ctx.accounts.short_position.initialize(
        lending_pool_key,
        ctx.accounts.user.key(),
        net_collateral,
        borrow_amount,
        minimum_sol_out,
        entry_sqrt_price,
        ctx.bumps.short_position,
    )?;

    Ok(())
}

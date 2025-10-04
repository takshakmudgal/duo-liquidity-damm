use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};
use cp_amm::{cpi::accounts::SwapCtx as AmmSwapCtx, program::CpAmm, SwapParameters};

use crate::state::{ErrorCode, LendingPool, ShortPosition};

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct OpenShortParams {
    /// Amount of SOL to deposit as collateral
    pub collateral_amount: u64,
    /// Amount of Token A to borrow and short
    pub borrow_amount: u64,
    /// Minimum amount of SOL expected from the swap (slippage protection)
    pub minimum_sol_out: u64,
}

#[derive(Accounts)]
pub struct OpenShort<'info> {
    #[account(mut)]
    pub lending_pool: AccountLoader<'info, LendingPool>,

    #[account(
        init,
        payer = user,
        space = ShortPosition::LEN,
        seeds = [
            b"short_position",
            lending_pool.key().as_ref(),
            user.key().as_ref(),
            &lending_pool.load()?.active_positions.to_le_bytes()
        ],
        bump
    )]
    pub short_position: Account<'info, ShortPosition>,

    /// CHECK: validated in CPI
    #[account(mut)]
    pub amm_pool: UncheckedAccount<'info>,

    /// CHECK: pool authority PDA
    pub pool_authority: UncheckedAccount<'info>,

    /// Token A mint (the token being shorted)
    pub token_a_mint: Account<'info, Mint>,

    /// Token B mint (SOL/stable)
    pub token_b_mint: Account<'info, Mint>,

    /// AMM's Token A vault
    #[account(mut)]
    pub amm_token_a_vault: Account<'info, TokenAccount>,

    /// AMM's Token B vault
    #[account(mut)]
    pub amm_token_b_vault: Account<'info, TokenAccount>,

    /// Lending pool's Token B vault
    #[account(
        mut,
        seeds = [b"token_b_vault", lending_pool.key().as_ref()],
        bump
    )]
    pub lending_pool_vault: Account<'info, TokenAccount>,

    /// User's Token B account (to deposit collateral)
    #[account(mut)]
    pub user_token_b_account: Account<'info, TokenAccount>,

    /// Temporary Token A account for the swap
    /// This will receive the borrowed Token A before swapping
    #[account(
        init,
        payer = user,
        token::mint = token_a_mint,
        token::authority = lending_pool,
        seeds = [b"temp_token_a", short_position.key().as_ref()],
        bump
    )]
    pub temp_token_a_account: Account<'info, TokenAccount>,

    /// User executing the short
    #[account(mut)]
    pub user: Signer<'info>,

    pub cp_amm_program: Program<'info, CpAmm>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handle_open_short(ctx: Context<OpenShort>, params: OpenShortParams) -> Result<()> {
    let OpenShortParams {
        collateral_amount,
        borrow_amount,
        minimum_sol_out,
    } = params;

    require!(collateral_amount > 0, ErrorCode::InsufficientCollateral);
    require!(borrow_amount > 0, ErrorCode::InvalidSwapAmount);

    let mut lending_pool = ctx.accounts.lending_pool.load_mut()?;
    
    // Calculate protocol fee
    let protocol_fee = (collateral_amount as u128)
        .checked_mul(lending_pool.protocol_fee_bps as u128)
        .ok_or(ErrorCode::MathOverflow)?
        .checked_div(10000)
        .ok_or(ErrorCode::MathOverflow)? as u64;

    let net_collateral = collateral_amount
        .checked_sub(protocol_fee)
        .ok_or(ErrorCode::MathOverflow)?;

    // 1. Transfer collateral from user to lending pool vault
    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.user_token_b_account.to_account_info(),
                to: ctx.accounts.lending_pool_vault.to_account_info(),
                authority: ctx.accounts.user.to_account_info(),
            },
        ),
        collateral_amount,
    )?;

    lending_pool.add_reserves(net_collateral)?;
    lending_pool.protocol_fees = lending_pool.protocol_fees
        .checked_add(protocol_fee)
        .ok_or(ErrorCode::MathOverflow)?;

    // 2. Borrow Token A from AMM pool by transferring from AMM vault to temp account
    // Note: This is a simplified version. In production, you'd need proper authorization
    // and the AMM would need to support lending functionality
    let lending_pool_key = ctx.accounts.lending_pool.key();
    let amm_pool_key = ctx.accounts.amm_pool.key();
    let seeds = &[
        b"lending_pool".as_ref(),
        amm_pool_key.as_ref(),
        &[lending_pool.bump],
    ];
    let signer = &[&seeds[..]];

    // Transfer borrowed Token A to temp account
    // This simulates borrowing - in production this would be a more complex operation
    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.amm_token_a_vault.to_account_info(),
                to: ctx.accounts.temp_token_a_account.to_account_info(),
                authority: ctx.accounts.pool_authority.to_account_info(),
            },
            signer,
        ),
        borrow_amount,
    )?;

    lending_pool.add_borrowed(borrow_amount)?;

    // 3. Swap Token A for Token B (SOL) using the AMM
    let swap_params = SwapParameters {
        amount_in: borrow_amount,
        minimum_amount_out: minimum_sol_out,
    };

    // Get current pool state to record entry price
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
                output_token_account: ctx.accounts.lending_pool_vault.to_account_info(),
                token_a_vault: ctx.accounts.amm_token_a_vault.to_account_info(),
                token_b_vault: ctx.accounts.amm_token_b_vault.to_account_info(),
                token_a_mint: ctx.accounts.token_a_mint.to_account_info(),
                token_b_mint: ctx.accounts.token_b_mint.to_account_info(),
                payer: ctx.accounts.lending_pool.to_account_info(),
                token_a_program: ctx.accounts.token_program.to_account_info(),
                token_b_program: ctx.accounts.token_program.to_account_info(),
                referral_token_account: None,
                event_authority: ctx.accounts.cp_amm_program.to_account_info(),
                program: ctx.accounts.cp_amm_program.to_account_info(),
            },
            signer,
        ),
        swap_params,
    )?;

    // Get the amount received from swap
    ctx.accounts.lending_pool_vault.reload()?;
    let vault_balance_after = ctx.accounts.lending_pool_vault.amount;
    let sol_from_swap = vault_balance_after
        .checked_sub(net_collateral)
        .ok_or(ErrorCode::InvalidSwapAmount)?;

    require!(sol_from_swap >= minimum_sol_out, ErrorCode::SlippageExceeded);

    lending_pool.add_reserves(sol_from_swap)?;

    // 4. Initialize the short position
    ctx.accounts.short_position.initialize(
        lending_pool_key,
        ctx.accounts.user.key(),
        net_collateral,
        borrow_amount,
        sol_from_swap,
        entry_sqrt_price,
        ctx.bumps.short_position,
    )?;

    lending_pool.increment_positions()?;

    // Calculate and verify collateral ratio
    let collateral_ratio = ctx.accounts.short_position.get_collateral_ratio(entry_sqrt_price)?;
    require!(
        collateral_ratio >= lending_pool.min_collateral_ratio as u128,
        ErrorCode::InsufficientCollateral
    );

    msg!("Short position opened");
    msg!("Collateral: {} SOL", net_collateral);
    msg!("Borrowed: {} Token A", borrow_amount);
    msg!("SOL from swap: {}", sol_from_swap);
    msg!("Collateral ratio: {}%", collateral_ratio as f64 / 100.0);

    Ok(())
}


use anchor_lang::prelude::*;
use anchor_spl::token::{self, close_account, CloseAccount, Mint, Token, TokenAccount, Transfer};
use cp_amm::{cpi::accounts::SwapCtx as AmmSwapCtx, program::CpAmm, SwapParameters};

use crate::state::{ErrorCode, LendingPool, ShortPosition};

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct CloseShortParams {
    pub max_sol_in: u64,
}

#[derive(Accounts)]
pub struct CloseShort<'info> {
    #[account(mut)]
    pub lending_pool: AccountLoader<'info, LendingPool>,

    #[account(
        mut,
        seeds = [
            b"short_position",
            lending_pool.key().as_ref(),
            user.key().as_ref(),
            &short_position.lending_pool.to_bytes()[24..32]
        ],
        bump = short_position.bump,
        has_one = lending_pool,
        has_one = owner @ ErrorCode::Unauthorized
    )]
    pub short_position: Account<'info, ShortPosition>,

    /// CHECK: validated in CPI
    #[account(mut)]
    pub amm_pool: UncheckedAccount<'info>,

    /// CHECK: pool authority PDA
    pub pool_authority: UncheckedAccount<'info>,

    pub token_a_mint: Account<'info, Mint>,

    pub token_b_mint: Account<'info, Mint>,

    #[account(mut)]
    pub amm_token_a_vault: Account<'info, TokenAccount>,

    #[account(mut)]
    pub amm_token_b_vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [b"token_b_vault", lending_pool.key().as_ref()],
        bump
    )]
    pub lending_pool_vault: Account<'info, TokenAccount>,

    #[account(mut)]
    pub user_token_b_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [b"temp_token_a", short_position.key().as_ref()],
        bump
    )]
    pub temp_token_a_account: Account<'info, TokenAccount>,

    pub owner: Signer<'info>,

    #[account(mut)]
    pub user: Signer<'info>,

    pub cp_amm_program: Program<'info, CpAmm>,
    pub token_program: Program<'info, Token>,
}

pub fn handle_close_short(ctx: Context<CloseShort>, params: CloseShortParams) -> Result<()> {
    let CloseShortParams { max_sol_in } = params;

    require!(
        ctx.accounts.short_position.status == 0,
        ErrorCode::PositionNotActive
    );

    let mut lending_pool = ctx.accounts.lending_pool.load_mut()?;
    let amm_pool_key = ctx.accounts.amm_pool.key();
    let seeds = &[
        b"lending_pool".as_ref(),
        amm_pool_key.as_ref(),
        &[lending_pool.bump],
    ];
    let signer = &[&seeds[..]];

    let borrowed_amount = ctx.accounts.short_position.borrowed_amount;

    let swap_params = SwapParameters {
        amount_in: max_sol_in,
        minimum_amount_out: borrowed_amount,
    };

    let vault_balance_before = ctx.accounts.lending_pool_vault.amount;

    cp_amm::cpi::swap(
        CpiContext::new_with_signer(
            ctx.accounts.cp_amm_program.to_account_info(),
            AmmSwapCtx {
                pool_authority: ctx.accounts.pool_authority.to_account_info(),
                pool: ctx.accounts.amm_pool.to_account_info(),
                input_token_account: ctx.accounts.lending_pool_vault.to_account_info(),
                output_token_account: ctx.accounts.temp_token_a_account.to_account_info(),
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

    ctx.accounts.lending_pool_vault.reload()?;
    ctx.accounts.temp_token_a_account.reload()?;

    let vault_balance_after = ctx.accounts.lending_pool_vault.amount;
    let buyback_cost = vault_balance_before
        .checked_sub(vault_balance_after)
        .ok_or(ErrorCode::MathOverflow)?;

    let token_a_received = ctx.accounts.temp_token_a_account.amount;
    require!(
        token_a_received >= borrowed_amount,
        ErrorCode::InvalidSwapAmount
    );

    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.temp_token_a_account.to_account_info(),
                to: ctx.accounts.amm_token_a_vault.to_account_info(),
                authority: ctx.accounts.lending_pool.to_account_info(),
            },
            signer,
        ),
        borrowed_amount,
    )?;

    lending_pool.remove_borrowed(borrowed_amount)?;

    let (pnl_amount, is_profit) = ctx.accounts.short_position.calculate_pnl(buyback_cost)?;

    let total_collateral = ctx
        .accounts
        .short_position
        .collateral_amount
        .checked_add(ctx.accounts.short_position.sol_from_swap)
        .ok_or(ErrorCode::MathOverflow)?;

    if is_profit {
        let total_return = ctx
            .accounts
            .short_position
            .collateral_amount
            .checked_add(pnl_amount)
            .ok_or(ErrorCode::MathOverflow)?;

        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.lending_pool_vault.to_account_info(),
                    to: ctx.accounts.user_token_b_account.to_account_info(),
                    authority: ctx.accounts.lending_pool.to_account_info(),
                },
                signer,
            ),
            total_return,
        )?;

        lending_pool.remove_reserves(total_collateral)?;

        msg!("Position closed with profit: {} SOL", pnl_amount);
    } else {
        if pnl_amount <= ctx.accounts.short_position.collateral_amount {
            let remaining = ctx
                .accounts
                .short_position
                .collateral_amount
                .checked_sub(pnl_amount)
                .ok_or(ErrorCode::MathOverflow)?;

            if remaining > 0 {
                token::transfer(
                    CpiContext::new_with_signer(
                        ctx.accounts.token_program.to_account_info(),
                        Transfer {
                            from: ctx.accounts.lending_pool_vault.to_account_info(),
                            to: ctx.accounts.user_token_b_account.to_account_info(),
                            authority: ctx.accounts.lending_pool.to_account_info(),
                        },
                        signer,
                    ),
                    remaining,
                )?;
            }

            lending_pool.remove_reserves(total_collateral)?;

            msg!("Position closed with loss: {} SOL", pnl_amount);
        } else {
            let deficit = pnl_amount
                .checked_sub(ctx.accounts.short_position.collateral_amount)
                .ok_or(ErrorCode::MathOverflow)?;

            token::transfer(
                CpiContext::new(
                    ctx.accounts.token_program.to_account_info(),
                    Transfer {
                        from: ctx.accounts.user_token_b_account.to_account_info(),
                        to: ctx.accounts.lending_pool_vault.to_account_info(),
                        authority: ctx.accounts.owner.to_account_info(),
                    },
                ),
                deficit,
            )?;

            lending_pool.remove_reserves(ctx.accounts.short_position.sol_from_swap)?;

            msg!(
                "Position closed with large loss: {} SOL (deficit paid)",
                pnl_amount
            );
        }
    }

    close_account(CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        CloseAccount {
            account: ctx.accounts.temp_token_a_account.to_account_info(),
            destination: ctx.accounts.user.to_account_info(),
            authority: ctx.accounts.lending_pool.to_account_info(),
        },
        signer,
    ))?;

    ctx.accounts.short_position.status = 1; // Closed
    lending_pool.decrement_positions()?;

    msg!("Short position closed successfully");
    msg!("Buyback cost: {} SOL", buyback_cost);

    Ok(())
}

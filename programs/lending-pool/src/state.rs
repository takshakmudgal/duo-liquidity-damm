use anchor_lang::prelude::*;

#[account(zero_copy)]
#[derive(InitSpace)]
pub struct LendingPool {
    pub authority: Pubkey,
    pub amm_pool: Pubkey,
    pub token_a_mint: Pubkey,
    pub token_b_mint: Pubkey,
    pub token_b_vault: Pubkey,
    pub total_reserves: u64,
    pub total_borrowed: u64,
    pub active_positions: u64,
    pub min_collateral_ratio: u16,
    pub liquidation_threshold: u16,
    pub protocol_fee_bps: u16,
    pub _padding_0: u16,
    pub protocol_fees: u64,
    pub bump: u8,
    pub _padding: [u8; 7],
    pub _reserved: [u64; 16],
}

#[account]
#[derive(InitSpace)]
pub struct ShortPosition {
    pub lending_pool: Pubkey,
    pub owner: Pubkey,
    pub collateral_amount: u64,
    pub borrowed_amount: u64,
    pub sol_from_swap: u64,
    pub entry_sqrt_price: u128,
    pub opened_at: i64,
    pub bump: u8,
    pub status: u8,
    pub _padding: [u8; 6],
}

#[account]
pub struct OpenShortParams {
    pub collateral_amount: u64,
    pub borrow_amount: u64,
    pub minimum_sol_out: u64,
}

impl LendingPool {
    pub const LEN: usize = 8 + LendingPool::INIT_SPACE;

    pub fn initialize(
        &mut self,
        authority: Pubkey,
        amm_pool: Pubkey,
        token_a_mint: Pubkey,
        token_b_mint: Pubkey,
        token_b_vault: Pubkey,
        min_collateral_ratio: u16,
        liquidation_threshold: u16,
        protocol_fee_bps: u16,
        bump: u8,
    ) {
        self.authority = authority;
        self.amm_pool = amm_pool;
        self.token_a_mint = token_a_mint;
        self.token_b_mint = token_b_mint;
        self.token_b_vault = token_b_vault;
        self.min_collateral_ratio = min_collateral_ratio;
        self.liquidation_threshold = liquidation_threshold;
        self.protocol_fee_bps = protocol_fee_bps;
        self.bump = bump;
        self.total_reserves = 0;
        self.total_borrowed = 0;
        self.active_positions = 0;
        self.protocol_fees = 0;
    }

    pub fn add_reserves(&mut self, amount: u64) -> Result<()> {
        self.total_reserves = self
            .total_reserves
            .checked_add(amount)
            .ok_or(error!(ErrorCode::MathOverflow))?;
        Ok(())
    }

    pub fn remove_reserves(&mut self, amount: u64) -> Result<()> {
        self.total_reserves = self
            .total_reserves
            .checked_sub(amount)
            .ok_or(error!(ErrorCode::InsufficientReserves))?;
        Ok(())
    }

    pub fn add_borrowed(&mut self, amount: u64) -> Result<()> {
        self.total_borrowed = self
            .total_borrowed
            .checked_add(amount)
            .ok_or(error!(ErrorCode::MathOverflow))?;
        Ok(())
    }

    pub fn remove_borrowed(&mut self, amount: u64) -> Result<()> {
        self.total_borrowed = self
            .total_borrowed
            .checked_sub(amount)
            .ok_or(error!(ErrorCode::MathOverflow))?;
        Ok(())
    }

    pub fn increment_positions(&mut self) -> Result<()> {
        self.active_positions = self
            .active_positions
            .checked_add(1)
            .ok_or(error!(ErrorCode::MathOverflow))?;
        Ok(())
    }

    pub fn decrement_positions(&mut self) -> Result<()> {
        self.active_positions = self
            .active_positions
            .checked_sub(1)
            .ok_or(error!(ErrorCode::MathOverflow))?;
        Ok(())
    }
}

impl ShortPosition {
    pub const LEN: usize = 8 + ShortPosition::INIT_SPACE;

    pub fn initialize(
        &mut self,
        lending_pool: Pubkey,
        owner: Pubkey,
        collateral_amount: u64,
        borrowed_amount: u64,
        sol_from_swap: u64,
        entry_sqrt_price: u128,
        bump: u8,
    ) -> Result<()> {
        self.lending_pool = lending_pool;
        self.owner = owner;
        self.collateral_amount = collateral_amount;
        self.borrowed_amount = borrowed_amount;
        self.sol_from_swap = sol_from_swap;
        self.entry_sqrt_price = entry_sqrt_price;
        self.opened_at = Clock::get()?.unix_timestamp;
        self.bump = bump;
        self.status = 0; // active
        Ok(())
    }

    pub fn get_collateral_ratio(&self, current_sqrt_price: u128) -> Result<u128> {
        let total_collateral = self
            .collateral_amount
            .checked_add(self.sol_from_swap)
            .ok_or(error!(ErrorCode::MathOverflow))?;

        let price_ratio = (current_sqrt_price as u128)
            .checked_mul(10000)
            .ok_or(error!(ErrorCode::MathOverflow))?
            .checked_div(self.entry_sqrt_price as u128)
            .ok_or(error!(ErrorCode::MathOverflow))?;

        let borrowed_value = (self.borrowed_amount as u128)
            .checked_mul(price_ratio)
            .ok_or(error!(ErrorCode::MathOverflow))?
            .checked_div(10000)
            .ok_or(error!(ErrorCode::MathOverflow))?;

        if borrowed_value == 0 {
            return Ok(u128::MAX);
        }

        let ratio = (total_collateral as u128)
            .checked_mul(10000)
            .ok_or(error!(ErrorCode::MathOverflow))?
            .checked_div(borrowed_value)
            .ok_or(error!(ErrorCode::MathOverflow))?;

        Ok(ratio)
    }

    pub fn calculate_pnl(&self, buyback_cost: u64) -> Result<(u64, bool)> {
        let total_collateral = self
            .collateral_amount
            .checked_add(self.sol_from_swap)
            .ok_or(error!(ErrorCode::MathOverflow))?;

        if buyback_cost > total_collateral {
            let loss = buyback_cost
                .checked_sub(total_collateral)
                .ok_or(error!(ErrorCode::MathOverflow))?;
            Ok((loss, false))
        } else {
            let profit = total_collateral
                .checked_sub(buyback_cost)
                .ok_or(error!(ErrorCode::MathOverflow))?;
            Ok((profit, true))
        }
    }
}

#[error_code]
pub enum ErrorCode {
    #[msg("Math overflow")]
    MathOverflow,
    #[msg("Insufficient reserves in lending pool")]
    InsufficientReserves,
    #[msg("Insufficient collateral")]
    InsufficientCollateral,
    #[msg("Position is undercollateralized")]
    Undercollateralized,
    #[msg("Position not active")]
    PositionNotActive,
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Invalid swap amount")]
    InvalidSwapAmount,
    #[msg("Slippage exceeded")]
    SlippageExceeded,
    #[msg("Position healthy, cannot liquidate")]
    PositionHealthy,
}

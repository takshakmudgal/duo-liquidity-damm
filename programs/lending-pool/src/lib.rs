use anchor_lang::prelude::*;

pub mod instructions;
pub mod state;

pub use instructions::*;
pub use state::*;

declare_id!("9o42VBepS4qZHsPcCY8rn9G9YFqs3RtZB7TEK4DWAu8Y");

#[program]
pub mod lending_pool {
    use super::*;

    pub fn initialize_lending_pool(
        ctx: Context<InitializeLendingPool>,
        min_collateral_ratio: u16,
        liquidation_threshold: u16,
        protocol_fee_bps: u16,
    ) -> Result<()> {
        instructions::handle_initialize_lending_pool(
            ctx,
            min_collateral_ratio,
            liquidation_threshold,
            protocol_fee_bps,
        )
    }

    pub fn open_short(ctx: Context<OpenShort>, params: OpenShortParams) -> Result<()> {
        instructions::handle_open_short(ctx, params)
    }

    pub fn close_short(ctx: Context<CloseShort>, params: CloseShortParams) -> Result<()> {
        instructions::handle_close_short(ctx, params)
    }

    pub fn liquidate(ctx: Context<Liquidate>, params: LiquidateParams) -> Result<()> {
        instructions::handle_liquidate(ctx, params)
    }
}


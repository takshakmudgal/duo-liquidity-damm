# DuoLiquidity Protocol

## Overview

DuoLiquidity is a dual-pool DeFi system combining a Constant Product AMM (based on Meteora DAMM v2) with a Lending Pool to enable short positions on Solana tokens.

## Key Features

### CP-AMM (Constant Product Automated Market Maker)
- Fixed hot account issue from dynamic-amm v1
- Full Token-2022 support
- Fee management with position NFTs and permanent locking
- Base fee scheduler and volatility-based dynamic fees
- Price range concentrated liquidity

### Lending Pool
- Short Token A using Token B (SOL) as collateral
- 150% minimum collateralization
- Automatic liquidation at 120%
- Real-time PnL tracking based on AMM prices
- No external oracles
- Permissionless liquidations with 5% bonus

## Use Cases

1. Hedging: Protect long positions by shorting the same asset
2. Speculation: Profit from price decreases
3. Arbitrage: Take advantage of price discrepancies
4. Market Making: Provide liquidity while hedging exposure

## How Shorting Works

### Opening a Short Position
```
1. Deposit SOL as collateral (150% of borrow value)
   ↓
2. Lending Pool borrows Token A from AMM
   ↓
3. Swaps Token A → SOL via AMM
   ↓
4. Pool holds: Original collateral + Swap proceeds
   ↓
5. Position tracked with entry price, collateral, and borrowed amount
```

### Closing a Short Position
```
1. Buy back Token A from AMM using SOL reserves
   ↓
2. Return Token A to AMM vault
   ↓
3. Calculate PnL (profit if price dropped, loss if increased)
   ↓
4. Return collateral ± PnL to user
```

## System Components

### Programs

1. **cp-amm** (`cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG`)
   - Traditional constant product AMM
   - Handles swaps, liquidity provision, and rewards
   
2. **lending-pool** (`9o42VBepS4qZHsPcCY8rn9G9YFqs3RtZB7TEK4DWAu8Y`)
   - Short position management
   - Collateral tracking and liquidations
   - CPI integration with cp-amm

## Quick Start

```bash
# Install dependencies
pnpm install

# Build all programs
anchor build

# Run tests
anchor test

# Deploy to devnet
anchor deploy --provider.cluster devnet
```

### Example: Open a Short Position

```typescript
import { Program } from "@coral-xyz/anchor";
import { LendingPool } from "./target/types/lending_pool";

const program = workspace.LendingPool as Program<LendingPool>;

await program.methods
  .openShort({
    collateralAmount: new BN(100_000_000_000), // 100 SOL
    borrowAmount: new BN(100_000_000),          // 100 Token A
    minimumSolOut: new BN(95_000_000_000),      // 5% slippage
  })
  .accounts({ /* ... */ })
  .rpc();
```

## CP-AMM Endpoints
### Admin
- create_config: create a static config key that includes all pre-defined parameters when user create pools with that config key.
- create_dynamic_config: create a dynamic config key that only define pool creator authority.
- create_token_badge: whitelist token mint, that has non-permissionless extensions (token2022)
- create_claim_fee_operator: whitelist an address to claim protocol fee
- close_claim_fee_operato: unwhitelist the address to claim protocol fee
- close_config: close a config key
- initialize_reward: initialize an on-chain liquidity mining for a pool
- update_reward_funder: update a whitelisted address to fund rewards for on-chain liquidity mining 
- update_reward_duration: update reward duration for liquidity mining
- set_pool_status: enable or disable pools. If pool is disabled, user can only be able to withdraw, can't add liquidity or swap

### Keeper to claim protocol fee
- claim_protocol_fee: claim protocol fee to Meteora's treasury address

### Token team (who run on-chain liquidity mining)
- fund_reward: fund reward for on-chain liquidity mining
- withdraw_ineligible_reward: withdraw ineligible reward 

### Partner (aka Launchpad)
- claim_partner_fee: claim partner fee

### Token deployer 
- initialize_pool: create a new pool from a static config key 
- initialize_pool_with_dynamic_config: create a new pool from a dynamic config key 
- initialize_customizable_pool: create a new pool with customizable parameters, should be only used by token deployer, that token can't be leaked.

### Liquidity provider
- create_position: create a new position nft, that holds liquidity that owner will deposit later
- add_liquidity: add liquidity to a pool 
- remove_liquidity: remove liquidity from a pool
- remove_all_liquidity: remove all liquidity from a pool
- claim_position_fee: claim position fee 
- lock_position: lock position with a vesting schedule
- refresh_vesting: refresh vesting schedule
- permanent_lock_position: lock position permanently 
- claim_reward: claim rewards from on-chain liquidity mining

### Trading bot/ user swap with pools
- swap: swap with the pool

## Lending Pool Endpoints

### Admin
- **initialize_lending_pool**: Create a new lending pool for an AMM pair
  - Sets collateral ratio requirements
  - Configures liquidation thresholds
  - Defines protocol fees

### Traders
- **open_short**: Open a short position
  - Deposit collateral
  - Borrow and sell Token A
  - Track position state
  
- **close_short**: Close an existing short position
  - Buy back Token A
  - Settle PnL
  - Return collateral ± profit/loss

### Liquidators
- **liquidate**: Liquidate undercollateralized positions
  - Anyone can call permissionlessly
  - Earn 5% bonus on successful liquidation
  - Protects pool solvency

## Config key state (CP-AMM)
- vault_config_key: alpha-vault address that is able to buy pool before activation_point
- pool_creator_authority: if this address is non-default, then only this address can create pool with that config key (for launchpad)
- pool_fees: includes base fee scheduler, dynamic-fee, protocol fee percent, partner fee percent, and referral fee percent configuration
- activation_type: determines whether pools are run in slot or timestamp 
- collect_fee_mode: determines whether pool should collect fees in both tokens or only one token
- sqrt_min_price: square root of min price for pools
- sqrt_max_price: square root of max price for pools

## Development

### Dependencies

- anchor 0.31.0
- solana 2.1.0
- rust 1.85.0

### Build

Program 

```
anchor build
```

CLI

```
cargo build -p cli
```

### Test

```
pnpm install
pnpm test
```

## Deployments

### CP-AMM
- Mainnet-beta: `cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG`
- Devnet: `cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG`

### Lending Pool
- Localnet: `9o42VBepS4qZHsPcCY8rn9G9YFqs3RtZB7TEK4DWAu8Y`
- Devnet: TBD
- Mainnet: TBD

## Security

### Audits
The CP-AMM program has been audited. You can find the audit report [here](https://docs.meteora.ag/resources/audits#id-2.-damm-v2).

The Lending Pool has not been audited. Use at your own risk.

### Risk Disclosures
- Short positions carry unlimited loss potential
- Liquidation occurs below 120% collateral ratio
- Smart contract risk
- Oracle risk from AMM pricing
- Test on devnet first

## Simulations

Run simulations matching Excel scenarios:
```bash
node simulations/run.js
```

Scenarios covered:
- Initial pool setup
- Long positions (add liquidity)
- Swaps with price impact
- Short position opening
- Profit scenarios (price drops)
- Liquidation scenarios (price rises)
- Multiple swaps with fees
- Complete lifecycle

## Contributing

Contributions are welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Write tests for new functionality
4. Ensure all tests pass
5. Submit a pull request

## License

This project builds upon Meteora's DAMM v2 and follows the same licensing terms.

## Resources

- Solana Documentation: https://docs.solana.com/
- Anchor Framework: https://www.anchor-lang.com/
- Meteora Protocol: https://www.meteora.ag/

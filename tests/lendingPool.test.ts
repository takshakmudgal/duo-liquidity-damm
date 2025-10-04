import { BN } from "@coral-xyz/anchor";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";

describe("lending-pool simulations", () => {

  it("simulates Excel scenario: initial pool setup", async () => {
    const initialLiquidityA = new BN(20000000000);
    const initialLiquidityB = new BN(80000000000);
    const sqrtPrice = new BN("141421356237309504880");
    
    console.log("Initial State:");
    console.log("Token A Amount:", initialLiquidityA.toString());
    console.log("Token B Amount:", initialLiquidityB.toString());
    console.log("Price (Token B per Token A):", 
      initialLiquidityB.toNumber() / initialLiquidityA.toNumber());
  });

  it("simulates Excel scenario: long position (add liquidity)", async () => {
    const addLiquidityA = new BN(10000000);
    const addLiquidityB = new BN(40000000);
    
    const totalA = new BN(20000000000).add(addLiquidityA);
    const totalB = new BN(80000000000).add(addLiquidityB);
    
    console.log("\nAfter Long (Add Liquidity):");
    console.log("Total Token A:", totalA.toString());
    console.log("Total Token B:", totalB.toString());
    console.log("Price:", totalB.toNumber() / totalA.toNumber());
  });

  it("simulates Excel scenario: sell (swap A to B)", async () => {
    const poolA = new BN(20010000000);
    const poolB = new BN(80040000000);
    const swapAmountA = new BN(2000000000);
    
    const k = poolA.mul(poolB);
    const newPoolA = poolA.add(swapAmountA);
    const newPoolB = k.div(newPoolA);
    const outputB = poolB.sub(newPoolB);
    
    console.log("\nAfter Sell (Swap A->B):");
    console.log("Input Token A:", swapAmountA.toString());
    console.log("Output Token B:", outputB.toString());
    console.log("New Pool A:", newPoolA.toString());
    console.log("New Pool B:", newPoolB.toString());
    console.log("New Price:", newPoolB.toNumber() / newPoolA.toNumber());
    
    const priceImpact = ((poolB.toNumber() / poolA.toNumber()) - 
                         (newPoolB.toNumber() / newPoolA.toNumber())) / 
                         (poolB.toNumber() / poolA.toNumber());
    console.log("Price Impact:", (priceImpact * 100).toFixed(4) + "%");
  });

  it("simulates Excel scenario: short position calculations", async () => {
    const collateral = new BN(100 * LAMPORTS_PER_SOL);
    const borrowAmount = new BN(100 * 10 ** 9);
    const entryPrice = 4.0;
    
    const swapProceeds = new BN(98 * LAMPORTS_PER_SOL);
    const totalReserves = collateral.add(swapProceeds);
    
    console.log("\nShort Position Opened:");
    console.log("Collateral (SOL):", collateral.toNumber() / LAMPORTS_PER_SOL);
    console.log("Borrowed (Token A):", borrowAmount.toNumber() / 10 ** 9);
    console.log("Entry Price:", entryPrice);
    console.log("Swap Proceeds (SOL):", swapProceeds.toNumber() / LAMPORTS_PER_SOL);
    console.log("Total Reserves:", totalReserves.toNumber() / LAMPORTS_PER_SOL);
    
    const collateralRatio = (totalReserves.toNumber() / LAMPORTS_PER_SOL) / 
                            ((borrowAmount.toNumber() / 10 ** 9) * entryPrice);
    console.log("Collateral Ratio:", (collateralRatio * 100).toFixed(2) + "%");
    
    const profitScenario = 0.7;
    const buybackCostProfit = (borrowAmount.toNumber() / 10 ** 9) * profitScenario * LAMPORTS_PER_SOL;
    const pnlProfit = (totalReserves.toNumber() - buybackCostProfit) / LAMPORTS_PER_SOL;
    console.log("\nProfit Scenario (price drops to 0.7):");
    console.log("Buyback Cost:", buybackCostProfit / LAMPORTS_PER_SOL);
    console.log("PnL:", pnlProfit);
    
    const lossScenario = 1.65;
    const buybackCostLoss = (borrowAmount.toNumber() / 10 ** 9) * lossScenario * LAMPORTS_PER_SOL;
    const liquidationPrice = 2.1;
    const ratioAtLiquidation = (totalReserves.toNumber() / LAMPORTS_PER_SOL) / 
                                ((borrowAmount.toNumber() / 10 ** 9) * liquidationPrice);
    console.log("\nLiquidation Scenario (price rises to 2.1):");
    console.log("Buyback Cost:", (borrowAmount.toNumber() / 10 ** 9) * liquidationPrice);
    console.log("Collateral Ratio:", (ratioAtLiquidation * 100).toFixed(2) + "%");
    console.log("Can Liquidate:", ratioAtLiquidation < 1.2 ? "YES" : "NO");
  });

  it("simulates Excel scenario: multiple swaps with fees", async () => {
    let poolA = new BN(20000000000);
    let poolB = new BN(80000000000);
    const feeBps = 25;
    
    const swaps = [
      { amountIn: new BN(1000000000), direction: "AtoB" },
      { amountIn: new BN(2000000000), direction: "BtoA" },
      { amountIn: new BN(500000000), direction: "AtoB" },
    ];
    
    console.log("\nMultiple Swap Simulation:");
    console.log("Initial Pool - A:", poolA.toString(), "B:", poolB.toString());
    
    for (let i = 0; i < swaps.length; i++) {
      const swap = swaps[i];
      const fee = swap.amountIn.muln(feeBps).divn(10000);
      const amountInAfterFee = swap.amountIn.sub(fee);
      
      if (swap.direction === "AtoB") {
        const k = poolA.mul(poolB);
        const newPoolA = poolA.add(amountInAfterFee);
        const newPoolB = k.div(newPoolA);
        const outputB = poolB.sub(newPoolB);
        
        console.log(`\nSwap ${i + 1} (A->B):`);
        console.log("  Input A:", swap.amountIn.toString());
        console.log("  Fee:", fee.toString());
        console.log("  Output B:", outputB.toString());
        console.log("  New Price:", newPoolB.toNumber() / newPoolA.toNumber());
        
        poolA = newPoolA;
        poolB = newPoolB;
      } else {
        const k = poolA.mul(poolB);
        const newPoolB = poolB.add(amountInAfterFee);
        const newPoolA = k.div(newPoolB);
        const outputA = poolA.sub(newPoolA);
        
        console.log(`\nSwap ${i + 1} (B->A):`);
        console.log("  Input B:", swap.amountIn.toString());
        console.log("  Fee:", fee.toString());
        console.log("  Output A:", outputA.toString());
        console.log("  New Price:", newPoolB.toNumber() / newPoolA.toNumber());
        
        poolA = newPoolA;
        poolB = newPoolB;
      }
    }
    
    console.log("\nFinal Pool - A:", poolA.toString(), "B:", poolB.toString());
  });

  it("simulates Excel scenario: cumulative fee tracking", async () => {
    let totalLpFees = new BN(0);
    let totalProtocolFees = new BN(0);
    const lpFeeBps = 20;
    const protocolFeeBps = 5;
    
    const transactions = [
      new BN(1000000000),
      new BN(2000000000),
      new BN(500000000),
      new BN(1500000000),
    ];
    
    console.log("\nCumulative Fee Tracking:");
    
    transactions.forEach((tx, i) => {
      const lpFee = tx.muln(lpFeeBps).divn(10000);
      const protocolFee = tx.muln(protocolFeeBps).divn(10000);
      
      totalLpFees = totalLpFees.add(lpFee);
      totalProtocolFees = totalProtocolFees.add(protocolFee);
      
      console.log(`Transaction ${i + 1}:`);
      console.log("  Amount:", tx.toString());
      console.log("  LP Fee:", lpFee.toString());
      console.log("  Protocol Fee:", protocolFee.toString());
      console.log("  Cumulative LP Fees:", totalLpFees.toString());
      console.log("  Cumulative Protocol Fees:", totalProtocolFees.toString());
    });
  });

  it("simulates Excel scenario: liquidation with price movements", async () => {
    const positions = [
      { collateral: 150, borrowed: 100, entryPrice: 1.0 },
      { collateral: 200, borrowed: 120, entryPrice: 1.2 },
      { collateral: 180, borrowed: 90, entryPrice: 1.5 },
    ];
    
    const priceMovements = [1.0, 1.2, 1.5, 1.8, 2.0, 2.2];
    
    console.log("\nLiquidation Simulation:");
    
    positions.forEach((pos, i) => {
      console.log(`\nPosition ${i + 1}:`);
      console.log("  Collateral:", pos.collateral);
      console.log("  Borrowed:", pos.borrowed);
      console.log("  Entry Price:", pos.entryPrice);
      
      const swapProceeds = pos.borrowed * pos.entryPrice * 0.98;
      const totalReserves = pos.collateral + swapProceeds;
      
      priceMovements.forEach((price) => {
        const borrowedValue = pos.borrowed * price;
        const ratio = totalReserves / borrowedValue;
        const status = ratio >= 1.5 ? "SAFE" : 
                      ratio >= 1.2 ? "AT RISK" : 
                      "LIQUIDATABLE";
        
        console.log(`  Price ${price}: Ratio ${(ratio * 100).toFixed(2)}% - ${status}`);
      });
    });
  });

  it("simulates Excel scenario: complete lifecycle", async () => {
    console.log("\n=== COMPLETE LIFECYCLE SIMULATION ===");
    
    let poolStateA = new BN(20000000000);
    let poolStateB = new BN(80000000000);
    
    console.log("\n1. Initial Pool State");
    console.log("   Token A:", poolStateA.toString());
    console.log("   Token B:", poolStateB.toString());
    console.log("   Price:", poolStateB.toNumber() / poolStateA.toNumber());
    
    console.log("\n2. User Opens Short Position");
    const shortCollateral = new BN(150 * LAMPORTS_PER_SOL);
    const shortBorrow = new BN(100 * 10 ** 9);
    poolStateA = poolStateA.add(shortBorrow);
    const swapOut = poolStateB.mul(shortBorrow).div(poolStateA);
    poolStateB = poolStateB.sub(swapOut);
    console.log("   Deposited Collateral:", shortCollateral.toNumber() / LAMPORTS_PER_SOL);
    console.log("   Borrowed Token A:", shortBorrow.toString());
    console.log("   Received from Swap:", swapOut.toNumber() / LAMPORTS_PER_SOL);
    console.log("   New Pool State A:", poolStateA.toString());
    console.log("   New Pool State B:", poolStateB.toString());
    
    console.log("\n3. Price Drops (Favorable for Short)");
    const regularSwap = new BN(5000000000);
    poolStateA = poolStateA.add(regularSwap);
    const swapOutB = poolStateB.mul(regularSwap).div(poolStateA);
    poolStateB = poolStateB.sub(swapOutB);
    console.log("   After Market Swap A:", poolStateA.toString());
    console.log("   After Market Swap B:", poolStateB.toString());
    console.log("   New Price:", poolStateB.toNumber() / poolStateA.toNumber());
    
    console.log("\n4. User Closes Short (Takes Profit)");
    const buybackCost = poolStateB.mul(shortBorrow).div(poolStateA);
    poolStateB = poolStateB.add(buybackCost);
    poolStateA = poolStateA.sub(shortBorrow);
    const totalReserves = shortCollateral.add(swapOut);
    const profit = totalReserves.sub(buybackCost);
    console.log("   Buyback Cost:", buybackCost.toNumber() / LAMPORTS_PER_SOL);
    console.log("   Total Reserves:", totalReserves.toNumber() / LAMPORTS_PER_SOL);
    console.log("   Profit:", profit.toNumber() / LAMPORTS_PER_SOL);
    console.log("   Return %:", ((profit.toNumber() / shortCollateral.toNumber()) * 100).toFixed(2));
    
    console.log("\n5. Final Pool State");
    console.log("   Token A:", poolStateA.toString());
    console.log("   Token B:", poolStateB.toString());
    console.log("   Final Price:", poolStateB.toNumber() / poolStateA.toNumber());
  });
});


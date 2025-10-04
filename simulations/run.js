const LAMPORTS_PER_SOL = 1000000000;

console.log("=== DuoLiquidity Simulations ===\n");

console.log("Scenario 1: Initial Pool Setup");
const initialLiquidityA = 20000000000n;
const initialLiquidityB = 80000000000n;
console.log("Token A Amount:", initialLiquidityA.toString());
console.log("Token B Amount:", initialLiquidityB.toString());
console.log("Price (Token B per Token A):", Number(initialLiquidityB) / Number(initialLiquidityA));
console.log("K (constant product):", (initialLiquidityA * initialLiquidityB).toString());

console.log("\nScenario 2: Long Position (Add Liquidity)");
const addLiquidityA = 10000000n;
const addLiquidityB = 40000000n;
const totalA = initialLiquidityA + addLiquidityA;
const totalB = initialLiquidityB + addLiquidityB;
console.log("Added Token A:", addLiquidityA.toString());
console.log("Added Token B:", addLiquidityB.toString());
console.log("Total Token A:", totalA.toString());
console.log("Total Token B:", totalB.toString());
console.log("New Price:", Number(totalB) / Number(totalA));

console.log("\nScenario 3: Sell (Swap A to B)");
const poolA = 20010000000n;
const poolB = 80040000000n;
const swapAmountA = 2000000000n;
const k = poolA * poolB;
const newPoolA = poolA + swapAmountA;
const newPoolB = k / newPoolA;
const outputB = poolB - newPoolB;
console.log("Input Token A:", swapAmountA.toString());
console.log("Output Token B:", outputB.toString());
console.log("New Pool A:", newPoolA.toString());
console.log("New Pool B:", newPoolB.toString());
console.log("New Price:", Number(newPoolB) / Number(newPoolA));
const priceImpact = ((Number(poolB) / Number(poolA)) - (Number(newPoolB) / Number(newPoolA))) / (Number(poolB) / Number(poolA));
console.log("Price Impact:", (priceImpact * 100).toFixed(4) + "%");

console.log("\nScenario 4: Short Position Opened");
const collateral = 100n * BigInt(LAMPORTS_PER_SOL);
const borrowAmount = 100n * 1000000000n;
const entryPrice = 4.0;
const swapProceeds = 98n * BigInt(LAMPORTS_PER_SOL);
const totalReserves = collateral + swapProceeds;
console.log("Collateral (SOL):", Number(collateral) / LAMPORTS_PER_SOL);
console.log("Borrowed (Token A):", Number(borrowAmount) / 1000000000);
console.log("Entry Price:", entryPrice);
console.log("Swap Proceeds (SOL):", Number(swapProceeds) / LAMPORTS_PER_SOL);
console.log("Total Reserves:", Number(totalReserves) / LAMPORTS_PER_SOL);
const collateralRatio = (Number(totalReserves) / LAMPORTS_PER_SOL) / ((Number(borrowAmount) / 1000000000) * entryPrice);
console.log("Collateral Ratio:", (collateralRatio * 100).toFixed(2) + "%");

console.log("\nScenario 5: Profit Scenario (price drops to 0.7)");
const profitScenario = 0.7;
const buybackCostProfit = (Number(borrowAmount) / 1000000000) * profitScenario * LAMPORTS_PER_SOL;
const pnlProfit = (Number(totalReserves) - buybackCostProfit) / LAMPORTS_PER_SOL;
console.log("Buyback Cost:", buybackCostProfit / LAMPORTS_PER_SOL);
console.log("PnL:", pnlProfit);
console.log("Return %:", ((pnlProfit / (Number(collateral) / LAMPORTS_PER_SOL)) * 100).toFixed(2) + "%");

console.log("\nScenario 6: Liquidation Scenario (price rises to 2.1)");
const liquidationPrice = 2.1;
const buybackCostLiq = (Number(borrowAmount) / 1000000000) * liquidationPrice * LAMPORTS_PER_SOL;
const ratioAtLiquidation = (Number(totalReserves) / LAMPORTS_PER_SOL) / ((Number(borrowAmount) / 1000000000) * liquidationPrice);
console.log("Buyback Cost:", buybackCostLiq / LAMPORTS_PER_SOL);
console.log("Collateral Ratio:", (ratioAtLiquidation * 100).toFixed(2) + "%");
console.log("Can Liquidate:", ratioAtLiquidation < 1.2 ? "YES" : "NO");
const remaining = Number(totalReserves) - buybackCostLiq;
const liquidatorBonus = remaining * 0.05;
console.log("Remaining after buyback:", remaining / LAMPORTS_PER_SOL);
console.log("Liquidator Bonus (5%):", liquidatorBonus / LAMPORTS_PER_SOL);

console.log("\nScenario 7: Multiple Swaps with Fees");
let currentPoolA = 20000000000n;
let currentPoolB = 80000000000n;
const feeBps = 25n;
const swaps = [
  { amountIn: 1000000000n, direction: "AtoB" },
  { amountIn: 2000000000n, direction: "BtoA" },
  { amountIn: 500000000n, direction: "AtoB" },
];
console.log("Initial Pool - A:", currentPoolA.toString(), "B:", currentPoolB.toString());
swaps.forEach((swap, i) => {
  const fee = (swap.amountIn * feeBps) / 10000n;
  const amountInAfterFee = swap.amountIn - fee;
  if (swap.direction === "AtoB") {
    const k2 = currentPoolA * currentPoolB;
    const newA = currentPoolA + amountInAfterFee;
    const newB = k2 / newA;
    const output = currentPoolB - newB;
    console.log(`Swap ${i + 1} (A->B): Input=${swap.amountIn} Fee=${fee} Output=${output} NewPrice=${Number(newB) / Number(newA)}`);
    currentPoolA = newA;
    currentPoolB = newB;
  } else {
    const k2 = currentPoolA * currentPoolB;
    const newB = currentPoolB + amountInAfterFee;
    const newA = k2 / newB;
    const output = currentPoolA - newA;
    console.log(`Swap ${i + 1} (B->A): Input=${swap.amountIn} Fee=${fee} Output=${output} NewPrice=${Number(newB) / Number(newA)}`);
    currentPoolA = newA;
    currentPoolB = newB;
  }
});
console.log("Final Pool - A:", currentPoolA.toString(), "B:", currentPoolB.toString());

console.log("\nScenario 8: Cumulative Fee Tracking");
let totalLpFees = 0n;
let totalProtocolFees = 0n;
const lpFeeBps = 20n;
const protocolFeeBps = 5n;
const transactions = [1000000000n, 2000000000n, 500000000n, 1500000000n];
transactions.forEach((tx, i) => {
  const lpFee = (tx * lpFeeBps) / 10000n;
  const protocolFee = (tx * protocolFeeBps) / 10000n;
  totalLpFees += lpFee;
  totalProtocolFees += protocolFee;
  console.log(`Tx ${i + 1}: Amount=${tx} LpFee=${lpFee} ProtocolFee=${protocolFee} CumulativeLp=${totalLpFees} CumulativeProtocol=${totalProtocolFees}`);
});

console.log("\nScenario 9: Liquidation with Price Movements");
const positions = [
  { collateral: 150, borrowed: 100, entryPrice: 1.0 },
  { collateral: 200, borrowed: 120, entryPrice: 1.2 },
  { collateral: 180, borrowed: 90, entryPrice: 1.5 },
];
const priceMovements = [1.0, 1.2, 1.5, 1.8, 2.0, 2.2];
positions.forEach((pos, i) => {
  const proceeds = pos.borrowed * pos.entryPrice * 0.98;
  const reserves = pos.collateral + proceeds;
  console.log(`Position ${i + 1}: Collateral=${pos.collateral} Borrowed=${pos.borrowed} Entry=${pos.entryPrice}`);
  priceMovements.forEach((price) => {
    const value = pos.borrowed * price;
    const ratio = reserves / value;
    const status = ratio >= 1.5 ? "SAFE" : ratio >= 1.2 ? "AT_RISK" : "LIQUIDATABLE";
    console.log(`  Price ${price}: Ratio=${(ratio * 100).toFixed(2)}% ${status}`);
  });
});

console.log("\nScenario 10: Complete Lifecycle");
let lifecycleA = 20000000000n;
let lifecycleB = 80000000000n;
console.log("1. Initial: A=" + lifecycleA + " B=" + lifecycleB + " Price=" + (Number(lifecycleB) / Number(lifecycleA)));
const shortColl = 150n * BigInt(LAMPORTS_PER_SOL);
const shortBorr = 100n * 1000000000n;
lifecycleA = lifecycleA + shortBorr;
const swapOutLC = (lifecycleB * shortBorr) / lifecycleA;
lifecycleB = lifecycleB - swapOutLC;
console.log("2. After Short: A=" + lifecycleA + " B=" + lifecycleB + " SwapOut=" + (Number(swapOutLC) / LAMPORTS_PER_SOL));
const regularSwapLC = 5000000000n;
lifecycleA = lifecycleA + regularSwapLC;
const swapOutBLC = (lifecycleB * regularSwapLC) / lifecycleA;
lifecycleB = lifecycleB - swapOutBLC;
console.log("3. After Market: A=" + lifecycleA + " B=" + lifecycleB + " Price=" + (Number(lifecycleB) / Number(lifecycleA)));
const buybackLC = (lifecycleB * shortBorr) / lifecycleA;
lifecycleB = lifecycleB + buybackLC;
lifecycleA = lifecycleA - shortBorr;
const totalResLC = shortColl + swapOutLC;
const profitLC = totalResLC - buybackLC;
console.log("4. Close: Buyback=" + (Number(buybackLC) / LAMPORTS_PER_SOL) + " Profit=" + (Number(profitLC) / LAMPORTS_PER_SOL));
console.log("5. Final: A=" + lifecycleA + " B=" + lifecycleB + " Price=" + (Number(lifecycleB) / Number(lifecycleA)));

console.log("\n=== All Simulations Complete ===");


import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { LendingPool } from "../target/types/lending_pool";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { assert } from "chai";

describe("lending-pool simulations", () => {
  anchor.setProvider(anchor.AnchorProvider.env());
  const program = anchor.workspace.LendingPool as Program<LendingPool>;

  it("simulates Excel scenario: initial pool setup", async () => {
    const initialLiquidityA = new BN("20000");
    const initialLiquidityB = new BN("80000");
    const sqrtPrice = new BN("23434");

    const tx = await program.methods.initializeLendingPool(
      initialLiquidityA.toNumber(),
      initialLiquidityB.toNumber(),
      sqrtPrice.toNumber()
    );

    console.log("Initial State:");
    console.log("Token A Amount:", initialLiquidityA.toString());
    console.log("Token B Amount:", initialLiquidityB.toString());
    console.log(
      "Price (Token B per Token A):",
      initialLiquidityB.toNumber() / initialLiquidityA.toNumber()
    );
    console.log(tx);
  });
});

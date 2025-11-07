import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { LendingPool } from "../target/types/lending_pool";
import { createMint } from "@solana/spl-token";
import { Connection, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { BN } from "bn.js";

describe("lending_pool", () => {
  anchor.setProvider(anchor.AnchorProvider.env());
  const connection = new Connection("http://127.0.0.1:8899", "confirmed");
  const program = anchor.workspace.LendingPool as Program<LendingPool>;
  let payer: any;
  let tokenAMint: any;
  let tokenBMint: any;
  let ammPool: string = "8Pm2kZpnxD3hoMmt4bjStX2Pw2Z9abpbHzZxMPqxPmie";
  let lendingPoolPda: any;
  let user: any;
  let tokenBVault: any;

  const raw = [
    {
      collateral_amount: 50000,
      borrow_amount: 4000,
      minimum_sol_out: 40,
    },
  ];
  const openShortParams = raw.map((r) => ({
    collateralAmount: new BN(r.collateral_amount),
    borrowAmount: new BN(r.borrow_amount),
    minimumSolOut: new BN(r.minimum_sol_out),
  }));

  before("create accounts", async () => {
    payer = Keypair.generate();
    const payerAirdrop = await connection.requestAirdrop(
      payer.publicKey,
      300 * LAMPORTS_PER_SOL
    );
    await connection.confirmTransaction(payerAirdrop);
    tokenAMint = await createMint(connection, payer, payer.publicKey, null, 2);
    tokenBMint = await createMint(connection, payer, payer.publicKey, null, 2);
    user = Keypair.generate();
    const userAirdrop = await connection.requestAirdrop(
      user.publicKey,
      500 * LAMPORTS_PER_SOL
    );
    await connection.confirmTransaction(userAirdrop);
  });

  it("Is initialized", async () => {
    const tx = await program.methods
      .initializeLendingPool(20000, 300, 50)
      .accounts({ tokenAMint, tokenBMint, payer, ammPool })
      .rpc();

    await new Promise((resolve) =>
      setTimeout(async () => {
        const res = await connection.getParsedTransaction(tx, "confirmed");
        lendingPoolPda =
          res?.meta?.innerInstructions?.[0]?.instructions?.[0]?.parsed?.info
            ?.newAccount;
        tokenBVault =
          res?.meta?.innerInstructions?.[0]?.instructions?.[1]?.parsed?.info
            ?.newAccount;
        resolve(null);
      }, 1000)
    );
  });

  it("Open Short", async () => {
    const tx = await program.methods
      .openShort(openShortParams[0])
      .accounts({
        lendingPool: lendingPoolPda,
        user,
        ammPool,
        poolAuthority: payer,
        tokenAMint,
        tokenBMint,
        ammTokenBVault: tokenBVault,
      })
      .rpc();
  });
});

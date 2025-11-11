import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { LendingPool } from "../target/types/lending_pool";
import { createMint } from "@solana/spl-token";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
} from "@solana/web3.js";
import { BN } from "bn.js";
import { CpAmm } from "../target/types/cp_amm";
import { createAssociatedTokenAccount } from "@solana/spl-token";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";

describe("lending_pool", () => {
  anchor.setProvider(anchor.AnchorProvider.env());
  const connection = new Connection("http://127.0.0.1:8899", "confirmed");
  const program = anchor.workspace.LendingPool as Program<LendingPool>;
  const ammProgram = anchor.workspace.CpAmm as Program<CpAmm>;
  let payer: any;
  let tokenAMint: any;
  let tokenBMint: any;
  let ammPool: string = "8Pm2kZpnxD3hoMmt4bjStX2Pw2Z9abpbHzZxMPqxPmie";
  let lendingPoolPda: any;
  let user: any;
  let tokenBVault: any;
  let creator: any;
  let payerTokenA: any;
  let payerTokenB: any;
  let pool: any;
  let programPubkey: any;

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
    creator = Keypair.generate();
    const creatorAirdrop = await connection.requestAirdrop(
      creator.publicKey,
      300 * LAMPORTS_PER_SOL
    );
    await connection.confirmTransaction(creatorAirdrop);
    tokenAMint = await createMint(connection, payer, payer.publicKey, null, 2);
    tokenBMint = await createMint(connection, payer, payer.publicKey, null, 2);
    payerTokenA = await createAssociatedTokenAccount(
      connection,
      payer,
      tokenAMint,
      payer.publicKey
    );
    user = Keypair.generate();
    payerTokenB = await createAssociatedTokenAccount(
      connection,
      payer,
      tokenBMint,
      creator.publicKey
    );
    const userAirdrop = await connection.requestAirdrop(
      user.publicKey,
      500 * LAMPORTS_PER_SOL
    );
    await connection.confirmTransaction(userAirdrop);

    pool = Keypair.generate().publicKey;
    programPubkey = Keypair.generate().publicKey;

    console.log("========== ACCOUNT PUBLIC KEYS ==========");
    console.log("payer:", payer.publicKey.toString());
    console.log("creator:", creator.publicKey.toString());
    console.log("user:", user.publicKey.toString());
    console.log("tokenAMint:", tokenAMint.toString());
    console.log("tokenBMint:", tokenBMint.toString());
    console.log("payerTokenA:", payerTokenA.toString());
    console.log("payerTokenB:", payerTokenB.toString());
    console.log("pool:", pool.toString());
    console.log("programPubkey:", programPubkey.toString());
    console.log("TOKEN_PROGRAM_ID:", TOKEN_PROGRAM_ID.toString());
    console.log("=========================================");
  });

  it("amm init", async () => {
    const tx = await ammProgram.methods
      .initializeCustomizablePool({
        poolFees: {
          baseFee: {
            cliffFeeNumerator: new BN(5),
            numberOfPeriod: 2,
            periodFrequency: new BN(2),
            reductionFactor: new BN(10),
            feeSchedulerMode: 4,
          },
          padding: [2, 4, 8],
          dynamicFee: null,
        },
        sqrtMinPrice: new BN(3455),
        sqrtMaxPrice: new BN(4543634645),
        hasAlphaVault: false,
        liquidity: new BN(34534),
        sqrtPrice: new BN(3423),
        activationType: 5,
        collectFeeMode: 3,
        activationPoint: null,
      })
      .accounts({
        creator: creator.publicKey,
        positionNftMint: await createMint(
          connection,
          payer,
          payer.publicKey,
          null,
          0
        ),
        payer,
        pool,
        tokenAMint,
        tokenBMint,
        payerTokenA,
        payerTokenB,
        tokenAProgram: TOKEN_PROGRAM_ID,
        tokenBProgram: TOKEN_PROGRAM_ID,
        program: programPubkey,
      })
      .signers([payer.publicKey])
      .rpc();

    await new Promise((resolve) =>
      setTimeout(async () => {
        const res = await connection.getParsedTransaction(tx, "confirmed");

        console.log(res);

        resolve(null);
      }, 1000)
    );
  });

  // it("Is initialized", async () => {
  //   const tx = await program.methods
  //     .initializeLendingPool(20000, 300, 50)
  //     .accounts({ tokenAMint, tokenBMint, payer, ammPool })
  //     .rpc();

  //   await new Promise((resolve) =>
  //     setTimeout(async () => {
  //       const res = await connection.getParsedTransaction(tx, "confirmed");
  //       lendingPoolPda =
  //         res?.meta?.innerInstructions?.[0]?.instructions?.[0]?.parsed?.info
  //           ?.newAccount;
  //       tokenBVault =
  //         res?.meta?.innerInstructions?.[0]?.instructions?.[1]?.parsed?.info
  //           ?.newAccount;
  //       resolve(null);
  //     }, 1000)
  //   );
  // });

  // it("Open Short", async () => {
  //   const tx = await program.methods
  //     .openShort(openShortParams[0])
  //     .accounts({
  //       lendingPool: lendingPoolPda,
  //       user,
  //       ammPool,
  //       poolAuthority: payer,
  //       tokenAMint,
  //       tokenBMint,
  //       ammTokenBVault: tokenBVault,
  //     })
  //     .rpc();
  // });
});

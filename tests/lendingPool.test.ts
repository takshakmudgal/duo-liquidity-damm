import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { LendingPool } from "../target/types/lending_pool";
import { CpAmm } from "../target/types/cp_amm";
import {
  createMint,
  mintTo,
  createAssociatedTokenAccount,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
} from "@solana/web3.js";
import { BN } from "bn.js";

function getKeysSorted(k1: PublicKey, k2: PublicKey) {
  if (Buffer.compare(k1.toBuffer(), k2.toBuffer()) > 0) {
    return { max: k1, min: k2 };
  }
  return { max: k2, min: k1 };
}

describe("lending_pool", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const connection = provider.connection;

  const program = anchor.workspace.LendingPool as Program<LendingPool>;
  const ammProgram = anchor.workspace.CpAmm as Program<CpAmm>;

  let payer = Keypair.generate();
  let creator = Keypair.generate();
  let positionNftMint = Keypair.generate();

  let tokenMaxMint: PublicKey;
  let tokenMinMint: PublicKey;

  // AMM Accounts
  let ammPool: PublicKey;
  let ammTokenMaxVault: PublicKey;
  let ammTokenMinVault: PublicKey;
  let positionNftAccount: PublicKey;
  let position: PublicKey;
  let poolAuthority: PublicKey;

  // Lending Pool Accounts
  let lendingPoolPda: PublicKey;
  let lpTokenMaxVault: PublicKey;
  let lpTokenMinVault: PublicKey;

  let shortPositionPda: PublicKey;
  let tempTokenAccount: PublicKey;
  let eventAuthority: PublicKey;

  let payerTokenMax: PublicKey;
  let payerTokenMin: PublicKey;

  const openShortParams = {
    collateralAmount: new BN(50000),
    borrowAmount: new BN(20000),
    minimumSolOut: new BN(0),
  };

  before("Setup Environment", async () => {
    await Promise.all([
      connection.requestAirdrop(payer.publicKey, 100 * LAMPORTS_PER_SOL),
      connection.requestAirdrop(creator.publicKey, 100 * LAMPORTS_PER_SOL),
    ]).then((sigs) =>
      Promise.all(sigs.map((s) => connection.confirmTransaction(s)))
    );

    const mintA = await createMint(connection, payer, payer.publicKey, null, 6);
    const mintB = await createMint(connection, payer, payer.publicKey, null, 6);

    const sorted = getKeysSorted(mintA, mintB);
    tokenMaxMint = sorted.max;
    tokenMinMint = sorted.min;

    payerTokenMax = await createAssociatedTokenAccount(
      connection,
      payer,
      tokenMaxMint,
      payer.publicKey
    );
    payerTokenMin = await createAssociatedTokenAccount(
      connection,
      payer,
      tokenMinMint,
      payer.publicKey
    );

    await mintTo(
      connection,
      payer,
      tokenMaxMint,
      payerTokenMax,
      payer.publicKey,
      1_000_000_000_000
    );
    await mintTo(
      connection,
      payer,
      tokenMinMint,
      payerTokenMin,
      payer.publicKey,
      1_000_000_000_000
    );

    // AMM Derivation
    [ammPool] = PublicKey.findProgramAddressSync(
      [Buffer.from("cpool"), tokenMaxMint.toBuffer(), tokenMinMint.toBuffer()],
      ammProgram.programId
    );

    [ammTokenMaxVault] = PublicKey.findProgramAddressSync(
      [Buffer.from("token_vault"), tokenMaxMint.toBuffer(), ammPool.toBuffer()],
      ammProgram.programId
    );

    [ammTokenMinVault] = PublicKey.findProgramAddressSync(
      [Buffer.from("token_vault"), tokenMinMint.toBuffer(), ammPool.toBuffer()],
      ammProgram.programId
    );

    [positionNftAccount] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("position_nft_account"),
        positionNftMint.publicKey.toBuffer(),
      ],
      ammProgram.programId
    );

    [position] = PublicKey.findProgramAddressSync(
      [Buffer.from("position"), positionNftMint.publicKey.toBuffer()],
      ammProgram.programId
    );

    // FIX: Using "vault_authority" seed (Standard for CP-AMM)
    [poolAuthority] = PublicKey.findProgramAddressSync(
      [Buffer.from("pool_authority")],
      ammProgram.programId
    );

    [eventAuthority] = PublicKey.findProgramAddressSync(
      [Buffer.from("__event_authority")],
      ammProgram.programId
    );

    // Lending Pool Derivation
    [lendingPoolPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("lending_pool"), ammPool.toBuffer()],
      program.programId
    );

    [lpTokenMaxVault] = PublicKey.findProgramAddressSync(
      [Buffer.from("token_a_vault"), lendingPoolPda.toBuffer()],
      program.programId
    );

    [lpTokenMinVault] = PublicKey.findProgramAddressSync(
      [Buffer.from("token_b_vault"), lendingPoolPda.toBuffer()],
      program.programId
    );
  });

  it("Initialize AMM Pool", async () => {
    await ammProgram.methods
      .initializeCustomizablePool({
        poolFees: {
          baseFee: {
            cliffFeeNumerator: new BN(1000000),
            numberOfPeriod: 1,
            periodFrequency: new BN(1),
            reductionFactor: new BN(0),
            feeSchedulerMode: 0,
          },
          padding: [0, 0, 0],
          dynamicFee: null,
        },
        sqrtMinPrice: new BN("4295048016"),
        sqrtMaxPrice: new BN("79226673521066979257578248091"),
        hasAlphaVault: false,
        liquidity: new BN("10000000000").mul(new BN("18446744073709551616")),
        sqrtPrice: new BN("18446744073709551616"),
        activationType: 0,
        collectFeeMode: 0,
        activationPoint: null,
      })
      .accounts({
        creator: creator.publicKey,
        positionNftMint: positionNftMint.publicKey,
        positionNftAccount,
        payer: payer.publicKey,
        pool: ammPool,
        position,
        tokenAMint: tokenMaxMint,
        tokenBMint: tokenMinMint,
        tokenAVault: ammTokenMaxVault,
        tokenBVault: ammTokenMinVault,
        payerTokenA: payerTokenMax,
        payerTokenB: payerTokenMin,
        tokenAProgram: TOKEN_PROGRAM_ID,
        tokenBProgram: TOKEN_PROGRAM_ID,
        program: ammProgram.programId,
      })
      .signers([payer, positionNftMint])
      .rpc();
  });

  it("Initialize Lending Pool", async () => {
    await program.methods
      .initializeLendingPool(20000, 19000, 300)
      .accounts({
        payer: payer.publicKey,
        authority: payer.publicKey,
        ammPool: ammPool,
        tokenAMint: tokenMaxMint,
        tokenBMint: tokenMinMint,
        lendingPool: lendingPoolPda,
        tokenAVault: lpTokenMaxVault,
        tokenBVault: lpTokenMinVault,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([payer])
      .rpc();
  });

  it("Seed Liquidity", async () => {
    await mintTo(
      connection,
      payer,
      tokenMaxMint,
      lpTokenMaxVault,
      payer.publicKey,
      1_000_000
    );
  });

  it("Open Short", async () => {
    [shortPositionPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("short_position"),
        lendingPoolPda.toBuffer(),
        payer.publicKey.toBuffer(),
      ],
      program.programId
    );

    [tempTokenAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from("temp_token_a"), shortPositionPda.toBuffer()],
      program.programId
    );

    await program.methods
      .openShort(openShortParams)
      .accounts({
        lendingPool: lendingPoolPda,
        user: payer.publicKey,
        ammPool: ammPool,
        tokenAMint: tokenMaxMint,
        tokenBMint: tokenMinMint,
        ammTokenAVault: ammTokenMaxVault,
        ammTokenBVault: ammTokenMinVault,
        tokenAVault: lpTokenMaxVault,
        tokenBVault: lpTokenMinVault,
        userTokenBAccount: payerTokenMin,
        shortPosition: shortPositionPda,
        tempTokenAAccount: tempTokenAccount,
        poolAuthority: poolAuthority,
        eventAuthority: eventAuthority,
        cpAmmProgram: ammProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([payer])
      .rpc();

    console.log("Short Opened Successfully");
  });

  it("Close Short", async () => {
    await program.methods
      .closeShort({
        maxSolIn: new BN(25000),
      })
      .accounts({
        lendingPool: lendingPoolPda,
        owner: payer.publicKey,
        shortPosition: shortPositionPda,
        ammPool: ammPool,
        poolAuthority: poolAuthority,
        tokenAMint: tokenMaxMint,
        tokenBMint: tokenMinMint,
        ammTokenAVault: ammTokenMaxVault,
        ammTokenBVault: ammTokenMinVault,
        tokenAVault: lpTokenMaxVault,
        tokenBVault: lpTokenMinVault,
        userTokenBAccount: payerTokenMin,
        tempTokenAAccount: tempTokenAccount,
        eventAuthority: eventAuthority,
        cpAmmProgram: ammProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([payer])
      .rpc();

    console.log("Short Closed Successfully");
  });

  it("Liquidate", async () => {
    // 1. Setup new user for short position
    let testUser = Keypair.generate();
    await connection.requestAirdrop(testUser.publicKey, 10 * LAMPORTS_PER_SOL)
      .then(sig => connection.confirmTransaction(sig));

    let testUserTokenMin = await createAssociatedTokenAccount(
      connection,
      payer,
      tokenMinMint,
      testUser.publicKey
    );

    await mintTo(
      connection,
      payer,
      tokenMinMint,
      testUserTokenMin,
      payer.publicKey,
      100_000_000_000 // Mint plenty
    );

    const shortPositionParams = {
      collateralAmount: new BN(50000),
      borrowAmount: new BN(20000),
      minimumSolOut: new BN(0),
    };

    // Derive PDA for testUser
    let [testShortPositionPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("short_position"),
        lendingPoolPda.toBuffer(),
        testUser.publicKey.toBuffer(),
      ],
      program.programId
    );

    let [testTempTokenAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from("temp_token_a"), testShortPositionPda.toBuffer()],
      program.programId
    );

    await program.methods
      .openShort(shortPositionParams)
      .accounts({
        lendingPool: lendingPoolPda,
        user: testUser.publicKey,
        ammPool: ammPool,
        tokenAMint: tokenMaxMint,
        tokenBMint: tokenMinMint,
        ammTokenAVault: ammTokenMaxVault,
        ammTokenBVault: ammTokenMinVault,
        tokenAVault: lpTokenMaxVault,
        tokenBVault: lpTokenMinVault,
        userTokenBAccount: testUserTokenMin,
        shortPosition: testShortPositionPda,
        tempTokenAAccount: testTempTokenAccount,
        poolAuthority: poolAuthority,
        eventAuthority: eventAuthority,
        cpAmmProgram: ammProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([testUser])
      .rpc();

    // 2. Crash the price (Swap B -> A)
    // Input B, Output A.
    // We need to swap enough to drop the price of B.
    // Current Liquidity ~ large.
    // We minted 300_000_000_000.
    // Let's swap 10_000_000.

    // We need a swap setup.
    await ammProgram.methods
      .swap({
        amountIn: new BN("3500000000"), // 3.5B Swap
        minimumAmountOut: new BN(0),
      })
      .accounts({
        poolAuthority: poolAuthority,
        pool: ammPool,
        inputTokenAccount: payerTokenMin, // B
        outputTokenAccount: payerTokenMax, // A
        tokenAVault: ammTokenMaxVault,
        tokenBVault: ammTokenMinVault,
        tokenAMint: tokenMaxMint,
        tokenBMint: tokenMinMint,
        payer: payer.publicKey,
        tokenAProgram: TOKEN_PROGRAM_ID,
        tokenBProgram: TOKEN_PROGRAM_ID,
        referralTokenAccount: null,
        eventAuthority: eventAuthority, // CP-AMM 0.1.4 requires this? Yes in swap instruction.
      })
      .signers([payer])
      .rpc();

    // 3. Liquidate
    await program.methods
      .liquidate({
        maxSolIn: new BN(50000),
      })
      .accounts({
        lendingPool: lendingPoolPda,
        shortPosition: testShortPositionPda,
        ammPool: ammPool,
        poolAuthority: poolAuthority,
        tokenAMint: tokenMaxMint,
        tokenBMint: tokenMinMint,
        ammTokenAVault: ammTokenMaxVault,
        ammTokenBVault: ammTokenMinVault,
        tokenAVault: lpTokenMaxVault,
        tokenBVault: lpTokenMinVault,
        tempTokenAAccount: testTempTokenAccount,
        liquidatorRewardAccount: payerTokenMin, // Liquidator gets B
        liquidator: payer.publicKey,
        payer: payer.publicKey,
        cpAmmProgram: ammProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        eventAuthority: eventAuthority,
      })
      .signers([payer])
      .rpc();

    console.log("Liquidation Successful");
  });
});

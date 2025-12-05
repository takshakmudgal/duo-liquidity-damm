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
import { mintTo } from "@solana/spl-token";
import { derivePoolAuthority } from "./bankrun-utils";

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
  let creator: any;
  let payerTokenA: any;
  let payerTokenB: any;
  let pool: any;
  let programPubkey: PublicKey = ammProgram.programId;
  let positionNftMint: any;
  let positionNftAccount: any;
  let tokenAVault: any;
  let tokenBVault: any;
  let position: any;
  let poolAuthority: any = derivePoolAuthority();

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
    positionNftMint = Keypair.generate();
    user = Keypair.generate();
    creator = Keypair.generate();

    const userAirdrop = await connection.requestAirdrop(
      user.publicKey,
      500 * LAMPORTS_PER_SOL
    );
    await connection.confirmTransaction(userAirdrop);
    const payerAirdrop = await connection.requestAirdrop(
      payer.publicKey,
      300 * LAMPORTS_PER_SOL
    );
    await connection.confirmTransaction(payerAirdrop);
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

    payerTokenB = await createAssociatedTokenAccount(
      connection,
      payer,
      tokenBMint,
      payer.publicKey
    );

    await mintTo(
      connection,
      payer,
      tokenAMint,
      payerTokenA,
      payer.publicKey,
      100000000
    );

    await mintTo(
      connection,
      payer,
      tokenBMint,
      payerTokenB,
      payer.publicKey,
      100000000
    );

    function getMaxKey(key1: PublicKey, key2: PublicKey): Buffer {
      const buf1 = key1.toBuffer();
      const buf2 = key2.toBuffer();
      if (Buffer.compare(buf1, buf2) === 1) {
        return buf1;
      }
      return buf2;
    }

    function getMinKey(key1: PublicKey, key2: PublicKey): Buffer {
      const buf1 = key1.toBuffer();
      const buf2 = key2.toBuffer();
      if (Buffer.compare(buf1, buf2) === 1) {
        return buf2;
      }
      return buf1;
    }

    pool = PublicKey.findProgramAddressSync(
      [
        Buffer.from("cpool"),
        getMaxKey(tokenAMint, tokenBMint),
        getMinKey(tokenAMint, tokenBMint),
      ],
      programPubkey
    )[0];

    positionNftAccount = PublicKey.findProgramAddressSync(
      [
        Buffer.from("position_nft_account"),
        positionNftMint.publicKey.toBuffer(),
      ],
      programPubkey
    )[0];

    position = PublicKey.findProgramAddressSync(
      [Buffer.from("position"), positionNftMint.publicKey.toBuffer()],
      programPubkey
    )[0];

    tokenAVault = PublicKey.findProgramAddressSync(
      [Buffer.from("token_vault"), tokenAMint.toBuffer(), pool.toBuffer()],
      programPubkey
    )[0];

    tokenBVault = PublicKey.findProgramAddressSync(
      [Buffer.from("token_vault"), tokenBMint.toBuffer(), pool.toBuffer()],
      programPubkey
    )[0];
  });

  it("amm init", async () => {
    const tx = await ammProgram.methods
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
        liquidity: new BN("1000000000000"),
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
        pool,
        position,
        tokenAMint,
        tokenBMint,
        tokenAVault,
        tokenBVault,
        payerTokenA,
        payerTokenB,
        tokenAProgram: TOKEN_PROGRAM_ID,
        tokenBProgram: TOKEN_PROGRAM_ID,
        program: programPubkey,
      })
      .signers([payer, positionNftMint])
      .rpc();
    await new Promise((resolve) =>
      setTimeout(async () => {
        const res = await connection.getParsedTransaction(tx, "confirmed");
        // poolAuthority =
        //   res?.meta?.innerInstructions
        //     ?.flatMap((ix) => ix.instructions)
        //     ?.map((ix) => ix.parsed?.info)
        //     ?.find(
        //       (info) =>
        //         info?.authority ||
        //         info?.mintAuthority ||
        //         info?.newAuthority ||
        //         info?.updateAuthority
        //     )?.authority ||
        //   res?.meta?.innerInstructions
        //     ?.flatMap((ix) => ix.instructions)
        //     ?.map((ix) => ix.parsed?.info)
        //     ?.find(
        //       (info) =>
        //         info?.mintAuthority ||
        //         info?.newAuthority ||
        //         info?.updateAuthority
        //     )?.mintAuthority ||
        //   null;
        resolve(null);
      }, 1000)
    );
  });

  it("lending pool init", async () => {
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
        resolve(null);
      }, 1000)
    );
  });

  it("Open Short", async () => {
    const tx = await program.methods
      .openShort(openShortParams[0])
      .accounts({
        lendingPool: lendingPoolPda,
        user: payer.publicKey,
        ammPool,
        tokenAMint,
        tokenBMint,
        ammTokenAVault: tokenAVault,
        ammTokenBVault: tokenBVault,
        userTokenBAccount: payerTokenB,
        poolAuthority: poolAuthority,
      })
      .signers([payer])
      .rpc();
  });
});

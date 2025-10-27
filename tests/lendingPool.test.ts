import { AnchorProvider, Program, Wallet } from "@coral-xyz/anchor";
import { LendingPool } from "../target/types/lending_pool";
import LendingPoolIDL from "../target/idl/lending_pool.json";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
} from "@solana/web3.js";
import { createMint } from "@solana/spl-token";
import { assert } from "chai";

describe("lending_pool", () => {
  const wallet = new Wallet(Keypair.generate());
  const connection = new Connection("http://127.0.0.1:8899", "confirmed");
  const provider = new AnchorProvider(connection, wallet, {});
  const program = new Program<LendingPool>(
    LendingPoolIDL as LendingPool,
    provider
  );

  it("init_lending_pool", async () => {
    const sig = await connection.requestAirdrop(
      wallet.publicKey,
      200 * LAMPORTS_PER_SOL
    );
    await connection.confirmTransaction(sig, "confirmed");

    const tokenAMint = await createMint(
      connection,
      wallet.payer,
      wallet.publicKey,
      null,
      6
    );
    const tokenBMint = await createMint(
      connection,
      wallet.payer,
      wallet.publicKey,
      null,
      6
    );

    const ammPool = Keypair.generate().publicKey;

    const [lendingPoolPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("lending_pool"), ammPool.toBuffer()],
      program.programId
    );

    await program.methods
      .initializeLendingPool(15000, 12000, 50)
      .accounts({
        tokenAMint,
        tokenBMint,
        authority: wallet.publicKey,
        ammPool,
        payer: wallet.publicKey,
      })
      .rpc();

    const lendingPool = await program.account.lendingPool.fetch(lendingPoolPda);

    assert.equal(lendingPool.authority.toString(), wallet.publicKey.toString());
    assert.equal(lendingPool.minCollateralRatio, 15000);
    assert.equal(lendingPool.liquidationThreshold, 12000);
    assert.equal(lendingPool.protocolFeeBps, 50);
    assert.equal(lendingPool.totalReserves.toString(), "0");
    assert.equal(lendingPool.totalBorrowed.toString(), "0");
  });
});

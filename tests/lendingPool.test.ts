import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { LendingPool } from "../target/types/lending_pool";
import { Keypair, PublicKey } from "@solana/web3.js";
import { createMint } from "@solana/spl-token";

describe("lending-pool", () => {
  const provider = anchor.AnchorProvider.env();
  const connection = provider.connection;
  const wallet = provider.wallet as anchor.Wallet;
  anchor.setProvider(provider);
  const program = anchor.workspace.LendingPool as Program<LendingPool>;

  let tokenAMint: PublicKey;
  let tokenBMint: PublicKey;
  let ammPool: Keypair;

  before(async () => {
    tokenAMint = await createMint(
      connection,
      wallet.payer,
      wallet.publicKey,
      null,
      9
    );
    tokenBMint = await createMint(
      connection,
      wallet.payer,
      wallet.publicKey,
      null,
      9
    );
    ammPool = Keypair.generate();
  });

  it("init lending pool", async () => {
    // const [lendingPoolPda] = PublicKey.findProgramAddressSync(
    //   [Buffer.from("lending_pool"), ammPool.publicKey.toBuffer()],
    //   program.programId
    // );

    // const [tokenBVaultPda] = PublicKey.findProgramAddressSync(
    //   [Buffer.from("token_b_vault"), lendingPoolPda.toBuffer()],
    //   program.programId
    // );

    const tx = await program.methods
      .initializeLendingPool(15000, 12000, 100)
      .rpc({ skipPreflight: true });

    console.log(tx);
  });
});

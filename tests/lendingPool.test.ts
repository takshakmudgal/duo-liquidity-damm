import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { LendingPool } from "../target/types/lending_pool";
import { createMint, type Mint } from "@solana/spl-token";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  type Signer,
  type PublicKey,
} from "@solana/web3.js";

describe("lending_pool", () => {
  anchor.setProvider(anchor.AnchorProvider.env());
  const connection = new Connection("http://127.0.0.1:8899", "confirmed");
  const program = anchor.workspace.LendingPool as Program<LendingPool>;
  let payer: Signer;
  let tokenAMint: any;
  let tokenBMint: any;

  before("create accounts", async () => {
    payer = Keypair.generate();
    const ix = await connection.requestAirdrop(
      payer.publicKey,
      120 * LAMPORTS_PER_SOL
    );
    await connection.confirmTransaction(ix);
    tokenAMint = await createMint(connection, payer, payer.publicKey, null, 2);
    tokenBMint = await createMint(connection, payer, payer.publicKey, null, 2);
  });

  it("Is initialized!", async () => {
    const tx = await program.methods
      .initializeLendingPool()
      .accounts(tokenAMint, tokenBMint)
      .rpc();
  });
});

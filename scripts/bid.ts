import "dotenv/config";
import * as anchor from "@project-serum/anchor";
import { IdoSolana } from "../target/types/ido_solana";
import { Program } from "@project-serum/anchor";
import { Token, AccountInfo, TOKEN_PROGRAM_ID, u64 } from "@solana/spl-token";
// Configure the local cluster.
//anchor.setProvider(anchor.Provider.local());
anchor.setProvider(anchor.Provider.env());

async function main() {
  // #region main
  const idl = JSON.parse(
    require("fs").readFileSync(
      "/Users/lmc/cardanopad/code/ido-solana/target/idl/ido_solana.json",
      {
        encoding: "utf-8",
      }
    )
  );
  const program = new anchor.Program(
    idl,
    "AoXg4hMG1pUjZavkYY5qpQCe9PVajuA79nTiZGj4N617"
  );

  const authority = anchor.web3.Keypair.fromSecretKey(
    Buffer.from(
      JSON.parse(
        require("fs").readFileSync("/Users/lmc/.config/solana/id1.json", {
          encoding: "utf-8",
        })
      )
    )
  );

  const quoteTokenKey = new anchor.web3.PublicKey(
    "D5XoCwUHpavMsYM5uRCAwNpJ8nANwhmWLpSccZXiT9Wu"
  );
  const pool = new anchor.web3.PublicKey(
    "FrJ7JBxreKM1oXkM7baxhs27EBRC6fH6G6id2DhFkHgP"
  );
  const [vault_signer, _] = await anchor.web3.PublicKey.findProgramAddress(
    [pool.toBuffer()],
    program.programId
  );
  const quoteToken = new Token(
    program.provider.connection,
    quoteTokenKey,
    TOKEN_PROGRAM_ID,
    authority
  );
  const quote_vault = new anchor.web3.PublicKey(
    "2vicpTxc9T6WruRm4TFmQrMyJLAtyKujPuPNwnfgHfoM"
  );
  const bidderQuoteWallet = (
    await quoteToken.getOrCreateAssociatedAccountInfo(authority.publicKey)
  ).address;

  const [vestingSchedule, scheduleBump] =
    await anchor.web3.PublicKey.findProgramAddress(
      [pool.toBuffer(), authority.publicKey.toBuffer()],
      program.programId
    );
  const tx = await program.rpc.bid(scheduleBump, {
    accounts: {
      vestingSchedule: vestingSchedule,
      pool: pool,
      quoteVault: quote_vault,
      depositAccount: bidderQuoteWallet,
      tokenProgram: TOKEN_PROGRAM_ID,
      bidder: authority.publicKey,
      payer: program.provider.wallet.publicKey,
      systemProgram: anchor.web3.SystemProgram.programId,
    },
    signers: [authority],
  });
  await program.provider.connection.confirmTransaction(tx);
  const tr = await program.provider.connection.getTransaction(tx, {
    commitment: "confirmed",
  });
  console.log(tr.slot);
}

console.log("Running bid.");
main().then(() => console.log("Success"));

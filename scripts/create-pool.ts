import "dotenv/config";
import * as anchor from "@project-serum/anchor";
import { IdoSolanaManager } from "../tests/helper/ido-solana-manager";
import { IdoSolana } from "../target/types/ido_solana";
import { Program } from "@project-serum/anchor";
// Configure the local cluster.
//anchor.setProvider(anchor.Provider.local());
anchor.setProvider(anchor.Provider.env());

async function main() {
  // #region main
  //const program = anchor.workspace.IdoSolana as Program<IdoSolana>;
  const idl = JSON.parse(
    require("fs").readFileSync(
      "/Users/lmc/solaunch/code/ido-solana/target/idl/ido_solana.json",
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
        require("fs").readFileSync(process.env.ANCHOR_WALLET, {
          encoding: "utf-8",
        })
      )
    )
  );

  let idoSolanaManager: IdoSolanaManager;
  let baseToken = new anchor.web3.PublicKey(
    "BJVkiZHwF7ujoMpjEs3f4eGvio1Rv5EZehEJzZ6ThwrY"
  );
  let quoteToken = new anchor.web3.PublicKey(
    "D5XoCwUHpavMsYM5uRCAwNpJ8nANwhmWLpSccZXiT9Wu"
  );

  let startTime = Date.now() / 1000;
  let endTime = startTime + 86400;
  let claimTime = startTime + 86400;
  let poolQuoteCap = 20000000000000;
  let poolExchange_rate = 200;
  let poolEveryQuoteAmount = 100000000000;
  let vestCliff = 0;
  let vestDuration = 86400;
  let vestSlicePeriodSeconds = 8640;
  let vestRateInitVested = 10;

  idoSolanaManager = await IdoSolanaManager.create(
    program,
    authority,
    baseToken,
    quoteToken,
    startTime,
    endTime,
    claimTime,
    poolQuoteCap,
    poolExchange_rate,
    poolEveryQuoteAmount,
    vestCliff,
    vestDuration,
    vestSlicePeriodSeconds,
    vestRateInitVested
  );

  const poolAccount = await program.account.pool.fetch(idoSolanaManager.pool);
  console.log(idoSolanaManager.pool.toString());
}

console.log("Running create pool.");
main().then(() => console.log("Success"));

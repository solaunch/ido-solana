import * as anchor from "@project-serum/anchor";
import { Program } from "@project-serum/anchor";
import { IdoSolana } from "../target/types/ido_solana";
import { IdoSolanaManager } from "./helper/ido-solana-manager";
import { MockToken } from "./helper/mock-token";
import assert from "assert";

describe("ido-solana", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.Provider.env());
  const program = anchor.workspace.IdoSolana as Program<IdoSolana>;
  const authority = anchor.web3.Keypair.generate();

  let idoSolanaManager: IdoSolanaManager;
  let baseToken: MockToken;
  let quoteToken: MockToken;

  let startTime = Date.now() / 1000;
  let endTime = startTime + 1000;
  let claimTime = startTime + 1010;
  let poolQuoteCap = 2000;
  let poolExchange_rate = 200;
  let poolEveryQuoteAmount = 100;
  let vestCliff = 0;
  let vestDuration = 100;
  let vestSlicePeriodSeconds = 10;
  let vestRateInitVested = 0;
  let baseTokenCap = new anchor.BN(10000);

  let bidder = anchor.web3.Keypair.generate();

  it("Init base mint", async () => {
    baseToken = await MockToken.create(program.provider.connection);
  });

  it("Init quote mint", async () => {
    quoteToken = await MockToken.create(program.provider.connection);
  });

  it("Create ido pool", async () => {
    idoSolanaManager = await IdoSolanaManager.create(
      program,
      authority,
      baseToken.address(),
      quoteToken.address(),
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

    await baseToken.mintToAccount(poolAccount.baseVault, baseTokenCap);

    assert.ok(poolAccount.startTime.eq(new anchor.BN(startTime)));
    assert.ok(poolAccount.endTime.eq(new anchor.BN(endTime)));
    assert.ok(poolAccount.vestDuration.eq(new anchor.BN(vestDuration)));
    assert.ok(poolAccount.baseMint.equals(baseToken.address()));
    // check base token vault
    assert.ok(
      (await baseToken.getAccountInfo(poolAccount.baseVault)).amount.eq(
        baseTokenCap
      )
    );
  });
});

import * as anchor from "@project-serum/anchor";
import { Program } from "@project-serum/anchor";
import { IdoSolana } from "../target/types/ido_solana";
import { IdoSolanaManager } from "./helper/ido-solana-manager";
import { MockToken } from "./helper/mock-token";
import * as serumCmn from "@project-serum/common";
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
  let endTime = startTime + 10;
  let claimTime = startTime + 10;
  let poolQuoteCap = 2000;
  let poolExchange_rate = 200;
  let poolEveryQuoteAmount = 100;
  let vestCliff = 0;
  let vestDuration = 10;
  let vestSlicePeriodSeconds = 1;
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

  it("bid request", async () => {
    const bidderQuoteWallet = (
      await quoteToken.getAssocAccountInfo(bidder.publicKey)
    ).address;
    await quoteToken.mintToAccount(bidderQuoteWallet, new anchor.BN(200));
    assert.ok(
      (await quoteToken.getAccountInfo(bidderQuoteWallet)).amount.eq(
        new anchor.BN(200)
      )
    );
    const scheduleAccount = await idoSolanaManager.bid(
      bidder,
      bidderQuoteWallet
    );
    assert.ok(scheduleAccount.bidder.equals(bidder.publicKey));
    assert.ok(scheduleAccount.startTime.eq(new anchor.BN(claimTime)));
    assert.ok(
      scheduleAccount.amount.eq(
        new anchor.BN((poolEveryQuoteAmount * poolExchange_rate) / 100)
      )
    );
    assert.ok(scheduleAccount.amountInitVested.eq(new anchor.BN(0)));
    assert.ok(scheduleAccount.amountClaimed.eq(new anchor.BN(0)));
    assert.ok(scheduleAccount.amount.eq(new anchor.BN(200)));
    assert.ok(
      (await quoteToken.getAccountInfo(bidderQuoteWallet)).amount.eq(
        new anchor.BN(100)
      )
    );
    const poolAccount = await program.account.pool.fetch(idoSolanaManager.pool);
    assert.ok(
      (await quoteToken.getAccountInfo(poolAccount.quoteVault)).amount.eq(
        new anchor.BN(100)
      )
    );
  });

  it("claim request", async () => {
    const bidderBaseWallet = (
      await baseToken.getAssocAccountInfo(bidder.publicKey)
    ).address;
    await serumCmn.sleep(11000);
    const scheduleAccount = await idoSolanaManager.claim(
      bidder,
      new anchor.BN(10),
      bidderBaseWallet
    );
    assert.ok(scheduleAccount.amountClaimed.eq(new anchor.BN(10)));
    assert.ok(
      (await baseToken.getAccountInfo(bidderBaseWallet)).amount.eq(
        new anchor.BN(10)
      )
    );
    const poolAccount = await program.account.pool.fetch(idoSolanaManager.pool);
    assert.ok(
      (await baseToken.getAccountInfo(poolAccount.baseVault)).amount.eq(
        baseTokenCap.sub(new anchor.BN(10))
      )
    );
  });
});

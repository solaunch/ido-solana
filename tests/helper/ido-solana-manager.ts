import * as anchor from "@project-serum/anchor";
import * as serumCmn from "@project-serum/common";
import { IdoSolana } from "../../target/types/ido_solana";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";

export class IdoSolanaManager {
  program: anchor.Program<IdoSolana>;
  pool: anchor.web3.PublicKey;
  authority: anchor.web3.Keypair;
  base_mint: anchor.web3.PublicKey;
  base_vault: anchor.web3.PublicKey;
  quote_mint: anchor.web3.PublicKey;
  quote_vault: anchor.web3.PublicKey;
  start_time: number;
  end_time: number;
  claim_time: number;
  pool_quote_cap: number;
  pool_exchange_rate: number;
  pool_every_quote_amount: number;
  vest_cliff: number;
  vest_duration: number;
  vest_slice_period_seconds: number;
  vest_rate_init_vested: number;
  total_shares: number;
  vault_signer: anchor.web3.PublicKey;
  bump: number;

  static async create(
    program: anchor.Program<IdoSolana>,
    authority: anchor.web3.Keypair,
    base_mint: anchor.web3.PublicKey,
    quote_mint: anchor.web3.PublicKey,
    start_time: number,
    end_time: number,
    claim_time: number,
    pool_quote_cap: number,
    pool_exchange_rate: number,
    pool_every_quote_amount: number,
    vest_cliff: number,
    vest_duration: number,
    vest_slice_period_seconds: number,
    vest_rate_init_vested: number
  ): Promise<IdoSolanaManager> {
    const manager = new IdoSolanaManager();
    manager.program = program;
    manager.authority = authority;
    manager.base_mint = base_mint;
    manager.quote_mint = quote_mint;
    const poolKeypair = anchor.web3.Keypair.generate();
    const [vault_signer, bump] = await anchor.web3.PublicKey.findProgramAddress(
      [poolKeypair.publicKey.toBuffer()],
      manager.program.programId
    );
    manager.bump = bump;
    manager.pool = poolKeypair.publicKey;
    manager.vault_signer = vault_signer;

    manager.base_vault = await serumCmn.createTokenAccount(
      manager.program.provider,
      base_mint,
      vault_signer
    );
    manager.quote_vault = await serumCmn.createTokenAccount(
      manager.program.provider,
      quote_mint,
      vault_signer
    );
    await manager.program.rpc.create(
      new anchor.BN(start_time),
      new anchor.BN(end_time),
      new anchor.BN(claim_time),
      new anchor.BN(pool_quote_cap),
      new anchor.BN(pool_exchange_rate),
      new anchor.BN(pool_every_quote_amount),
      new anchor.BN(vest_cliff),
      new anchor.BN(vest_duration),
      new anchor.BN(vest_slice_period_seconds),
      new anchor.BN(vest_rate_init_vested),
      bump,
      {
        accounts: {
          pool: manager.pool,
          vaultSigner: vault_signer,
          baseMint: manager.base_mint,
          baseVault: manager.base_vault,
          quoteMint: manager.quote_mint,
          quoteVault: manager.quote_vault,
          authority: manager.authority.publicKey,
          payer: manager.program.provider.wallet.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        },
        signers: [poolKeypair, manager.authority],
      }
    );
    return manager;
  }

  async bid(
    bidder: anchor.web3.Keypair,
    bidderQuoteWallet: anchor.web3.PublicKey
  ) {
    const [vestingSchedule, scheduleBump] =
      await anchor.web3.PublicKey.findProgramAddress(
        [this.pool.toBuffer(), bidder.publicKey.toBuffer()],
        this.program.programId
      );
    const tx = await this.program.rpc.bid(scheduleBump, {
      accounts: {
        vestingSchedule: vestingSchedule,
        pool: this.pool,
        quoteVault: this.quote_vault,
        depositAccount: bidderQuoteWallet,
        tokenProgram: TOKEN_PROGRAM_ID,
        bidder: bidder.publicKey,
        payer: this.program.provider.wallet.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      },
      signers: [bidder],
    });
    await this.program.provider.connection.confirmTransaction(tx);
    const tr = await this.program.provider.connection.getTransaction(tx, {
      commitment: "confirmed",
    });
    return await this.program.account.vestingSchedule.fetch(vestingSchedule);
  }

  async getVestingScheduleKey(
    user: anchor.web3.Keypair
  ): Promise<anchor.web3.PublicKey> {
    const [vestingSchedule] = await anchor.web3.PublicKey.findProgramAddress(
      [this.pool.toBuffer(), user.publicKey.toBuffer()],
      this.program.programId
    );
    return vestingSchedule;
  }

  async claim(
    bidder: anchor.web3.Keypair,
    amount: anchor.BN,
    bidderBaseWallet: anchor.web3.PublicKey
  ) {
    const poolAccount = await this.program.account.pool.fetch(this.pool);
    const [vestingSchedule, _] = await anchor.web3.PublicKey.findProgramAddress(
      [this.pool.toBuffer(), bidder.publicKey.toBuffer()],
      this.program.programId
    );
    const tx = await this.program.rpc.claim(amount, {
      accounts: {
        vestingSchedule: vestingSchedule,
        pool: this.pool,
        vaultSigner: this.vault_signer,
        baseVault: poolAccount.baseVault,
        tokenProgram: TOKEN_PROGRAM_ID,
        claimAccount: bidderBaseWallet,
        bidder: bidder.publicKey,
        clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
      },
      signers: [bidder],
    });
    await this.program.provider.connection.confirmTransaction(tx);
    await this.program.provider.connection.getTransaction(tx, {
      commitment: "confirmed",
    });
    return await this.program.account.vestingSchedule.fetch(vestingSchedule);
  }
}

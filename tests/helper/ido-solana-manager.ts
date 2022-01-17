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

  async bid(user: anchor.web3.Keypair): Promise<number> {
    const [vestingSchedule, scheduleBump] =
      await anchor.web3.PublicKey.findProgramAddress(
        [this.pool.toBuffer(), user.publicKey.toBuffer()],
        this.program.programId
      );
    const tx = await this.program.rpc.bid(scheduleBump, {
      accounts: {
        vestingSchedule: vestingSchedule,
        pool: this.pool,
        quoteVault: this.quote_vault,
        depositAccount: user,
        quoteTokenProgram: TOKEN_PROGRAM_ID,
        authority: this.authority,
        payer: this.authority.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      },
      signers: [this.authority],
    });
    await this.program.provider.connection.confirmTransaction(tx);
    const tr = await this.program.provider.connection.getTransaction(tx, {
      commitment: "confirmed",
    });
    return tr.slot;
  }

  async claim(user: anchor.web3.Keypair, amount: anchor.BN) {
    const poolAccount = await this.program.account.pool.fetch(this.pool);
    const [vestingSchedule, _] = await anchor.web3.PublicKey.findProgramAddress(
      [this.pool.toBuffer(), user.publicKey.toBuffer()],
      this.program.programId
    );
    const tx = await this.program.rpc.claim(amount, {
      accounts: {
        vestingSchedule: vestingSchedule,
        pool: this.pool,
        baseVault: poolAccount.baseVault,
        baseTokenProgram: TOKEN_PROGRAM_ID,
        claimAccount: user.publicKey,
        authority: this.authority,
        clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
      },
      signers: [this.authority],
    });
    await this.program.provider.connection.confirmTransaction(tx);
    const tr = await this.program.provider.connection.getTransaction(tx, {
      commitment: "confirmed",
    });
    return tr.slot;
  }
}

import { Token, AccountInfo, TOKEN_PROGRAM_ID, u64 } from "@solana/spl-token";
import { PublicKey, Connection, Signer, Keypair } from "@solana/web3.js";
import * as anchor from "@project-serum/anchor";
export class MockToken {
  private token: Token;
  private mintAuthority: Signer;
  private connection: Connection;

  static async create(connection: Connection): Promise<MockToken> {
    let mockToken = new MockToken();
    mockToken.connection = connection;
    mockToken.mintAuthority = anchor.web3.Keypair.generate();
    const signature = await mockToken.connection.requestAirdrop(
      mockToken.mintAuthority.publicKey,
      1e9
    );
    await mockToken.connection.confirmTransaction(signature);
    mockToken.token = await Token.createMint(
      mockToken.connection,
      mockToken.mintAuthority,
      mockToken.mintAuthority.publicKey,
      null,
      9,
      TOKEN_PROGRAM_ID
    );

    return mockToken;
  }

  async mintToUser(dest: PublicKey, amount: anchor.BN) {
    const account = await (
      await this.token.getOrCreateAssociatedAccountInfo(dest)
    ).address;
    await this.token.mintTo(
      account,
      this.mintAuthority.publicKey,
      [],
      new u64(amount.toString())
    );
  }

  async getAssocAccountInfo(user: PublicKey): Promise<AccountInfo> {
    return this.token.getOrCreateAssociatedAccountInfo(user);
  }

  async mintToAccount(dest: PublicKey, amount: anchor.BN) {
    await this.token.mintTo(
      dest,
      this.mintAuthority.publicKey,
      [],
      new u64(amount.toString())
    );
  }

  async getAccountInfo(account: PublicKey): Promise<AccountInfo> {
    return this.token.getAccountInfo(account);
  }
  address(): PublicKey {
    return this.token.publicKey;
  }
}

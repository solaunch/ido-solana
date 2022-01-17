use anchor_lang::prelude::*;
use anchor_spl::token::{self, TokenAccount, Transfer};

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

#[program]
pub mod ido_solana {
    use super::*;
    pub fn create(
        ctx: Context<Create>,
        start_time: u64,
        end_time: u64,
        claim_time: u64,
        pool_quote_cap: u64,
        pool_exchange_rate: u64,
        pool_every_quote_amount: u64,
        vest_cliff: u64,
        vest_duration: u64,
        vest_slice_period_seconds: u64,
        vest_rate_init_vested: u64,
        bump: u8,
    ) -> ProgramResult {
        let pool = &mut ctx.accounts.pool;
        pool.base_mint = ctx.accounts.base_mint.key();
        pool.base_vault = ctx.accounts.base_vault.key();
        pool.quote_mint = ctx.accounts.quote_mint.key();
        pool.quote_vault = ctx.accounts.quote_vault.key();

        pool.start_time = start_time;
        pool.end_time = end_time;
        pool.claim_time = claim_time;
        pool.pool_quote_cap = pool_quote_cap;
        pool.pool_exchange_rate = pool_exchange_rate;
        pool.pool_every_quote_amount = pool_every_quote_amount;
        pool.vest_cliff = vest_cliff;
        pool.vest_duration = vest_duration;
        pool.vest_slice_period_seconds = vest_slice_period_seconds;
        pool.vest_rate_init_vested = vest_rate_init_vested;
        pool.bump = bump;
        Ok(())
    }

    pub fn bid(ctx: Context<Bid>, bump: u8) -> ProgramResult {
        let pool = &mut ctx.accounts.pool;
        let schedule = &mut ctx.accounts.vesting_schedule;
        require!(schedule.amount <= 0, ErrorCode::AlreadyBid);

        pool.total_shares = pool.total_shares + 1;
        require!( pool.total_shares * pool.pool_every_quote_amount <= pool.pool_quote_cap, ErrorCode::CapFull);

        let vest_amount = pool.pool_every_quote_amount.checked_mul(pool.pool_exchange_rate).unwrap().checked_div(100).unwrap();
        schedule.amount = vest_amount;
        if pool.vest_rate_init_vested > 0 {
            schedule.amount_init_vested = vest_amount.checked_mul(pool.vest_rate_init_vested).unwrap().checked_div(100).unwrap();
        }
        schedule.start_time = pool.claim_time;
        schedule.bump = bump;

        // transfer tokens
        let cpi_accounts = Transfer {
            from: ctx.accounts.deposit_account.to_account_info(),
            to: ctx.accounts.quote_vault.to_account_info(),
            authority: ctx.accounts.authority.to_account_info(),
        };
        let cpi_program = ctx.accounts.quote_token_program.clone();

        token::transfer(CpiContext::new(cpi_program, cpi_accounts), pool.pool_every_quote_amount)?;
        Ok(())
    }

    pub fn claim(ctx: Context<Claim>, amount: u64) -> ProgramResult {
        let mut final_amount = amount;
        let pool = &mut ctx.accounts.pool;
        let schedule = &mut ctx.accounts.vesting_schedule;
        let claimable_amount = compute_claimable_amount(pool, schedule, ctx.accounts.clock.unix_timestamp as u64);
        require!(claimable_amount >= amount, ErrorCode::NotEnoughVestedToken);

        if amount == 0 {
            final_amount = claimable_amount;
        }
        // transfer tokens
        let cpi_accounts = Transfer {
            from: ctx.accounts.base_vault.to_account_info(),
            to: ctx.accounts.claim_account.to_account_info(),
            authority: ctx.accounts.authority.to_account_info(),
        };
        let cpi_program = ctx.accounts.base_token_program.clone();

        token::transfer(CpiContext::new(cpi_program, cpi_accounts), final_amount)?;
        schedule.amount_claimed = schedule.amount_claimed.checked_add(final_amount).unwrap();
        Ok(())
    }
}

fn compute_claimable_amount(pool: &mut Pool, schedule: &mut VestingSchedule, current_time: u64) -> u64{
    if current_time < schedule.start_time {
        return 0;
    }
    if current_time > schedule.start_time.checked_add(pool.vest_duration).unwrap() {
        return schedule.amount.checked_sub(schedule.amount_claimed).unwrap();
    }
    let time_from_start = current_time.checked_sub(schedule.start_time).unwrap();
    let vested_slice_periods = time_from_start.checked_div(pool.vest_slice_period_seconds).unwrap();
    let vested_seconds = vested_slice_periods.checked_mul(pool.vest_slice_period_seconds).unwrap();
    let claimable_amount = schedule.amount.checked_mul(vested_seconds).unwrap().checked_div(pool.vest_duration).unwrap().checked_add(schedule.amount_init_vested).unwrap();
    return claimable_amount.checked_sub(schedule.amount_claimed).unwrap();
}

#[derive(Accounts)]
pub struct Initialize {}

#[derive(Accounts)]
#[instruction(
    start_time: u64,
    end_time: u64,
    claim_time: u64,
    pool_quote_cap: u64,
    pool_exchange_rate: u64,
    pool_every_quote_amount: u64,
    vest_cliff: u64,
    vest_duration: u64,
    vest_slice_period_seconds: u64,
    vest_rate_init_vested: u64,
    bump: u8
)]
pub struct Create<'info> {
    #[account(init, payer = payer)]
    pub pool: Account<'info, Pool>,
    #[account(seeds = [pool.to_account_info().key.as_ref()], bump = bump)]
    pub vault_signer: AccountInfo<'info>,
    pub base_mint: AccountInfo<'info>,
    #[account(
        mut,
        constraint = &base_vault.owner == vault_signer.key,
        constraint = &base_vault.mint == base_mint.key
    )]
    pub base_vault: Account<'info, TokenAccount>,

    pub quote_mint: AccountInfo<'info>,
    #[account(
        mut,
        constraint = &quote_vault.owner == vault_signer.key,
        constraint = &quote_vault.mint == quote_mint.key
    )]
    pub quote_vault: Account<'info, TokenAccount>,

    // permissions related
    pub authority: Signer<'info>,
    // init related
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(bump: u8)]
pub struct Bid<'info> {
    #[account(
        init, 
        seeds = [
            pool.to_account_info().key.as_ref(), 
            authority.to_account_info().key.as_ref()
        ],
        bump = bump,
        payer = payer,
    )]
    pub vesting_schedule: Account<'info, VestingSchedule>,
    #[account(mut)]
    pub pool: Account<'info, Pool>,
    #[account(mut, constraint = quote_vault.to_account_info().key == &pool.quote_vault)]
    pub quote_vault: Account<'info, TokenAccount>,
    #[account(
        mut, 
        constraint = &deposit_account.owner == authority.key, 
        constraint = &deposit_account.mint == &pool.quote_mint
    )]
    pub deposit_account: Account<'info, TokenAccount>,
    #[account(constraint = quote_token_program.key == &token::ID)]
    pub quote_token_program: AccountInfo<'info>,
    pub authority: Signer<'info>,
    // init related
    pub payer: Signer<'info>,     
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(amount: u64)]
pub struct Claim<'info> {
    #[account(
        mut, 
        seeds = [
            vesting_schedule.pool.as_ref(), 
            vesting_schedule.authority.as_ref()
        ],
        bump = vesting_schedule.bump,
        has_one = pool,
        has_one = authority,
    )]
    pub vesting_schedule: Account<'info, VestingSchedule>,
    #[account(mut)]
    pub pool: Account<'info, Pool>,
    #[account(mut, constraint = base_vault.to_account_info().key == &pool.base_vault)]
    pub base_vault: Account<'info, TokenAccount>,
    #[account(constraint = base_token_program.key == &token::ID)]
    pub base_token_program: AccountInfo<'info>,
    #[account(
        mut, 
        constraint = &claim_account.owner == authority.key, 
        constraint = &claim_account.mint == &pool.base_mint
    )]
    pub claim_account: Account<'info, TokenAccount>,
    pub authority: Signer<'info>,
    pub clock: Sysvar<'info, Clock>,
}

#[account]
#[derive(Default)]
pub struct Pool {
    pub base_mint: Pubkey,
    pub base_vault: Pubkey,
    pub quote_mint: Pubkey,
    pub quote_vault: Pubkey,
    pub start_time: u64,
    pub end_time: u64,
    pub claim_time: u64,
    pub pool_quote_cap: u64,
    pub pool_exchange_rate: u64,
    pub pool_every_quote_amount: u64,
    pub vest_cliff: u64,
    pub vest_duration: u64,
    pub vest_slice_period_seconds: u64,
    pub vest_rate_init_vested: u64,
    pub total_shares: u64,
    pub bump: u8,
}

#[account]
#[derive(Default)]
pub struct VestingSchedule {
    pub authority: Pubkey,
    pub pool: Pubkey,
    pub start_time: u64,
    pub amount: u64,
    pub amount_init_vested: u64,
    pub amount_claimed: u64,
    pub bump: u8,
}

#[error]
pub enum ErrorCode {
    #[msg("Already bid")]
    AlreadyBid,
    #[msg("Cap Full")]
    CapFull,
    #[msg("Cannot claim tokens, not enough vested tokens")]
    NotEnoughVestedToken,
}

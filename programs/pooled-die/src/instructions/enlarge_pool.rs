use anchor_lang::system_program;

use crate::*;

use {constants::*, error::Error::*};

#[derive(Accounts)]
pub struct EnlargePool<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [GLOBAL_STATE_TAG.as_ref()], bump,
        has_one = admin
    )]
    pub global_state: Account<'info, GlobalState>,

    #[account(mut, seeds = [VRF_ACCOUNT_LIST_TAG.as_ref()], bump)]
    pub vrf_account_list: Box<Account<'info, VrfAccountList>>,

    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,

    // Remaining accounts
    // #[account(constraint = vrf_account_n.load()?.authority == vrf_account_pda_authority.key())]
    // pub vrf_account_n: AccountLoader<'info, VrfAccountData>,
    // From 1 to n
}

pub fn handler(ctx: Context<EnlargePool>) -> Result<()> {
    let remaining_accounts_iter = &mut ctx.remaining_accounts.iter();
    let remaining_accounts = ctx.remaining_accounts.len();

    // Update pool size
    ctx.accounts.global_state.vrf_pool_size += remaining_accounts as u32;

    // Update VrfAccountList size
    let vrf_account_list_account_info = ctx.accounts.vrf_account_list.to_account_info();

    let previous_len = vrf_account_list_account_info.data_len();
    let new_len = previous_len + remaining_accounts * 32;

    vrf_account_list_account_info.realloc(new_len, false)?;

    // Update VrfAccountList minimum balance for rent exemption
    let minimum_balance = ctx.accounts.rent.minimum_balance(new_len);
    let balance_diff = minimum_balance
        .checked_sub(vrf_account_list_account_info.lamports())
        .unwrap();

    system_program::transfer(
        CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.admin.to_account_info(),
                to: ctx.accounts.vrf_account_list.to_account_info(),
            },
        ),
        balance_diff,
    )?;

    // Check remaining accounts + add to VrfAccountList
    for i in 0..remaining_accounts {
        let next_remaining_account = next_account_info(remaining_accounts_iter).unwrap();

        let vrf_account = AccountLoader::<VrfAccountData>
            ::try_from(next_remaining_account)?;

        if vrf_account.load()?.authority != ctx.accounts.vrf_account_list.key() {
            return Err(
                error!(VrfAccountInvalidAuthority)
                    .with_pubkeys((vrf_account.load()?.authority, ctx.accounts.vrf_account_list.key()))
                    .with_account_name(format!("vrf_account_{}", i))
            );
        }

        ctx.accounts.vrf_account_list.list.push(next_remaining_account.key());
    }

    Ok(())
}

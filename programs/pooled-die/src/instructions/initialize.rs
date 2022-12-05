use crate::*;

use constants::*;

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        init,
        seeds = [GLOBAL_STATE_TAG.as_ref()], bump,
        payer = admin,
        space = GlobalState::LEN
    )]
    pub global_state: Account<'info, GlobalState>,

    #[account(
        init,
        seeds = [VRF_ACCOUNT_LIST_TAG.as_ref()], bump,
        payer = admin,
        space = VrfAccountList::INITIAL_LEN // initially empty
    )]
    pub vrf_account_list: Account<'info, VrfAccountList>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<Initialize>, switchboard_state_bump: u8) -> Result<()> {
    ctx.accounts.global_state.admin = ctx.accounts.admin.key();
    ctx.accounts.global_state.switchboard_state_bump = switchboard_state_bump;

    Ok(())
}

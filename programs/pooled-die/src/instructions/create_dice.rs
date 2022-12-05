use crate::*;

use anchor_spl::token::{TokenAccount, Token};
use constants::*;
use solana_program::hash;
use switchboard_v2::vrf::{VrfSetCallback, Callback, AccountMetaBorsh};

use error::Error::*;

#[derive(Accounts)]
pub struct CreateDice<'info> {
    #[account(mut)]
    pub player: Signer<'info>,

    #[account(
        mut,
        constraint = player_wallet.owner == player.key()
    )]
    pub player_wallet: Account<'info, TokenAccount>,

    #[account(
        init,
        seeds = [DICE_TAG.as_ref(), player.key().as_ref()], bump,
        payer = player,
        space = Dice::LEN
    )]
    pub dice: Account<'info, Dice>,

    // VrfAccount

    #[account(
        mut,
        address = *vrf_account_list.list.get(global_state.vrf_account_pointer as usize).unwrap()
    )]
    pub vrf_account: AccountLoader<'info, VrfAccountData>,

    #[account(mut, seeds = [GLOBAL_STATE_TAG.as_ref()], bump)]
    pub global_state: Account<'info, GlobalState>,

    #[account(seeds = [VRF_ACCOUNT_LIST_TAG.as_ref()], bump)]
    pub vrf_account_list: Account<'info, VrfAccountList>,

    // Other Switchboard accounts

    #[account(mut, has_one = data_buffer)]
    pub oracle_queue: AccountLoader<'info, OracleQueueAccountData>,
    /// CHECK: through raw constraint
    #[account(mut, constraint = oracle_queue.load()?.authority == queue_authority.key())]
    pub queue_authority: UncheckedAccount<'info>,
    /// CHECK: through raw constraint
    #[account(mut)]
    pub data_buffer: AccountInfo<'info>,
    #[account(mut)]
    pub permission: AccountLoader<'info, PermissionAccountData>,
    #[account(
        mut,
        constraint =
            escrow.owner == switchboard_state.key()
            && escrow.mint == switchboard_state.load()?.token_mint
    )]
    pub escrow: Account<'info, TokenAccount>,
    #[account(mut)]
    pub switchboard_state: AccountLoader<'info, SbState>,
    /// CHECK: through VRF owner
    #[account(
        address = *vrf_account.to_account_info().owner,
        constraint = switchboard_program.executable == true
    )]
    pub switchboard_program: AccountInfo<'info>,

    // Solana accounts
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    /// CHECK: through address constraint
    #[account(address = solana_program::sysvar::recent_blockhashes::ID)]
    pub recent_blockhashes: AccountInfo<'info>,
}

pub fn handler(ctx: Context<CreateDice>, permission_bump: u8) -> Result<()> {
    let switchboard_program = ctx.accounts.switchboard_program.clone();

    // Signer seeds for later CPIs
    let bump = *ctx.bumps.get("vrf_account_list").unwrap();
    let vrf_account_list_seeds: &[&[&[u8]]] = &[&[
        VRF_ACCOUNT_LIST_TAG.as_ref(),
        &[bump],
    ]];

    // Change callback
    if ctx.accounts.vrf_account_list.key() != ctx.accounts.vrf_account.load()?.authority {
        return Err(error!(VrfAccountInvalidAuthority));
    }

    let vrf_set_callback = VrfSetCallback {
        vrf: ctx.accounts.vrf_account.to_account_info(),
        authority: ctx.accounts.vrf_account_list.to_account_info()
    };

    let sighash = &hash::hash("global:settle_dice".as_bytes()).to_bytes()[..8];

    let callback = Callback {
        program_id: *ctx.program_id,
        accounts: vec![
            AccountMetaBorsh {pubkey: ctx.accounts.dice.key(), is_signer: false, is_writable: true},
            AccountMetaBorsh {pubkey: ctx.accounts.vrf_account.key(), is_signer: false, is_writable: false}
        ],
        ix_data: sighash.to_vec()
    };

    vrf_set_callback.invoke_signed(
        switchboard_program.clone(),
        callback,
        vrf_account_list_seeds
    )?;

    // Request randomness
    let vrf_request_randomness = VrfRequestRandomness {
        authority: ctx.accounts.vrf_account_list.to_account_info(),
        vrf: ctx.accounts.vrf_account.to_account_info(),
        oracle_queue: ctx.accounts.oracle_queue.to_account_info(),
        queue_authority: ctx.accounts.queue_authority.to_account_info(),
        data_buffer: ctx.accounts.data_buffer.to_account_info(),
        permission: ctx.accounts.permission.to_account_info(),
        escrow: ctx.accounts.escrow.clone(),
        payer_wallet: ctx.accounts.player_wallet.clone(),
        payer_authority: ctx.accounts.player.to_account_info(),
        recent_blockhashes: ctx.accounts.recent_blockhashes.to_account_info(),
        program_state: ctx.accounts.switchboard_state.to_account_info(),
        token_program: ctx.accounts.token_program.to_account_info(),
    };

    vrf_request_randomness.invoke_signed(
        switchboard_program,
        ctx.accounts.global_state.switchboard_state_bump,
        permission_bump,
        vrf_account_list_seeds,
    )?;

    // Move pointer
    ctx.accounts.global_state.vrf_account_pointer += 1;
    ctx.accounts.global_state.vrf_account_pointer %= ctx.accounts.global_state.vrf_pool_size;

    Ok(())
}

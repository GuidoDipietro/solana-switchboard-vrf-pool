use crate::*;

#[derive(Accounts)]
pub struct SettleDice<'info> {
    #[account(mut)]
    pub dice: Account<'info, Dice>,
    pub vrf_account: AccountLoader<'info, VrfAccountData>,
}

pub fn handler(ctx: Context<SettleDice>) -> Result<()> {
    let vrf_account = ctx.accounts.vrf_account.load()?;
    let result_buffer = vrf_account.get_result()?;
    if result_buffer == [0u8; 32] {
        msg!("vrf buffer empty");
        return Ok(());
    }

    let dice = &mut ctx.accounts.dice;

    msg!("Result buffer is {:?}", result_buffer);
    let face: u8 = result_buffer[0] % 6 + 1;
    msg!("Face is {}", face);

    dice.face = face;

    Ok(())
}

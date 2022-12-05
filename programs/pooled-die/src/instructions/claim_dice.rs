use crate::*;

use {constants::*, error::Error::*};

#[derive(Accounts)]
pub struct ClaimDice<'info> {
    #[account(mut)]
    pub player: Signer<'info>,

    #[account(
        mut,
        seeds = [DICE_TAG.as_ref(), player.key().as_ref()],
        bump,
        close = player
    )]
    pub dice: Account<'info, Dice>,
}

pub fn handler(ctx: Context<ClaimDice>) -> Result<()> {
    if ctx.accounts.dice.face == 0 {
        return Err(error!(DiceStillRolling));
    }

    msg!("Dice with face {} has been claimed by {:?}.", ctx.accounts.dice.face, ctx.accounts.player.key());

    Ok(())
}

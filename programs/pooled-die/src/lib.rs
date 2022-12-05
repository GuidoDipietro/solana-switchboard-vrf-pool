use anchor_lang::prelude::*;

pub mod instructions;
pub mod state;
pub mod constants;
pub mod error;

use crate::{instructions::*, state::*};
pub use switchboard_v2::{
    OracleQueueAccountData, PermissionAccountData, SbState, VrfAccountData, VrfRequestRandomness,
};

declare_id!("3kNw5Q6SaTEmtX64HtHtjbNFfytxfLn8wALCdYQfFQhP");

#[program]
pub mod pooled_die {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, switchboard_state_bump: u8) -> Result<()> {
        initialize::handler(ctx, switchboard_state_bump)
    }

    pub fn enlarge_pool(ctx: Context<EnlargePool>) -> Result<()> {
        enlarge_pool::handler(ctx)
    }

    pub fn create_dice(ctx: Context<CreateDice>, permission_bump: u8) -> Result<()> {
        create_dice::handler(ctx, permission_bump)
    }

    pub fn settle_dice(ctx: Context<SettleDice>) -> Result<()> {
        settle_dice::handler(ctx)
    }

    pub fn claim_dice(ctx: Context<ClaimDice>) -> Result<()> {
        claim_dice::handler(ctx)
    }
}

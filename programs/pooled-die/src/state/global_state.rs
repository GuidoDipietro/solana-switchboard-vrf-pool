use crate::*;

#[account]
pub struct GlobalState {
    pub admin: Pubkey,
    pub vrf_account_pointer: u32,
    pub vrf_pool_size: u32,
    pub switchboard_state_bump: u8,
}

impl GlobalState {
    pub const LEN: usize = 8 + 32 + 4 + 4 + 1;
}

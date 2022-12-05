use crate::*;

#[account]
pub struct VrfAccountList {
    pub list: Vec<Pubkey>,
}

impl VrfAccountList {
    pub const INITIAL_LEN: usize = 8 + 4;
}


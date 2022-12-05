use crate::*;

#[account]
pub struct Dice {
    pub face: u8,
}

impl Dice {
    pub const LEN: usize = 8 + 1;
}

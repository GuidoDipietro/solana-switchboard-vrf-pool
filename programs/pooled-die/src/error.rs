use crate::*;

#[error_code]
pub enum Error {
    #[msg("VrfAccount has invalid authority")]
    VrfAccountInvalidAuthority,

    #[msg("Dice has not finished rolling yet")]
    DiceStillRolling,
}

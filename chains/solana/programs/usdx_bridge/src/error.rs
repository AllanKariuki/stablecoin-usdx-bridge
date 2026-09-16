use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    #[msg("Only the configured relayer may call this instruction")]
    InvalidRelayer,
}

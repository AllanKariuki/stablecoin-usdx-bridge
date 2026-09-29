use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    #[msg("Only the configured relayer may call this instruction")]
    InvalidRelayer,
    #[msg("Owner has not delegated burn authority to the bridge PDA")]
    NoDelegateApproval,
    #[msg("Delegated amount is less than the requested burn amount")]
    InsufficientDelegatedAmount,
    #[msg("Only the configured admin may call this instruction")]
    InvalidAdmin,
    #[msg("The bridge is paused")]
    BridgePaused,
    #[msg("A pubkey argument was the default (all-zero) pubkey")]
    InvalidPubkey,
}

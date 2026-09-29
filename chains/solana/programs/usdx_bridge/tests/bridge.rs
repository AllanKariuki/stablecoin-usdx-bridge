//! litesvm integration tests for the usdx_bridge program.
//!
//! The dev-dependencies here (litesvm, solana-message/-transaction/-signer/
//! -keypair) were declared in Cargo.toml but never used — this is the first
//! real test suite for the Solana side, covering exactly the safety surface
//! the Ethereum side already has: replay guards, the relayer gate, and the
//! delegate-required burn.
//!
//! Run with `anchor build --arch v1 --ignore-keys && cargo test -p usdx_bridge`
//! — litesvm loads the compiled program, it doesn't compile it, and
//! Anchor's own default arch (v3) produces a binary litesvm 0.10.0 can't
//! verify. See the Testing section in ../../README.md for the full story.

use anchor_lang::prelude::Pubkey;
use anchor_lang::solana_program::program_pack::Pack;
use anchor_lang::{InstructionData, ToAccountMetas};
use anchor_spl::associated_token::{get_associated_token_address, spl_associated_token_account};
use anchor_spl::token;
use litesvm::types::TransactionResult;
use litesvm::LiteSVM;
use solana_instruction::Instruction;
use solana_keypair::Keypair;
use solana_message::Message;
use solana_signer::Signer as _;
use solana_transaction::Transaction;

use usdx_bridge::{accounts as usdx_accounts, constants::*, instruction as usdx_instruction};

const ONE_SOL: u64 = 1_000_000_000;
const SO_PATH: &str = "../../target/deploy/usdx_bridge.so";

/// The relayer identity is a hardcoded pubkey (constants::relayer_pubkey),
/// not a keypair test code can generate — its real private key belongs to
/// whoever operates the actual devnet relayer and must never be in this
/// repo. Tests "sign" as the relayer by including this pubkey as a signer
/// in the instruction's account metas with sigverify disabled (see
/// `new_svm` below): Anchor's Signer<'info> only checks the is_signer bit
/// on the account, and the `constraint = relayer.key() == relayer_pubkey()`
/// check compares the pubkey value, both of which this can satisfy without
/// the private key. Kept as a literal, independent of
/// constants::relayer_pubkey(), so a change to the hardcoded relayer isn't
/// silently validated against itself.
fn relayer_pubkey() -> Pubkey {
    "257pTZ4CBDLmQrdwpSHC6ahrJkxSaQFFEohpeXD3H3FJ"
        .parse()
        .unwrap()
}

fn mint_authority_pda() -> (Pubkey, u8) {
    Pubkey::find_program_address(&[MINT_AUTHORITY_SEED], &usdx_bridge::ID)
}

fn processed_marker_pda(correlation_id: &[u8; 32]) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[PROCESSED_SEED, correlation_id], &usdx_bridge::ID)
}

fn config_pda() -> (Pubkey, u8) {
    Pubkey::find_program_address(&[CONFIG_SEED], &usdx_bridge::ID)
}

/// A fresh, funded VM with the program loaded and sigverify off — see
/// relayer_pubkey() above for why sigverify has to be off: nothing in this
/// test suite can produce a cryptographically valid signature for the
/// hardcoded relayer. Anchor's own account-level checks (is_signer,
/// pubkey-equality constraints) still run and are what these tests
/// actually exercise.
fn new_svm() -> LiteSVM {
    let mut svm = LiteSVM::new().with_sigverify(false);
    svm.add_program_from_file(usdx_bridge::ID, SO_PATH)
        .expect("build the program first: anchor build --arch v1 --ignore-keys");
    // BridgeMint/BridgeBurn's processed_marker is created with
    // `payer = relayer` — the relayer identity needs real lamports even
    // though it isn't cryptographically signing (sigverify is off above).
    fund(&mut svm, &relayer_pubkey());
    svm
}

/// A VM with BridgeConfig already initialised, which every mint and burn now
/// requires: the relayer is read from that account rather than from a
/// compile-time constant (P6/R6). Returns the admin keypair, because most
/// config tests need to act as it.
fn new_svm_with_config() -> (LiteSVM, Keypair) {
    let mut svm = new_svm();
    let admin = Keypair::new();
    fund(&mut svm, &admin.pubkey());

    let payer = Keypair::new();
    fund(&mut svm, &payer.pubkey());
    init_config(&mut svm, &payer, &admin.pubkey());

    (svm, admin)
}

fn init_config(svm: &mut LiteSVM, payer: &Keypair, admin: &Pubkey) {
    let (config, _) = config_pda();
    let accounts = usdx_accounts::InitializeConfig {
        payer: payer.pubkey(),
        config,
        system_program: anchor_lang::system_program::ID,
    };
    let ix = Instruction {
        program_id: usdx_bridge::ID,
        accounts: accounts.to_account_metas(None),
        data: usdx_instruction::InitializeConfig { admin: *admin }.data(),
    };
    send(svm, &[ix], &payer.pubkey(), &[payer])
        .unwrap_or_else(|e| panic!("initialize_config failed: {e:?}"));
}

fn admin_only_ix(admin: Pubkey, data: Vec<u8>) -> Instruction {
    let (config, _) = config_pda();
    let accounts = usdx_accounts::AdminOnly { config, admin };
    Instruction {
        program_id: usdx_bridge::ID,
        accounts: accounts.to_account_metas(None),
        data,
    }
}

fn read_config(svm: &LiteSVM) -> usdx_bridge::state::BridgeConfig {
    use anchor_lang::AccountDeserialize;
    let (config, _) = config_pda();
    let account = svm.get_account(&config).expect("config should exist");
    usdx_bridge::state::BridgeConfig::try_deserialize(&mut account.data.as_slice())
        .expect("config should deserialise")
}

fn fund(svm: &mut LiteSVM, who: &Pubkey) {
    svm.airdrop(who, 100 * ONE_SOL).unwrap();
}

/// Builds and sends a transaction, signing with whatever real keypairs are
/// supplied and leaving every other required signer slot as the zeroed
/// signature `Transaction::new_unsigned` pre-fills — safe only because
/// sigverify is off on every VM this suite creates.
#[allow(clippy::result_large_err)] // litesvm's own error type, not ours to box
fn send(
    svm: &mut LiteSVM,
    ixs: &[Instruction],
    payer: &Pubkey,
    signers: &[&Keypair],
) -> TransactionResult {
    let message = Message::new(ixs, Some(payer));
    let mut tx = Transaction::new_unsigned(message);
    if !signers.is_empty() {
        tx.partial_sign(signers, svm.latest_blockhash());
    }
    svm.send_transaction(tx)
}

/// Deploys a fresh mint via the program's own initialize_mint_authority
/// instruction (it creates the mint through an `init` constraint — there's
/// nothing to pre-create). Returns the mint pubkey.
fn init_mint(svm: &mut LiteSVM, payer: &Keypair) -> Pubkey {
    let mint = Keypair::new();
    let (mint_authority, _) = mint_authority_pda();

    let accounts = usdx_accounts::InitAuthority {
        payer: payer.pubkey(),
        mint: mint.pubkey(),
        mint_authority,
        token_program: token::ID,
        system_program: anchor_lang::system_program::ID,
        rent: solana_sdk_ids::sysvar::rent::ID,
    };
    let ix = Instruction {
        program_id: usdx_bridge::ID,
        accounts: accounts.to_account_metas(None),
        data: usdx_instruction::InitializeMintAuthority.data(),
    };

    let res = send(svm, &[ix], &payer.pubkey(), &[payer, &mint]);
    res.unwrap_or_else(|e| panic!("initialize_mint_authority failed: {e:?}"));
    mint.pubkey()
}

/// Creates (idempotently) the associated token account for `owner` and
/// returns its address. bridge_mint/bridge_burn operate on plain
/// TokenAccounts, and an ATA is the standard shape for one.
fn ensure_ata(svm: &mut LiteSVM, payer: &Keypair, owner: &Pubkey, mint: &Pubkey) -> Pubkey {
    let ata = get_associated_token_address(owner, mint);
    let ix = spl_associated_token_account::instruction::create_associated_token_account_idempotent(
        &payer.pubkey(),
        owner,
        mint,
        &token::ID,
    );
    send(svm, &[ix], &payer.pubkey(), &[payer])
        .unwrap_or_else(|e| panic!("creating ATA failed: {e:?}"));
    ata
}

fn token_balance(svm: &LiteSVM, ata: &Pubkey) -> u64 {
    let account = svm.get_account(ata).expect("token account should exist");
    let unpacked = token::spl_token::state::Account::unpack(&account.data)
        .expect("account should be a valid SPL token account");
    unpacked.amount
}

fn bridge_mint_ix(
    mint: Pubkey,
    destination: Pubkey,
    amount: u64,
    correlation_id: [u8; 32],
    relayer: Pubkey,
) -> Instruction {
    let (mint_authority, _) = mint_authority_pda();
    let (processed_marker, _) = processed_marker_pda(&correlation_id);
    let (config, _) = config_pda();
    let accounts = usdx_accounts::BridgeMint {
        mint,
        mint_authority,
        destination,
        processed_marker,
        config,
        relayer,
        token_program: token::ID,
        system_program: anchor_lang::system_program::ID,
    };
    Instruction {
        program_id: usdx_bridge::ID,
        accounts: accounts.to_account_metas(None),
        data: usdx_instruction::BridgeMint {
            amount,
            correlation_id,
        }
        .data(),
    }
}

fn bridge_burn_ix(
    mint: Pubkey,
    source: Pubkey,
    amount: u64,
    correlation_id: [u8; 32],
    relayer: Pubkey,
) -> Instruction {
    let (mint_authority, _) = mint_authority_pda();
    let (processed_marker, _) = processed_marker_pda(&correlation_id);
    let (config, _) = config_pda();
    let accounts = usdx_accounts::BridgeBurn {
        mint,
        mint_authority,
        source,
        processed_marker,
        config,
        relayer,
        token_program: token::ID,
        system_program: anchor_lang::system_program::ID,
    };
    Instruction {
        program_id: usdx_bridge::ID,
        accounts: accounts.to_account_metas(None),
        data: usdx_instruction::BridgeBurn {
            amount,
            correlation_id,
        }
        .data(),
    }
}

fn approve_delegate_ix(source: Pubkey, owner: Pubkey, amount: u64) -> Instruction {
    let (mint_authority, _) = mint_authority_pda();
    let accounts = usdx_accounts::ApproveBridgeDelegate {
        owner,
        source,
        mint_authority,
        token_program: token::ID,
    };
    Instruction {
        program_id: usdx_bridge::ID,
        accounts: accounts.to_account_metas(None),
        data: usdx_instruction::ApproveBridgeDelegate { amount }.data(),
    }
}

/// Deterministic per-test correlation id. Doesn't need to be a real hash —
/// only needs to be a distinct 32-byte value per test seed, which a direct
/// byte copy already guarantees for the short ASCII literals used below.
fn correlation_id(seed: &str) -> [u8; 32] {
    let mut id = [0u8; 32];
    let bytes = seed.as_bytes();
    assert!(
        bytes.len() <= 32,
        "test seed too long to fit a correlation_id"
    );
    id[..bytes.len()].copy_from_slice(bytes);
    id
}

// ---------------------------------------------------------------------
// initialize_mint_authority
// ---------------------------------------------------------------------

#[test]
fn init_authority_creates_a_mint_owned_by_the_pda() {
    let (mut svm, _admin) = new_svm_with_config();
    let payer = Keypair::new();
    fund(&mut svm, &payer.pubkey());

    let mint_pubkey = init_mint(&mut svm, &payer);
    let (mint_authority, _) = mint_authority_pda();

    let account = svm.get_account(&mint_pubkey).unwrap();
    let mint = token::spl_token::state::Mint::unpack(&account.data).unwrap();
    assert_eq!(mint.decimals, USDX_DECIMALS);
    assert_eq!(
        mint.mint_authority,
        anchor_lang::solana_program::program_option::COption::Some(mint_authority)
    );
}

// ---------------------------------------------------------------------
// bridge_mint
// ---------------------------------------------------------------------

#[test]
fn bridge_mint_by_the_relayer_credits_the_destination() {
    let (mut svm, _admin) = new_svm_with_config();
    let payer = Keypair::new();
    fund(&mut svm, &payer.pubkey());

    let mint = init_mint(&mut svm, &payer);
    let user = Keypair::new();
    fund(&mut svm, &user.pubkey());
    let dest = ensure_ata(&mut svm, &payer, &user.pubkey(), &mint);

    let ix = bridge_mint_ix(
        mint,
        dest,
        100_000_000,
        correlation_id("mint-1"),
        relayer_pubkey(),
    );
    send(&mut svm, &[ix], &payer.pubkey(), &[&payer])
        .unwrap_or_else(|e| panic!("bridge_mint failed: {e:?}"));

    assert_eq!(token_balance(&svm, &dest), 100_000_000);
}

#[test]
fn bridge_mint_rejects_a_non_relayer_signer() {
    let (mut svm, _admin) = new_svm_with_config();
    let payer = Keypair::new();
    fund(&mut svm, &payer.pubkey());

    let mint = init_mint(&mut svm, &payer);
    let user = Keypair::new();
    fund(&mut svm, &user.pubkey());
    let dest = ensure_ata(&mut svm, &payer, &user.pubkey(), &mint);

    let impostor = Keypair::new();
    fund(&mut svm, &impostor.pubkey());
    let ix = bridge_mint_ix(mint, dest, 100, correlation_id("mint-2"), impostor.pubkey());
    let res = send(&mut svm, &[ix], &payer.pubkey(), &[&payer]);

    let err = res.expect_err("a non-relayer signer must be rejected");
    assert!(
        err.meta
            .logs
            .iter()
            .any(|l| l.contains("InvalidRelayer") || l.contains("configured relayer")),
        "expected an InvalidRelayer rejection, got logs: {:?}",
        err.meta.logs
    );
}

#[test]
fn bridge_mint_rejects_a_replayed_correlation_id() {
    let (mut svm, _admin) = new_svm_with_config();
    let payer = Keypair::new();
    fund(&mut svm, &payer.pubkey());

    let mint = init_mint(&mut svm, &payer);
    let user = Keypair::new();
    fund(&mut svm, &user.pubkey());
    let dest = ensure_ata(&mut svm, &payer, &user.pubkey(), &mint);

    let id = correlation_id("mint-3");
    let first = bridge_mint_ix(mint, dest, 50, id, relayer_pubkey());
    send(&mut svm, &[first], &payer.pubkey(), &[&payer]).unwrap();

    let second = bridge_mint_ix(mint, dest, 50, id, relayer_pubkey());
    let res = send(&mut svm, &[second], &payer.pubkey(), &[&payer]);

    assert!(
        res.is_err(),
        "replaying a correlation_id must fail — the processed_marker PDA already exists"
    );
    assert_eq!(
        token_balance(&svm, &dest),
        50,
        "the replayed mint must not have applied a second time"
    );
}

// ---------------------------------------------------------------------
// approve_bridge_delegate + bridge_burn
// ---------------------------------------------------------------------

#[test]
fn bridge_burn_rejects_a_source_with_no_delegate_approval() {
    let (mut svm, _admin) = new_svm_with_config();
    let payer = Keypair::new();
    fund(&mut svm, &payer.pubkey());

    let mint = init_mint(&mut svm, &payer);
    let user = Keypair::new();
    fund(&mut svm, &user.pubkey());
    let source = ensure_ata(&mut svm, &payer, &user.pubkey(), &mint);

    let mint_ix = bridge_mint_ix(
        mint,
        source,
        1_000,
        correlation_id("burn-1-mint"),
        relayer_pubkey(),
    );
    send(&mut svm, &[mint_ix], &payer.pubkey(), &[&payer]).unwrap();

    // No approve_bridge_delegate call — the owner never opted in.
    let burn_ix = bridge_burn_ix(
        mint,
        source,
        100,
        correlation_id("burn-1"),
        relayer_pubkey(),
    );
    let res = send(&mut svm, &[burn_ix], &payer.pubkey(), &[&payer]);

    let err = res.expect_err("burning without a prior delegate approval must fail");
    assert!(
        err.meta
            .logs
            .iter()
            .any(|l| l.contains("NoDelegateApproval") || l.contains("delegated burn authority")),
        "expected a NoDelegateApproval rejection, got logs: {:?}",
        err.meta.logs
    );
}

#[test]
fn bridge_burn_rejects_delegated_amount_below_the_burn_amount() {
    let (mut svm, _admin) = new_svm_with_config();
    let payer = Keypair::new();
    fund(&mut svm, &payer.pubkey());

    let mint = init_mint(&mut svm, &payer);
    let user = Keypair::new();
    fund(&mut svm, &user.pubkey());
    let source = ensure_ata(&mut svm, &payer, &user.pubkey(), &mint);

    let mint_ix = bridge_mint_ix(
        mint,
        source,
        1_000,
        correlation_id("burn-2-mint"),
        relayer_pubkey(),
    );
    send(&mut svm, &[mint_ix], &payer.pubkey(), &[&payer]).unwrap();

    let approve_ix = approve_delegate_ix(source, user.pubkey(), 50);
    send(&mut svm, &[approve_ix], &payer.pubkey(), &[&payer, &user]).unwrap();

    // Asking to burn more than was delegated.
    let burn_ix = bridge_burn_ix(
        mint,
        source,
        100,
        correlation_id("burn-2"),
        relayer_pubkey(),
    );
    let res = send(&mut svm, &[burn_ix], &payer.pubkey(), &[&payer]);

    let err = res.expect_err("burning more than the delegated amount must fail");
    assert!(
        err.meta
            .logs
            .iter()
            .any(|l| l.contains("InsufficientDelegatedAmount")
                || l.contains("less than the requested")),
        "expected an InsufficientDelegatedAmount rejection, got logs: {:?}",
        err.meta.logs
    );
}

#[test]
fn bridge_burn_with_delegate_approval_debits_the_source() {
    let (mut svm, _admin) = new_svm_with_config();
    let payer = Keypair::new();
    fund(&mut svm, &payer.pubkey());

    let mint = init_mint(&mut svm, &payer);
    let user = Keypair::new();
    fund(&mut svm, &user.pubkey());
    let source = ensure_ata(&mut svm, &payer, &user.pubkey(), &mint);

    let mint_ix = bridge_mint_ix(
        mint,
        source,
        1_000,
        correlation_id("burn-3-mint"),
        relayer_pubkey(),
    );
    send(&mut svm, &[mint_ix], &payer.pubkey(), &[&payer]).unwrap();

    let approve_ix = approve_delegate_ix(source, user.pubkey(), 400);
    send(&mut svm, &[approve_ix], &payer.pubkey(), &[&payer, &user]).unwrap();

    let burn_ix = bridge_burn_ix(
        mint,
        source,
        300,
        correlation_id("burn-3"),
        relayer_pubkey(),
    );
    send(&mut svm, &[burn_ix], &payer.pubkey(), &[&payer])
        .unwrap_or_else(|e| panic!("bridge_burn failed: {e:?}"));

    assert_eq!(token_balance(&svm, &source), 700);

    let account = svm.get_account(&source).unwrap();
    let unpacked = token::spl_token::state::Account::unpack(&account.data).unwrap();
    assert_eq!(
        unpacked.delegated_amount, 100,
        "the delegate's remaining allowance should shrink by the burned amount"
    );
}

#[test]
fn bridge_burn_rejects_a_non_relayer_signer() {
    let (mut svm, _admin) = new_svm_with_config();
    let payer = Keypair::new();
    fund(&mut svm, &payer.pubkey());

    let mint = init_mint(&mut svm, &payer);
    let user = Keypair::new();
    fund(&mut svm, &user.pubkey());
    let source = ensure_ata(&mut svm, &payer, &user.pubkey(), &mint);

    let mint_ix = bridge_mint_ix(
        mint,
        source,
        1_000,
        correlation_id("burn-4-mint"),
        relayer_pubkey(),
    );
    send(&mut svm, &[mint_ix], &payer.pubkey(), &[&payer]).unwrap();
    let approve_ix = approve_delegate_ix(source, user.pubkey(), 1_000);
    send(&mut svm, &[approve_ix], &payer.pubkey(), &[&payer, &user]).unwrap();

    let impostor = Keypair::new();
    fund(&mut svm, &impostor.pubkey());
    let burn_ix = bridge_burn_ix(
        mint,
        source,
        100,
        correlation_id("burn-4"),
        impostor.pubkey(),
    );
    let res = send(&mut svm, &[burn_ix], &payer.pubkey(), &[&payer]);

    let err = res.expect_err("a non-relayer signer must be rejected");
    assert!(
        err.meta
            .logs
            .iter()
            .any(|l| l.contains("InvalidRelayer") || l.contains("configured relayer")),
        "expected an InvalidRelayer rejection, got logs: {:?}",
        err.meta.logs
    );
}

#[test]
fn bridge_burn_rejects_a_replayed_correlation_id() {
    let (mut svm, _admin) = new_svm_with_config();
    let payer = Keypair::new();
    fund(&mut svm, &payer.pubkey());

    let mint = init_mint(&mut svm, &payer);
    let user = Keypair::new();
    fund(&mut svm, &user.pubkey());
    let source = ensure_ata(&mut svm, &payer, &user.pubkey(), &mint);

    let mint_ix = bridge_mint_ix(
        mint,
        source,
        1_000,
        correlation_id("burn-5-mint"),
        relayer_pubkey(),
    );
    send(&mut svm, &[mint_ix], &payer.pubkey(), &[&payer]).unwrap();
    let approve_ix = approve_delegate_ix(source, user.pubkey(), 1_000);
    send(&mut svm, &[approve_ix], &payer.pubkey(), &[&payer, &user]).unwrap();

    let id = correlation_id("burn-5");
    let first = bridge_burn_ix(mint, source, 10, id, relayer_pubkey());
    send(&mut svm, &[first], &payer.pubkey(), &[&payer]).unwrap();

    let second = bridge_burn_ix(mint, source, 10, id, relayer_pubkey());
    let res = send(&mut svm, &[second], &payer.pubkey(), &[&payer]);

    assert!(
        res.is_err(),
        "replaying a correlation_id must fail — the processed_marker PDA already exists"
    );
    assert_eq!(
        token_balance(&svm, &source),
        990,
        "the replayed burn must not have applied a second time"
    );
}

// ---------------------------------------------------------------------
// Regression lock: the processed_marker PDA is SHARED between mint and
// burn (seeded only by correlation_id, not by which instruction used it),
// unlike Ethereum's USDX.sol, which keeps processedMints/processedBurns as
// two separate maps. This is an intentional platform-level asymmetry
// (core-ledger's saga suffixes bridge/compensation correlation ids so it
// never collides in practice) — this test exists so nobody "simplifies"
// Solana into two markers, or Ethereum into one, without that being a
// deliberate, reviewed decision.
// ---------------------------------------------------------------------

#[test]
fn processed_marker_is_shared_between_mint_and_burn_for_the_same_correlation_id() {
    let (mut svm, _admin) = new_svm_with_config();
    let payer = Keypair::new();
    fund(&mut svm, &payer.pubkey());

    let mint = init_mint(&mut svm, &payer);
    let user = Keypair::new();
    fund(&mut svm, &user.pubkey());
    let account = ensure_ata(&mut svm, &payer, &user.pubkey(), &mint);

    let id = correlation_id("shared-marker");
    let mint_ix = bridge_mint_ix(mint, account, 1_000, id, relayer_pubkey());
    send(&mut svm, &[mint_ix], &payer.pubkey(), &[&payer])
        .unwrap_or_else(|e| panic!("bridge_mint failed: {e:?}"));

    let approve_ix = approve_delegate_ix(account, user.pubkey(), 1_000);
    send(&mut svm, &[approve_ix], &payer.pubkey(), &[&payer, &user]).unwrap();

    // Same correlation_id as the mint above — on Ethereum this would
    // succeed (processedMints and processedBurns are independent maps).
    // On Solana it must fail: both derive the same ("processed", id) PDA.
    let burn_ix = bridge_burn_ix(mint, account, 100, id, relayer_pubkey());
    let res = send(&mut svm, &[burn_ix], &payer.pubkey(), &[&payer]);

    assert!(
        res.is_err(),
        "a burn reusing a mint's correlation_id must fail on Solana (shared processed_marker PDA) — \
         if this now passes, the marker seeding changed and USDX.sol's comment about mirroring it no longer holds"
    );
    assert_eq!(
        token_balance(&svm, &account),
        1_000,
        "the colliding burn must not have applied"
    );
}

// ---------------------------------------------------------------------
// BridgeConfig — relayer rotation, admin handover, pause (P6 / R6)
//
// Before these instructions existed, the relayer was a compile-time
// constant: rotating a key meant rebuilding and redeploying the program,
// with a governance window in between during which the compromised key
// still worked. The risk register calls that R6 and gates rotation on
// exactly this account existing.
// ---------------------------------------------------------------------

#[test]
fn initialize_config_seeds_the_shipped_relayer_and_the_given_admin() {
    let (svm, admin) = new_svm_with_config();

    let config = read_config(&svm);
    assert_eq!(config.admin, admin.pubkey());
    // Seeded from the constant the program shipped with, so an existing
    // deployment can initialise without knowing a pubkey out of band.
    assert_eq!(config.relayer, relayer_pubkey());
    assert!(!config.paused, "a freshly initialised bridge must not be paused");
}

#[test]
fn initialize_config_cannot_run_twice() {
    // `init` fails if the account exists. Re-running must be an error rather
    // than a reset: an account whose whole job is to say who may change
    // things must not be resettable by anyone who can pay rent.
    let (mut svm, _admin) = new_svm_with_config();
    let payer = Keypair::new();
    fund(&mut svm, &payer.pubkey());

    let (config, _) = config_pda();
    let accounts = usdx_accounts::InitializeConfig {
        payer: payer.pubkey(),
        config,
        system_program: anchor_lang::system_program::ID,
    };
    let ix = Instruction {
        program_id: usdx_bridge::ID,
        accounts: accounts.to_account_metas(None),
        data: usdx_instruction::InitializeConfig {
            admin: payer.pubkey(),
        }
        .data(),
    };

    send(&mut svm, &[ix], &payer.pubkey(), &[&payer])
        .expect_err("initialize_config must not be re-runnable");
}

#[test]
fn initialize_config_rejects_a_zero_admin() {
    // A zero admin locks the config forever: nothing could satisfy the admin
    // constraint, so the relayer could never be rotated and the bridge could
    // never be paused. Recovering from that is a redeploy.
    let mut svm = new_svm();
    let payer = Keypair::new();
    fund(&mut svm, &payer.pubkey());

    let (config, _) = config_pda();
    let accounts = usdx_accounts::InitializeConfig {
        payer: payer.pubkey(),
        config,
        system_program: anchor_lang::system_program::ID,
    };
    let ix = Instruction {
        program_id: usdx_bridge::ID,
        accounts: accounts.to_account_metas(None),
        data: usdx_instruction::InitializeConfig {
            admin: Pubkey::default(),
        }
        .data(),
    };

    send(&mut svm, &[ix], &payer.pubkey(), &[&payer])
        .expect_err("a zero admin must be rejected");
}

#[test]
fn set_relayer_rotates_who_may_mint() {
    // The whole point of R6, end to end: the old relayer stops working and a
    // new one starts, in one transaction.
    let (mut svm, admin) = new_svm_with_config();
    let payer = Keypair::new();
    fund(&mut svm, &payer.pubkey());

    let mint = init_mint(&mut svm, &payer);
    let user = Keypair::new();
    fund(&mut svm, &user.pubkey());
    let dest = ensure_ata(&mut svm, &payer, &user.pubkey(), &mint);

    let new_relayer = Keypair::new();
    fund(&mut svm, &new_relayer.pubkey());

    // Before rotation the new relayer is nobody.
    let before = bridge_mint_ix(mint, dest, 10, correlation_id("rot-before"), new_relayer.pubkey());
    send(&mut svm, &[before], &payer.pubkey(), &[&payer])
        .expect_err("an un-rotated relayer must not be able to mint");

    let rotate = admin_only_ix(
        admin.pubkey(),
        usdx_instruction::SetRelayer {
            new_relayer: new_relayer.pubkey(),
        }
        .data(),
    );
    send(&mut svm, &[rotate], &payer.pubkey(), &[&payer, &admin])
        .unwrap_or_else(|e| panic!("set_relayer failed: {e:?}"));

    assert_eq!(read_config(&svm).relayer, new_relayer.pubkey());

    // After rotation the new relayer works...
    let after = bridge_mint_ix(mint, dest, 10, correlation_id("rot-after"), new_relayer.pubkey());
    send(&mut svm, &[after], &payer.pubkey(), &[&payer])
        .unwrap_or_else(|e| panic!("the rotated-in relayer should be able to mint: {e:?}"));
    assert_eq!(token_balance(&svm, &dest), 10);

    // ...and the old one does not. This is the half that matters after a
    // suspected leak: rotation is worthless if the compromised key still
    // works.
    let old = bridge_mint_ix(mint, dest, 10, correlation_id("rot-old"), relayer_pubkey());
    send(&mut svm, &[old], &payer.pubkey(), &[&payer])
        .expect_err("the rotated-out relayer must no longer be able to mint");
}

#[test]
fn set_relayer_rejects_a_non_admin() {
    let (mut svm, _admin) = new_svm_with_config();
    let payer = Keypair::new();
    fund(&mut svm, &payer.pubkey());

    let impostor = Keypair::new();
    fund(&mut svm, &impostor.pubkey());

    let ix = admin_only_ix(
        impostor.pubkey(),
        usdx_instruction::SetRelayer {
            new_relayer: impostor.pubkey(),
        }
        .data(),
    );
    send(&mut svm, &[ix], &payer.pubkey(), &[&payer, &impostor])
        .expect_err("only the admin may rotate the relayer");

    assert_eq!(
        read_config(&svm).relayer,
        relayer_pubkey(),
        "a rejected rotation must leave the relayer unchanged"
    );
}

#[test]
fn set_relayer_rejects_the_zero_pubkey() {
    // Setting it would not disable the relayer, it would leave an account
    // nothing can satisfy. `set_paused` is the reversible way to stop the
    // bridge.
    let (mut svm, admin) = new_svm_with_config();
    let payer = Keypair::new();
    fund(&mut svm, &payer.pubkey());

    let ix = admin_only_ix(
        admin.pubkey(),
        usdx_instruction::SetRelayer {
            new_relayer: Pubkey::default(),
        }
        .data(),
    );
    send(&mut svm, &[ix], &payer.pubkey(), &[&payer, &admin])
        .expect_err("the zero pubkey must be rejected");
}

#[test]
fn set_paused_halts_minting_and_burning_and_is_reversible() {
    // Ethereum's USDX has had a pause since it was written. Solana had none,
    // so the only answer to a compromise was revoking the mint authority —
    // irreversible, and it takes the honest users with it.
    let (mut svm, admin) = new_svm_with_config();
    let payer = Keypair::new();
    fund(&mut svm, &payer.pubkey());

    let mint = init_mint(&mut svm, &payer);
    let user = Keypair::new();
    fund(&mut svm, &user.pubkey());
    let ata = ensure_ata(&mut svm, &payer, &user.pubkey(), &mint);

    // Fund the account before pausing, so the burn path has something to
    // refuse to burn.
    let seed = bridge_mint_ix(mint, ata, 1_000, correlation_id("pause-seed"), relayer_pubkey());
    send(&mut svm, &[seed], &payer.pubkey(), &[&payer]).unwrap();

    let pause = admin_only_ix(
        admin.pubkey(),
        usdx_instruction::SetPaused { paused: true }.data(),
    );
    send(&mut svm, &[pause], &payer.pubkey(), &[&payer, &admin])
        .unwrap_or_else(|e| panic!("set_paused failed: {e:?}"));
    assert!(read_config(&svm).paused);

    let minting = bridge_mint_ix(mint, ata, 1, correlation_id("pause-mint"), relayer_pubkey());
    send(&mut svm, &[minting], &payer.pubkey(), &[&payer])
        .expect_err("a paused bridge must not mint");

    let approve = approve_delegate_ix(ata, user.pubkey(), 1_000);
    send(&mut svm, &[approve], &payer.pubkey(), &[&payer, &user]).unwrap();
    let burning = bridge_burn_ix(mint, ata, 1, correlation_id("pause-burn"), relayer_pubkey());
    send(&mut svm, &[burning], &payer.pubkey(), &[&payer])
        .expect_err("a paused bridge must not burn");

    // Reversible, which is the entire advantage over revoking mint authority.
    let unpause = admin_only_ix(
        admin.pubkey(),
        usdx_instruction::SetPaused { paused: false }.data(),
    );
    send(&mut svm, &[unpause], &payer.pubkey(), &[&payer, &admin]).unwrap();

    let resumed = bridge_mint_ix(mint, ata, 5, correlation_id("pause-resume"), relayer_pubkey());
    send(&mut svm, &[resumed], &payer.pubkey(), &[&payer])
        .unwrap_or_else(|e| panic!("an unpaused bridge should mint again: {e:?}"));
    assert_eq!(token_balance(&svm, &ata), 1_005);
}

#[test]
fn set_paused_rejects_a_non_admin() {
    let (mut svm, _admin) = new_svm_with_config();
    let payer = Keypair::new();
    fund(&mut svm, &payer.pubkey());

    let impostor = Keypair::new();
    fund(&mut svm, &impostor.pubkey());

    let ix = admin_only_ix(
        impostor.pubkey(),
        usdx_instruction::SetPaused { paused: true }.data(),
    );
    send(&mut svm, &[ix], &payer.pubkey(), &[&payer, &impostor])
        .expect_err("only the admin may pause the bridge");

    assert!(!read_config(&svm).paused);
}

#[test]
fn set_admin_hands_over_control_completely() {
    let (mut svm, admin) = new_svm_with_config();
    let payer = Keypair::new();
    fund(&mut svm, &payer.pubkey());

    let successor = Keypair::new();
    fund(&mut svm, &successor.pubkey());

    let handover = admin_only_ix(
        admin.pubkey(),
        usdx_instruction::SetAdmin {
            new_admin: successor.pubkey(),
        }
        .data(),
    );
    send(&mut svm, &[handover], &payer.pubkey(), &[&payer, &admin])
        .unwrap_or_else(|e| panic!("set_admin failed: {e:?}"));

    assert_eq!(read_config(&svm).admin, successor.pubkey());

    // The successor can act...
    let by_successor = admin_only_ix(
        successor.pubkey(),
        usdx_instruction::SetPaused { paused: true }.data(),
    );
    send(&mut svm, &[by_successor], &payer.pubkey(), &[&payer, &successor])
        .unwrap_or_else(|e| panic!("the new admin should be able to act: {e:?}"));

    // ...and the predecessor cannot. A handover that leaves the old admin
    // able to act is not a handover.
    let by_predecessor = admin_only_ix(
        admin.pubkey(),
        usdx_instruction::SetPaused { paused: false }.data(),
    );
    send(&mut svm, &[by_predecessor], &payer.pubkey(), &[&payer, &admin])
        .expect_err("the previous admin must lose control");
}

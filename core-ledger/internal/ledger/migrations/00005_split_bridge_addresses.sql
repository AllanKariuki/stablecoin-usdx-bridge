-- +goose Up

-- bridge_transfers carried one `user_address`, and a cross-chain bridge needs
-- two. The handler set it to the *destination* wallet's address while the saga
-- burned from that same value on the *source* chain — and an Ethereum address
-- (20 bytes of hex) and a Solana address (a base58 ed25519 pubkey) are never
-- the same string. So every ETH<->SOL bridge submitted its burn against an
-- address derived from the wrong chain's, and the compensating re-mint had the
-- same defect. A fresh mint and a redemption were unaffected: they only ever
-- touch one chain, so the single column happened to hold the right value.
--
-- Splitting the column is what makes the burn and the mint able to disagree
-- about where they point, which on a bridge they always do.
ALTER TABLE bridge_transfers
    ADD COLUMN IF NOT EXISTS source_address TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS target_address TEXT NOT NULL DEFAULT '';

-- Repair from the wallets rather than from user_address: a wallet is
-- authoritative for the address it mints to and burns from, and for a bridge
-- row the correct source address was never recorded anywhere else.
UPDATE bridge_transfers bt
   SET source_address = w.address
  FROM wallets w
 WHERE w.id = bt.source_wallet_id
   AND bt.source_address = '';

UPDATE bridge_transfers bt
   SET target_address = w.address
  FROM wallets w
 WHERE w.id = bt.target_wallet_id
   AND bt.target_address = '';

ALTER TABLE bridge_transfers DROP COLUMN IF EXISTS user_address;

-- Which address a saga needs is a function of its shape, the same way its
-- chains are: a mint has only a destination, a redemption only a source, a
-- bridge both.
ALTER TABLE bridge_transfers DROP CONSTRAINT IF EXISTS chk_bridge_transfers_kind_addresses;
ALTER TABLE bridge_transfers ADD CONSTRAINT chk_bridge_transfers_kind_addresses CHECK (
    (kind = 'MINT'   AND target_address <> '') OR
    (kind = 'REDEEM' AND source_address <> '') OR
    (kind = 'BRIDGE' AND source_address <> '' AND target_address <> '')
);

-- +goose Down
ALTER TABLE bridge_transfers DROP CONSTRAINT IF EXISTS chk_bridge_transfers_kind_addresses;
ALTER TABLE bridge_transfers ADD COLUMN IF NOT EXISTS user_address TEXT NOT NULL DEFAULT '';
UPDATE bridge_transfers SET user_address = target_address WHERE target_address <> '';
UPDATE bridge_transfers SET user_address = source_address WHERE target_address = '';
ALTER TABLE bridge_transfers
    DROP COLUMN IF EXISTS target_address,
    DROP COLUMN IF EXISTS source_address;

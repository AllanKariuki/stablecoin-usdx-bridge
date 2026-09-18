-- +goose Up
-- Fixes a pre-existing bug: any DB created before this migration existed
-- (either from the original raw-SQL migration, or from GORM's AutoMigrate
-- during the brief sqlx -> GORM -> goose transition) has this constraint
-- without '' allowed, which rejects every fresh-mint insert (source_chain
-- is empty when there's no source chain to bridge from). DROP+ADD under
-- the same name is idempotent against a DB where 00001 already created it
-- correctly.
ALTER TABLE bridge_transfers DROP CONSTRAINT IF EXISTS chk_bridge_transfers_source_chain;
ALTER TABLE bridge_transfers ADD CONSTRAINT chk_bridge_transfers_source_chain
    CHECK (source_chain IN ('', 'ETHEREUM', 'SOLANA'));

-- +goose Down
ALTER TABLE bridge_transfers DROP CONSTRAINT IF EXISTS chk_bridge_transfers_source_chain;
ALTER TABLE bridge_transfers ADD CONSTRAINT chk_bridge_transfers_source_chain
    CHECK (source_chain IN ('ETHEREUM', 'SOLANA'));

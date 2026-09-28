-- services/indexer's database, in its own TimescaleDB container.
--
-- Separate from the platform Postgres on purpose (docs/building-plan.md:
-- "Postgres: one container, one database per service, one role per service.
-- TimescaleDB is its own container"). chain_events is an append-heavy time
-- series queried by window; the journal is a transactional ledger queried by
-- key. They want different autovacuum settings, different shared_buffers
-- pressure and — once retention and compression policies land — different
-- background workers entirely.
--
-- The extension is created in the database itself rather than only in
-- template1, because the indexer's own migration does
-- CREATE EXTENSION IF NOT EXISTS timescaledb and needs the role running it to
-- be able to.
CREATE ROLE indexer WITH LOGIN PASSWORD 'indexer' SUPERUSER;
CREATE DATABASE indexer OWNER indexer;
CREATE DATABASE indexer_test OWNER indexer;

\connect indexer
CREATE EXTENSION IF NOT EXISTS timescaledb;

\connect indexer_test
CREATE EXTENSION IF NOT EXISTS timescaledb;

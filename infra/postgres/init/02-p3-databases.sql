-- P3's two new service databases, on the same "one database per service, one
-- role per service" model as 01-identity-db.sql.
--
-- services/indexer is NOT here. It owns a TimescaleDB database in a separate
-- container (see docker-compose.yaml's `timescaledb` service and
-- infra/timescaledb/init/): the plan's decision is "TimescaleDB is its own
-- container", and chain_events is an append-heavy time series whose
-- compression and retention policies have no business sharing a tuning
-- profile with a double-entry journal.
--
-- Like 01-, the official postgres image only runs docker-entrypoint-initdb.d/
-- the first time a container starts against an EMPTY data directory — an
-- existing local `pgdata` volume needs `docker compose down -v && make up`.

-- services/rms: custodians, statements, reserve targets, fee schedules,
-- attestations.
CREATE ROLE rms WITH LOGIN PASSWORD 'rms';
CREATE DATABASE rms OWNER rms;
CREATE DATABASE rms_test OWNER rms;

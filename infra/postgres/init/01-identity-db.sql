-- Creates services/identity's own Postgres role + databases, isolated by
-- GRANT rather than convention (docs/building-plan.md's "one database per
-- service, one role per service" decision). identity_test is a second,
-- separate database (not a schema inside identity) so its e2e/integration
-- specs (services/identity/test/fixtures/bootstrap.ts) can freely drop and
-- recreate tables without ever touching a dev database's data.
--
-- The official postgres image only runs docker-entrypoint-initdb.d/ the
-- first time a container starts against an EMPTY data directory — an
-- existing local `pgdata` volume from before this file existed needs
-- `docker compose down -v && make up` to pick it up.
CREATE ROLE identity WITH LOGIN PASSWORD 'identity';
CREATE DATABASE identity OWNER identity;
CREATE DATABASE identity_test OWNER identity;

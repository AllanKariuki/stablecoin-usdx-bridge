-- P4's two service databases, on the same "one database per service, one role
-- per service" model as 01- and 02-.
--
-- Like the others, the official postgres image only runs
-- docker-entrypoint-initdb.d/ the first time a container starts against an
-- EMPTY data directory — an existing local `pgdata` volume needs
-- `docker compose down -v && make up`.

-- services/payments: intents, invoices, bank accounts, beneficiaries,
-- statement lines. Owns no balance — every intent that settles posts one
-- journal transaction through core-ledger.
CREATE ROLE payments WITH LOGIN PASSWORD 'payments';
CREATE DATABASE payments OWNER payments;
CREATE DATABASE payments_test OWNER payments;

-- services/notifications: templates, preferences, the delivery log, and
-- outbound webhooks.
CREATE ROLE notifications WITH LOGIN PASSWORD 'notifications';
CREATE DATABASE notifications OWNER notifications;
CREATE DATABASE notifications_test OWNER notifications;

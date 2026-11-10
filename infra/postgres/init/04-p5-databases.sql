-- P5's three service databases.
--
-- Same model as 01- through 03-, and the same caveat: the postgres image only
-- runs docker-entrypoint-initdb.d/ against an EMPTY data directory, so an
-- existing local volume needs `docker compose down -v && make up`.

-- services/workflow: maker-checker. Policies, approval requests, approvals.
-- Deliberately its own database rather than a schema in another service's:
-- the point of the service is that no caller can edit the record of what was
-- approved, and a shared database would make that a convention rather than a
-- grant.
CREATE ROLE workflow WITH LOGIN PASSWORD 'workflow';
CREATE DATABASE workflow OWNER workflow;
CREATE DATABASE workflow_test OWNER workflow;

-- services/kyc: cases, documents, tiers, limits.
CREATE ROLE kyc WITH LOGIN PASSWORD 'kyc';
CREATE DATABASE kyc OWNER kyc;
CREATE DATABASE kyc_test OWNER kyc;

-- services/compliance: screenings, rules, alerts, cases, enforcement.
CREATE ROLE compliance WITH LOGIN PASSWORD 'compliance';
CREATE DATABASE compliance OWNER compliance;
CREATE DATABASE compliance_test OWNER compliance;

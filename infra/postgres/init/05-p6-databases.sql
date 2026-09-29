-- services/signer's own database: the append-only, hash-chained record of
-- every signature it has produced and every one it has refused.
--
-- It is deliberately the most isolated database on the platform. Nothing else
-- reads it, nothing else writes it, and the append-only trigger means even
-- the owning role cannot edit a row — which is what makes the log evidence
-- rather than a report.
CREATE ROLE signer WITH LOGIN PASSWORD 'signer';
CREATE DATABASE signer OWNER signer;
CREATE DATABASE signer_test OWNER signer;

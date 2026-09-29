-- P7's two service databases.
--
-- audit-trail's is the second-most isolated on the platform after the
-- signer's: nothing else reads it, nothing else writes it, and its
-- append-only trigger means even the owning role cannot edit a row.
CREATE ROLE audit_trail WITH LOGIN PASSWORD 'audit_trail';
CREATE DATABASE audit_trail OWNER audit_trail;
CREATE DATABASE audit_trail_test OWNER audit_trail;

-- reporting owns report definitions and runs. It owns no numbers: every
-- figure is read from the service that owns it at run time and frozen into
-- the run.
CREATE ROLE reporting WITH LOGIN PASSWORD 'reporting';
CREATE DATABASE reporting OWNER reporting;
CREATE DATABASE reporting_test OWNER reporting;

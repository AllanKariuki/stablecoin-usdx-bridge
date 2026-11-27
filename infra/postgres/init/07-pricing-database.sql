-- services/pricing's database: the pair policy (pricing_pairs) and the
-- exposure record (quotes_issued) live here, isolated by GRANT like every
-- other service database (docs/building-plan.md: one database per service,
-- one role per service). The one number that matters downstream — the quote
-- itself — is POSTed to core-ledger's fx_quotes and lives there, because
-- the ledger is the only place a rate can be consumed.
CREATE ROLE pricing WITH LOGIN PASSWORD 'pricing';
CREATE DATABASE pricing OWNER pricing;
CREATE DATABASE pricing_test OWNER pricing;

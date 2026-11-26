-- H6: compliance.blacklist gains 'admin' in its approver pool.
--
-- Blacklisting freezes a holder's tokens, so the decision needs a second
-- person — and until now the seeded pool was ['compliance'], whose only
-- seeded member is also the one who proposes (excluded by
-- exclude_initiator). H6's end-to-end flow is compliance@damp.local proposes,
-- admin@damp.local approves, so the pool now includes admin, exactly like
-- pol_pause's. One approval remains the requirement.
--
-- Edits the seed for fresh databases; existing databases (001 has already
-- run) get the same row fixed here.

UPDATE policies
   SET approver_roles = ARRAY['compliance', 'admin']
 WHERE action = 'compliance.blacklist';

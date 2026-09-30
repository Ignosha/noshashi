-- Two roles procurement reviews ask for by name.
--
--   reviewer  the second pair of eyes: activates a policy someone else wrote
--             and decides exceptions someone else raised (including asking
--             for more evidence), and reads the audit log. Cannot draft
--             policies, raise exceptions or administer the organization.
--   auditor   an internal, read-only seat: everything a member can read, plus
--             the audit log. Changes nothing. Unlike the regulator seat it is
--             not time-limited and needs no plan feature.
--
-- On their own because a new enum value cannot be used in the transaction
-- that adds it; 20260930120100 puts them to work.
alter type noshashi.member_role add value if not exists 'reviewer';
alter type noshashi.member_role add value if not exists 'auditor';

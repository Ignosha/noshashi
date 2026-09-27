-- The examiner's role. On its own because a new enum value cannot be used
-- in the transaction that adds it; 20260927180100 puts it to work.
alter type noshashi.member_role add value if not exists 'regulator';

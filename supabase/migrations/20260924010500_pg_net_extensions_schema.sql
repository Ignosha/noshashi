-- pg_net was first registered in public (it is not relocatable). Nothing
-- was queued, so it is re-created in the extensions schema; its functions
-- stay in the net schema, where noshashi.webhook_send and webhook_tick use them.
drop extension if exists pg_net;
create extension pg_net with schema extensions;

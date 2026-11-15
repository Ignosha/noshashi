-- Compatibility for the pinned Supabase CLI 2.58.5 / PostgreSQL 17.6 fixture.
-- The platform's pg_graphql event hook creates this wrapper, but a fresh
-- pg_restore installs the extension before restoring the event hook.
-- Source (MIT): https://github.com/supabase/cli/blob/v2.58.5/internal/utils/templates/initial_schemas/14.sql
-- See extensions.grant_pg_graphql_access(). Do not replace existing functions.
do $restore$
begin
 if to_regprocedure('graphql_public.graphql(text,text,jsonb,jsonb)') is null then
  execute $ddl$
   create function graphql_public.graphql(
    "operationName" text default null,
    query text default null,
    variables jsonb default null,
    extensions jsonb default null
   ) returns jsonb language sql as $body$
    select graphql.resolve(
     query := query,
     variables := coalesce(variables, '{}'),
     "operationName" := "operationName",
     extensions := extensions
    );
   $body$;
  $ddl$;
 end if;
end;
$restore$;
-- Match the same pinned provider hook's initial extension permissions. These
-- normally run during CREATE EXTENSION, before archived ACL differences apply.
-- Keep them before metadata restoration so stricter archived changes still win.
grant usage on schema graphql to postgres, anon, authenticated, service_role;
grant select on all tables in schema graphql to postgres, anon, authenticated, service_role;
grant execute on all functions in schema graphql to postgres, anon, authenticated, service_role;
grant all on all sequences in schema graphql to postgres, anon, authenticated, service_role;
alter default privileges in schema graphql grant all on tables to postgres, anon, authenticated, service_role;
alter default privileges in schema graphql grant all on functions to postgres, anon, authenticated, service_role;
alter default privileges in schema graphql grant all on sequences to postgres, anon, authenticated, service_role;
-- The same upstream initial schema grants these before the wrapper exists.
-- pg_dump's extension-initial ACL assumptions require the target bootstrap
-- to supply them too; later archived ACL differences remain authoritative.
grant usage on schema graphql_public to postgres, anon, authenticated, service_role;
grant execute on function graphql_public.graphql(text,text,jsonb,jsonb) to postgres, anon, authenticated, service_role;
alter default privileges in schema graphql_public grant all on tables to postgres, anon, authenticated, service_role;
alter default privileges in schema graphql_public grant all on functions to postgres, anon, authenticated, service_role;
alter default privileges in schema graphql_public grant all on sequences to postgres, anon, authenticated, service_role;

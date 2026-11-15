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

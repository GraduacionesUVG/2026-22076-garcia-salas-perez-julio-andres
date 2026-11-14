-- Query-performance hardening.
-- Keeps result sets and authorization semantics unchanged:
--   1) project_members lookups by user_id use an index.
--   2) auth helpers in RLS policies are evaluated once per statement.

create index if not exists project_members_user_id_project_id_idx
  on public.project_members (user_id, project_id);

create index if not exists project_delimitation_version_items_version_position_idx
  on public.project_delimitation_version_items (version_id, "position", created_at);

create or replace function public.is_project_member(pid uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $function$
  select exists (
    select 1
    from public.project_members pm
    where pm.project_id = pid
      and pm.user_id = (select auth.uid())
  );
$function$;

create or replace function public.project_role(pid uuid)
returns public.project_role
language sql
security definer
set search_path = public
as $function$
  select pm.role
  from public.project_members pm
  where pm.project_id = pid
    and pm.user_id = (select auth.uid())
  limit 1;
$function$;

create or replace function public.has_project_role(pid uuid, roles text[])
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $function$
  select exists (
    select 1
    from public.project_members pm
    where pm.project_id = pid
      and pm.user_id = (select auth.uid())
      and pm.role::text = any(roles)
  );
$function$;

create or replace function public.analysis_is_project_member(pid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $function$
  select exists (
    select 1
    from public.project_members pm
    where pm.project_id = pid
      and pm.user_id = (select auth.uid())
  );
$function$;

create or replace function public.analysis_has_project_role(pid uuid, allowed_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $function$
  select exists (
    select 1
    from public.project_members pm
    where pm.project_id = pid
      and pm.user_id = (select auth.uid())
      and pm.role::text = any(allowed_roles)
  );
$function$;

create or replace function public.app_profile_role()
returns text
language sql
stable
security definer
set search_path = public
as $function$
  select role::text
  from public.profiles
  where id = (select auth.uid())
    and is_active = true;
$function$;

-- Rewrite only policies that still contain a direct auth function call. The
-- guards keep this block safe to re-run after a partially applied migration.
do $$
declare
  rec record;
  roles_sql text;
  cmd_sql text;
  qual_sql text;
  check_sql text;
  ddl text;
begin
  for rec in
    select pol.*, n.nspname as schema_name, c.relname as table_name,
           pg_get_expr(pol.polqual, pol.polrelid) as qual_expr,
           pg_get_expr(pol.polwithcheck, pol.polrelid) as check_expr
    from pg_policy pol
    join pg_class c on c.oid = pol.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and (
        (coalesce(pg_get_expr(pol.polqual, pol.polrelid), '') like '%auth.uid()%'
          and coalesce(pg_get_expr(pol.polqual, pol.polrelid), '') not like '%(select auth.uid())%')
        or (coalesce(pg_get_expr(pol.polqual, pol.polrelid), '') like '%auth.jwt()%'
          and coalesce(pg_get_expr(pol.polqual, pol.polrelid), '') not like '%(select auth.jwt())%')
        or (coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), '') like '%auth.uid()%'
          and coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), '') not like '%(select auth.uid())%')
        or (coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), '') like '%auth.jwt()%'
          and coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), '') not like '%(select auth.jwt())%')
      )
  loop
    select string_agg(
      case when rid = 0 then 'public' else quote_ident(pg_get_userbyid(rid)) end,
      ', ' order by rid
    )
    into roles_sql
    from unnest(rec.polroles) as role_ids(rid);

    cmd_sql := case rec.polcmd
      when 'r' then 'SELECT'
      when 'a' then 'INSERT'
      when 'w' then 'UPDATE'
      when 'd' then 'DELETE'
      else 'ALL'
    end;

    qual_sql := replace(replace(rec.qual_expr, 'auth.uid()', '(select auth.uid())'), 'auth.jwt()', '(select auth.jwt())');
    check_sql := replace(replace(rec.check_expr, 'auth.uid()', '(select auth.uid())'), 'auth.jwt()', '(select auth.jwt())');

    execute format('drop policy %I on %I.%I', rec.polname, rec.schema_name, rec.table_name);

    ddl := format(
      'create policy %I on %I.%I as %s for %s to %s',
      rec.polname, rec.schema_name, rec.table_name,
      case when rec.polpermissive then 'permissive' else 'restrictive' end,
      cmd_sql, roles_sql
    );
    if qual_sql is not null then
      ddl := ddl || format(' using (%s)', qual_sql);
    end if;
    if check_sql is not null then
      ddl := ddl || format(' with check (%s)', check_sql);
    end if;
    execute ddl;
  end loop;
end $$;

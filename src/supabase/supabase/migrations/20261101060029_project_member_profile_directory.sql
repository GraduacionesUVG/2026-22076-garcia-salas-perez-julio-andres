-- The general profiles table remains private (profiles_select_own).
-- Expose only the existing team identity fields, only to active coworkers,
-- and only for identities belonging to the requested project.
create or replace function public.project_member_profiles_safe(
  p_project_id uuid,
  p_user_ids uuid[]
)
returns table (id uuid, full_name text, email text, username text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or public.app_profile_role() is null or not exists (
    select 1 from public.project_members caller
    where caller.project_id = p_project_id and caller.user_id = auth.uid()
  ) then
    raise exception 'PROJECT_MEMBER_REQUIRED' using errcode = '42501';
  end if;

  return query
    select profile.id, profile.full_name::text, profile.email::text, profile.username::text
    from public.project_members member
    join public.profiles profile on profile.id = member.user_id
    where member.project_id = p_project_id
      and member.user_id = any(p_user_ids);
end;
$$;

revoke all on function public.project_member_profiles_safe(uuid, uuid[]) from public, anon;
grant execute on function public.project_member_profiles_safe(uuid, uuid[]) to authenticated;

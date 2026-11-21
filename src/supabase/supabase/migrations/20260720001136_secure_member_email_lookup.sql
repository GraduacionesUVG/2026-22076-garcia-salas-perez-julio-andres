create or replace function public.project_has_member_email_safe(
  p_project_id uuid,
  p_email_b64 text
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  normalized_email text := lower(convert_from(decode(p_email_b64, 'base64'), 'utf8'));
begin
  if auth.uid() is null or not exists (
    select 1
    from public.project_members owner_member
    where owner_member.project_id = p_project_id
      and owner_member.user_id = auth.uid()
      and owner_member.role = 'owner'
  ) then
    raise exception 'PROJECT_OWNER_REQUIRED' using errcode = '42501';
  end if;

  return exists (
    select 1
    from public.project_members member
    join public.profiles profile on profile.id = member.user_id
    where member.project_id = p_project_id
      and lower(profile.email) = normalized_email
  );
end;
$$;

revoke all on function public.project_has_member_email_safe(uuid, text) from public, anon;
grant execute on function public.project_has_member_email_safe(uuid, text) to authenticated;

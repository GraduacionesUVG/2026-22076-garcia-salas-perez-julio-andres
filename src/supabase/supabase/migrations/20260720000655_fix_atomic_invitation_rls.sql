create or replace function public.accept_project_invitation_atomic(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  invitation public.project_invitations%rowtype;
  member public.project_members%rowtype;
  caller_id uuid := auth.uid();
  jwt_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if caller_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'P0001';
  end if;

  select * into invitation
  from public.project_invitations i
  where i.token = p_token
  for update;

  if not found then
    raise exception 'PROJECT_INVITATION_NOT_FOUND' using errcode = 'P0001';
  end if;
  if invitation.status <> 'pending' then
    raise exception 'PROJECT_INVITATION_NOT_PENDING' using errcode = 'P0001';
  end if;
  if invitation.expires_at <= now() then
    raise exception 'PROJECT_INVITATION_EXPIRED' using errcode = 'P0001';
  end if;
  if jwt_email = '' or jwt_email <> lower(invitation.email) then
    raise exception 'PROJECT_INVITATION_EMAIL_MISMATCH' using errcode = 'P0001';
  end if;

  begin
    insert into public.project_members (project_id, user_id, role)
    values (invitation.project_id, caller_id, invitation.role)
    returning * into member;
  exception when unique_violation then
    raise exception 'PROJECT_MEMBER_ALREADY_EXISTS' using errcode = 'P0001';
  end;

  update public.project_invitations
  set status = 'accepted', accepted_at = now(), accepted_by = caller_id
  where id = invitation.id and status = 'pending'
  returning * into invitation;

  if not found then
    raise exception 'PROJECT_INVITATION_NOT_PENDING' using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'invitation', to_jsonb(invitation),
    'member', to_jsonb(member)
  );
end;
$$;

revoke all on function public.accept_project_invitation_atomic(text) from public, anon;
grant execute on function public.accept_project_invitation_atomic(text) to authenticated;

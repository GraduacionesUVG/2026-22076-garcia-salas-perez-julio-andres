create or replace function public.guard_document_content_with_segments()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.content is distinct from old.content
     and exists (
       select 1
       from public.project_document_segments s
       where s.project_id = old.project_id
         and s.document_id = old.id
         and s.deleted_at is null
     ) then
    raise exception 'DOCUMENT_HAS_ACTIVE_SEGMENTS' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_document_content_with_segments on public.project_documents;
create trigger guard_document_content_with_segments
before update of content on public.project_documents
for each row execute function public.guard_document_content_with_segments();

create or replace function public.guard_code_soft_delete_dependencies()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.deleted_at is null and new.deleted_at is not null then
    if exists (
      select 1 from public.project_codes child
      where child.project_id = old.project_id
        and child.parent_code_id = old.id
        and child.deleted_at is null
    ) then
      raise exception 'CODE_HAS_ACTIVE_CHILDREN' using errcode = 'P0001';
    end if;

    if exists (
      select 1 from public.project_segment_codes assignment
      where assignment.project_id = old.project_id
        and assignment.code_id = old.id
        and assignment.deleted_at is null
    ) then
      raise exception 'CODE_HAS_ACTIVE_ASSIGNMENTS' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_code_soft_delete_dependencies on public.project_codes;
create trigger guard_code_soft_delete_dependencies
before update of deleted_at on public.project_codes
for each row execute function public.guard_code_soft_delete_dependencies();

create or replace function public.accept_project_invitation_atomic(p_token text)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  invitation public.project_invitations%rowtype;
  member public.project_members%rowtype;
  jwt_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
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
    values (invitation.project_id, auth.uid(), invitation.role)
    returning * into member;
  exception when unique_violation then
    raise exception 'PROJECT_MEMBER_ALREADY_EXISTS' using errcode = 'P0001';
  end;

  update public.project_invitations
  set status = 'accepted', accepted_at = now(), accepted_by = auth.uid()
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

create or replace function public.create_project_code_safe(
  p_project_id uuid,
  p_name_b64 text,
  p_description_b64 text,
  p_definition_b64 text,
  p_inclusion_b64 text,
  p_exclusion_b64 text,
  p_parent_code_id uuid,
  p_color text,
  p_position integer,
  p_metadata jsonb
)
returns setof public.project_codes
language sql
security invoker
set search_path = ''
as $$
  insert into public.project_codes (
    project_id, name, description, definition, inclusion_criteria,
    exclusion_criteria, parent_code_id, color, position, metadata,
    created_by, updated_by
  ) values (
    p_project_id,
    convert_from(decode(p_name_b64, 'base64'), 'utf8'),
    convert_from(decode(p_description_b64, 'base64'), 'utf8'),
    convert_from(decode(p_definition_b64, 'base64'), 'utf8'),
    convert_from(decode(p_inclusion_b64, 'base64'), 'utf8'),
    convert_from(decode(p_exclusion_b64, 'base64'), 'utf8'),
    p_parent_code_id, p_color, p_position, coalesce(p_metadata, '{}'::jsonb),
    auth.uid(), auth.uid()
  )
  returning *;
$$;

create or replace function public.find_project_code_by_name_safe(
  p_project_id uuid,
  p_name_b64 text,
  p_exclude_code_id uuid
)
returns setof public.project_codes
language sql
stable
security invoker
set search_path = ''
as $$
  select c.*
  from public.project_codes c
  where c.project_id = p_project_id
    and c.name = convert_from(decode(p_name_b64, 'base64'), 'utf8')
    and c.deleted_at is null
    and (p_exclude_code_id is null or c.id <> p_exclude_code_id)
  limit 1;
$$;

create or replace function public.search_project_codes_safe(
  p_project_id uuid,
  p_search_b64 text,
  p_include_deleted boolean,
  p_parent_code_id uuid,
  p_limit integer,
  p_offset integer
)
returns setof public.project_codes
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  search_text text := convert_from(decode(p_search_b64, 'base64'), 'utf8');
  escaped_pattern text;
begin
  escaped_pattern := '%' || replace(replace(replace(search_text, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  return query
  select c.*
  from public.project_codes c
  where c.project_id = p_project_id
    and (p_include_deleted or c.deleted_at is null)
    and (p_parent_code_id is null or c.parent_code_id = p_parent_code_id)
    and (
      c.name ilike escaped_pattern escape '\'
      or c.description ilike escaped_pattern escape '\'
      or c.definition ilike escaped_pattern escape '\'
    )
  order by c.position asc, c.name asc
  limit least(greatest(p_limit, 1), 200)
  offset greatest(p_offset, 0);
end;
$$;

revoke all on function public.accept_project_invitation_atomic(text) from public, anon;
revoke all on function public.create_project_code_safe(uuid, text, text, text, text, text, uuid, text, integer, jsonb) from public, anon;
revoke all on function public.find_project_code_by_name_safe(uuid, text, uuid) from public, anon;
revoke all on function public.search_project_codes_safe(uuid, text, boolean, uuid, integer, integer) from public, anon;

grant execute on function public.accept_project_invitation_atomic(text) to authenticated;
grant execute on function public.create_project_code_safe(uuid, text, text, text, text, text, uuid, text, integer, jsonb) to authenticated;
grant execute on function public.find_project_code_by_name_safe(uuid, text, uuid) to authenticated;
grant execute on function public.search_project_codes_safe(uuid, text, boolean, uuid, integer, integer) to authenticated;

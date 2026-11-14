-- Backend regression fixes: integrity, concurrency, and Unicode segment ranges.

create or replace function public.prevent_project_code_cycle()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  cycle_found boolean;
begin
  -- Serialize all parent changes for a project so reciprocal concurrent
  -- updates cannot both pass the same preflight read.
  perform pg_advisory_xact_lock(
    hashtextextended('project_codes:' || new.project_id::text, 0)
  );

  if new.parent_code_id is null then
    return new;
  end if;

  if new.parent_code_id = new.id then
    raise exception 'CODE_PARENT_CYCLE' using errcode = 'P0001';
  end if;

  with recursive ancestors(id) as (
    select new.parent_code_id
    union all
    select code.parent_code_id
    from public.project_codes code
    join ancestors parent on parent.id = code.id
    where code.project_id = new.project_id
      and code.parent_code_id is not null
  )
  select exists(select 1 from ancestors where id = new.id)
  into cycle_found;

  if cycle_found then
    raise exception 'CODE_PARENT_CYCLE' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_project_code_cycle on public.project_codes;
create trigger prevent_project_code_cycle
before insert or update of project_id, parent_code_id
on public.project_codes
for each row execute function public.prevent_project_code_cycle();

create or replace function public.reject_duplicate_workflow_snapshot()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  duplicate_found boolean;
begin
  if new.content_hash is null then
    return new;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(TG_TABLE_NAME || ':' || new.project_id::text, 0)
  );

  execute format(
    'select exists (select 1 from public.%I where project_id = $1 and content_hash = $2)',
    TG_TABLE_NAME
  )
  into duplicate_found
  using new.project_id, new.content_hash;

  if duplicate_found then
    raise exception 'DUPLICATE_SNAPSHOT' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists reject_duplicate_delimitation_snapshot
  on public.project_delimitation_versions;
create trigger reject_duplicate_delimitation_snapshot
before insert on public.project_delimitation_versions
for each row execute function public.reject_duplicate_workflow_snapshot();

drop trigger if exists reject_duplicate_research_design_snapshot
  on public.project_research_design_versions;
create trigger reject_duplicate_research_design_snapshot
before insert on public.project_research_design_versions
for each row execute function public.reject_duplicate_workflow_snapshot();

drop trigger if exists reject_duplicate_sample_config_snapshot
  on public.project_sample_config_versions;
create trigger reject_duplicate_sample_config_snapshot
before insert on public.project_sample_config_versions
for each row execute function public.reject_duplicate_workflow_snapshot();

create or replace function public.utf16_normalized_length(input_text text)
returns integer
language plpgsql
immutable
strict
as $$
declare
  normalized text := regexp_replace(input_text, E'\\r\\n?', E'\\n', 'g');
  character text;
  index_value integer;
  units integer := 0;
begin
  for index_value in 1..char_length(normalized) loop
    character := substr(normalized, index_value, 1);
    units := units + case
      when octet_length(convert_to(character, 'UTF8')) = 4 then 2
      else 1
    end;
  end loop;

  return units;
end;
$$;

create or replace function public.utf16_normalized_slice(
  input_text text,
  start_unit integer,
  end_unit integer
)
returns text
language plpgsql
immutable
strict
as $$
declare
  normalized text := regexp_replace(input_text, E'\\r\\n?', E'\\n', 'g');
  character text;
  index_value integer;
  cursor_unit integer := 0;
  character_units integer;
  output_text text := '';
begin
  if start_unit < 0 or end_unit < start_unit then
    return null;
  end if;

  for index_value in 1..char_length(normalized) loop
    character := substr(normalized, index_value, 1);
    character_units := case
      when octet_length(convert_to(character, 'UTF8')) = 4 then 2
      else 1
    end;

    if cursor_unit >= start_unit and cursor_unit + character_units <= end_unit then
      output_text := output_text || character;
    elsif cursor_unit < end_unit and cursor_unit + character_units > end_unit then
      -- A JavaScript selection must never split a supplementary code point.
      return null;
    end if;

    cursor_unit := cursor_unit + character_units;
  end loop;

  if cursor_unit < end_unit then
    return null;
  end if;

  return output_text;
end;
$$;

create or replace function public.validate_project_document_segment()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  document_content text;
  normalized_selected text;
  normalized_length integer;
  selected_slice text;
begin
  select d.content
  into document_content
  from public.project_documents d
  where d.id = new.document_id
    and d.project_id = new.project_id
    and d.deleted_at is null;

  if document_content is null then
    raise exception 'Document does not exist or is deleted';
  end if;

  normalized_length := public.utf16_normalized_length(document_content);
  if new.start_char < 0 or new.end_char < new.start_char
     or new.end_char > normalized_length then
    raise exception 'Segment range is outside document content';
  end if;

  normalized_selected := regexp_replace(new.selected_text, E'\\r\\n?', E'\\n', 'g');
  selected_slice := public.utf16_normalized_slice(
    document_content,
    new.start_char,
    new.end_char
  );

  if selected_slice is null or selected_slice <> normalized_selected then
    raise exception 'Selected text does not match document content range';
  end if;

  return new;
end;
$$;

create or replace function public.get_project_analysis_overview(input_project_id uuid)
returns jsonb
language sql
stable
set search_path = public
as $$
  with document_counts as (
    select count(*)::bigint as documents_count
    from public.project_documents
    where project_id = input_project_id and deleted_at is null
  ),
  segment_counts as (
    select count(*)::bigint as segments_count,
      count(*) filter (where not exists (
        select 1 from public.project_segment_codes sc
        where sc.project_id = input_project_id
          and sc.segment_id = s.id
          and sc.deleted_at is null
      ))::bigint as uncoded_segments_count
    from public.project_document_segments s
    where s.project_id = input_project_id and s.deleted_at is null
  ),
  code_counts as (
    select count(*)::bigint as codes_count
    from public.project_codes
    where project_id = input_project_id and deleted_at is null
  ),
  segment_code_counts as (
    select count(distinct segment_id)::bigint as coded_segments_count,
      count(distinct segment_id) filter (where is_quote = true)::bigint as quotes_count
    from public.project_segment_codes
    where project_id = input_project_id and deleted_at is null
  ),
  memo_counts as (
    select count(*)::bigint as memos_count
    from public.project_memos
    where project_id = input_project_id and deleted_at is null
  ),
  insight_counts as (
    select count(*)::bigint as insights_count
    from public.project_insights
    where project_id = input_project_id and deleted_at is null
  )
  select jsonb_build_object(
    'project_id', input_project_id,
    'documents_count', coalesce(document_counts.documents_count, 0),
    'segments_count', coalesce(segment_counts.segments_count, 0),
    'codes_count', coalesce(code_counts.codes_count, 0),
    'coded_segments_count', coalesce(segment_code_counts.coded_segments_count, 0),
    'quotes_count', coalesce(segment_code_counts.quotes_count, 0),
    'memos_count', coalesce(memo_counts.memos_count, 0),
    'insights_count', coalesce(insight_counts.insights_count, 0),
    'uncoded_segments_count', coalesce(segment_counts.uncoded_segments_count, 0)
  )
  from document_counts, segment_counts, code_counts,
    segment_code_counts, memo_counts, insight_counts;
$$;

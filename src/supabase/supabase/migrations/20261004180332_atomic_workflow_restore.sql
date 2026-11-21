-- All new functions are invoker-rights. Existing RLS and audit/deduplication triggers remain active.
-- The lock namespace also covers missing parents and ordinary child/version writes.
CREATE FUNCTION public.workflow_spec(workflow text) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog, public AS $$
BEGIN
  CASE workflow
  WHEN 'delimitation' THEN RETURN '{"parent":"project_delimitation","child":"project_delimitation_items","versions":"project_delimitation_versions","items":"project_delimitation_version_items","fields":["topic","context_place","population","time_period","resources"],"child_fields":["kind","text","position"],"defaults":{"topic":"","context_place":"","population":"","time_period":"","resources":""}}'::jsonb;
  WHEN 'research-design' THEN RETURN '{"parent":"project_research_design","child":"project_specific_objectives","versions":"project_research_design_versions","items":"project_research_design_version_items","fields":["research_question","general_objective"],"child_fields":["text","position","workflow_order"],"defaults":{"research_question":"","general_objective":""}}'::jsonb;
  WHEN 'sample-config' THEN RETURN '{"parent":"project_sample_config","child":"project_sample_collection_techniques","versions":"project_sample_config_versions","items":"project_sample_config_version_techniques","fields":["main_approach_code","scope_code","field_phase","target_sample_size","sample_size_rationale"],"child_fields":["technique_code","custom_label","is_custom","position","workflow_order"],"defaults":{"main_approach_code":null,"scope_code":null,"field_phase":"","target_sample_size":null,"sample_size_rationale":""}}'::jsonb;
  ELSE RAISE EXCEPTION 'INVALID_WORKFLOW' USING ERRCODE = '22023';
  END CASE;
END $$;

CREATE FUNCTION public.workflow_lock_key(workflow text, project uuid) RETURNS bigint
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$
  SELECT hashtextextended('workflow:' || workflow || ':' || project::text, 0)
$$;

ALTER TABLE public.project_delimitation_items ADD COLUMN position bigint;
-- Legacy rows stay NULL and retain created_at/id order (NULLS FIRST); no audit timestamp backfill.
-- New items append with a position; a restore replaces all items with explicit version positions.
ALTER TABLE public.project_delimitation_items ADD CONSTRAINT delimitation_item_position_nonnegative CHECK (position >= 0);

-- Complete the existing position/created_at/id ordering without changing numeric positions.
-- Legacy NULLs retain their original timestamp/ID ordering, with no UPDATE/audit backfill.
ALTER TABLE public.project_specific_objectives ADD COLUMN workflow_order bigint CHECK (workflow_order >= 0);
ALTER TABLE public.project_research_design_version_items ADD COLUMN workflow_order bigint CHECK (workflow_order >= 0);
ALTER TABLE public.project_sample_collection_techniques ADD COLUMN workflow_order bigint CHECK (workflow_order >= 0);
ALTER TABLE public.project_sample_config_version_techniques ADD COLUMN workflow_order bigint CHECK (workflow_order >= 0);

CREATE FUNCTION public.coordinate_workflow_write() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE project uuid; row_data jsonb; spec jsonb;
BEGIN
  spec := public.workflow_spec(TG_ARGV[0]);
  -- Never wait while an ordinary UPDATE/DELETE already holds a tuple lock.
  -- A busy writer is rejected atomically; callers map this marker to a safe 409, without retry.
  FOR row_data IN SELECT value FROM jsonb_array_elements(
    CASE TG_OP WHEN 'INSERT' THEN jsonb_build_array(to_jsonb(NEW))
      WHEN 'DELETE' THEN jsonb_build_array(to_jsonb(OLD))
      ELSE jsonb_build_array(to_jsonb(OLD), to_jsonb(NEW)) END)
  LOOP
    IF TG_ARGV[1] = 'version_id' THEN
      EXECUTE format('SELECT project_id FROM public.%I WHERE id=$1', spec->>'versions')
        INTO project USING (row_data->>'version_id')::uuid;
    ELSE project := (row_data->>'project_id')::uuid;
    END IF;
    IF project IS NOT NULL AND NOT pg_try_advisory_xact_lock(public.workflow_lock_key(TG_ARGV[0], project)) THEN
      RAISE EXCEPTION 'WORKFLOW_WRITE_CONFLICT' USING ERRCODE = 'P0001';
    END IF;
  END LOOP;
  IF TG_TABLE_NAME = 'project_delimitation_items' AND TG_OP = 'INSERT' THEN
    IF NEW.position IS NULL THEN
      SELECT coalesce(max(position), -1) + 1 INTO NEW.position FROM public.project_delimitation_items WHERE project_id = NEW.project_id;
    END IF;
  END IF;
  IF TG_OP='INSERT' AND TG_TABLE_NAME IN ('project_specific_objectives','project_research_design_version_items','project_sample_collection_techniques','project_sample_config_version_techniques') THEN
    IF NEW.workflow_order IS NULL THEN
      -- This allocator runs under the project lock already acquired above. Ordinary
      -- inserts append after legacy/copied rows even when numeric positions tie.
      EXECUTE format('SELECT coalesce(max(workflow_order),-1)+1 FROM public.%I WHERE %I=$1',TG_TABLE_NAME,TG_ARGV[1]) INTO NEW.workflow_order USING (to_jsonb(NEW)->>TG_ARGV[1])::uuid;
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;

DO $$ DECLARE workflow text; spec jsonb; tab text; BEGIN
  FOREACH workflow IN ARRAY ARRAY['delimitation','research-design','sample-config'] LOOP
    spec := public.workflow_spec(workflow);
    FOREACH tab IN ARRAY ARRAY[spec->>'parent',spec->>'child',spec->>'versions',spec->>'items'] LOOP
      EXECUTE format('CREATE TRIGGER aaa_coordinate_workflow BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.coordinate_workflow_write(%L,%L)', tab, workflow, CASE WHEN tab=spec->>'items' THEN 'version_id' ELSE 'project_id' END);
    END LOOP;
  END LOOP;
END $$;

-- Exact ECMAScript trim whitespace set (not PostgreSQL/locale-dependent whitespace).
CREATE FUNCTION public.workflow_trim(value text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$
 SELECT btrim(coalesce(value,''), chr(9)||chr(10)||chr(11)||chr(12)||chr(13)||chr(32)||chr(160)||chr(5760)||chr(8192)||chr(8193)||chr(8194)||chr(8195)||chr(8196)||chr(8197)||chr(8198)||chr(8199)||chr(8200)||chr(8201)||chr(8202)||chr(8232)||chr(8233)||chr(8239)||chr(8287)||chr(12288)||chr(65279))
$$;

-- Structural identity supplements, but never rewrites, historical JavaScript digests.
-- Delimitation compares normalized multisets: no claim that SQL collation equals Node ICU.
CREATE FUNCTION public.workflow_identity(workflow text, snapshot jsonb, children jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog, public AS $$
DECLARE spec jsonb := public.workflow_spec(workflow); result jsonb := '{}'::jsonb; field text; items jsonb;
BEGIN
  FOR field IN SELECT jsonb_array_elements_text(spec->'fields') LOOP
    IF field IN ('main_approach_code','scope_code','target_sample_size') THEN
      result := result || jsonb_build_object(field, snapshot->field);
    ELSE
      result := result || jsonb_build_object(field, public.workflow_trim(CASE WHEN workflow='delimitation' THEN replace(snapshot->>field,E'\r\n',E'\n') ELSE snapshot->>field END));
    END IF;
  END LOOP;
  IF workflow='delimitation' THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object('kind',kind,'text',text) ORDER BY kind COLLATE "C",text COLLATE "C"),'[]') INTO items
    FROM (SELECT item->>'kind' kind, public.workflow_trim(replace(item->>'text',E'\r\n',E'\n')) text FROM jsonb_array_elements(children) item) normalized WHERE text<>'';
  ELSIF workflow='research-design' THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object('text',public.workflow_trim(item->>'text'),'position',item->'position') ORDER BY (item->>'position')::int,ord),'[]') INTO items
    FROM jsonb_array_elements(children) WITH ORDINALITY AS t(item,ord);
  ELSE
    SELECT coalesce(jsonb_agg(jsonb_build_object('technique_code',item->'technique_code','custom_label',nullif(public.workflow_trim(item->>'custom_label'),''),'is_custom',item->'is_custom','position',item->'position') ORDER BY (item->>'position')::int,ord),'[]') INTO items
    FROM jsonb_array_elements(children) WITH ORDINALITY AS t(item,ord);
  END IF;
  RETURN result || jsonb_build_object('children',items);
END $$;

CREATE FUNCTION public.workflow_version_data(workflow text, project uuid, version uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = pg_catalog, public AS $$
DECLARE spec jsonb := public.workflow_spec(workflow); parent jsonb; children jsonb; snapshot jsonb := '{}'::jsonb; field text;
BEGIN
  EXECUTE format('SELECT to_jsonb(v) FROM public.%I v WHERE project_id=$1 AND id=$2',spec->>'versions') INTO parent USING project,version;
  IF parent IS NULL THEN RETURN NULL; END IF;
  EXECUTE format('SELECT coalesce(jsonb_agg(to_jsonb(i)-''workflow_order'' ORDER BY position,(to_jsonb(i)->>''workflow_order'')::bigint NULLS FIRST,created_at,id),''[]'') FROM public.%I i WHERE version_id=$1',spec->>'items') INTO children USING version;
  FOR field IN SELECT jsonb_array_elements_text(spec->'fields') LOOP snapshot := snapshot || jsonb_build_object(field,coalesce(nullif(parent->('snapshot_'||field),'null'::jsonb),spec->'defaults'->field)); END LOOP;
  RETURN jsonb_build_object('version',parent,'snapshot',snapshot,'children',children);
END $$;

CREATE FUNCTION public.save_workflow_snapshot(
 p_workflow text, p_project_id uuid, p_actor_id uuid, p_snapshot jsonb, p_children jsonb,
 p_label text DEFAULT NULL, p_trigger_type text DEFAULT 'manual', p_content_hash text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE spec jsonb := public.workflow_spec(p_workflow); candidate record; detail jsonb; identity jsonb;
 version jsonb; version_id uuid; next_number int; columns text; values_sql text; child_columns text; payload jsonb;
BEGIN
  IF auth.uid() IS NULL OR p_actor_id IS DISTINCT FROM auth.uid() OR NOT public.has_project_role(p_project_id,ARRAY['owner','editor']) THEN RAISE EXCEPTION 'WORKFLOW_FORBIDDEN' USING ERRCODE='P0001'; END IF;
  PERFORM pg_advisory_xact_lock(public.workflow_lock_key(p_workflow,p_project_id));
  -- Persist array ordinality separately; numeric positions and digest identity are unchanged.
  IF p_workflow<>'delimitation' THEN
    SELECT coalesce(jsonb_agg(item || jsonb_build_object('workflow_order',ord-1) ORDER BY ord),'[]') INTO p_children FROM jsonb_array_elements(p_children) WITH ORDINALITY AS t(item,ord);
  END IF;
  identity := public.workflow_identity(p_workflow,p_snapshot,p_children);
  FOR candidate IN EXECUTE format('SELECT id FROM public.%I WHERE project_id=$1 ORDER BY version_number DESC',spec->>'versions') USING p_project_id LOOP
    detail := public.workflow_version_data(p_workflow,p_project_id,candidate.id);
    IF public.workflow_identity(p_workflow,detail->'snapshot',detail->'children') = identity THEN
      RETURN detail || jsonb_build_object('created',false);
    END IF;
  END LOOP;
  EXECUTE format('SELECT coalesce(max(version_number),0)+1 FROM public.%I WHERE project_id=$1',spec->>'versions') INTO next_number USING p_project_id;
  SELECT string_agg(quote_ident('snapshot_'||field),','),string_agg('r.'||quote_ident('snapshot_'||field),',') INTO columns,values_sql FROM jsonb_array_elements_text(spec->'fields') field;
  SELECT jsonb_object_agg('snapshot_'||key,value) INTO payload FROM jsonb_each(p_snapshot);
  payload := payload || jsonb_build_object('project_id',p_project_id,'version_number',next_number,'created_by',p_actor_id,'label',p_label,'trigger_type',p_trigger_type,'content_hash',CASE WHEN p_trigger_type='restore_backup' THEN NULL ELSE p_content_hash END);
  EXECUTE format('INSERT INTO public.%1$I(project_id,version_number,created_by,label,trigger_type,content_hash,%2$s) SELECT r.project_id,r.version_number,r.created_by,r.label,r.trigger_type,r.content_hash,%3$s FROM jsonb_populate_record(NULL::public.%1$I,$1) r RETURNING to_jsonb(%1$I)',spec->>'versions',columns,values_sql) INTO version USING payload;
  version_id := (version->>'id')::uuid;
  SELECT string_agg(quote_ident(field),',') INTO child_columns FROM jsonb_array_elements_text(spec->'child_fields') field;
  EXECUTE format('INSERT INTO public.%1$I(version_id,%2$s) SELECT $1,%2$s FROM jsonb_populate_recordset(NULL::public.%1$I,$2)',spec->>'items',child_columns) USING version_id,p_children;
  RETURN public.workflow_version_data(p_workflow,p_project_id,version_id) || jsonb_build_object('created',true);
END $$;

CREATE FUNCTION public.restore_workflow_version(
 p_workflow text, p_project_id uuid, p_version_id uuid, p_actor_id uuid,
 p_expected_revision bigint, p_create_backup boolean DEFAULT true
) RETURNS jsonb LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE spec jsonb := public.workflow_spec(p_workflow); target jsonb; parent jsonb; children jsonb; backup jsonb;
 snapshot jsonb; payload jsonb; field text; columns text; assignments text; child_columns text; expected bigint;
BEGIN
  IF auth.uid() IS NULL OR p_actor_id IS DISTINCT FROM auth.uid() OR NOT public.has_project_role(p_project_id,ARRAY['owner','editor']) THEN RAISE EXCEPTION 'WORKFLOW_FORBIDDEN' USING ERRCODE='P0001'; END IF;
  PERFORM pg_advisory_xact_lock(public.workflow_lock_key(p_workflow,p_project_id));
  target := public.workflow_version_data(p_workflow,p_project_id,p_version_id);
  IF target IS NULL THEN RAISE EXCEPTION 'WORKFLOW_VERSION_NOT_FOUND' USING ERRCODE='P0001'; END IF;
  EXECUTE format('SELECT to_jsonb(p) FROM public.%I p WHERE project_id=$1 FOR UPDATE',spec->>'parent') INTO parent USING p_project_id;
  expected := coalesce((parent->>'revision')::bigint,0);
  IF p_expected_revision IS NULL OR p_expected_revision<0 OR p_expected_revision<>expected THEN RAISE EXCEPTION 'WORKFLOW_REVISION_CONFLICT' USING ERRCODE='P0001', DETAIL=coalesce(parent::text,'null'); END IF;
  EXECUTE format('SELECT coalesce(jsonb_agg(to_jsonb(c)-''workflow_order'' ORDER BY position NULLS FIRST,(to_jsonb(c)->>''workflow_order'')::bigint NULLS FIRST,created_at,id),''[]'') FROM public.%I c WHERE project_id=$1',spec->>'child') INTO children USING p_project_id;
  IF p_workflow='delimitation' THEN
    -- Version positions describe the exact current read order, including legacy NULL-position rows.
    SELECT coalesce(jsonb_agg(item || jsonb_build_object('position',ord-1) ORDER BY ord),'[]') INTO children FROM jsonb_array_elements(children) WITH ORDINALITY AS t(item,ord);
  END IF;
  snapshot := spec->'defaults';
  FOR field IN SELECT jsonb_array_elements_text(spec->'fields') LOOP snapshot := snapshot || jsonb_build_object(field,coalesce(nullif(parent->field,'null'::jsonb),spec->'defaults'->field)); END LOOP;
  IF p_create_backup AND (p_workflow='delimitation' OR children<>'[]'::jsonb OR public.workflow_identity(p_workflow,snapshot,'[]')<>public.workflow_identity(p_workflow,spec->'defaults','[]')) THEN
    backup := public.save_workflow_snapshot(p_workflow,p_project_id,p_actor_id,snapshot,children,
      CASE WHEN p_workflow='delimitation' THEN 'Auto backup before restoring v' ELSE 'Backup before restoring v' END || (target->'version'->>'version_number'),'restore_backup',NULL);
  END IF;
  SELECT string_agg(quote_ident(f),','),string_agg(format('%I=excluded.%I',f,f),',') INTO columns,assignments FROM jsonb_array_elements_text(spec->'fields') f;
  payload := target->'snapshot' || jsonb_build_object('project_id',p_project_id,'revision',expected+1,'created_by',p_actor_id,'updated_by',p_actor_id);
  -- Sample's existing BEFORE UPDATE audit trigger assigns OLD.revision+1, not NEW.revision+1.
  EXECUTE format('INSERT INTO public.%1$I(project_id,%2$s,revision,created_by,updated_by) SELECT project_id,%2$s,revision,created_by,updated_by FROM jsonb_populate_record(NULL::public.%1$I,$1) ON CONFLICT(project_id) DO UPDATE SET %3$s,revision=excluded.revision,updated_by=excluded.updated_by RETURNING to_jsonb(%1$I)',spec->>'parent',columns,assignments) INTO parent USING payload;
  EXECUTE format('DELETE FROM public.%I WHERE project_id=$1',spec->>'child') USING p_project_id;
  SELECT string_agg(quote_ident(f),',') INTO child_columns FROM jsonb_array_elements_text(spec->'child_fields') f;
  payload := target->'children';
  IF p_workflow<>'delimitation' THEN
    SELECT coalesce(jsonb_agg(item || jsonb_build_object('workflow_order',ord-1) ORDER BY ord),'[]') INTO payload FROM jsonb_array_elements(payload) WITH ORDINALITY AS t(item,ord);
  END IF;
  EXECUTE format('INSERT INTO public.%1$I(project_id,%2$s,created_by,updated_by) SELECT $1,%2$s,$2,$2 FROM jsonb_populate_recordset(NULL::public.%1$I,$3)',spec->>'child',child_columns) USING p_project_id,p_actor_id,payload;
  EXECUTE format('SELECT coalesce(jsonb_agg(to_jsonb(c)-''workflow_order'' ORDER BY position NULLS FIRST,(to_jsonb(c)->>''workflow_order'')::bigint NULLS FIRST,created_at,id),''[]'') FROM public.%I c WHERE project_id=$1',spec->>'child') INTO children USING p_project_id;
  RETURN jsonb_build_object('target',target,'backup',backup,'parent',parent,'children',children,'backup_created',coalesce((backup->>'created')::boolean,false));
END $$;

REVOKE ALL ON FUNCTION public.workflow_spec(text),public.workflow_lock_key(text,uuid),public.coordinate_workflow_write(),public.workflow_trim(text),public.workflow_identity(text,jsonb,jsonb),public.workflow_version_data(text,uuid,uuid),public.save_workflow_snapshot(text,uuid,uuid,jsonb,jsonb,text,text,text),public.restore_workflow_version(text,uuid,uuid,uuid,bigint,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.workflow_spec(text),public.workflow_lock_key(text,uuid),public.coordinate_workflow_write(),public.workflow_trim(text),public.workflow_identity(text,jsonb,jsonb),public.workflow_version_data(text,uuid,uuid),public.save_workflow_snapshot(text,uuid,uuid,jsonb,jsonb,text,text,text),public.restore_workflow_version(text,uuid,uuid,uuid,bigint,boolean) TO authenticated;

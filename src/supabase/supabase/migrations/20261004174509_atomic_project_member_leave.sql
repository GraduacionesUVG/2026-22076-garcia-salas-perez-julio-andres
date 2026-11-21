-- Preserve the existing owner-only delete policy; add only non-owner self-leave.
CREATE POLICY pm_delete_nonowner_self
ON public.project_members FOR DELETE TO authenticated
USING (user_id = (SELECT auth.uid()) AND role <> 'owner'::public.project_role);

-- Activity must be inserted while membership still grants INSERT access. An
-- unsuccessful DELETE raises so the earlier activity is rolled back as well.
CREATE OR REPLACE FUNCTION public.remove_project_member_atomic(
  p_project_id uuid,
  p_user_id uuid,
  p_actor_user_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, auth
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_actor_role public.project_role;
  v_target_role public.project_role;
  v_deleted integer;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;
  IF p_actor_user_id IS DISTINCT FROM v_actor THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  SELECT role INTO v_actor_role FROM public.project_members
  WHERE project_id = p_project_id AND user_id = v_actor;
  IF v_actor_role IS NULL OR (v_actor <> p_user_id AND v_actor_role <> 'owner') THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  IF v_actor = p_user_id AND v_actor_role = 'owner' THEN
    RAISE EXCEPTION 'CANNOT_REMOVE_SELF';
  END IF;

  SELECT role INTO v_target_role FROM public.project_members
  WHERE project_id = p_project_id AND user_id = p_user_id;
  IF v_target_role IS NULL THEN
    RAISE EXCEPTION 'PROJECT_MEMBER_NOT_FOUND';
  END IF;
  IF v_target_role = 'owner' THEN
    RAISE EXCEPTION 'PROJECT_MEMBER_OWNER_PROTECTED';
  END IF;

  INSERT INTO public.project_activity_events(project_id, event_type, event_payload, created_by)
  VALUES (p_project_id, 'member_removed', jsonb_build_object('user_id', p_user_id), v_actor);

  DELETE FROM public.project_members
  WHERE project_id = p_project_id AND user_id = p_user_id AND role <> 'owner';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  IF v_deleted <> 1 THEN
    -- A concurrent removal/promotion or RLS denial must not leave a false event.
    RAISE EXCEPTION 'PROJECT_MEMBER_NOT_FOUND';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.remove_project_member_atomic(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remove_project_member_atomic(uuid, uuid, uuid) TO authenticated;

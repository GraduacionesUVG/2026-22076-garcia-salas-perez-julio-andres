-- Existing rows acquire revision 0 without an UPDATE or audit timestamp rewrite.
-- Keep JSON/JavaScript numbers exact; exhaustion fails rather than wrapping.
BEGIN;

ALTER TABLE public.project_participants
  ADD COLUMN revision bigint NOT NULL DEFAULT 0,
  ADD CONSTRAINT project_participants_revision_safe_integer
    CHECK (revision BETWEEN 0 AND 9007199254740991);

CREATE FUNCTION public.set_project_participant_revision()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.revision := 0;
  ELSE
    -- Derive only from persisted OLD; caller-supplied NEW.revision is ignored.
    -- Includes direct allowed UPDATEs and soft deletes. The existing audit
    -- trigger updates audit fields only, so neither trigger increments twice.
    NEW.revision := OLD.revision + 1;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.set_project_participant_revision() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_project_participants_revision
BEFORE INSERT OR UPDATE ON public.project_participants
FOR EACH ROW EXECUTE FUNCTION public.set_project_participant_revision();

COMMIT;

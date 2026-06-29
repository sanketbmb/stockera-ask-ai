-- I-LITE-FIX-1: project queries to library on INSERT as well as UPDATE.
-- Prior trigger only fired on UPDATE when is_public_library flipped false->true,
-- so new rows (which already default to true) were never projected.
DROP TRIGGER IF EXISTS trg_project_query_to_library ON public.queries;

CREATE TRIGGER trg_project_query_to_library
  AFTER INSERT OR UPDATE OF is_public_library, query_text ON public.queries
  FOR EACH ROW
  WHEN (new.is_public_library = true)
  EXECUTE FUNCTION public.fn_project_query_to_library();
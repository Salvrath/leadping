-- Lock the trigger function search path to prevent role-dependent resolution.
alter function public.set_textback_updated_at()
set search_path = pg_catalog, public;

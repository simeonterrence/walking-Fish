-- Fix: Exposed Auth Users via admin_list view
-- The admin_list view in public schema exposes auth.users data to anon/authenticated roles
-- Solution: Replace view with SECURITY DEFINER function accessible only via service_role

-- 1. Create a SECURITY DEFINER function to get admin users
CREATE OR REPLACE FUNCTION public.get_admin_list()
RETURNS TABLE (
    id uuid,
    email text,
    created_at timestamptz,
    role text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        au.id,
        au.email,
        au.created_at,
        COALESCE(au.raw_app_meta_data->>'role', 'unknown') as role
    FROM auth.users au
    WHERE au.raw_app_meta_data->>'role' IN ('admin_role', 'super_admin_role')
    ORDER BY au.created_at DESC;
$$;

-- 2. Revoke execute from PUBLIC/anon/authenticated — only service_role can call it
REVOKE EXECUTE ON FUNCTION public.get_admin_list() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_list() TO service_role;

-- 3. Revoke all on the old view and drop it
REVOKE ALL ON public.admin_list FROM anon, authenticated;
DROP VIEW IF EXISTS public.admin_list;
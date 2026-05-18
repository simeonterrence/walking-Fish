-- =============================================================================
-- Migration: 20260518000004_security_hardening.sql
-- Description: Security hardening for Walking Fish production database.
--   1. Drop redundant UPDATE RLS policy on invite_tokens (bypasses mark_token_used RPC)
--   2. Harden mark_token_used SECURITY DEFINER function with authorization + search_path
--   3. Fix search_path on security-invoker helper functions (can_mark_token, debug_jwt)
--   4. Harden permissive INSERT RLS policies (WITH CHECK (true)) with email validation
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Drop the redundant UPDATE policy on public.invite_tokens.
--    Any authenticated user could bypass mark_token_used() via direct UPDATE.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "authenticated_can_mark_token_used" ON public.invite_tokens;


-- -----------------------------------------------------------------------------
-- 2. Recreate public.mark_token_used with:
--    a) Explicit SET search_path to prevent search-path injection.
--    b) Authorization check: caller must match token email OR be an admin.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_token_used(token_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  jwt_email text;
  jwt_role  text;
  token_email text;
BEGIN
  -- Extract caller identity from JWT
  jwt_email := auth.jwt() ->> 'email';
  jwt_role  := auth.jwt() -> 'app_metadata' ->> 'role';

  -- Look up the email the invite token was issued to
  SELECT email INTO token_email
  FROM public.invite_tokens
  WHERE id = token_id;

  -- Authorize: only the matching vendor or an admin may proceed
  IF (jwt_email IS NOT NULL AND jwt_email = token_email)
     OR (jwt_role = 'admin_role') THEN

    UPDATE public.invite_tokens
    SET used = true
    WHERE id = token_id
      AND used = false
      AND expires_at > now();

    RETURN FOUND;
  ELSE
    RAISE EXCEPTION 'Not authorized to mark this token as used.';
  END IF;
END;
$$;


-- -----------------------------------------------------------------------------
-- 3. Set an explicit, safe search_path on security-invoker helper functions
--    to prevent search-path injection attacks.
-- -----------------------------------------------------------------------------
ALTER FUNCTION public.can_mark_token(uuid)  SET search_path = public, auth;
ALTER FUNCTION public.debug_jwt()           SET search_path = public, auth;


-- -----------------------------------------------------------------------------
-- 4. Harden permissive INSERT RLS policies (resolves rls_policy_always_true).
--    Replace WITH CHECK (true) with a basic email format validation check.
-- -----------------------------------------------------------------------------

-- early_access
DROP POLICY IF EXISTS "anon_can_insert_early_access" ON public.early_access;
CREATE POLICY "anon_can_insert_early_access"
  ON public.early_access
  FOR INSERT
  TO anon
  WITH CHECK (
    email IS NOT NULL
    AND email ~* '^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$'
  );

-- contact_messages
DROP POLICY IF EXISTS "anon_can_insert_contact_messages" ON public.contact_messages;
CREATE POLICY "anon_can_insert_contact_messages"
  ON public.contact_messages
  FOR INSERT
  TO anon
  WITH CHECK (
    email IS NOT NULL
    AND email ~* '^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$'
  );

-- vendor_applications
DROP POLICY IF EXISTS "anon_can_insert_applications" ON public.vendor_applications;
CREATE POLICY "anon_can_insert_applications"
  ON public.vendor_applications
  FOR INSERT
  TO anon
  WITH CHECK (
    email IS NOT NULL
    AND email ~* '^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$'
  );

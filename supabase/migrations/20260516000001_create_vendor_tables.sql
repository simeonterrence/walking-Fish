-- Migration: Create vendor management tables
-- Tables: vendor_applications, vendor_profiles, invite_tokens
-- RLS policies enforce access: anon (insert applications, validate tokens),
-- authenticated vendor (own profile, mark token used),
-- authenticated admin (full CRUD).

-- ============================================
-- 1. vendor_applications
-- ============================================
CREATE TABLE public.vendor_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name text NOT NULL,
  contact_name text NOT NULL,
  email text NOT NULL,
  phone text,
  category text NOT NULL,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.vendor_applications ENABLE ROW LEVEL SECURITY;

-- Public visitors can submit applications
CREATE POLICY "anon_can_insert_applications"
  ON public.vendor_applications
  FOR INSERT
  TO anon
  WITH CHECK (true);

-- Admins can view all applications
CREATE POLICY "admin_can_select_applications"
  ON public.vendor_applications
  FOR SELECT
  TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin_role');

-- Admins can update application status (approve/reject)
CREATE POLICY "admin_can_update_applications"
  ON public.vendor_applications
  FOR UPDATE
  TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin_role')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin_role');

-- ============================================
-- 2. vendor_profiles
-- ============================================
CREATE TABLE public.vendor_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  business_name text NOT NULL,
  contact_name text NOT NULL,
  email text NOT NULL,
  phone text,
  category text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  application_id uuid REFERENCES public.vendor_applications(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.vendor_profiles ENABLE ROW LEVEL SECURITY;

-- Vendors can view their own profile
CREATE POLICY "vendor_select_own_profile"
  ON public.vendor_profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = auth_user_id);

-- Vendors can create their own profile during setup
CREATE POLICY "vendor_insert_own_profile"
  ON public.vendor_profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = auth_user_id);

-- Vendors can update their own profile
CREATE POLICY "vendor_update_own_profile"
  ON public.vendor_profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = auth_user_id)
  WITH CHECK (auth.uid() = auth_user_id);

-- Admins can view all vendor profiles
CREATE POLICY "admin_select_all_profiles"
  ON public.vendor_profiles
  FOR SELECT
  TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin_role');

-- Admins can update any profile (suspend, edit)
CREATE POLICY "admin_update_all_profiles"
  ON public.vendor_profiles
  FOR UPDATE
  TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin_role')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin_role');

-- ============================================
-- 3. invite_tokens
-- ============================================
CREATE TABLE public.invite_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.vendor_applications(id) ON DELETE CASCADE,
  email text NOT NULL,
  token text NOT NULL UNIQUE,
  business_name text,
  contact_name text,
  category text,
  temp_password text,
  used boolean NOT NULL DEFAULT false,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.invite_tokens ENABLE ROW LEVEL SECURITY;

-- Anyone can validate a token (unused + unexpired only)
CREATE POLICY "anyone_can_validate_tokens"
  ON public.invite_tokens
  FOR SELECT
  TO anon, authenticated
  USING (used = false AND expires_at > now());

-- Admins can manage all tokens (create, view, update)
CREATE POLICY "admin_can_manage_tokens"
  ON public.invite_tokens
  FOR ALL
  TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin_role')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin_role');

-- Authenticated users can mark unused, unexpired tokens as used.
-- mark_token_used() SECURITY DEFINER function is the primary mechanism.
CREATE POLICY "authenticated_can_mark_token_used"
  ON public.invite_tokens
  FOR UPDATE
  TO authenticated
  USING (used = false AND expires_at > now())
  WITH CHECK (used = true);

-- ============================================
-- Indexes
-- ============================================
CREATE INDEX idx_applications_status ON public.vendor_applications(status);
CREATE INDEX idx_applications_email ON public.vendor_applications(email);
CREATE INDEX idx_profiles_auth_user ON public.vendor_profiles(auth_user_id);
CREATE INDEX idx_profiles_email ON public.vendor_profiles(email);
CREATE INDEX idx_tokens_token ON public.invite_tokens(token);
CREATE INDEX idx_tokens_email ON public.invite_tokens(email);
CREATE INDEX idx_tokens_expires ON public.invite_tokens(expires_at);
CREATE INDEX idx_tokens_used ON public.invite_tokens(used);

-- ============================================
-- Auto-update updated_at trigger
-- ============================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_vendor_applications_updated_at
  BEFORE UPDATE ON public.vendor_applications
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER set_vendor_profiles_updated_at
  BEFORE UPDATE ON public.vendor_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- mark_token_used — SECURITY DEFINER RPC
-- Called by vendors during setup to mark their
-- invite token as used. Bypasses RLS.
-- ============================================
CREATE OR REPLACE FUNCTION public.mark_token_used(token_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.invite_tokens
  SET used = true
  WHERE id = token_id
    AND used = false
    AND expires_at > now();

  RETURN FOUND;
END;
$$;

-- Only authenticated users can call this RPC (not anon)
REVOKE EXECUTE ON FUNCTION public.mark_token_used FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_token_used TO authenticated;

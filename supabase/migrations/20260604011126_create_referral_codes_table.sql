-- Migration: Create referral codes table
-- Allows admin/superadmin to issue referral codes that customers can use at checkout.
-- Tracks usage for analytics.

-- ============================================
-- 1. referral_codes
-- ============================================
CREATE TABLE public.referral_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  description text NOT NULL DEFAULT '',
  created_by_email text,
  is_active boolean NOT NULL DEFAULT true,
  max_uses integer CHECK (max_uses IS NULL OR max_uses >= 0),
  current_uses integer NOT NULL DEFAULT 0 CHECK (current_uses >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz
);

ALTER TABLE public.referral_codes ENABLE ROW LEVEL SECURITY;

-- Anonymous users can read active referral codes (to validate at checkout)
CREATE POLICY "anon_can_read_active_referral_codes"
  ON public.referral_codes
  FOR SELECT
  TO anon
  USING (is_active = true AND (expires_at IS NULL OR expires_at > now()));

-- Authenticated users can read active codes
CREATE POLICY "authenticated_can_read_active_referral_codes"
  ON public.referral_codes
  FOR SELECT
  TO authenticated
  USING (is_active = true AND (expires_at IS NULL OR expires_at > now()));

-- Admins and superadmins can manage all referral codes
CREATE POLICY "admin_can_all_referral_codes"
  ON public.referral_codes
  FOR ALL
  TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin_role', 'super_admin_role'))
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin_role', 'super_admin_role'));

-- Service role can manage all codes (used by Edge Function)
CREATE POLICY "service_role_can_all_referral_codes"
  ON public.referral_codes
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================
-- Indexes
-- ============================================
CREATE INDEX idx_referral_codes_code ON public.referral_codes(code);
CREATE INDEX idx_referral_codes_active ON public.referral_codes(is_active);
CREATE INDEX idx_referral_codes_expires ON public.referral_codes(expires_at);

-- Order metadata already has a referral_code stored in metadata->>referral_code
-- Create index for better query performance on referral code analytics
-- B-tree index on text extraction (->>) is needed for IS NOT NULL / equality queries
CREATE INDEX idx_orders_referral_code ON public.orders ((metadata->>'referral_code'));

-- ============================================
-- Trigger for updated_at
-- ============================================
CREATE TRIGGER set_referral_codes_updated_at
  BEFORE UPDATE ON public.referral_codes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- RPC: increment_referral_code_usage
-- Atomically increments the current_uses counter for a referral code.
-- Returns the updated row if successful, null if code is invalid/expired/at max.
-- ============================================
CREATE OR REPLACE FUNCTION public.increment_referral_code_usage(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_record public.referral_codes;
BEGIN
  -- Lock the row to prevent race conditions
  SELECT * INTO v_record
  FROM public.referral_codes
  WHERE code = p_code
  FOR UPDATE;

  -- Check code exists, is active, and hasn't expired
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Referral code not found');
  END IF;

  IF NOT v_record.is_active THEN
    RETURN jsonb_build_object('success', false, 'error', 'Referral code is inactive');
  END IF;

  IF v_record.expires_at IS NOT NULL AND v_record.expires_at < now() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Referral code has expired');
  END IF;

  -- Check max uses
  IF v_record.max_uses IS NOT NULL AND v_record.current_uses >= v_record.max_uses THEN
    RETURN jsonb_build_object('success', false, 'error', 'Referral code has reached maximum uses');
  END IF;

  -- Increment usage
  UPDATE public.referral_codes
  SET current_uses = current_uses + 1
  WHERE id = v_record.id;

  RETURN jsonb_build_object(
    'success', true,
    'code', v_record.code,
    'current_uses', v_record.current_uses + 1,
    'max_uses', v_record.max_uses
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.increment_referral_code_usage FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_referral_code_usage TO service_role;

-- ============================================
-- RPC: issue_referral_code
-- Creates a new referral code. Generates a random code if not provided.
-- ============================================
CREATE OR REPLACE FUNCTION public.issue_referral_code(
  p_code text DEFAULT NULL,
  p_description text DEFAULT '',
  p_max_uses integer DEFAULT NULL,
  p_expires_at timestamptz DEFAULT NULL,
  p_discount_type text DEFAULT NULL,
  p_discount_value numeric DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code text;
  v_role text;
  v_record public.referral_codes;
BEGIN
  -- Check authorization
  v_role := auth.jwt() -> 'app_metadata' ->> 'role';
  IF v_role IS NULL OR v_role NOT IN ('admin_role', 'super_admin_role') THEN
    RAISE EXCEPTION 'Permission denied: admin or super-admin role required.';
  END IF;

  -- Generate code if not provided
  IF p_code IS NULL OR p_code = '' THEN
    v_code := upper(encode(gen_random_bytes(4), 'hex'));
  ELSE
    v_code := p_code;
  END IF;

  -- Insert the code
  INSERT INTO public.referral_codes (code, description, created_by_email, max_uses, expires_at, discount_type, discount_value)
  VALUES (v_code, p_description, auth.jwt() ->> 'email', p_max_uses, p_expires_at, p_discount_type, p_discount_value)
  RETURNING * INTO v_record;

  RETURN jsonb_build_object(
    'success', true,
    'id', v_record.id,
    'code', v_record.code,
    'description', v_record.description,
    'max_uses', v_record.max_uses,
    'expires_at', v_record.expires_at,
    'created_at', v_record.created_at,
    'discount_type', v_record.discount_type,
    'discount_value', v_record.discount_value
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.issue_referral_code FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.issue_referral_code TO authenticated;

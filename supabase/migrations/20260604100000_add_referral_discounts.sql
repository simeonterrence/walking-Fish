-- Migration: Add referral discounts
-- Adds discount columns to referral_codes so admins can set % or fixed discounts.
-- Updates increment_referral_code_usage to return discount info for the Edge Function.

-- ============================================
-- 1. Add discount columns to referral_codes
-- ============================================
ALTER TABLE public.referral_codes
  ADD COLUMN discount_type text CHECK (discount_type IN ('percentage', 'fixed')),
  ADD COLUMN discount_value numeric NOT NULL DEFAULT 0 CHECK (discount_value >= 0),
  ADD COLUMN discount_active boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.referral_codes.discount_type IS '"percentage" or "fixed" — how the discount is applied to the order total';
COMMENT ON COLUMN public.referral_codes.discount_value IS 'The amount: e.g. 10 for 10% or D50 fixed';
COMMENT ON COLUMN public.referral_codes.discount_active IS 'Whether the discount is currently being offered';

-- ============================================
-- 2. Update increment_referral_code_usage to also return discount info
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

  -- Build response with discount info if discount is active
  IF v_record.discount_active AND v_record.discount_value > 0 THEN
    RETURN jsonb_build_object(
      'success', true,
      'code', v_record.code,
      'current_uses', v_record.current_uses + 1,
      'max_uses', v_record.max_uses,
      'discount_type', v_record.discount_type,
      'discount_value', v_record.discount_value
    );
  ELSE
    RETURN jsonb_build_object(
      'success', true,
      'code', v_record.code,
      'current_uses', v_record.current_uses + 1,
      'max_uses', v_record.max_uses
    );
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.increment_referral_code_usage FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_referral_code_usage TO service_role;

-- ============================================
-- 3. RPC: toggle_referral_code_discount
-- Toggles the discount_active flag for a referral code.
-- Also allows setting discount_type and discount_value.
-- ============================================
CREATE OR REPLACE FUNCTION public.toggle_referral_code_discount(
  p_id uuid,
  p_discount_active boolean,
  p_discount_type text DEFAULT NULL,
  p_discount_value numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_record public.referral_codes;
BEGIN
  -- Check authorization
  v_role := auth.jwt() -> 'app_metadata' ->> 'role';
  IF v_role IS NULL OR v_role NOT IN ('admin_role', 'super_admin_role') THEN
    RAISE EXCEPTION 'Permission denied: admin or super-admin role required.';
  END IF;

  -- Find the code
  SELECT * INTO v_record FROM public.referral_codes WHERE id = p_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Referral code not found');
  END IF;

  -- Update discount fields
  UPDATE public.referral_codes
  SET
    discount_active = p_discount_active,
    discount_type = CASE WHEN p_discount_type IS NOT NULL THEN p_discount_type ELSE v_record.discount_type END,
    discount_value = CASE WHEN p_discount_value IS NOT NULL THEN p_discount_value ELSE v_record.discount_value END
  WHERE id = p_id;

  RETURN jsonb_build_object(
    'success', true,
    'id', p_id,
    'discount_active', p_discount_active,
    'discount_type', COALESCE(p_discount_type, v_record.discount_type),
    'discount_value', COALESCE(p_discount_value, v_record.discount_value)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.toggle_referral_code_discount FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.toggle_referral_code_discount TO authenticated;

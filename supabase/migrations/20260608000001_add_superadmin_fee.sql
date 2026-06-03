-- Migration: Add superadmin commission fee to ticket_types
--
-- Allows superadmins to configure a per-ticket commission:
--   - Fixed: e.g., D5 per ticket sold
--   - Percentage: e.g., 1% of ticket price per ticket sold
--
-- Changes:
--   1. Add superadmin_fee_type and superadmin_fee_value to ticket_types
--   2. Update add_ticket_type RPC to accept fee params
--   3. Grant select on the new columns via existing RLS

-- ============================================
-- 1. Add fee columns to ticket_types
-- ============================================
ALTER TABLE public.ticket_types
  ADD COLUMN IF NOT EXISTS superadmin_fee_type text NOT NULL DEFAULT 'fixed'
    CHECK (superadmin_fee_type IN ('fixed', 'percentage'));

ALTER TABLE public.ticket_types
  ADD COLUMN IF NOT EXISTS superadmin_fee_value integer NOT NULL DEFAULT 0
    CHECK (superadmin_fee_value >= 0);

-- ============================================
-- 2. Update add_ticket_type RPC to accept fee params
-- ============================================
CREATE OR REPLACE FUNCTION public.add_ticket_type(
  p_name text,
  p_slug text,
  p_type text,
  p_price integer,
  p_capacity integer DEFAULT 0,
  p_sort_order integer DEFAULT 0,
  p_is_active boolean DEFAULT true,
  p_metadata jsonb DEFAULT '{}',
  p_superadmin_fee_type text DEFAULT 'fixed',
  p_superadmin_fee_value integer DEFAULT 0
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_id uuid;
BEGIN
  -- Only admin_role, super_admin_role, or ticketing_role may add ticket types
  v_role := auth.jwt() -> 'app_metadata' ->> 'role';
  IF v_role IS NULL OR v_role NOT IN ('admin_role', 'super_admin_role', 'ticketing_role') THEN
    RAISE EXCEPTION 'Permission denied: admin or ticketing role required.';
  END IF;

  INSERT INTO public.ticket_types (name, slug, type, price, capacity, sold, is_active, sort_order, metadata, superadmin_fee_type, superadmin_fee_value)
  VALUES (p_name, p_slug, p_type, p_price, p_capacity, 0, p_is_active, p_sort_order, p_metadata, p_superadmin_fee_type, p_superadmin_fee_value)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.add_ticket_type(p_name text, p_slug text, p_type text, p_price integer, p_capacity integer, p_sort_order integer, p_is_active boolean, p_metadata jsonb, p_superadmin_fee_type text, p_superadmin_fee_value integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.add_ticket_type(p_name text, p_slug text, p_type text, p_price integer, p_capacity integer, p_sort_order integer, p_is_active boolean, p_metadata jsonb, p_superadmin_fee_type text, p_superadmin_fee_value integer) TO authenticated;

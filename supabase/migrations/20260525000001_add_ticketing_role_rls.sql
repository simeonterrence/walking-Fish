-- Migration: Add ticketing_role RLS policies and RPC grants
-- 
-- Creates a helper function to check if the authenticated user is admin or ticketing staff,
-- then updates all ticketing table RLS policies to allow both roles.
-- Also grants ticketing_role execute on relevant RPC functions for admin dashboard CRUD.

-- ============================================
-- Helper: check if user has admin or ticketing role
-- ============================================
CREATE OR REPLACE FUNCTION public.has_admin_or_ticketing_role()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin_role', 'ticketing_role');
$$;

-- ============================================
-- 1. ticket_types
-- ============================================
DROP POLICY IF EXISTS "admin_can_all_ticket_types" ON public.ticket_types;

CREATE POLICY "admin_or_ticketing_can_all_ticket_types"
  ON public.ticket_types
  FOR ALL
  TO authenticated
  USING (public.has_admin_or_ticketing_role())
  WITH CHECK (public.has_admin_or_ticketing_role());

-- ============================================
-- 2. orders
-- ============================================
DROP POLICY IF EXISTS "admin_can_all_orders" ON public.orders;

CREATE POLICY "admin_or_ticketing_can_all_orders"
  ON public.orders
  FOR ALL
  TO authenticated
  USING (public.has_admin_or_ticketing_role())
  WITH CHECK (public.has_admin_or_ticketing_role());

-- ============================================
-- 3. tickets
-- ============================================
DROP POLICY IF EXISTS "admin_can_all_tickets" ON public.tickets;

CREATE POLICY "admin_or_ticketing_can_all_tickets"
  ON public.tickets
  FOR ALL
  TO authenticated
  USING (public.has_admin_or_ticketing_role())
  WITH CHECK (public.has_admin_or_ticketing_role());

-- ============================================
-- 4. top_up_bundles
-- ============================================
DROP POLICY IF EXISTS "admin_can_all_bundles" ON public.top_up_bundles;

CREATE POLICY "admin_or_ticketing_can_all_bundles"
  ON public.top_up_bundles
  FOR ALL
  TO authenticated
  USING (public.has_admin_or_ticketing_role())
  WITH CHECK (public.has_admin_or_ticketing_role());

-- ============================================
-- 5. balance_transactions
-- ============================================
DROP POLICY IF EXISTS "admin_can_select_txns" ON public.balance_transactions;

CREATE POLICY "admin_or_ticketing_can_select_txns"
  ON public.balance_transactions
  FOR SELECT
  TO authenticated
  USING (public.has_admin_or_ticketing_role());

-- ============================================
-- 6. payment_proofs
-- ============================================
DROP POLICY IF EXISTS "admin_can_all_payment_proofs" ON public.payment_proofs;

CREATE POLICY "admin_or_ticketing_can_all_payment_proofs"
  ON public.payment_proofs
  FOR ALL
  TO authenticated
  USING (public.has_admin_or_ticketing_role())
  WITH CHECK (public.has_admin_or_ticketing_role());

-- ============================================
-- 7. staff_scanner_codes
-- ============================================
DROP POLICY IF EXISTS "admin_can_all_scanner_codes" ON public.staff_scanner_codes;

CREATE POLICY "admin_or_ticketing_can_all_scanner_codes"
  ON public.staff_scanner_codes
  FOR ALL
  TO authenticated
  USING (public.has_admin_or_ticketing_role())
  WITH CHECK (public.has_admin_or_ticketing_role());

-- ============================================
-- 8. system_config
-- ============================================
DROP POLICY IF EXISTS "admin_can_all_system_config" ON public.system_config;

CREATE POLICY "admin_or_ticketing_can_all_system_config"
  ON public.system_config
  FOR ALL
  TO authenticated
  USING (public.has_admin_or_ticketing_role())
  WITH CHECK (public.has_admin_or_ticketing_role());

-- ============================================
-- Grant RPC execute to ticketing_role
-- The mark_ticket_used and update_ticket_balance RPCs
-- are already granted to 'authenticated' (so ticketing_role inherits).
-- The generate_ticket_code and increment_ticket_sold_count RPCs
-- are service_role only — keep those restricted.
-- ============================================

-- ============================================
-- RPC: add_ticket_type
-- Allows ticketing_role and admin_role to create ticket types
-- ============================================
CREATE OR REPLACE FUNCTION public.add_ticket_type(
  p_name text,
  p_slug text,
  p_type text,
  p_price integer,
  p_capacity integer,
  p_sort_order integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_id uuid;
  result jsonb;
BEGIN
  IF NOT public.has_admin_or_ticketing_role() THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  INSERT INTO public.ticket_types (name, slug, type, price, capacity, sold, is_active, sort_order)
  VALUES (p_name, p_slug, p_type, p_price, p_capacity, 0, true, p_sort_order)
  RETURNING id INTO new_id;

  result := jsonb_build_object('id', new_id);
  RETURN result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.add_ticket_type FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.add_ticket_type TO authenticated;

-- ============================================
-- RPC: toggle_ticket_type_active
-- Toggles is_active for a ticket type
-- ============================================
CREATE OR REPLACE FUNCTION public.toggle_ticket_type_active(
  p_id uuid,
  p_active boolean
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_admin_or_ticketing_role() THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  UPDATE public.ticket_types
  SET is_active = p_active
  WHERE id = p_id;

  RETURN FOUND;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.toggle_ticket_type_active FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.toggle_ticket_type_active TO authenticated;

-- ============================================
-- RPC: add_top_up_bundle
-- ============================================
CREATE OR REPLACE FUNCTION public.add_top_up_bundle(
  p_amount integer,
  p_sort_order integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_id uuid;
  result jsonb;
BEGIN
  IF NOT public.has_admin_or_ticketing_role() THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  INSERT INTO public.top_up_bundles (amount, sort_order, is_active)
  VALUES (p_amount, p_sort_order, true)
  RETURNING id INTO new_id;

  result := jsonb_build_object('id', new_id);
  RETURN result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.add_top_up_bundle FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.add_top_up_bundle TO authenticated;

-- ============================================
-- RPC: toggle_bundle_active
-- ============================================
CREATE OR REPLACE FUNCTION public.toggle_bundle_active(
  p_id uuid,
  p_active boolean
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_admin_or_ticketing_role() THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  UPDATE public.top_up_bundles
  SET is_active = p_active
  WHERE id = p_id;

  RETURN FOUND;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.toggle_bundle_active FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.toggle_bundle_active TO authenticated;

-- ============================================
-- RPC: delete_top_up_bundle
-- ============================================
CREATE OR REPLACE FUNCTION public.delete_top_up_bundle(
  p_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_admin_or_ticketing_role() THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  DELETE FROM public.top_up_bundles WHERE id = p_id;
  RETURN FOUND;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.delete_top_up_bundle FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_top_up_bundle TO authenticated;

-- ============================================
-- RPC: upsert_balance_cap
-- ============================================
CREATE OR REPLACE FUNCTION public.upsert_balance_cap(
  p_value text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_admin_or_ticketing_role() THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  INSERT INTO public.system_config (key, value, description)
  VALUES ('balance_cap', p_value, 'Maximum balance per activity credit ticket (in GMD)')
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

  RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.upsert_balance_cap FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_balance_cap TO authenticated;

-- ============================================
-- RPC: issue_scanner_code
-- ============================================
CREATE OR REPLACE FUNCTION public.issue_scanner_code(
  p_code text,
  p_label text DEFAULT 'Staff'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_id uuid;
  result jsonb;
BEGIN
  IF NOT public.has_admin_or_ticketing_role() THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  INSERT INTO public.staff_scanner_codes (code, label, is_active)
  VALUES (p_code, p_label, true)
  RETURNING id INTO new_id;

  result := jsonb_build_object('id', new_id, 'code', p_code);
  RETURN result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.issue_scanner_code FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.issue_scanner_code TO authenticated;

-- ============================================
-- RPC: revoke_scanner_code
-- ============================================
CREATE OR REPLACE FUNCTION public.revoke_scanner_code(
  p_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_admin_or_ticketing_role() THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  UPDATE public.staff_scanner_codes
  SET is_active = false
  WHERE id = p_id;

  RETURN FOUND;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.revoke_scanner_code FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.revoke_scanner_code TO authenticated;

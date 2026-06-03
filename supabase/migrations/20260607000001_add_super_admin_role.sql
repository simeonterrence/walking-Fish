-- Migration: Add super_admin_role to RLS policies and authorization checks
--
-- Introduces a new super_admin_role that has the same access as admin_role
-- PLUS the ability to create/revoke other admin accounts.
--
-- Changes:
--   1. Update has_admin_or_ticketing_role() to include super_admin_role
--   2. Update vendor table RLS policies to allow super_admin_role
--   3. Update early_access and contact_messages RLS policies
--   4. Update site_images and storage RLS policies
--   5. Update security hardening (mark_token_used, delete_ticket_with_audit)

-- ============================================
-- 1. Update helper: has_admin_or_ticketing_role
-- ============================================
CREATE OR REPLACE FUNCTION public.has_admin_or_ticketing_role()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin_role', 'super_admin_role', 'ticketing_role');
$$;

-- ============================================
-- 2. Vendor tables (vendor_applications, vendor_profiles, invite_tokens)
-- ============================================

-- vendor_applications
DROP POLICY IF EXISTS "admin_can_select_applications" ON public.vendor_applications;
CREATE POLICY "admin_can_select_applications"
  ON public.vendor_applications
  FOR SELECT
  TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin_role', 'super_admin_role'));

DROP POLICY IF EXISTS "admin_can_update_applications" ON public.vendor_applications;
CREATE POLICY "admin_can_update_applications"
  ON public.vendor_applications
  FOR UPDATE
  TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin_role', 'super_admin_role'))
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin_role', 'super_admin_role'));

-- vendor_profiles
DROP POLICY IF EXISTS "admin_select_all_profiles" ON public.vendor_profiles;
CREATE POLICY "admin_select_all_profiles"
  ON public.vendor_profiles
  FOR SELECT
  TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin_role', 'super_admin_role'));

DROP POLICY IF EXISTS "admin_update_all_profiles" ON public.vendor_profiles;
CREATE POLICY "admin_update_all_profiles"
  ON public.vendor_profiles
  FOR UPDATE
  TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin_role', 'super_admin_role'))
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin_role', 'super_admin_role'));

DROP POLICY IF EXISTS "admin_delete_profiles" ON public.vendor_profiles;
CREATE POLICY "admin_delete_profiles"
  ON public.vendor_profiles
  FOR DELETE
  TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin_role', 'super_admin_role'));

-- invite_tokens
DROP POLICY IF EXISTS "admin_can_manage_tokens" ON public.invite_tokens;
CREATE POLICY "admin_can_manage_tokens"
  ON public.invite_tokens
  FOR ALL
  TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin_role', 'super_admin_role'))
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin_role', 'super_admin_role'));

-- ============================================
-- 3. early_access
-- ============================================
DROP POLICY IF EXISTS "admin_can_select_early_access" ON public.early_access;
CREATE POLICY "admin_can_select_early_access"
  ON public.early_access
  FOR SELECT
  TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin_role', 'super_admin_role'));

DROP POLICY IF EXISTS "admin_can_all_early_access" ON public.early_access;
CREATE POLICY "admin_can_all_early_access"
  ON public.early_access
  FOR ALL
  TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin_role', 'super_admin_role'))
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin_role', 'super_admin_role'));

-- ============================================
-- 4. contact_messages
-- ============================================
DROP POLICY IF EXISTS "admin_can_select_contact_messages" ON public.contact_messages;
CREATE POLICY "admin_can_select_contact_messages"
  ON public.contact_messages
  FOR SELECT
  TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin_role', 'super_admin_role'));

DROP POLICY IF EXISTS "admin_can_all_contact_messages" ON public.contact_messages;
CREATE POLICY "admin_can_all_contact_messages"
  ON public.contact_messages
  FOR ALL
  TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin_role', 'super_admin_role'))
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin_role', 'super_admin_role'));

-- ============================================
-- 5. site_images
-- ============================================
DROP POLICY IF EXISTS "admin_can_all_site_images" ON public.site_images;
CREATE POLICY "admin_can_all_site_images"
  ON public.site_images
  FOR ALL
  TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin_role', 'super_admin_role'))
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin_role', 'super_admin_role'));

-- ============================================
-- 6. storage.objects (site-photos bucket)
-- ============================================
DROP POLICY IF EXISTS "admin_can_insert_site_photos" ON storage.objects;
CREATE POLICY "admin_can_insert_site_photos"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'site-photos'
    AND (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin_role', 'super_admin_role')
  );

DROP POLICY IF EXISTS "admin_can_update_site_photos" ON storage.objects;
CREATE POLICY "admin_can_update_site_photos"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'site-photos'
    AND (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin_role', 'super_admin_role')
  )
  WITH CHECK (
    bucket_id = 'site-photos'
    AND (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin_role', 'super_admin_role')
  );

DROP POLICY IF EXISTS "admin_can_delete_site_photos" ON storage.objects;
CREATE POLICY "admin_can_delete_site_photos"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'site-photos'
    AND (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin_role', 'super_admin_role')
  );

-- ============================================
-- 7. ticket_delete_audit
-- ============================================
DROP POLICY IF EXISTS "admin_can_select_ticket_delete_audit" ON public.ticket_delete_audit;
CREATE POLICY "admin_can_select_ticket_delete_audit"
  ON public.ticket_delete_audit
  FOR SELECT
  TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin_role', 'super_admin_role'));

-- ============================================
-- 8. Create admin_list view for the admin management UI
-- ============================================
DROP VIEW IF EXISTS public.admin_list;
CREATE VIEW public.admin_list
WITH (security_barrier)
AS
  SELECT
    id::uuid,
    email,
    created_at,
    raw_app_meta_data ->> 'role' AS role
  FROM auth.users
  WHERE raw_app_meta_data ->> 'role' IN ('admin_role', 'super_admin_role');

-- Grant access to authenticated users with either role
REVOKE ALL ON public.admin_list FROM PUBLIC, anon;
GRANT SELECT ON public.admin_list TO authenticated;

-- ============================================
-- 9. Update mark_token_used to allow super_admin_role
-- ============================================
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

  -- Authorize: only the matching vendor, admin_role, or super_admin_role may proceed
  IF (jwt_email IS NOT NULL AND jwt_email = token_email)
     OR (jwt_role IN ('admin_role', 'super_admin_role')) THEN

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

-- ============================================
-- 10. Update delete_ticket_with_audit to allow super_admin_role
-- ============================================
CREATE OR REPLACE FUNCTION public.delete_ticket_with_audit(
  p_ticket_id uuid,
  p_deleted_by text DEFAULT 'admin'
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ticket record;
  v_balance_txns jsonb;
  v_role text;
BEGIN
  -- Security: only admin_role, super_admin_role, or ticketing_role can delete tickets via this RPC
  v_role := auth.jwt() -> 'app_metadata' ->> 'role';
  IF v_role IS NULL OR v_role NOT IN ('admin_role', 'super_admin_role', 'ticketing_role') THEN
    RAISE EXCEPTION 'Permission denied: admin or ticketing role required.';
  END IF;

  -- Fetch ticket with joined order + type info
  SELECT
    t.*,
    tt.name AS type_name,
    tt.slug AS type_slug,
    tt.price AS type_price,
    o.email AS order_email,
    o.total AS order_total,
    o.payment_method AS order_payment_method,
    o.status AS order_status
  INTO v_ticket
  FROM public.tickets t
  LEFT JOIN public.ticket_types tt ON t.ticket_type_id = tt.id
  LEFT JOIN public.orders o ON t.order_id = o.id
  WHERE t.id = p_ticket_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- Gather all balance transactions for this ticket
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', bt.id,
      'type', bt.type,
      'amount_delta', bt.amount_delta,
      'balance_after', bt.balance_after,
      'source', bt.source,
      'notes', bt.notes,
      'created_at', bt.created_at
    ) ORDER BY bt.created_at ASC
  ), '[]'::jsonb)
  INTO v_balance_txns
  FROM public.balance_transactions bt
  WHERE bt.ticket_id = p_ticket_id;

  -- Insert audit record
  INSERT INTO public.ticket_delete_audit (
    ticket_id, ticket_code,
    ticket_type_name, ticket_type_slug, ticket_type_price,
    order_id, order_email, order_total, order_payment_method, order_status,
    ticket_type, ticket_status, ticket_balance, ticket_uses_remaining,
    customer_name, customer_email,
    deleted_by, deletion_reason,
    ticket_snapshot, balance_transactions
  ) VALUES (
    p_ticket_id, v_ticket.code,
    v_ticket.type_name, v_ticket.type_slug, v_ticket.type_price,
    v_ticket.order_id, v_ticket.order_email, v_ticket.order_total, v_ticket.order_payment_method, v_ticket.order_status,
    v_ticket.type, v_ticket.status, v_ticket.balance, v_ticket.uses_remaining,
    v_ticket.customer_name, v_ticket.customer_email,
    p_deleted_by, '',
    row_to_json(v_ticket)::jsonb,
    v_balance_txns
  );

  -- Delete the ticket (CASCADE removes balance_transactions)
  DELETE FROM public.tickets WHERE id = p_ticket_id;

  RETURN true;
END;
$$;

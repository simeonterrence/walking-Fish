-- Migration: Create ticket_delete_audit table and audit-safe delete RPC
--
-- Creates a permanent audit trail for all ticket deletions:
--   1. ticket_delete_audit table — stores a full snapshot of every deleted ticket
--      (including its order context, balance transaction history, and type metadata)
--   2. delete_ticket_with_audit RPC — atomically archives a ticket then deletes it
--      (CASCADE handles balance_transactions automatically)
--
-- Usage:
--   SELECT delete_ticket_with_audit('ticket-uuid-here', 'admin@walkingfish.gm');
--
-- This ensures all future deletions (manual + bulk cleanup) are recorded.

-- ============================================
-- 1. ticket_delete_audit table
-- ============================================
CREATE TABLE public.ticket_delete_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Ticket identity
  ticket_id uuid NOT NULL,
  ticket_code text NOT NULL,
  ticket_type_name text,
  ticket_type_slug text,
  ticket_type_price integer,

  -- Order context (denormalised at deletion time)
  order_id uuid,
  order_email text,
  order_total integer,
  order_payment_method text,
  order_status text,

  -- Ticket state snapshot
  ticket_type text NOT NULL,
  ticket_status text,
  ticket_balance integer DEFAULT 0,
  ticket_uses_remaining integer,

  -- Customer info
  customer_name text,
  customer_email text,

  -- Audit metadata
  deleted_by text NOT NULL DEFAULT 'admin',
  deleted_at timestamptz NOT NULL DEFAULT now(),
  deletion_reason text NOT NULL DEFAULT '',

  -- Full JSON snapshots for historical completeness
  ticket_snapshot jsonb,
  balance_transactions jsonb DEFAULT '[]'::jsonb
);

-- Index for quick lookups by ticket code or order
CREATE INDEX idx_ticket_delete_audit_ticket_code ON public.ticket_delete_audit(ticket_code);
CREATE INDEX idx_ticket_delete_audit_deleted_at ON public.ticket_delete_audit(deleted_at DESC);
CREATE INDEX idx_ticket_delete_audit_ticket_id ON public.ticket_delete_audit(ticket_id);

ALTER TABLE public.ticket_delete_audit ENABLE ROW LEVEL SECURITY;

-- Admins (admin_role) can view the full audit trail
DROP POLICY IF EXISTS "admin_can_select_ticket_delete_audit" ON public.ticket_delete_audit;
CREATE POLICY "admin_can_select_ticket_delete_audit"
  ON public.ticket_delete_audit
  FOR SELECT
  TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin_role');

-- Ticketing role can also view (for scanner / support context)
DROP POLICY IF EXISTS "ticketing_can_select_ticket_delete_audit" ON public.ticket_delete_audit;
CREATE POLICY "ticketing_can_select_ticket_delete_audit"
  ON public.ticket_delete_audit
  FOR SELECT
  TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'ticketing_role');

-- Service role can insert (via RPC or direct)
DROP POLICY IF EXISTS "service_role_can_insert_ticket_delete_audit" ON public.ticket_delete_audit;
CREATE POLICY "service_role_can_insert_ticket_delete_audit"
  ON public.ticket_delete_audit
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- ============================================
-- 2. RPC: delete_ticket_with_audit
-- Atomically archives a ticket (with order + balance_transaction context),
-- then deletes it. CASCADE handles balance_transactions.
-- Returns true on success.
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
  -- Security: only admin_role or ticketing_role can delete tickets via this RPC
  v_role := auth.jwt() -> 'app_metadata' ->> 'role';
  IF v_role IS NULL OR v_role NOT IN ('admin_role', 'ticketing_role') THEN
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

REVOKE EXECUTE ON FUNCTION public.delete_ticket_with_audit FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_ticket_with_audit TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_ticket_with_audit TO authenticated;

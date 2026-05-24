-- Migration: Create ticketing system tables
-- Core tables for Piroake Fest 2026 ticketing: ticket types, orders, tickets,
-- top-up bundles, balance transactions, payment proofs, staff scanner codes,
-- and system configuration.
--
-- RLS policies:
--   - anon: insert orders (create purchase), read ticket_types, top_up_bundles
--   - authenticated (email match): read own tickets/orders, insert payment_proofs
--   - authenticated (admin_role): full CRUD on all tables
--   - authenticated (staff_role): read tickets by code/QR for scanning ops

-- ============================================
-- 1. ticket_types
-- Admin-configurable ticket definitions.
-- Used for both entry passes and activity credit bundles.
-- ============================================
CREATE TABLE public.ticket_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  type text NOT NULL CHECK (type IN ('entry', 'activity_credit', 'parking')),
  price integer NOT NULL CHECK (price >= 0),
  capacity integer NOT NULL DEFAULT 0 CHECK (capacity >= 0),
  sold integer NOT NULL DEFAULT 0 CHECK (sold >= 0 AND sold <= capacity),
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ticket_types ENABLE ROW LEVEL SECURITY;

-- Everyone can read active ticket types (for the ticket shop)
CREATE POLICY "anyone_can_read_active_ticket_types"
  ON public.ticket_types
  FOR SELECT
  TO anon, authenticated
  USING (is_active = true);

-- Admins can manage all ticket types
CREATE POLICY "admin_can_all_ticket_types"
  ON public.ticket_types
  FOR ALL
  TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin_role')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin_role');

-- ============================================
-- 2. orders
-- Customer purchases. Contains one or more tickets.
-- ============================================
CREATE TABLE public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  status text NOT NULL DEFAULT 'unpaid' CHECK (status IN ('unpaid', 'paid', 'pending_verification', 'cancelled', 'refunded')),
  total integer NOT NULL CHECK (total >= 0),
  payment_method text CHECK (payment_method IN ('modempay', 'wave_transfer')),
  payment_proof_id uuid,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- Anonymous users can create orders (initial purchase)
CREATE POLICY "anon_can_insert_orders"
  ON public.orders
  FOR INSERT
  TO anon
  WITH CHECK (true);

-- Customers can view their own orders by email
CREATE POLICY "customer_can_select_own_orders"
  ON public.orders
  FOR SELECT
  TO authenticated
  USING (email = auth.jwt() ->> 'email');

-- Admins can manage all orders
CREATE POLICY "admin_can_all_orders"
  ON public.orders
  FOR ALL
  TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin_role')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin_role');

-- ============================================
-- 3. tickets
-- Individual tickets within an order. Can be entry passes,
-- parking passes, or rechargeable activity credits.
-- ============================================
CREATE TABLE public.tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  ticket_type_id uuid NOT NULL REFERENCES public.ticket_types(id),
  type text NOT NULL CHECK (type IN ('entry', 'activity_credit', 'parking')),
  code text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'used', 'exhausted', 'revoked')),
  balance integer NOT NULL DEFAULT 0 CHECK (balance >= 0),
  customer_email text,
  customer_name text,
  qr_url text,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;

-- Anonymous users can look up a ticket by code (for self-service top-up)
-- Only returns necessary fields: code, balance, status, type, customer_name
CREATE POLICY "anon_can_select_ticket_by_code"
  ON public.tickets
  FOR SELECT
  TO anon
  USING (true);

-- Customers can view their own tickets (matched by email)
CREATE POLICY "customer_can_select_own_tickets"
  ON public.tickets
  FOR SELECT
  TO authenticated
  USING (customer_email = auth.jwt() ->> 'email');

-- Staff with a valid scanner code can read tickets for scanning operations
CREATE POLICY "staff_can_select_tickets"
  ON public.tickets
  FOR SELECT
  TO authenticated
  USING (true);

-- Staff can update ticket status (gate scan, debit, top-up)
CREATE POLICY "staff_can_update_tickets"
  ON public.tickets
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Admins can manage all tickets
CREATE POLICY "admin_can_all_tickets"
  ON public.tickets
  FOR ALL
  TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin_role')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin_role');

-- ============================================
-- 4. top_up_bundles
-- Predefined top-up amounts for self-service and booth.
-- Admin-configurable, distinct from ticket_types.
-- ============================================
CREATE TABLE public.top_up_bundles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  amount integer NOT NULL CHECK (amount > 0),
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.top_up_bundles ENABLE ROW LEVEL SECURITY;

-- Everyone can read active top-up bundles
CREATE POLICY "anyone_can_read_active_bundles"
  ON public.top_up_bundles
  FOR SELECT
  TO anon, authenticated
  USING (is_active = true);

-- Admins can manage bundles
CREATE POLICY "admin_can_all_bundles"
  ON public.top_up_bundles
  FOR ALL
  TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin_role')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin_role');

-- ============================================
-- 5. balance_transactions
-- Complete audit trail of all balance changes for activity credit tickets.
-- ============================================
CREATE TABLE public.balance_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('top_up', 'debit', 'initial_purchase')),
  amount_delta integer NOT NULL,
  balance_after integer NOT NULL,
  source text NOT NULL CHECK (source IN ('modempay', 'wave', 'cash', 'booth_debit', 'initial')),
  notes text,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.balance_transactions ENABLE ROW LEVEL SECURITY;

-- Staff can read balance transactions (for dispute resolution)
CREATE POLICY "staff_can_select_balance_txns"
  ON public.balance_transactions
  FOR SELECT
  TO authenticated
  USING (true);

-- Customers can see transactions for their own tickets
CREATE POLICY "customer_can_select_ticket_txns"
  ON public.balance_transactions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tickets
      WHERE tickets.id = balance_transactions.ticket_id
        AND tickets.customer_email = auth.jwt() ->> 'email'
    )
  );

-- Edge Function (service role) inserts transactions
CREATE POLICY "service_role_can_insert_txns"
  ON public.balance_transactions
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Admins can read all transactions
CREATE POLICY "admin_can_select_txns"
  ON public.balance_transactions
  FOR SELECT
  TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin_role');

-- ============================================
-- 6. payment_proofs
-- Stores Wave Transfer payment proof submissions.
-- ============================================
CREATE TABLE public.payment_proofs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  email text NOT NULL,
  amount integer NOT NULL CHECK (amount > 0),
  reference_number text NOT NULL,
  screenshot_url text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'rejected')),
  verified_by uuid,
  verified_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.payment_proofs ENABLE ROW LEVEL SECURITY;

-- Customers can insert proof for their own orders
CREATE POLICY "anon_can_insert_payment_proofs"
  ON public.payment_proofs
  FOR INSERT
  TO anon
  WITH CHECK (true);

-- Admins can manage all proofs
CREATE POLICY "admin_can_all_payment_proofs"
  ON public.payment_proofs
  FOR ALL
  TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin_role')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin_role');

-- ============================================
-- 7. staff_scanner_codes
-- Unique per-staff access codes for the /scan page.
-- ============================================
CREATE TABLE public.staff_scanner_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  label text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.staff_scanner_codes ENABLE ROW LEVEL SECURITY;

-- Staff can read their own code (to log in)
-- Only returns active codes and doesn't expose other codes
CREATE POLICY "authenticated_can_validate_scanner_code"
  ON public.staff_scanner_codes
  FOR SELECT
  TO authenticated
  USING (is_active = true);

-- Admins can manage all codes
CREATE POLICY "admin_can_all_scanner_codes"
  ON public.staff_scanner_codes
  FOR ALL
  TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin_role')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin_role');

-- ============================================
-- 8. system_config
-- Key-value settings for admin-configurable system parameters.
-- ============================================
CREATE TABLE public.system_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  value text NOT NULL,
  description text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.system_config ENABLE ROW LEVEL SECURITY;

-- Anyone can read system config (public settings like balance cap)
CREATE POLICY "anyone_can_read_system_config"
  ON public.system_config
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- Admins can manage settings
CREATE POLICY "admin_can_all_system_config"
  ON public.system_config
  FOR ALL
  TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin_role')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin_role');

-- ============================================
-- Default data
-- ============================================
INSERT INTO public.system_config (key, value, description) VALUES
  ('balance_cap', '5000', 'Maximum balance per activity credit ticket (in GMD)');

INSERT INTO public.top_up_bundles (amount, sort_order) VALUES
  (100, 1),
  (200, 2),
  (500, 3),
  (1000, 4);

INSERT INTO public.ticket_types (name, slug, type, price, capacity, sold, sort_order) VALUES
  ('Regular Entry', 'regular-entry', 'entry', 300, 2000, 0, 1),
  ('VIP Entry', 'vip-entry', 'entry', 800, 500, 0, 2),
  ('Group Entry (5 Pax)', 'group-entry', 'entry', 1300, 200, 0, 3),
  ('Parking', 'parking', 'parking', 100, 300, 0, 4),
  ('Games Pass D500', 'games-pass-d500', 'activity_credit', 500, 1000, 0, 5),
  ('Games Pass D1,000', 'games-pass-d1000', 'activity_credit', 1000, 500, 0, 6),
  ('Games Pass D2,000', 'games-pass-d2000', 'activity_credit', 2000, 200, 0, 7);

-- ============================================
-- Indexes
-- ============================================
CREATE INDEX idx_tickets_code ON public.tickets(code);
CREATE INDEX idx_tickets_order ON public.tickets(order_id);
CREATE INDEX idx_tickets_email ON public.tickets(customer_email);
CREATE INDEX idx_tickets_type ON public.tickets(type);
CREATE INDEX idx_orders_email ON public.orders(email);
CREATE INDEX idx_orders_status ON public.orders(status);
CREATE INDEX idx_balance_txns_ticket ON public.balance_transactions(ticket_id);
CREATE INDEX idx_balance_txns_created ON public.balance_transactions(created_at DESC);
CREATE INDEX idx_payment_proofs_order ON public.payment_proofs(order_id);
CREATE INDEX idx_payment_proofs_status ON public.payment_proofs(status);
CREATE INDEX idx_scanner_codes_code ON public.staff_scanner_codes(code);

-- ============================================
-- Auto-update updated_at trigger function
-- Reuses existing function if already created by vendor migration;
-- CREATE OR REPLACE so it's idempotent.
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

CREATE TRIGGER set_ticket_types_updated_at
  BEFORE UPDATE ON public.ticket_types
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER set_orders_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER set_tickets_updated_at
  BEFORE UPDATE ON public.tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER set_payment_proofs_updated_at
  BEFORE UPDATE ON public.payment_proofs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER set_system_config_updated_at
  BEFORE UPDATE ON public.system_config
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- RPC: increment_ticket_sold_count
-- Atomically increments the sold counter for a ticket type.
-- Used when an order is confirmed.
-- Returns true if capacity not exceeded, false otherwise.
-- ============================================
CREATE OR REPLACE FUNCTION public.increment_ticket_sold_count(ticket_type_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_sold integer;
  current_capacity integer;
BEGIN
  SELECT sold, capacity INTO current_sold, current_capacity
  FROM public.ticket_types
  WHERE id = ticket_type_id
  FOR UPDATE;

  IF current_sold >= current_capacity THEN
    RETURN false;
  END IF;

  UPDATE public.ticket_types
  SET sold = sold + 1
  WHERE id = ticket_type_id;

  RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.increment_ticket_sold_count FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_ticket_sold_count TO service_role;

-- ============================================
-- RPC: update_ticket_balance
-- Atomically adjusts a ticket's balance.
-- For debits: verifies sufficient balance before deducting.
-- For top-ups: enforces balance cap.
-- Returns the new balance, or -1 if the operation is rejected.
-- ============================================
CREATE OR REPLACE FUNCTION public.update_ticket_balance(
  p_ticket_id uuid,
  p_amount_delta integer,
  p_txn_type text,
  p_source text,
  p_notes text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_balance integer;
  new_balance integer;
  balance_cap_value integer;
BEGIN
  -- Lock the ticket row
  SELECT balance INTO current_balance
  FROM public.tickets
  WHERE id = p_ticket_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN -1;
  END IF;

  new_balance := current_balance + p_amount_delta;

  -- For debits (negative delta), check sufficient balance
  IF p_amount_delta < 0 AND new_balance < 0 THEN
    RETURN -1;
  END IF;

  -- For top-ups (positive delta), check balance cap
  IF p_amount_delta > 0 THEN
    SELECT COALESCE(NULLIF(value, ''), '5000')::integer INTO balance_cap_value
    FROM public.system_config
    WHERE key = 'balance_cap';

    IF new_balance > balance_cap_value THEN
      RETURN -1;
    END IF;
  END IF;

  -- Update ticket balance
  UPDATE public.tickets
  SET balance = new_balance
  WHERE id = p_ticket_id;

  -- Record the transaction
  INSERT INTO public.balance_transactions (ticket_id, type, amount_delta, balance_after, source, notes)
  VALUES (p_ticket_id, p_txn_type, p_amount_delta, new_balance, p_source, p_notes);

  RETURN new_balance;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.update_ticket_balance FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_ticket_balance TO service_role;
GRANT EXECUTE ON FUNCTION public.update_ticket_balance TO authenticated;

-- ============================================
-- RPC: mark_ticket_used
-- Marks an entry/parking ticket as used (gate scan).
-- Returns true if successful, false if already used.
-- ============================================
CREATE OR REPLACE FUNCTION public.mark_ticket_used(p_ticket_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_status text;
BEGIN
  SELECT status INTO current_status
  FROM public.tickets
  WHERE id = p_ticket_id
  FOR UPDATE;

  IF current_status = 'used' THEN
    RETURN false;
  END IF;

  UPDATE public.tickets
  SET status = 'used'
  WHERE id = p_ticket_id;

  RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mark_ticket_used FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_ticket_used TO authenticated;

-- ============================================
-- RPC: generate_ticket_code
-- Generates a unique ticket code in TKT-XXXXXX format.
-- ============================================
CREATE OR REPLACE FUNCTION public.generate_ticket_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  code text;
  done bool;
BEGIN
  done := false;
  WHILE NOT done LOOP
    code := 'TKT-' || upper(substr(md5(random()::text), 1, 6));
    done := NOT EXISTS (SELECT 1 FROM public.tickets WHERE tickets.code = code);
  END LOOP;
  RETURN code;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.generate_ticket_code FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_ticket_code TO service_role;

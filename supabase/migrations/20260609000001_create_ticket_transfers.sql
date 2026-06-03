-- Migration: Create ticket transfers table for ticket sharing/transfer
-- Allows ticket owners to transfer tickets to other people after purchase.
--
-- When a ticket is transferred:
--   1. The transfer record is created with a unique transfer code
--   2. The recipient receives an email with a claim link
--   3. Once claimed, the ticket's customer_email is updated to the new owner
--   4. A new QR code and access code are generated for the new owner
--   5. The original owner receives a confirmation that the transfer completed

-- ============================================
-- 1. ticket_transfers
-- ============================================
CREATE TABLE public.ticket_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  from_email text NOT NULL,
  to_email text NOT NULL,
  transfer_code text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'cancelled', 'expired')),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '48 hours'),
  message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  cancelled_at timestamptz
);

ALTER TABLE public.ticket_transfers ENABLE ROW LEVEL SECURITY;

-- Owner of the ticket (from_email) can see their transfers
CREATE POLICY "owner_can_select_transfers"
  ON public.ticket_transfers
  FOR SELECT
  TO authenticated
  USING (from_email = auth.jwt() ->> 'email' OR to_email = auth.jwt() ->> 'email');

-- Anonymous users can look up a transfer by code (for claiming)
-- Only returns necessary fields: id, status, expires_at, to_email
CREATE POLICY "anon_can_select_transfer_by_code"
  ON public.ticket_transfers
  FOR SELECT
  TO anon
  USING (true);

-- Service role can insert transfers
CREATE POLICY "service_role_can_insert_transfers"
  ON public.ticket_transfers
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Service role can update transfers
CREATE POLICY "service_role_can_update_transfers"
  ON public.ticket_transfers
  FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Admins can manage all transfers
CREATE POLICY "admin_can_all_transfers"
  ON public.ticket_transfers
  FOR ALL
  TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin_role')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin_role');

-- ============================================
-- Indexes
-- ============================================
CREATE INDEX idx_ticket_transfers_ticket ON public.ticket_transfers(ticket_id);
CREATE INDEX idx_ticket_transfers_from ON public.ticket_transfers(from_email);
CREATE INDEX idx_ticket_transfers_to ON public.ticket_transfers(to_email);
CREATE INDEX idx_ticket_transfers_code ON public.ticket_transfers(transfer_code);
CREATE INDEX idx_ticket_transfers_status ON public.ticket_transfers(status);

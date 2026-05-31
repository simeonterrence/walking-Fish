-- Migration: normalize_emails_case_insensitive
-- Description: Normalizes existing email values to lowercase in tickets and orders
-- tables, and updates RLS policies to use case-insensitive comparison.
-- This ensures that email-based lookups work reliably regardless of the
-- case used during entry or authentication.

-- 1. Normalize existing customer_email in tickets table to lowercase
UPDATE public.tickets
SET customer_email = LOWER(customer_email)
WHERE customer_email IS NOT NULL;

-- 2. Normalize existing email in orders table to lowercase
UPDATE public.orders
SET email = LOWER(email)
WHERE email IS NOT NULL;

-- 3. Drop and recreate RLS policy on tickets for case-insensitive customer select
DROP POLICY IF EXISTS "customer_can_select_own_tickets" ON public.tickets;

CREATE POLICY "customer_can_select_own_tickets"
  ON public.tickets
  FOR SELECT
  TO authenticated
  USING (LOWER(customer_email) = LOWER(auth.jwt() ->> 'email'));

-- 4. Drop and recreate RLS policy on orders for case-insensitive customer select
DROP POLICY IF EXISTS "customer_can_select_own_orders" ON public.orders;

CREATE POLICY "customer_can_select_own_orders"
  ON public.orders
  FOR SELECT
  TO authenticated
  USING (LOWER(email) = LOWER(auth.jwt() ->> 'email'));

-- 5. Create index to support case-insensitive lookups on customer_email
CREATE INDEX IF NOT EXISTS idx_tickets_lower_customer_email
  ON public.tickets (LOWER(customer_email));

-- 6. Create index to support case-insensitive lookups on orders email
CREATE INDEX IF NOT EXISTS idx_orders_lower_email
  ON public.orders (LOWER(email));

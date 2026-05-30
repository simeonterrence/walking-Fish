-- Migration: Create magic_link_logs table for tracking magic link sends
-- Allows admins to see how many times a magic link was sent to each email
-- and when the last send occurred.

CREATE TABLE public.magic_link_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  sent_by text NOT NULL DEFAULT 'system',
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.magic_link_logs ENABLE ROW LEVEL SECURITY;

-- Admins can view and insert logs
CREATE POLICY "admin_can_select_magic_link_logs"
  ON public.magic_link_logs
  FOR SELECT
  TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin_role');

CREATE POLICY "admin_can_insert_magic_link_logs"
  ON public.magic_link_logs
  FOR INSERT
  TO authenticated
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin_role');

-- Anon can insert (for the public send-magic-link endpoint on the tickets page)
CREATE POLICY "anon_can_insert_magic_link_logs"
  ON public.magic_link_logs
  FOR INSERT
  TO anon
  WITH CHECK (true);

-- Indexes
CREATE INDEX idx_magic_link_logs_email ON public.magic_link_logs(email);
CREATE INDEX idx_magic_link_logs_created ON public.magic_link_logs(created_at DESC);
CREATE INDEX idx_magic_link_logs_order ON public.magic_link_logs(order_id);

-- Migration: Create early_access and contact_messages tables
-- Support waitlist and contact forms. RLS enabled with public insert & admin view.

CREATE TABLE public.early_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  ticket_code text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.early_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_can_insert_early_access"
  ON public.early_access
  FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "admin_can_select_early_access"
  ON public.early_access
  FOR SELECT
  TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin_role');

CREATE POLICY "admin_can_all_early_access"
  ON public.early_access
  FOR ALL
  TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin_role');


CREATE TABLE public.contact_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text,
  email text NOT NULL,
  subject text,
  message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.contact_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_can_insert_contact_messages"
  ON public.contact_messages
  FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "admin_can_select_contact_messages"
  ON public.contact_messages
  FOR SELECT
  TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin_role');

CREATE POLICY "admin_can_all_contact_messages"
  ON public.contact_messages
  FOR ALL
  TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin_role');

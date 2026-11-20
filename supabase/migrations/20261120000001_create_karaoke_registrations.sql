-- Migration: karaoke_registrations table
-- Stores signups for the Piroake Fest 2026 "Gen Z vs Millennials" Karaoke Competition.
-- The public /karaoke form submits through the verify-turnstile Edge Function,
-- which inserts with the service role after validating the CAPTCHA.

CREATE TABLE IF NOT EXISTS public.karaoke_registrations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  registration_type TEXT NOT NULL CHECK (registration_type IN ('Individual', 'Group')),
  name TEXT NOT NULL,
  generation TEXT NOT NULL CHECK (generation IN ('Gen Z', 'Millennials')),
  genre TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  group_size INTEGER CHECK (group_size IS NULL OR (group_size BETWEEN 2 AND 20)),
  status TEXT DEFAULT 'pending' NOT NULL,
  notes TEXT
);

COMMENT ON TABLE public.karaoke_registrations IS
  'Piroake Fest 2026 Gen Z vs Millennials Karaoke Competition registrations.';

CREATE INDEX IF NOT EXISTS karaoke_registrations_created_at_idx
  ON public.karaoke_registrations (created_at DESC);

ALTER TABLE public.karaoke_registrations ENABLE ROW LEVEL SECURITY;

-- No anon INSERT policy: submissions must pass Turnstile through the Edge Function.
-- Admins read and manage registrations with the admin_role claim (or service key).
DROP POLICY IF EXISTS "admin_can_select_karaoke_registrations" ON public.karaoke_registrations;
CREATE POLICY "admin_can_select_karaoke_registrations"
  ON public.karaoke_registrations
  FOR SELECT
  TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin_role');

DROP POLICY IF EXISTS "admin_can_update_karaoke_registrations" ON public.karaoke_registrations;
CREATE POLICY "admin_can_update_karaoke_registrations"
  ON public.karaoke_registrations
  FOR UPDATE
  TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin_role')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin_role');

DROP POLICY IF EXISTS "admin_can_delete_karaoke_registrations" ON public.karaoke_registrations;
CREATE POLICY "admin_can_delete_karaoke_registrations"
  ON public.karaoke_registrations
  FOR DELETE
  TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin_role');

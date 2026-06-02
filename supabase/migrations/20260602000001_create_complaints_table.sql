-- Migration: Create complaints table for tracking issue resolution
-- Stores customer complaints with status tracking, assignment, and resolution notes.

CREATE TABLE public.complaints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text,
  phone text NOT NULL,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'new',
  assigned_to text,
  resolution_notes text,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Auto-update updated_at on row modification
CREATE OR REPLACE FUNCTION public.update_complaints_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER complaints_updated_at_trigger
  BEFORE UPDATE ON public.complaints
  FOR EACH ROW
  EXECUTE FUNCTION public.update_complaints_updated_at();

ALTER TABLE public.complaints ENABLE ROW LEVEL SECURITY;

-- Anyone can insert a complaint (anonymous form submission)
CREATE POLICY "anon_can_insert_complaints"
  ON public.complaints
  FOR INSERT
  TO anon
  WITH CHECK (true);

-- Authenticated users with admin_role can view all complaints
CREATE POLICY "admin_can_select_complaints"
  ON public.complaints
  FOR SELECT
  TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin_role');

-- Authenticated users with admin_role can update complaints (status, assignment, resolution)
CREATE POLICY "admin_can_update_complaints"
  ON public.complaints
  FOR UPDATE
  TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin_role')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin_role');

-- Authenticated users with admin_role can delete complaints
CREATE POLICY "admin_can_delete_complaints"
  ON public.complaints
  FOR DELETE
  TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin_role');

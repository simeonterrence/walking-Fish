-- Migration: volunteer_applications table
-- Stores applications submitted by potential volunteers for PIROAKE Games Night Series & other Walking-Fish events.

CREATE TABLE IF NOT EXISTS public.volunteer_applications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  full_name TEXT NOT NULL,
  address TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  prior_experience TEXT NOT NULL,
  prior_experience_details TEXT,
  skills TEXT NOT NULL,
  resume_url TEXT,
  resume_filename TEXT,
  motivation TEXT NOT NULL,
  extra_info TEXT,
  confirmation BOOLEAN DEFAULT FALSE NOT NULL,
  status TEXT DEFAULT 'pending' NOT NULL,
  notes TEXT
);

-- Enable RLS
ALTER TABLE public.volunteer_applications ENABLE ROW LEVEL SECURITY;

-- Allow anonymous users to submit volunteer applications
CREATE POLICY "Allow public insert to volunteer_applications"
  ON public.volunteer_applications
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Allow authenticated admins to view/manage volunteer applications
CREATE POLICY "Allow authenticated read/manage volunteer_applications"
  ON public.volunteer_applications
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated update volunteer_applications"
  ON public.volunteer_applications
  FOR UPDATE
  TO authenticated
  USING (true);

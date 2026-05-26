-- Migration: Create site_images table
-- This table stores metadata for photos displayed across the public site
-- (gallery, partners, hero, events, media, about sections).
-- The table was created manually via the Supabase Dashboard; this migration
-- brings it under version control for full infrastructure-as-code coverage.
-- Uses IF NOT EXISTS so it's safe to run even if the table already exists.

-- ============================================
-- 1. Create the table
-- ============================================
CREATE TABLE IF NOT EXISTS public.site_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  file_path text NOT NULL,
  alt_text text DEFAULT ''::text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ============================================
-- 2. Indexes
-- ============================================
CREATE INDEX IF NOT EXISTS idx_site_images_section ON public.site_images(section);
CREATE INDEX IF NOT EXISTS idx_site_images_section_position ON public.site_images(section, position);

-- Migration: Add details jsonb column to vendor_applications and vendor_profiles
-- This stores the complete multi-page form answers in a structured format.

ALTER TABLE public.vendor_applications ADD COLUMN IF NOT EXISTS details jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.vendor_profiles ADD COLUMN IF NOT EXISTS details jsonb DEFAULT '{}'::jsonb;

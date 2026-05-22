-- Migration: Add phone column to early_access and contact_messages tables
-- Support collecting phone / WhatsApp numbers for follow-up.

ALTER TABLE public.early_access ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE public.contact_messages ADD COLUMN IF NOT EXISTS phone text;

-- Migration: Add Kids ticket and Kids Center / Playground ticket types
--
-- Extends the type CHECK constraint on ticket_types and tickets tables
-- to allow 'kids_zone' as a valid type value, then seeds the new rows.

-- ============================================
-- 1. Extend ticket_types.type CHECK constraint
-- ============================================
ALTER TABLE public.ticket_types DROP CONSTRAINT IF EXISTS ticket_types_type_check;
ALTER TABLE public.ticket_types ADD CONSTRAINT ticket_types_type_check
  CHECK (type IN ('entry', 'activity_credit', 'parking', 'food', 'drinks', 'kids_zone'));

-- ============================================
-- 2. Extend tickets.type CHECK constraint
-- ============================================
ALTER TABLE public.tickets DROP CONSTRAINT IF EXISTS tickets_type_check;
ALTER TABLE public.tickets ADD CONSTRAINT tickets_type_check
  CHECK (type IN ('entry', 'activity_credit', 'parking', 'food', 'drinks', 'kids_zone'));

-- ============================================
-- 3. Add seed data for Kids ticket & Kids Center / Playground
-- ============================================
INSERT INTO public.ticket_types (name, slug, type, price, capacity, sold, sort_order, metadata) VALUES
  ('Kids Ticket', 'kids-ticket', 'entry', 100, 500, 0, 10,
   '{"description": "Discounted entry for children aged 3–10 years"}'),
  ('Kids Center / Playground', 'kids-center-playground', 'kids_zone', 500, 200, 0, 11,
   '{"description": "Access to the dedicated Kids Center & Playground area", "hours": "12:00pm – 7:00pm", "age_range": "3 – 10 years"}')
ON CONFLICT (slug) DO NOTHING;

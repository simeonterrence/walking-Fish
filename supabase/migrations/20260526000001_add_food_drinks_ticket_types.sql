-- Migration: Add food and drinks ticket types
-- Extends the type CHECK constraint on ticket_types and tickets tables
-- to allow 'food' and 'drinks' as valid type values, then seeds default
-- Food Ticket and Drinks Ticket rows.

-- ============================================
-- 1. Extend ticket_types.type CHECK constraint
-- ============================================
ALTER TABLE public.ticket_types DROP CONSTRAINT IF EXISTS ticket_types_type_check;
ALTER TABLE public.ticket_types ADD CONSTRAINT ticket_types_type_check
  CHECK (type IN ('entry', 'activity_credit', 'parking', 'food', 'drinks'));

-- ============================================
-- 2. Extend tickets.type CHECK constraint
-- ============================================
ALTER TABLE public.tickets DROP CONSTRAINT IF EXISTS tickets_type_check;
ALTER TABLE public.tickets ADD CONSTRAINT tickets_type_check
  CHECK (type IN ('entry', 'activity_credit', 'parking', 'food', 'drinks'));

-- ============================================
-- 3. Add seed data for Food Ticket & Drinks Ticket
-- ============================================
INSERT INTO public.ticket_types (name, slug, type, price, capacity, sold, sort_order) VALUES
  ('Food Ticket', 'food-ticket', 'food', 200, 500, 0, 8),
  ('Drinks Ticket', 'drinks-ticket', 'drinks', 150, 500, 0, 9);

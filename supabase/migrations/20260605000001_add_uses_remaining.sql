-- Migration: Add uses_remaining support for multi-use tickets (e.g. Group Entry 5 Pax)
-- A single ticket can be scanned multiple times at the gate, with the scanner
-- showing how many entries remain after each scan.
--
-- Changes:
--   1. Add max_uses to ticket_types (default 1) — how many entries each ticket of this type allows
--   2. Add uses_remaining to tickets (nullable) — remaining entry count for multi-use tickets
--      NULL = single-use (regular entry/parking), must be treated as "1 use remaining"
--   3. Update mark_ticket_used RPC to decrement uses_remaining instead of immediately marking as used
--   4. Update group entry seed data to set max_uses = 5

-- ============================================
-- 1. Add max_uses to ticket_types
-- ============================================
ALTER TABLE public.ticket_types ADD COLUMN max_uses integer NOT NULL DEFAULT 1 CHECK (max_uses >= 1);

-- ============================================
-- 2. Add uses_remaining to tickets
-- ============================================
-- NULL = single-use (existing regular entry/parking tickets)
-- > 0 = multi-use (group entry tickets)
ALTER TABLE public.tickets ADD COLUMN uses_remaining integer CHECK (uses_remaining >= 0);

-- ============================================
-- 3. Update mark_ticket_used RPC
-- For multi-use tickets (uses_remaining > 0): decrement uses_remaining.
-- When uses_remaining reaches 0, mark status as 'used'.
-- For single-use tickets (uses_remaining IS NULL): existing behavior.
-- ============================================
CREATE OR REPLACE FUNCTION public.mark_ticket_used(p_ticket_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_status text;
  current_type text;
  remaining_uses integer;
BEGIN
  SELECT status, type, uses_remaining INTO current_status, current_type, remaining_uses
  FROM public.tickets
  WHERE id = p_ticket_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- Block balance-based tickets (should use /debit instead)
  IF current_type IN ('activity_credit', 'food', 'drinks') THEN
    RETURN false;
  END IF;

  -- Block already fully used/revoked tickets
  IF current_status = 'used' OR current_status = 'exhausted' OR current_status = 'revoked' THEN
    RETURN false;
  END IF;

  -- Multi-use ticket: decrement remaining uses
  IF remaining_uses IS NOT NULL AND remaining_uses > 1 THEN
    UPDATE public.tickets
    SET uses_remaining = uses_remaining - 1
    WHERE id = p_ticket_id;
    RETURN true;
  END IF;

  -- Last use of a multi-use ticket
  IF remaining_uses IS NOT NULL AND remaining_uses = 1 THEN
    UPDATE public.tickets
    SET uses_remaining = 0, status = 'used'
    WHERE id = p_ticket_id;
    RETURN true;
  END IF;

  -- Regular single-use ticket (uses_remaining IS NULL)
  UPDATE public.tickets
  SET status = 'used'
  WHERE id = p_ticket_id;

  RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mark_ticket_used FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_ticket_used TO authenticated;

-- ============================================
-- 4. Update group entry ticket type to allow 5 uses
-- ============================================
UPDATE public.ticket_types
SET max_uses = 5
WHERE slug = 'group-entry';

-- Fix mark_ticket_used RPC: return false when ticket not found
-- The previous version returned true even for non-existent ticket IDs
-- because SELECT INTO sets current_status to NULL, NULL != 'used' is false,
-- so it falls through to UPDATE (affects 0 rows) and returns true.

CREATE OR REPLACE FUNCTION public.mark_ticket_used(p_ticket_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_status text;
BEGIN
  SELECT status INTO current_status
  FROM public.tickets
  WHERE id = p_ticket_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF current_status = 'used' THEN
    RETURN false;
  END IF;

  UPDATE public.tickets
  SET status = 'used'
  WHERE id = p_ticket_id;

  RETURN true;
END;
$$;

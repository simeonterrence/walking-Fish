-- Guard mark_ticket_used RPC: reject balance-based tickets
-- Balance-based tickets (food, drinks, activity_credit) should use the
-- debit/reverse-debit system instead of being marked as 'used' via gate scan.
-- This prevents staff from accidentally marking a D200 food voucher as
-- "used" instead of debiting the correct amount from its balance.

CREATE OR REPLACE FUNCTION public.mark_ticket_used(p_ticket_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_status text;
  current_type text;
BEGIN
  SELECT status, type INTO current_status, current_type
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

  IF current_status = 'used' THEN
    RETURN false;
  END IF;

  UPDATE public.tickets
  SET status = 'used'
  WHERE id = p_ticket_id;

  RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mark_ticket_used FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_ticket_used TO authenticated;

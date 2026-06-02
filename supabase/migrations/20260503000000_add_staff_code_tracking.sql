-- Add staff_code column to balance_transactions for tracking which staff processed each transaction
ALTER TABLE balance_transactions ADD COLUMN IF NOT EXISTS staff_code text;

-- Update the update_ticket_balance RPC to accept and store staff_code
CREATE OR REPLACE FUNCTION update_ticket_balance(
  p_ticket_id uuid,
  p_amount_delta integer,
  p_txn_type text,
  p_source text,
  p_notes text DEFAULT NULL,
  p_staff_code text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  current_balance integer;
  new_balance integer;
  balance_cap_value integer;
BEGIN
  -- Lock the ticket row
  SELECT balance INTO current_balance
  FROM public.tickets
  WHERE id = p_ticket_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN -1;
  END IF;
  new_balance := current_balance + p_amount_delta;
  -- For debits (negative delta), check sufficient balance
  IF p_amount_delta < 0 AND new_balance < 0 THEN
    RETURN -1;
  END IF;
  -- For top-ups (positive delta), check balance cap
  IF p_amount_delta > 0 THEN
    SELECT COALESCE(NULLIF(value, ''), '5000')::integer INTO balance_cap_value
    FROM public.system_config
    WHERE key = 'balance_cap';
    IF new_balance > balance_cap_value THEN
      RETURN -1;
    END IF;
  END IF;
  -- Update ticket balance
  UPDATE public.tickets
  SET balance = new_balance
  WHERE id = p_ticket_id;
  -- Record the transaction
  INSERT INTO public.balance_transactions (ticket_id, type, amount_delta, balance_after, source, notes, staff_code)
  VALUES (p_ticket_id, p_txn_type, p_amount_delta, new_balance, p_source, p_notes, p_staff_code);
  RETURN new_balance;
END;
$$;

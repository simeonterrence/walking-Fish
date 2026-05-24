-- Fix: Rename variable `code` to `new_code` in generate_ticket_code()
-- to avoid ambiguous column reference with tickets.code column.
CREATE OR REPLACE FUNCTION public.generate_ticket_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_code text;
  done bool;
BEGIN
  done := false;
  WHILE NOT done LOOP
    new_code := 'TKT-' || upper(substr(md5(random()::text), 1, 6));
    done := NOT EXISTS (SELECT 1 FROM public.tickets WHERE tickets.code = new_code);
  END LOOP;
  RETURN new_code;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.generate_ticket_code FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_ticket_code TO service_role;

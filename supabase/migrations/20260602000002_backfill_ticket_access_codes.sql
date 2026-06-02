-- Migration: Backfill access_codes for tickets created before the feature was added
-- The /view-tickets flow requires each ticket to have a 6-digit access_code in
-- its metadata JSONB column so users can look up their tickets by email + code.
-- Tickets created before the access_code feature had qr_data_uri in metadata
-- but no access_code. This migration generates one for each affected ticket.

-- ============================================
-- Backfill: generate 6-digit access codes for
-- tickets that don't have one yet
-- ============================================
DO $$
DECLARE
  ticket_record RECORD;
  new_code TEXT;
  attempts INT;
  max_attempts INT := 10;
  code_unique BOOLEAN;
BEGIN
  FOR ticket_record IN
    SELECT id, code, metadata
    FROM public.tickets
    WHERE (metadata IS NULL OR metadata->>'access_code' IS NULL)
  LOOP
    -- Generate a unique 6-digit access code (with retry on collision)
    new_code := NULL;
    attempts := 0;
    code_unique := FALSE;

    WHILE NOT code_unique AND attempts < max_attempts LOOP
      new_code := LPAD(FLOOR(RANDOM() * 900000 + 100000)::TEXT, 6, '0');
      attempts := attempts + 1;

      -- Check uniqueness across ALL tickets (not just the current batch)
      SELECT NOT EXISTS (
        SELECT 1 FROM public.tickets
        WHERE metadata->>'access_code' = new_code
      ) INTO code_unique;
    END LOOP;

    IF NOT code_unique THEN
      RAISE WARNING 'Could not generate unique access_code for ticket % after % attempts', ticket_record.code, max_attempts;
      CONTINUE;
    END IF;

    -- Update metadata: if NULL, initialize with just the access_code;
    -- otherwise merge access_code into existing metadata
    IF ticket_record.metadata IS NULL OR ticket_record.metadata = '{}'::jsonb THEN
      UPDATE public.tickets
      SET metadata = jsonb_build_object('access_code', new_code)
      WHERE id = ticket_record.id;
    ELSE
      UPDATE public.tickets
      SET metadata = ticket_record.metadata || jsonb_build_object('access_code', new_code)
      WHERE id = ticket_record.id;
    END IF;

    RAISE NOTICE 'Ticket %: assigned access_code %', ticket_record.code, new_code;
  END LOOP;
END;
$$;

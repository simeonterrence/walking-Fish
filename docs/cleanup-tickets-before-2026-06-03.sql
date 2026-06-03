-- ═══════════════════════════════════════════════════════════════════════
-- CLEANUP SCRIPT: Archive & delete all tickets purchased on or before
-- June 3, 2026 @ 1:00 AM (UTC)
--
-- HOW TO RUN:
--   1. Open your Supabase Dashboard → SQL Editor
--   2. Paste this entire script
--   3. Run it (make sure the migration in
--      supabase/migrations/20260606000001_create_ticket_delete_audit.sql
--      has been applied first!)
--   4. Verify the data in the public.ticket_delete_audit table
--
-- WHAT IT DOES:
--   1. Archives EVERY ticket (with order + balance_transaction context)
--      to the ticket_delete_audit table
--   2. Resets all ticket_types.sold counters to 0 (fresh start)
--   3. Deletes all orders created on or before the cutoff
--      (CASCADE removes tickets, balance_transactions, payment_proofs)
--
-- ⚠️  THIS IS DESTRUCTIVE. Run in a transaction so you can roll back.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ── Config ──────────────────────────────────────────────────────────
-- Cutoff: June 3, 2026 @ 1:00 AM (Gambia = UTC+0, so same as UTC)
DO $$
DECLARE
  v_cutoff CONSTANT timestamptz := '2026-06-03 01:00:00+00';
  v_archived_tickets bigint;
  v_archived_orders bigint;
BEGIN

  -- ── Step 1: Archive all pre-cutoff tickets into the audit trail ──
  WITH archived AS (
    INSERT INTO public.ticket_delete_audit (
      ticket_id, ticket_code,
      ticket_type_name, ticket_type_slug, ticket_type_price,
      order_id, order_email, order_total, order_payment_method, order_status,
      ticket_type, ticket_status, ticket_balance, ticket_uses_remaining,
      customer_name, customer_email,
      deleted_by, deletion_reason,
      ticket_snapshot, balance_transactions
    )
    SELECT
      t.id, t.code,
      tt.name, tt.slug, tt.price,
      o.id, o.email, o.total, o.payment_method, o.status,
      t.type, t.status, t.balance, t.uses_remaining,
      t.customer_name, t.customer_email,
      'system_cleanup',
      'Bulk reset: all tickets purchased on or before 2026-06-03 01:00',
      row_to_json(t.*)::jsonb,
      COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', bt.id,
            'type', bt.type,
            'amount_delta', bt.amount_delta,
            'balance_after', bt.balance_after,
            'source', bt.source,
            'notes', bt.notes,
            'created_at', bt.created_at
          ) ORDER BY bt.created_at ASC
        )
        FROM public.balance_transactions bt
        WHERE bt.ticket_id = t.id
      ), '[]'::jsonb)
    FROM public.tickets t
    JOIN public.orders o ON o.id = t.order_id
    LEFT JOIN public.ticket_types tt ON t.ticket_type_id = tt.id
    WHERE o.created_at <= v_cutoff
    RETURNING 1
  )
  SELECT count(*) INTO v_archived_tickets FROM archived;

  RAISE NOTICE 'Archived % ticket(s) to ticket_delete_audit.', v_archived_tickets;

  -- ── Step 2: Reset all ticket_type sold counters to 0 ──
  UPDATE public.ticket_types SET sold = 0;

  RAISE NOTICE 'Reset all ticket_types.sold counters to 0.';

  -- ── Step 3: Delete archived orders (CASCADE handles tickets, txns, proofs) ──
  DELETE FROM public.orders WHERE created_at <= v_cutoff;

  GET DIAGNOSTICS v_archived_orders = ROW_COUNT;
  RAISE NOTICE 'Deleted % order(s) (and their cascaded tickets / balance_transactions).', v_archived_orders;

  RAISE NOTICE '✅ Cleanup complete. All pre-cutoff data is archived in ticket_delete_audit.';

END;
$$;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════
-- VERIFICATION (run after COMMIT to check):
-- ═══════════════════════════════════════════════════════════════════════
-- SELECT count(*) FROM public.ticket_delete_audit;
-- SELECT * FROM public.ticket_delete_audit ORDER BY deleted_at DESC LIMIT 10;
-- SELECT count(*) FROM public.tickets;  -- should be 0 or only post-cutoff
-- SELECT * FROM public.ticket_types ORDER BY sort_order;  -- sold should all be 0

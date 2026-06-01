-- Migration: Create processed_webhooks table for ModemPay webhook idempotency
--
-- This table was referenced by the ticketing Edge Function code but was never
-- created in any migration. Without it:
--   1. ModemPay webhook idempotency tracking doesn't work
--   2. Retried webhooks could theoretically create duplicate tickets
--   3. There's no audit trail of which webhook events were received
--
-- The table stores a record of each successfully processed webhook event
-- so that retries (which ModemPay sends) can be safely ignored.

CREATE TABLE public.processed_webhooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_event_id text NOT NULL UNIQUE,
  event_type text NOT NULL DEFAULT '',
  processed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.processed_webhooks ENABLE ROW LEVEL SECURITY;

-- The Edge Function uses the service role key, which bypasses RLS.
-- No public access needed — only for internal webhook tracking.

CREATE INDEX idx_processed_webhooks_event_id ON public.processed_webhooks(webhook_event_id);
CREATE INDEX idx_processed_webhooks_processed_at ON public.processed_webhooks(processed_at DESC);

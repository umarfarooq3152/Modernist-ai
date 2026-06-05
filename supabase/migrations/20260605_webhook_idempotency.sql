-- Migration: Idempotency table for Stripe webhook events
-- Prevents double-processing if Stripe retries the same event.

CREATE TABLE IF NOT EXISTS public.processed_webhook_events (
  id           BIGSERIAL PRIMARY KEY,
  event_id     TEXT NOT NULL UNIQUE,   -- Stripe event ID (evt_...)
  type         TEXT NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast duplicate lookups
CREATE INDEX IF NOT EXISTS idx_webhook_events_event_id
  ON public.processed_webhook_events (event_id);

-- No client should ever read or write this table directly
ALTER TABLE public.processed_webhook_events ENABLE ROW LEVEL SECURITY;

-- Service role (used by the edge function) bypasses RLS automatically
-- Deny all access from the anon/authenticated roles
CREATE POLICY "No client access"
  ON public.processed_webhook_events
  FOR ALL
  TO public
  USING (false);

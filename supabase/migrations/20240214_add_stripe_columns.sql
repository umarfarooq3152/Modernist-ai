
-- Migration: Add Stripe tracking columns to checkouts table
ALTER TABLE checkouts
  ADD COLUMN IF NOT EXISTS stripe_session_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_payment_intent TEXT;

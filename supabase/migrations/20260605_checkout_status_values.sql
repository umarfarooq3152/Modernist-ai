-- Migration: Expand checkout status to cover full payment lifecycle

-- If status is an enum, add new values; if it's a plain TEXT column this is a no-op.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'checkout_status'
  ) THEN
    -- Enum path
    ALTER TYPE checkout_status ADD VALUE IF NOT EXISTS 'payment_failed';
    ALTER TYPE checkout_status ADD VALUE IF NOT EXISTS 'refunded';
  END IF;
END$$;

-- If status is a TEXT column, add a CHECK constraint instead
-- (only runs if the column has no constraint yet)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'checkouts_status_check'
      AND table_name = 'checkouts'
  ) THEN
    ALTER TABLE public.checkouts
      ADD CONSTRAINT checkouts_status_check
      CHECK (status IN ('pending', 'completed', 'payment_failed', 'refunded', 'cancelled'));
  END IF;
END$$;

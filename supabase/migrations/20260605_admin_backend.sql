-- Migration: Admin backend supporting queries
-- Run in Supabase SQL Editor

-- 1. Ensure profiles has an email column (for admin order display)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email TEXT;

-- 2. Ensure checkout_items has an image_url column
ALTER TABLE public.checkout_items
  ADD COLUMN IF NOT EXISTS image_url TEXT;

-- 3. Foreign key from checkouts → profiles (for JOIN in admin orders)
--    Only adds if not already present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'checkouts_user_id_fkey'
      AND table_name = 'checkouts'
  ) THEN
    ALTER TABLE public.checkouts
      ADD CONSTRAINT checkouts_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
END$$;

-- 4. Foreign key from reviews → products
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'reviews_product_id_fkey'
      AND table_name = 'reviews'
  ) THEN
    ALTER TABLE public.reviews
      ADD CONSTRAINT reviews_product_id_fkey
      FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;
  END IF;
END$$;

-- 5. Foreign key from checkout_items → checkouts
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'checkout_items_order_id_fkey'
      AND table_name = 'checkout_items'
  ) THEN
    ALTER TABLE public.checkout_items
      ADD CONSTRAINT checkout_items_order_id_fkey
      FOREIGN KEY (order_id) REFERENCES public.checkouts(id) ON DELETE CASCADE;
  END IF;
END$$;

-- 6. Indexes for common admin queries
CREATE INDEX IF NOT EXISTS idx_checkouts_status ON public.checkouts(status);
CREATE INDEX IF NOT EXISTS idx_checkouts_created_at ON public.checkouts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reviews_product_id ON public.reviews(product_id);
CREATE INDEX IF NOT EXISTS idx_reviews_rating ON public.reviews(rating);
CREATE INDEX IF NOT EXISTS idx_clerk_logs_status ON public.clerk_logs(status);
CREATE INDEX IF NOT EXISTS idx_clerk_logs_created_at ON public.clerk_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_products_category ON public.products(category);

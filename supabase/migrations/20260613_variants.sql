-- Product variants: sizes and colors
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS variants JSONB NOT NULL DEFAULT '{"sizes": [], "colors": []}';

-- Record selected variant per line item for order history
ALTER TABLE public.checkout_items
  ADD COLUMN IF NOT EXISTS selected_size  TEXT,
  ADD COLUMN IF NOT EXISTS selected_color TEXT;

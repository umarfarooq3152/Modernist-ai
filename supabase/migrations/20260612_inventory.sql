-- ============================================================
-- Migration: Inventory tracking + Supabase Realtime
-- ============================================================

-- 1. Stock columns on products
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS stock_quantity   INTEGER NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS low_stock_threshold INTEGER NOT NULL DEFAULT 10;

-- 2. Inventory log — records every stock movement
CREATE TABLE IF NOT EXISTS public.inventory_logs (
  id           BIGSERIAL PRIMARY KEY,
  product_id   TEXT        NOT NULL,
  delta        INTEGER     NOT NULL,          -- positive = restock, negative = sold/adj
  reason       TEXT        NOT NULL,          -- 'sale', 'manual_adjustment', 'restock'
  order_id     TEXT,                          -- linked checkout id if reason = 'sale'
  created_by   UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inventory_logs_product ON public.inventory_logs(product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_logs_created ON public.inventory_logs(created_at DESC);

-- RLS: admins read/write; service role used by webhook for inserts
ALTER TABLE public.inventory_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage inventory logs"
  ON public.inventory_logs
  FOR ALL
  TO authenticated
  USING  (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- 3. Enable Supabase Realtime on the tables we need live updates from
ALTER PUBLICATION supabase_realtime ADD TABLE public.checkouts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.products;

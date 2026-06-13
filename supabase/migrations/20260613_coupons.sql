-- Manual coupon / concession code management
CREATE TABLE IF NOT EXISTS public.coupons (
  id               BIGSERIAL    PRIMARY KEY,
  code             TEXT         NOT NULL UNIQUE,
  discount_percent INTEGER      NOT NULL CHECK (discount_percent > 0 AND discount_percent <= 100),
  max_uses         INTEGER,
  uses_count       INTEGER      NOT NULL DEFAULT 0,
  expires_at       TIMESTAMPTZ,
  is_active        BOOLEAN      NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT now()
);

ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;

-- Admins: full CRUD
CREATE POLICY "Admins manage coupons" ON public.coupons
  FOR ALL TO authenticated
  USING  (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- Authenticated users: read active, non-expired codes for cart validation
CREATE POLICY "Users validate coupons" ON public.coupons
  FOR SELECT TO authenticated
  USING (is_active = true AND (expires_at IS NULL OR expires_at > now()));

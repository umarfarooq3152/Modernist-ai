-- ============================================================
-- Migration: Enforce Row-Level Security across all tables
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor)
-- ============================================================

-- Helper: check if the calling user is an admin
-- Avoids a recursive profile lookup by reading directly from auth.jwt() claims
-- or falling back to a profiles lookup.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- ============================================================
-- PRODUCTS
-- ============================================================
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public Read" ON public.products;
DROP POLICY IF EXISTS "Admin Insert" ON public.products;
DROP POLICY IF EXISTS "Admin Update" ON public.products;
DROP POLICY IF EXISTS "Admin Delete" ON public.products;

-- Anyone (including unauthenticated) can read products
CREATE POLICY "Public Read"
  ON public.products FOR SELECT
  TO public
  USING (true);

-- Only admins can create/modify/delete products
CREATE POLICY "Admin Insert"
  ON public.products FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "Admin Update"
  ON public.products FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Admin Delete"
  ON public.products FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- ============================================================
-- PROFILES
-- ============================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admin read all profiles" ON public.profiles;

-- Users can read their own profile; admins can read all
CREATE POLICY "Owner or admin read"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id OR public.is_admin());

-- Unauthenticated users cannot read any profile
-- (public storefront doesn't need to list profiles)

-- Users can create their own profile (on sign-up)
CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- Users can only update their own profile; admins can update any
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id OR public.is_admin())
  WITH CHECK (auth.uid() = id OR public.is_admin());

-- ============================================================
-- REVIEWS
-- ============================================================
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read reviews" ON public.reviews;
DROP POLICY IF EXISTS "Auth users insert review" ON public.reviews;
DROP POLICY IF EXISTS "Owner delete review" ON public.reviews;

-- Anyone can read reviews
CREATE POLICY "Public read reviews"
  ON public.reviews FOR SELECT
  TO public
  USING (true);

-- Authenticated users can submit a review (one per product is enforced in app logic)
CREATE POLICY "Auth users insert review"
  ON public.reviews FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own review; admins can delete any
CREATE POLICY "Owner or admin delete review"
  ON public.reviews FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id OR public.is_admin());

-- ============================================================
-- CHECKOUTS (orders)
-- ============================================================
ALTER TABLE public.checkouts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own checkouts" ON public.checkouts;
DROP POLICY IF EXISTS "Users insert own checkout" ON public.checkouts;
DROP POLICY IF EXISTS "Admin read all checkouts" ON public.checkouts;
DROP POLICY IF EXISTS "Service role update checkout" ON public.checkouts;

-- Users can only see their own orders
CREATE POLICY "Users read own checkouts"
  ON public.checkouts FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.is_admin());

-- Users can create a checkout for themselves
CREATE POLICY "Users insert own checkout"
  ON public.checkouts FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Updates (e.g. status = 'completed') are done by the webhook via service role key
-- Service role bypasses RLS by default, so no explicit policy needed for that path.
-- Admin can also update manually.
CREATE POLICY "Admin update checkout"
  ON public.checkouts FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ============================================================
-- CHECKOUT_ITEMS
-- ============================================================
ALTER TABLE public.checkout_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own checkout items" ON public.checkout_items;
DROP POLICY IF EXISTS "Users insert checkout items" ON public.checkout_items;

-- Users can read items that belong to their own orders
CREATE POLICY "Users read own checkout items"
  ON public.checkout_items FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.checkouts
      WHERE checkouts.id::text = checkout_items.order_id
        AND (checkouts.user_id = auth.uid() OR public.is_admin())
    )
  );

-- Users can insert items for their own checkouts
CREATE POLICY "Users insert checkout items"
  ON public.checkout_items FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.checkouts
      WHERE checkouts.id::text = checkout_items.order_id
        AND checkouts.user_id = auth.uid()
    )
  );

-- ============================================================
-- CLERK_LOGS (AI bargaining audit trail)
-- ============================================================
ALTER TABLE public.clerk_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users insert own clerk log" ON public.clerk_logs;
DROP POLICY IF EXISTS "Admin read clerk logs" ON public.clerk_logs;

-- Authenticated users can log their own negotiations
CREATE POLICY "Users insert own clerk log"
  ON public.clerk_logs FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

-- Only admins can read the full negotiation log (admin panel)
CREATE POLICY "Admin read clerk logs"
  ON public.clerk_logs FOR SELECT
  TO authenticated
  USING (public.is_admin());

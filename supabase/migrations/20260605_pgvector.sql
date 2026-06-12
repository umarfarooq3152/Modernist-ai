-- ============================================================
-- Migration: pgvector + match_products RPC + wishlist
-- Run in Supabase SQL Editor (Dashboard → SQL Editor)
-- ============================================================

-- 1. Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Add 384-dimension embedding column to products
--    (gte-small model produces 384-dim vectors)
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS embedding vector(384);

-- 3. IVFFlat index for fast approximate nearest-neighbour search
--    lists = ceil(sqrt(row_count)) — tune after data load
CREATE INDEX IF NOT EXISTS idx_products_embedding
  ON public.products
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 50);

-- 4. Core similarity search function
--    Called by the rag-search edge function with a query embedding
DROP FUNCTION IF EXISTS match_products(vector, float, int);

CREATE OR REPLACE FUNCTION public.match_products(
  query_embedding  vector(384),
  match_threshold  float    DEFAULT 0.3,
  match_count      int      DEFAULT 10
)
RETURNS TABLE (
  id          text,
  name        text,
  description text,
  price       float8,
  bottom_price float8,
  category    text,
  image_url   text,
  tags        text[],
  similarity  float
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    p.id::text,
    p.name,
    p.description,
    p.price::float8,
    p.bottom_price::float8,
    p.category,
    p.image_url,
    p.tags,
    1 - (p.embedding <=> query_embedding) AS similarity
  FROM public.products p
  WHERE p.embedding IS NOT NULL
    AND 1 - (p.embedding <=> query_embedding) >= match_threshold
  ORDER BY p.embedding <=> query_embedding
  LIMIT match_count;
$$;

-- 5. Find similar products to a given product (for recommendations)
DROP FUNCTION IF EXISTS similar_products(text, int);

CREATE OR REPLACE FUNCTION public.similar_products(
  source_product_id  text,
  match_count        int DEFAULT 4
)
RETURNS TABLE (
  id          text,
  name        text,
  price       float8,
  category    text,
  image_url   text,
  tags        text[],
  similarity  float
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    p.id::text,
    p.name,
    p.price::float8,
    p.category,
    p.image_url,
    p.tags,
    1 - (p.embedding <=> src.embedding) AS similarity
  FROM public.products p
  CROSS JOIN (
    SELECT embedding FROM public.products WHERE id::text = source_product_id
  ) src
  WHERE p.embedding IS NOT NULL
    AND p.id::text <> source_product_id
  ORDER BY p.embedding <=> src.embedding
  LIMIT match_count;
$$;

-- ============================================================
-- Wishlist table
-- ============================================================

CREATE TABLE IF NOT EXISTS public.wishlists (
  id         BIGSERIAL PRIMARY KEY,
  user_id    UUID    NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id TEXT    NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_wishlists_user_id    ON public.wishlists(user_id);
CREATE INDEX IF NOT EXISTS idx_wishlists_product_id ON public.wishlists(product_id);

-- RLS: users can only see and manage their own wishlist items
ALTER TABLE public.wishlists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own wishlist"
  ON public.wishlists
  FOR ALL
  TO authenticated
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

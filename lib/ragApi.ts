/**
 * ragApi — client wrapper for the rag-search Supabase Edge Function.
 *
 * The rag-search function handles:
 *  - Query embedding (server-side, same model as stored embeddings)
 *  - pgvector similarity search
 *  - Optional LLM-generated explanation
 *
 * This replaces the browser-based HuggingFace model download (~768MB).
 */

import { supabase } from './supabase';
import { Product } from '../types';

export interface RAGResult {
  id: string;
  name: string;
  description: string;
  price: number;
  bottom_price: number;
  category: string;
  image_url: string;
  tags: string[];
  similarity: number;
}

export interface RAGSearchResponse {
  results: RAGResult[];
  query: string | null;
  explanation: string | null;
}

const EDGE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/rag-search`;

async function edgeFetch(body: object): Promise<RAGSearchResponse> {
  const res = await fetch(EDGE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: import.meta.env.VITE_SUPABASE_ANON_KEY },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || 'rag-search failed');
  }
  return res.json();
}

/** Semantic product search — returns ranked products + optional LLM explanation */
export async function semanticSearch(
  query: string,
  opts: { matchThreshold?: number; matchCount?: number; explain?: boolean } = {}
): Promise<RAGSearchResponse> {
  return edgeFetch({
    query,
    match_threshold: opts.matchThreshold ?? 0.3,
    match_count: opts.matchCount ?? 8,
    explain: opts.explain ?? false,
  });
}

/** Get products similar to a given product (for recommendations) */
export async function similarProducts(
  productId: string,
  count = 4
): Promise<RAGResult[]> {
  const res = await edgeFetch({ source_product_id: productId, match_count: count });
  return res.results;
}

/** Map RAGResult back to the Product type used by the store */
export function ragResultToProduct(r: RAGResult, allProducts: Product[]): Product {
  return allProducts.find(p => p.id === r.id) ?? {
    id: r.id,
    name: r.name,
    description: r.description,
    price: r.price,
    bottom_price: r.bottom_price,
    category: r.category,
    image_url: r.image_url,
    tags: r.tags,
    reviews: [],
  } as Product;
}

/** Wishlist helpers — thin wrappers around Supabase client */
export const wishlistApi = {
  async getAll(): Promise<string[]> {
    const { data } = await supabase.from('wishlists').select('product_id');
    return (data || []).map((r: any) => r.product_id);
  },

  async add(productId: string): Promise<void> {
    await supabase.from('wishlists').insert({ product_id: productId });
  },

  async remove(productId: string): Promise<void> {
    await supabase.from('wishlists').delete().eq('product_id', productId);
  },

  async toggle(productId: string, currentlySaved: boolean): Promise<boolean> {
    if (currentlySaved) {
      await wishlistApi.remove(productId);
      return false;
    } else {
      await wishlistApi.add(productId);
      return true;
    }
  },
};

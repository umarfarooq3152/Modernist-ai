/**
 * Supabase RPC-based RAG Search
 * 
 * Calls the `match_products` Postgres function for vector similarity search.
 * This is the server-side / Supabase companion to the in-browser embedding search.
 * 
 * Workflow:
 * 1. Embed the user query via Transformers.js (in-browser)
 * 2. Call Supabase RPC `match_products` with the embedding vector
 * 3. Return ranked products with similarity scores and bottom_price
 */

import { supabase } from './supabase';
import { getLocalEmbedding } from './embeddings';
import { Product } from '../types';

export interface SupabaseRAGResult {
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

export interface SupabaseRAGOptions {
  query: string;
  matchThreshold?: number;
  matchCount?: number;
  category?: string;
  minPrice?: number;
  maxPrice?: number;
}

/**
 * Search products via Supabase RPC `match_products` using vector embeddings.
 * Falls back gracefully if the RPC function doesn't exist yet.
 */
export async function searchViaSupabaseRPC(
  options: SupabaseRAGOptions
): Promise<SupabaseRAGResult[]> {
  const {
    query,
    matchThreshold = 0.5,
    matchCount = 5,
    category,
    minPrice,
    maxPrice,
  } = options;

  try {
    // Step 1: Generate embedding vector from user query using Transformers.js
    const queryEmbedding = await getLocalEmbedding(query);

    // Step 2: Call Supabase RPC function `match_products`
    const { data, error } = await supabase.rpc('match_products', {
      query_embedding: queryEmbedding,
      match_threshold: matchThreshold,
      match_count: matchCount,
    });

    if (error) {
      console.warn('[SupabaseRAG] RPC match_products failed:', error.message);
      return [];
    }

    if (!data || !Array.isArray(data)) {
      console.warn('[SupabaseRAG] No results from match_products');
      return [];
    }

    // Step 3: Apply client-side filters (category, price)
    let results: SupabaseRAGResult[] = data.map((row: any) => ({
      id: row.id,
      name: row.name,
      description: row.description || '',
      price: Number(row.price),
      bottom_price: Number(row.bottom_price || row.price * 0.7),
      category: row.category || '',
      image_url: row.image_url || '',
      tags: Array.isArray(row.tags) ? row.tags : [],
      similarity: Number(row.similarity),
    }));

    if (category && category !== 'All') {
      results = results.filter(r => r.category.toLowerCase() === category.toLowerCase());
    }
    if (minPrice !== undefined) {
      results = results.filter(r => r.price >= minPrice);
    }
    if (maxPrice !== undefined) {
      results = results.filter(r => r.price <= maxPrice);
    }

    return results;
  } catch (err: any) {
    console.warn('[SupabaseRAG] Search failed:', err.message);
    return [];
  }
}

/**
 * Hybrid search: try Supabase RPC first, fall back to local embeddings.
 * Returns products matched to the local Product[] array for UI compatibility.
 */
export async function hybridRAGSearch(
  options: SupabaseRAGOptions,
  allProducts: Product[],
  localEmbeddingsCache: Map<string, number[]>
): Promise<{ products: Product[]; source: 'supabase' | 'local' | 'fallback' }> {
  // Attempt 1: Supabase RPC vector search
  try {
    const supabaseResults = await searchViaSupabaseRPC(options);
    if (supabaseResults.length > 0) {
      // Map Supabase results back to local Product objects for UI consistency
      const matchedProducts = supabaseResults
        .map(sr => {
          const localProduct = allProducts.find(p => p.id === sr.id);
          return localProduct || null;
        })
        .filter((p): p is Product => p !== null);

      if (matchedProducts.length > 0) {
        return { products: matchedProducts, source: 'supabase' };
      }
    }
  } catch (err) {
    console.warn('[HybridRAG] Supabase search unavailable, falling back to local');
  }

  // Attempt 2: Local in-browser embedding search
  if (localEmbeddingsCache.size > 0) {
    try {
      const { cosineSimilarity } = await import('./embeddings');
      const queryEmbedding = await getLocalEmbedding(options.query);

      const scored = allProducts
        .filter(p => localEmbeddingsCache.has(p.id))
        .map(p => ({
          product: p,
          score: cosineSimilarity(queryEmbedding, localEmbeddingsCache.get(p.id)!),
        }))
        .filter(s => s.score >= 0.35)
        .sort((a, b) => b.score - a.score)
        .slice(0, options.matchCount || 5);

      // Apply filters
      let results = scored.map(s => s.product);
      if (options.category && options.category !== 'All') {
        results = results.filter(p => p.category.toLowerCase() === options.category!.toLowerCase());
      }
      if (options.minPrice !== undefined) {
        results = results.filter(p => p.price >= options.minPrice!);
      }
      if (options.maxPrice !== undefined) {
        results = results.filter(p => p.price <= options.maxPrice!);
      }

      if (results.length > 0) {
        return { products: results, source: 'local' };
      }
    } catch (err) {
      console.warn('[HybridRAG] Local embedding search failed');
    }
  }

  // Attempt 3: Keyword fallback
  const query = options.query.toLowerCase();
  const keywords = query.split(/\s+/).filter(w => w.length > 2);
  let fallbackResults = allProducts.filter(p => {
    const text = `${p.name} ${p.description} ${p.tags.join(' ')} ${p.category}`.toLowerCase();
    return keywords.some(k => text.includes(k));
  });

  if (options.category && options.category !== 'All') {
    fallbackResults = fallbackResults.filter(p => p.category.toLowerCase() === options.category!.toLowerCase());
  }
  if (options.minPrice !== undefined) {
    fallbackResults = fallbackResults.filter(p => p.price >= options.minPrice!);
  }
  if (options.maxPrice !== undefined) {
    fallbackResults = fallbackResults.filter(p => p.price <= options.maxPrice!);
  }

  return {
    products: fallbackResults.slice(0, options.matchCount || 5),
    source: 'fallback',
  };
}

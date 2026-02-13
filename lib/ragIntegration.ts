/**
 * RAG Integration Module for AI Clerk
 * Handles search_inventory tool calls with hybrid RAG:
 * 1. Supabase RPC (match_products) — server-side vector search
 * 2. Local in-browser embeddings (Transformers.js) — fallback
 * 3. Keyword search — last resort
 */

import { Product } from '../types';
import { searchInventoryRAG, formatSearchResultsForClerk, extractPriceFilters, extractCategoryFromQuery } from './ragSearch';
import { hybridRAGSearch } from './supabaseRAG';

export interface RAGSearchRequest {
  query: string;
  category?: string;
  maxResults?: number;
  minPrice?: number;
  maxPrice?: number;
}

export interface RAGSearchResponse {
  success: boolean;
  query: string;
  results: Product[];
  formattedResponse: string;
  matchSummary: string;
  error?: string;
}

/**
 * Execute a RAG-based search_inventory call
 * This is called when the AI's tool execution reaches search_inventory
 */
export async function executeRAGSearch(
  request: RAGSearchRequest,
  allProducts: Product[],
  productEmbeddingsCache: Map<string, number[]>
): Promise<RAGSearchResponse> {
  try {
    // Extract filters from natural language query
    const priceFilters = extractPriceFilters(request.query);
    const categoryFromQuery = extractCategoryFromQuery(request.query);

    const searchOptions = {
      query: request.query,
      category: request.category || categoryFromQuery,
      minPrice: request.minPrice || priceFilters.minPrice,
      maxPrice: request.maxPrice || priceFilters.maxPrice,
      maxResults: request.maxResults || 5,
    };

    // Execute RAG search
    const results = await searchInventoryRAG(
      searchOptions,
      allProducts,
      productEmbeddingsCache
    );

    // Format for display
    const formattedResponse = formatSearchResultsForClerk(results);
    const productResults = results.map(r => r.product);

    // Build match summary for the Clerk's response
    let matchSummary = '';
    if (results.length === 0) {
      matchSummary = 'No matches found';
    } else if (results.length === 1) {
      matchSummary = `Found 1 matching piece`;
    } else {
      const avgConfidence = Math.round(
        (results.reduce((sum, r) => sum + r.similarity_score, 0) / results.length) * 100
      );
      matchSummary = `Found ${results.length} matching pieces (${avgConfidence}% confidence)`;
    }

    return {
      success: true,
      query: request.query,
      results: productResults,
      formattedResponse,
      matchSummary,
    };
  } catch (error: any) {
    console.error('RAG search error:', error);
    return {
      success: false,
      query: request.query,
      results: [],
      formattedResponse: 'Search failed. Please try a different query.',
      matchSummary: 'Error',
      error: error.message,
    };
  }
}

/**
 * For Groq function calling: handle search_inventory tool
 * Returns formatted response and products for the UI
 */
export async function handleSearchInventoryToolCall(
  args: any,
  allProducts: Product[],
  productEmbeddingsCache: Map<string, number[]>
): Promise<{
  assistantMessage: string;
  products: Product[];
  error?: boolean;
}> {
  const query = (args.query || '').trim();
  
  // Validate query
  if (!query || query.length < 2) {
    return {
      assistantMessage: 'I need a more specific search query. What are you looking for?',
      products: [],
      error: true,
    };
  }

  // Execute RAG search
  const ragResult = await executeRAGSearch(
    {
      query,
      category: args.category,
      maxResults: args.max_results || 5,
      minPrice: args.min_price,
      maxPrice: args.max_price,
    },
    allProducts,
    productEmbeddingsCache
  );

  if (!ragResult.success || ragResult.results.length === 0) {
    return {
      assistantMessage: ragResult.error || 'No products match your search. Refine your query and try again.',
      products: [],
      error: true,
    };
  }

  // Generate Clerk-style response
  const responses = [
    `${ragResult.matchSummary}. Let me show you pieces that command attention.`,
    `The archive reveals ${ragResult.matchSummary.toLowerCase()}. Each one earns its place.`,
    `Curated for you: ${ragResult.matchSummary.toLowerCase()}. These carry weight.`,
    `Here's what we have that matches your vision — ${ragResult.matchSummary.toLowerCase()}.`,
    `${ragResult.matchSummary}. The floor's been arranged — take a look.`,
  ];

  return {
    assistantMessage: responses[Math.floor(Math.random() * responses.length)],
    products: ragResult.results,
  };
}

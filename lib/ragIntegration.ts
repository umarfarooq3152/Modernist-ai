/**
 * RAG Integration Module for AI Clerk
 * Handles search_inventory tool calls with vector-based RAG
 * Primary path: Supabase RPC `match_products` (pgvector)
 * Fallback path: Local Transformers.js embeddings + cosine similarity
 */

import { Product } from '../types';
import { searchInventoryViaSupabase, searchInventoryRAG, formatSearchResultsForClerk, extractPriceFilters, extractCategoryFromQuery } from './ragSearch';

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

    // Execute RAG search — try Supabase RPC first, then fall back to local embeddings
    let results;
    try {
      results = await searchInventoryViaSupabase(
        searchOptions,
        allProducts,
        productEmbeddingsCache
      );
    } catch (supabaseErr) {
      console.warn('[RAG] Supabase path failed, using local fallback:', supabaseErr);
      results = await searchInventoryRAG(
        searchOptions,
        allProducts,
        productEmbeddingsCache
      );
    }

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
  // Type coercion: Convert string numbers to actual numbers
  // (AI sometimes passes "1000" instead of 1000 despite schema)
  if (typeof args.max_results === 'string') args.max_results = parseInt(args.max_results, 10);
  if (typeof args.min_price === 'string') args.min_price = parseFloat(args.min_price);
  if (typeof args.max_price === 'string') args.max_price = parseFloat(args.max_price);
  
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
    // Zero results: Auto-retry with a broader query (drop filters, widen search)
    console.log(`[RAG] 0 results for "${query}", retrying with broader terms...`);
    
    // Extract the core intent words (strip price/category qualifiers)
    const broadQuery = query
      .replace(/under\s*\$?\d+/gi, '')
      .replace(/over\s*\$?\d+/gi, '')
      .replace(/less than\s*\$?\d+/gi, '')
      .replace(/between\s*\$?\d+\s*(and|-)\s*\$?\d+/gi, '')
      .replace(/\b(cheap|expensive|affordable|budget|luxury|premium)\b/gi, '')
      .trim() || 'popular bestseller';

    const retryResult = await executeRAGSearch(
      { query: broadQuery, maxResults: 5 },
      allProducts,
      productEmbeddingsCache
    );

    if (retryResult.success && retryResult.results.length > 0) {
      const altResponses = [
        `I don't have exactly that, but let me show you our most popular alternatives. ${retryResult.matchSummary}.`,
        `Nothing matched "${query}" precisely, but these pieces carry a similar energy. ${retryResult.matchSummary}.`,
        `That's a very specific ask — I respect it. Here's what's closest in our archive. ${retryResult.matchSummary}.`,
      ];
      return {
        assistantMessage: altResponses[Math.floor(Math.random() * altResponses.length)],
        products: retryResult.results,
      };
    }

    return {
      assistantMessage: ragResult.error || 'No products match your search. Try describing the vibe, occasion, or style you\'re going for.',
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

/**
 * Handle generate_coupon tool call — validates against bottom_price and injects coupon into cart session
 */
export interface CouponResult {
  success: boolean;
  couponCode: string;
  discountPercent: number;
  reason: string;
  refused: boolean;
  message: string;
}

export function handleGenerateCouponToolCall(
  args: {
    code?: string;
    discount?: number;
    reason?: string;
    sentiment?: string;
  },
  cartItems: { product: Product; quantity: number }[],
  rudenessScore: number
): CouponResult {
  // Type coercion: Convert string numbers to actual numbers
  if (typeof args.discount === 'string') {
    args.discount = parseFloat(args.discount);
  }
  
  const sentiment = (args.sentiment || 'neutral').toLowerCase();

  // SPINE: Refuse rude users entirely, apply surcharge
  if (rudenessScore >= 3 || sentiment === 'rude') {
    const surchargePercent = Math.min(rudenessScore * 5, 25);
    return {
      success: false,
      couponCode: `RUDE-${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
      discountPercent: -surchargePercent, // Negative = surcharge
      reason: 'Attitude surcharge',
      refused: true,
      message: `Nice try, but manners matter at MODERNIST. Prices just went up ${surchargePercent}%. Come back with a better attitude.`,
    };
  }

  // Cart must have items
  if (cartItems.length === 0) {
    return {
      success: false,
      couponCode: '',
      discountPercent: 0,
      reason: '',
      refused: false,
      message: 'Add some pieces to your bag first, then we can talk numbers!',
    };
  }

  // Calculate floor (sum of bottom_prices)
  const subtotal = cartItems.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  const floor = cartItems.reduce((sum, item) => sum + item.product.bottom_price * item.quantity, 0);

  // Cap discount: max 20% for <3 items, max 25% for 3+
  let discountPercent = Math.min(args.discount || 10, cartItems.length >= 3 ? 25 : 20);

  // Ensure discounted total stays above the floor
  const discountedTotal = Math.round(subtotal * (1 - discountPercent / 100));
  if (discountedTotal < floor) {
    // Reduce discount to floor-safe maximum
    discountPercent = Math.max(1, Math.round(((subtotal - floor) / subtotal) * 100));
  }

  const couponCode = args.code || generateCouponCodeFromReason(args.reason || 'Negotiated', discountPercent);

  return {
    success: true,
    couponCode,
    discountPercent,
    reason: args.reason || 'Archival Concession',
    refused: false,
    message: `${discountPercent}% concession granted. Coupon ${couponCode} has been applied to your bag.`,
  };
}

/** Generate a coupon code string from the reason */
function generateCouponCodeFromReason(reason: string, percent: number): string {
  const prefixes: Record<string, string> = {
    birthday: 'BDAY', loyal: 'LOYAL', bulk: 'BULK', student: 'STUDENT',
    first: 'WELCOME', holiday: 'HOLIDAY', friend: 'FRIEND', military: 'HONOR',
    buying: 'MULTI', default: 'CLERK',
  };
  const reasonLower = (reason || '').toLowerCase();
  let prefix = prefixes.default;
  for (const [key, val] of Object.entries(prefixes)) {
    if (reasonLower.includes(key)) { prefix = val; break; }
  }
  const suffix = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefix}-${percent}-${suffix}`;
}

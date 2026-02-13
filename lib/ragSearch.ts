/**
 * RAG Search Utility — Vector-based Product Search
 * 
 * This module implements Retrieval-Augmented Generation (RAG) for product search.
 * It uses in-browser embeddings (Xenova/all-MiniLM-L6-v2) to find semantically similar products.
 * 
 * Workflow:
 * 1. User query → Generate embedding
 * 2. Compare against all product embeddings (cached)
 * 3. Return top N results sorted by similarity
 * 4. Include bottom_price for negotiation logic
 */

import { Product } from '../types';
import { getLocalEmbedding, cosineSimilarity } from './embeddings';

interface SearchResult {
  product: Product;
  similarity_score: number;
  match_reason: string;
}

interface SearchOptions {
  query: string;
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  maxResults?: number;
}

/**
 * Generate embeddings for products (cached after first call)
 * This happens on AI chat open to avoid delays during search
 */
export async function generateProductEmbeddings(
  products: Product[]
): Promise<Map<string, number[]>> {
  const embeddingMap = new Map<string, number[]>();
  
  for (const product of products) {
    try {
      // Combine product name, description, tags for rich semantic context
      const text = `${product.name} ${product.description} ${product.tags?.join(' ') || ''} ${product.category}`;
      const embedding = await getLocalEmbedding(text);
      embeddingMap.set(product.id, embedding);
    } catch (error) {
      console.error(`Failed to embed product ${product.id}:`, error);
    }
  }
  
  return embeddingMap;
}

/**
 * Search products using vector similarity (RAG)
 * 
 * This is the core RAG function that:
 * 1. Embeds the user query
 * 2. Finds top N semantically similar products
 * 3. Applies filters (category, price)
 * 4. Returns results with similarity scores and match reasoning
 */
export async function searchInventoryRAG(
  options: SearchOptions,
  allProducts: Product[],
  productEmbeddingsCache: Map<string, number[]>
): Promise<SearchResult[]> {
  const {
    query,
    category,
    minPrice,
    maxPrice,
    maxResults = 5,
  } = options;

  if (!query || query.trim().length === 0) {
    return [];
  }

  try {
    // Step 1: Generate embedding for the user's query
    let queryEmbedding: number[];
    try {
      queryEmbedding = await getLocalEmbedding(query);
    } catch (error) {
      console.error('Failed to embed query:', error);
      // Fallback to category/keyword matching if embedding fails
      return fallbackKeywordSearch(options, allProducts);
    }

    // Step 2: Score all products against the query
    const scoredProducts: SearchResult[] = allProducts
      .map((product) => {
        const productEmbedding = productEmbeddingsCache.get(product.id);
        
        if (!productEmbedding) {
          // Skip if no embedding cached
          return null;
        }

        // Calculate cosine similarity
        const similarity = cosineSimilarity(queryEmbedding, productEmbedding);
        
        // Bonus scoring for exact keyword matches
        let bonusScore = 0;
        const queryLower = query.toLowerCase();
        const nameLower = product.name.toLowerCase();
        
        if (nameLower.includes(queryLower)) {
          bonusScore += 0.2; // Name match is strong signal
        }
        
        if (product.tags?.some(tag => queryLower.includes(tag.toLowerCase()))) {
          bonusScore += 0.1; // Tag match
        }
        
        if (product.category.toLowerCase().includes(queryLower)) {
          bonusScore += 0.1; // Category match
        }

        const finalScore = Math.min(similarity + bonusScore, 1.0);

        return {
          product,
          similarity_score: finalScore,
          match_reason: getMatchReason(product, query, similarity, bonusScore),
        };
      })
      .filter((result): result is SearchResult => result !== null)
      .filter((result) => {
        // Apply filters
        if (category && result.product.category !== category) {
          return false;
        }
        if (minPrice && result.product.price < minPrice) {
          return false;
        }
        if (maxPrice && result.product.price > maxPrice) {
          return false;
        }
        return true;
      })
      .sort((a, b) => b.similarity_score - a.similarity_score)
      .slice(0, maxResults);

    return scoredProducts;
  } catch (error) {
    console.error('RAG search failed:', error);
    return fallbackKeywordSearch(options, allProducts);
  }
}

/**
 * Fallback keyword matching when embeddings fail
 */
function fallbackKeywordSearch(
  options: SearchOptions,
  allProducts: Product[]
): SearchResult[] {
  const { query, category, minPrice, maxPrice, maxResults = 5 } = options;
  const queryLower = query.toLowerCase();
  const queryWords = queryLower.split(/\s+/);

  const results = allProducts
    .map((product) => {
      let matchScore = 0;
      let reasons: string[] = [];

      // Check name
      if (product.name.toLowerCase().includes(queryLower)) {
        matchScore += 10;
        reasons.push('name match');
      } else {
        // Check individual words in name
        queryWords.forEach((word) => {
          if (product.name.toLowerCase().includes(word)) {
            matchScore += 2;
          }
        });
      }

      // Check description
      if (product.description.toLowerCase().includes(queryLower)) {
        matchScore += 5;
        reasons.push('in description');
      }

      // Check tags
      if (product.tags?.some(tag => tag.toLowerCase().includes(queryLower))) {
        matchScore += 5;
        reasons.push('tagged');
      }

      // Check category
      if (product.category.toLowerCase().includes(queryLower)) {
        matchScore += 3;
        reasons.push('category match');
      }

      return {
        product,
        similarity_score: matchScore / 10, // Normalize to 0-1
        match_reason: reasons.join(', ') || 'keyword match',
      };
    })
    .filter((result) => {
      if (result.similarity_score === 0) return false;
      if (category && result.product.category !== category) return false;
      if (minPrice && result.product.price < minPrice) return false;
      if (maxPrice && result.product.price > maxPrice) return false;
      return true;
    })
    .sort((a, b) => b.similarity_score - a.similarity_score)
    .slice(0, maxResults);

  return results;
}

/**
 * Generate human-readable match reason
 */
function getMatchReason(
  product: Product,
  query: string,
  similarity: number,
  bonusScore: number
): string {
  const queryLower = query.toLowerCase();
  const nameLower = product.name.toLowerCase();

  if (nameLower.includes(queryLower)) {
    return `Matches "${query}" in product name`;
  }
  
  if (product.tags?.some(tag => queryLower.includes(tag.toLowerCase()))) {
    return `Tagged with "${query}"`;
  }
  
  if (product.category.toLowerCase().includes(queryLower)) {
    return `${product.category} category match`;
  }

  const similarityPercent = Math.round(similarity * 100);
  return `${similarityPercent}% semantic match for "${query}"`;
}

/**
 * Format search results for the Clerk to present to the user
 */
export function formatSearchResultsForClerk(results: SearchResult[]): string {
  if (results.length === 0) {
    return 'No products match your query. Would you like to refine your search?';
  }

  const formattedResults = results
    .map(
      (result, index) => `
${index + 1}. **${result.product.name}** — $${result.product.price.toLocaleString()}
   Category: ${result.product.category}
   Description: ${result.product.description}
   Tags: ${result.product.tags?.join(', ') || 'N/A'}
   Match: ${result.match_reason} (${Math.round(result.similarity_score * 100)}% confidence)
   Bottom Price: $${result.product.bottom_price.toLocaleString()} (minimum negotiable)`
    )
    .join('\n\n');

  return `Found ${results.length} matching piece${results.length !== 1 ? 's' : ''}:\n${formattedResults}`;
}

/**
 * Extract price filters from natural language queries
 * Supports patterns like "under $500", "between $100 and $300", "$500+", etc.
 */
export function extractPriceFilters(query: string): { minPrice?: number; maxPrice?: number } {
  const filters: { minPrice?: number; maxPrice?: number } = {};

  // Match "under $XXX" or "less than $XXX"
  const underMatch = query.match(/(?:under|less than|below)\s*\$?(\d+(?:,\d{3})*(?:\.\d{2})?)/i);
  if (underMatch) {
    filters.maxPrice = parseFloat(underMatch[1].replace(/,/g, ''));
  }

  // Match "$XXX+" or "over $XXX" or "more than $XXX"
  const overMatch = query.match(/(?:\$(\d+(?:,\d{3})*(?:\.\d{2})?)\+|over|more than|at least)\s*\$?(\d+(?:,\d{3})*(?:\.\d{2})?)/i);
  if (overMatch) {
    const price = parseFloat((overMatch[1] || overMatch[2]).replace(/,/g, ''));
    filters.minPrice = price;
  }

  // Match "between $XXX and $YYY"
  const betweenMatch = query.match(/between\s*\$?(\d+(?:,\d{3})*(?:\.\d{2})?)\s*(?:and|-)\s*\$?(\d+(?:,\d{3})*(?:\.\d{2})?)/i);
  if (betweenMatch) {
    filters.minPrice = parseFloat(betweenMatch[1].replace(/,/g, ''));
    filters.maxPrice = parseFloat(betweenMatch[2].replace(/,/g, ''));
  }

  return filters;
}

/**
 * Extract category from natural language query
 */
export function extractCategoryFromQuery(query: string): string | undefined {
  const categories = ['Outerwear', 'Basics', 'Accessories', 'Home', 'Apparel', 'Footwear'];
  const queryLower = query.toLowerCase();

  for (const category of categories) {
    if (queryLower.includes(category.toLowerCase())) {
      return category;
    }
  }

  return undefined;
}

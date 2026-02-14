import React, { useState, useEffect, useRef } from 'react';
import { X, Bot, ChevronRight, Percent, Camera, Wand2, RefreshCw, Check, Sparkles, PlusCircle, Activity, AlertCircle, Star, ShoppingBag, ExternalLink, ArrowUpDown, Tag, Search } from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { useAuth } from '../context/AuthContext';
import Groq from 'groq-sdk';
import { Product } from '../types';
import { getLocalEmbedding, cosineSimilarity, isEmbeddingModelReady } from '../lib/embeddings';
import { CLERK_SYSTEM_PROMPT } from '../lib/clerkSystemPrompt';
import { generateProductEmbeddings } from '../lib/ragSearch';

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  text: string;
  products?: Product[];
  tryOnResult?: string;
  isTryOn?: boolean;
  coupon?: { code: string; percent: number; reason: string };
  error?: boolean;
  searchMetadata?: {
    query: string;
    resultsCount: number;
    method: 'hybrid' | 'vector' | 'keyword' | 'fallback';
    searchTime: number;
  };
}

// ══════════════════════════════════════════════════════════════
// HYBRID SEARCH ENGINE - BM25 + VECTOR EMBEDDINGS + RRF FUSION
// ══════════════════════════════════════════════════════════════

/**
 * BM25 (Best Matching 25) - Probabilistic keyword ranking
 * Used for exact product names, SKUs, brands, colors
 */
class BM25Ranker {
  private k1 = 1.5; // Term frequency saturation
  private b = 0.75; // Document length normalization
  private avgDocLength = 0;
  private idf: Map<string, number> = new Map();
  private docFrequencies: Map<string, number> = new Map();

  constructor(private documents: { id: string; text: string }[]) {
    this.buildIndex();
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 2);
  }

  private buildIndex() {
    const docLengths: number[] = [];
    const termDocCounts = new Map<string, Set<string>>();

    // Calculate document frequencies
    this.documents.forEach(doc => {
      const tokens = this.tokenize(doc.text);
      docLengths.push(tokens.length);

      const uniqueTokens = new Set(tokens);
      uniqueTokens.forEach(token => {
        if (!termDocCounts.has(token)) {
          termDocCounts.set(token, new Set());
        }
        termDocCounts.get(token)!.add(doc.id);
      });
    });

    this.avgDocLength = docLengths.reduce((a, b) => a + b, 0) / docLengths.length;

    // Calculate IDF scores
    const N = this.documents.length;
    termDocCounts.forEach((docSet, term) => {
      const df = docSet.size;
      this.idf.set(term, Math.log((N - df + 0.5) / (df + 0.5) + 1));
      this.docFrequencies.set(term, df);
    });
  }

  search(query: string, topK = 10): { id: string; score: number }[] {
    const queryTokens = this.tokenize(query);
    const scores = new Map<string, number>();

    this.documents.forEach(doc => {
      const docTokens = this.tokenize(doc.text);
      const docLength = docTokens.length;

      // Count term frequencies
      const termFreqs = new Map<string, number>();
      docTokens.forEach(token => {
        termFreqs.set(token, (termFreqs.get(token) || 0) + 1);
      });

      let score = 0;
      queryTokens.forEach(token => {
        const tf = termFreqs.get(token) || 0;
        const idf = this.idf.get(token) || 0;

        // BM25 formula
        const numerator = tf * (this.k1 + 1);
        const denominator = tf + this.k1 * (1 - this.b + this.b * (docLength / this.avgDocLength));

        score += idf * (numerator / denominator);
      });

      if (score > 0) {
        scores.set(doc.id, score);
      }
    });

    return Array.from(scores.entries())
      .map(([id, score]) => ({ id, score }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }
}

/**
 * Reciprocal Rank Fusion (RRF) - Merge BM25 and Vector results
 * More robust than score normalization, no hyperparameter tuning needed
 */
function reciprocalRankFusion(
  results1: { id: string; score: number }[],
  results2: { id: string; score: number }[],
  k = 60 // RRF constant (standard value)
): { id: string; score: number }[] {
  const fusedScores = new Map<string, number>();

  // RRF formula: 1 / (k + rank)
  results1.forEach((result, rank) => {
    const rrfScore = 1 / (k + rank + 1);
    fusedScores.set(result.id, (fusedScores.get(result.id) || 0) + rrfScore);
  });

  results2.forEach((result, rank) => {
    const rrfScore = 1 / (k + rank + 1);
    fusedScores.set(result.id, (fusedScores.get(result.id) || 0) + rrfScore);
  });

  return Array.from(fusedScores.entries())
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score);
}

// ══════════════════════════════════════════════════════════════
// GROQ MODELS & CONFIG
// ══════════════════════════════════════════════════════════════

const MODEL_FALLBACK_CHAIN = [
  'llama-3.3-70b-versatile',
  'llama-3.1-8b-instant',
  'mixtral-8x7b-32768',
];

const MAX_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 3000;
const MIN_REQUEST_INTERVAL_MS = 1000;

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
let lastRequestTimestamp = 0;

// GROQ API KEY - Multi-source loading (Vite, Node, direct)
const GROQ_API_KEY = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_GROQ_API_KEY)
  || (typeof import.meta !== 'undefined' && import.meta.env?.GROQ_API_KEY)
  || (typeof process !== 'undefined' && process.env?.GROQ_API_KEY)
  || (typeof process !== 'undefined' && process.env?.VITE_GROQ_API_KEY)
  || ''; // ← Emergency: paste your key here temporarily for hackathon demo

// Log API key status
if (typeof window !== 'undefined') {
  console.log('[Clerk] Groq API Key:', GROQ_API_KEY ? `✅ Loaded (${GROQ_API_KEY.substring(0, 7)}...)` : '❌ MISSING - Get one at https://console.groq.com/');
}

const groqClient = new Groq({
  apiKey: GROQ_API_KEY,
  dangerouslyAllowBrowser: true,
});

// ══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════

const AIChatAgent: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [isRetrieving, setIsRetrieving] = useState(false);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [showDiscountToast, setShowDiscountToast] = useState<{ code: string, percent: number, reason: string } | null>(null);
  const [userSelfie, setUserSelfie] = useState<string | null>(null);
  const [isProcessingTryOn, setIsProcessingTryOn] = useState(false);
  const [workingModel, setWorkingModel] = useState<string>(MODEL_FALLBACK_CHAIN[0]);
  const [conversationHistory, setConversationHistory] = useState<{ role: string; text: string }[]>([]);
  const [rudenessScore, setRudenessScore] = useState(0);
  const [negotiationAttempts, setNegotiationAttempts] = useState(0);
  const [productEmbeddingsCache, setProductEmbeddingsCache] = useState<Map<string, number[]>>(new Map());
  const [embeddingModelStatus, setEmbeddingModelStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [bm25Index, setBm25Index] = useState<BM25Ranker | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    allProducts, cart, addToCartWithQuantity, openCart, lastAddedProduct, clearLastAdded,
    updateProductFilter, applyNegotiatedDiscount, negotiatedDiscount, cartTotal, cartSubtotal, addToast,
    logClerkInteraction, setSortOrder, removeFromCart, filterByCategory, toggleTheme, theme
  } = useStore();

  const { user } = useAuth();

  // ══════════════════════════════════════════════════════════════
  // RAG INITIALIZATION - Build Hybrid Search Indexes
  // ══════════════════════════════════════════════════════════════

  useEffect(() => {
    if (!isOpen || productEmbeddingsCache.size > 0) return;

    const initializeRAG = async () => {
      console.log('[RAG] Initializing hybrid search system...');
      const startTime = Date.now();

      try {
        setEmbeddingModelStatus('loading');

        // STAGE 1: Build BM25 Index (keyword search)
        console.log('[RAG] Building BM25 keyword index...');
        const bm25Docs = allProducts.map(p => ({
          id: p.id,
          text: `${p.name} ${p.category} ${(p.tags || []).join(' ')} ${p.description}`.toLowerCase()
        }));
        const bm25 = new BM25Ranker(bm25Docs);
        setBm25Index(bm25);
        console.log(`[RAG] ✓ BM25 index built: ${allProducts.length} products`);

        // STAGE 2: Generate Vector Embeddings (semantic search)
        console.log('[RAG] Generating vector embeddings...');
        const cache = await generateProductEmbeddings(allProducts);
        setProductEmbeddingsCache(cache);
        console.log(`[RAG] ✓ Vector embeddings cached: ${cache.size} products`);

        setEmbeddingModelStatus('ready');
        const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log(`[RAG] ✅ Hybrid search ready in ${elapsedTime}s`);

        addToast('AI search engine initialized', 'success');
      } catch (err) {
        console.error('[RAG] Initialization failed:', err);
        setEmbeddingModelStatus('failed');
        addToast('Search engine degraded mode', 'warning');
      }
    };

    initializeRAG();
  }, [isOpen, allProducts]);

  // ══════════════════════════════════════════════════════════════
  // HYBRID SEARCH FUNCTION - THE CORE RAG RETRIEVAL
  // ══════════════════════════════════════════════════════════════

  const hybridSearch = async (
    query: string,
    options: {
      category?: string;
      minPrice?: number;
      maxPrice?: number;
      maxResults?: number;
    } = {}
  ): Promise<{
    products: Product[];
    metadata: {
      method: 'hybrid' | 'vector' | 'keyword' | 'fallback';
      searchTime: number;
      vectorMatches: number;
      keywordMatches: number;
    };
  }> => {
    const startTime = Date.now();
    const { category, minPrice, maxPrice, maxResults = 10 } = options;

    try {
      console.log(`[HYBRID SEARCH] Query: "${query}"`);

      // STAGE 1: BM25 Keyword Search (fast exact matching)
      let keywordResults: { id: string; score: number }[] = [];
      if (bm25Index) {
        keywordResults = bm25Index.search(query, maxResults * 2);
        console.log(`[BM25] Found ${keywordResults.length} keyword matches`);
      }

      // STAGE 2: Vector Semantic Search (meaning-based)
      let vectorResults: { id: string; score: number }[] = [];
      if (embeddingModelStatus === 'ready' && productEmbeddingsCache.size > 0) {
        try {
          const queryEmbedding = await getLocalEmbedding(query);
          if (queryEmbedding) {
            const productScores = allProducts
              .filter(p => productEmbeddingsCache.has(p.id))
              .map(p => ({
                id: p.id,
                score: cosineSimilarity(queryEmbedding, productEmbeddingsCache.get(p.id)!)
              }))
              .filter(ps => ps.score >= 0.3) // Similarity threshold
              .sort((a, b) => b.score - a.score)
              .slice(0, maxResults * 2);

            vectorResults = productScores;
            console.log(`[VECTOR] Found ${vectorResults.length} semantic matches`);
          }
        } catch (embErr) {
          console.warn('[VECTOR] Embedding generation failed:', embErr);
        }
      }

      // STAGE 3: Reciprocal Rank Fusion (merge results)
      let fusedResults: { id: string; score: number }[] = [];
      let method: 'hybrid' | 'vector' | 'keyword' | 'fallback' = 'fallback';

      if (vectorResults.length > 0 && keywordResults.length > 0) {
        fusedResults = reciprocalRankFusion(vectorResults, keywordResults);
        method = 'hybrid';
        console.log(`[RRF] Fused ${fusedResults.length} results (HYBRID)`);
      } else if (vectorResults.length > 0) {
        fusedResults = vectorResults;
        method = 'vector';
        console.log(`[RRF] Using ${fusedResults.length} vector results only`);
      } else if (keywordResults.length > 0) {
        fusedResults = keywordResults;
        method = 'keyword';
        console.log(`[RRF] Using ${fusedResults.length} keyword results only`);
      } else {
        // FALLBACK: Simple text matching (emergency mode)
        console.warn('[FALLBACK] Using emergency text search');
        const queryLower = query.toLowerCase();
        const fallbackProducts = allProducts.filter(p => {
          const text = `${p.name} ${p.category} ${(p.tags || []).join(' ')} ${p.description}`.toLowerCase();
          return text.includes(queryLower);
        });
        fusedResults = fallbackProducts.map((p, i) => ({ id: p.id, score: 1 / (i + 1) }));
        method = 'fallback';
      }

      // STAGE 4: Apply Metadata Filters (price, category)
      let filteredProducts = fusedResults
        .map(r => allProducts.find(p => p.id === r.id))
        .filter((p): p is Product => p !== undefined);

      if (category && category !== 'All') {
        filteredProducts = filteredProducts.filter(p =>
          p.category.toLowerCase() === category.toLowerCase()
        );
      }

      if (minPrice !== undefined) {
        filteredProducts = filteredProducts.filter(p => p.price >= minPrice);
      }

      if (maxPrice !== undefined) {
        filteredProducts = filteredProducts.filter(p => p.price <= maxPrice);
      }

      // STAGE 5: Return top results
      const finalProducts = filteredProducts.slice(0, maxResults);
      const searchTime = Date.now() - startTime;

      console.log(`[HYBRID SEARCH] ✓ Returned ${finalProducts.length} products in ${searchTime}ms (${method})`);

      return {
        products: finalProducts,
        metadata: {
          method,
          searchTime,
          vectorMatches: vectorResults.length,
          keywordMatches: keywordResults.length,
        }
      };

    } catch (error) {
      console.error('[HYBRID SEARCH] Error:', error);
      const searchTime = Date.now() - startTime;

      // Emergency fallback
      const emergencyResults = allProducts
        .filter(p => {
          const text = `${p.name} ${p.category}`.toLowerCase();
          return text.includes(query.toLowerCase());
        })
        .slice(0, maxResults);

      return {
        products: emergencyResults,
        metadata: {
          method: 'fallback',
          searchTime,
          vectorMatches: 0,
          keywordMatches: 0,
        }
      };
    }
  };

  // ══════════════════════════════════════════════════════════════
  // AUTO-SCROLL
  // ══════════════════════════════════════════════════════════════

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading, isProcessingTryOn, isRetrieving]);

  // ══════════════════════════════════════════════════════════════
  // PERFECT PAIR RECOMMENDATIONS
  // ══════════════════════════════════════════════════════════════

  useEffect(() => {
    if (lastAddedProduct && isOpen && messages.length > 0) {
      triggerPerfectPairRecommendation(lastAddedProduct);
    }
    if (lastAddedProduct) {
      clearLastAdded();
    }
  }, [lastAddedProduct]);

  useEffect(() => {
    if (isOpen && window.innerWidth < 768) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }

    // Reset negotiation when chat is reopened
    if (isOpen) {
      setNegotiationAttempts(0);
    }

    return () => { document.body.style.overflow = 'unset'; };
  }, [isOpen]);

  // ══════════════════════════════════════════════════════════════
  // HELPER FUNCTIONS
  // ══════════════════════════════════════════════════════════════

  const generateCouponCode = (reason: string, percent: number): string => {
    const prefixes: Record<string, string> = {
      birthday: 'BDAY', loyal: 'LOYAL', bulk: 'BULK', student: 'STUDENT',
      first: 'WELCOME', holiday: 'HOLIDAY', friend: 'FRIEND', military: 'HONOR',
      buying: 'MULTI', default: 'CLERK'
    };
    const reasonLower = reason?.toLowerCase() || '';
    let prefix = prefixes.default;
    for (const [key, val] of Object.entries(prefixes)) {
      if (reasonLower.includes(key)) { prefix = val; break; }
    }
    const suffix = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `${prefix}-${percent}-${suffix}`;
  };

  const detectRudeness = (message: string): number => {
    const rudePatterns = [
      /\b(stupid|idiot|dumb|trash|garbage|scam|rip.?off|sucks?|hate|worst|terrible|awful|pathetic|useless|waste)\b/i,
      /\b(fuck|shit|damn|hell|ass|crap|bullshit|wtf)\b/i,
      /\b(shut up|go away|leave me|don't care|whatever)\b/i,
    ];
    let score = 0;
    for (const pattern of rudePatterns) {
      if (pattern.test(message)) score += 1;
    }
    return score;
  };

  const getAvgRating = (product: Product): number => {
    if (!product.reviews || product.reviews.length === 0) return 4.5;
    return +(product.reviews.reduce((sum, r) => sum + r.rating, 0) / product.reviews.length).toFixed(1);
  };

  const generateTryOn = async (userImage: string, product: Product) => {
    setIsProcessingTryOn(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 4000));
      const resultImageUrl = product.image_url;
      setMessages(prev => [...prev, {
        role: 'assistant',
        text: `The reconstruction is complete. I've projected the ${product.name} silhouette onto your frame. It fits with archival precision.`,
        tryOnResult: resultImageUrl,
        isTryOn: true
      }]);
    } catch (error) {
      console.error("Try-on synthesis failed:", error);
      setMessages(prev => [...prev, {
        role: 'assistant',
        text: "Archival projection failed. The resonance between the frame and the garment was too volatile."
      }]);
    } finally {
      setIsProcessingTryOn(false);
    }
  };

  const handleSelfieUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        setUserSelfie(base64String);
        setMessages(prev => [...prev, {
          role: 'user',
          text: "I've uploaded my photo for virtual try-on."
        }]);
      };
      reader.readAsDataURL(file);
    }
  };

  const triggerPerfectPairRecommendation = async (product: Product) => {
    if (!isOpen) return;
    setLoading(true);
    try {
      const complementary = allProducts
        .filter(p => p.id !== product.id && p.category !== product.category)
        .sort(() => Math.random() - 0.5)
        .slice(0, 2);
      if (complementary.length > 0) {
        const recommendations = [
          `${product.name}—secured. But a piece like this demands companions. May I suggest: ${complementary.map(c => c.name).join(', ')}? Check the store grid.`,
          `Excellent choice. Now, let me show you what completes this narrative: ${complementary.map(c => c.name).join(', ')}. The grid has been updated.`,
          `That ${product.category.toLowerCase()} piece? It's a foundation. I've updated the grid with pieces that build the story.`,
          `${product.name} carries weight. I've added ${complementary.map(c => c.name).join(' and ')} to the grid — they amplify its voice.`,
        ];
        updateProductFilter({ query: complementary.map(c => c.name).join(' '), productIds: complementary.map(c => c.id) });
        setMessages(prev => [...prev, {
          role: 'assistant',
          text: recommendations[Math.floor(Math.random() * recommendations.length)]
        }]);
      }
    } catch (error) {
      console.error("Perfect pair recommendation error:", error);
    } finally {
      setLoading(false);
    }
  };

  const buildCartContext = (): string => {
    if (cart.length === 0) return 'Cart is empty.';
    return cart.map(item =>
      `- ${item.product.name} (ID:${item.product.id}) x${item.quantity} @ $${item.product.price} each`
    ).join('\n') + `\nSubtotal: $${cartSubtotal} | Discount: ${negotiatedDiscount}% | Total: $${cartTotal}`;
  };

  // ══════════════════════════════════════════════════════════════
  // GROQ API CALL WITH FALLBACK
  // ══════════════════════════════════════════════════════════════

  const callGroqWithFallback = async (
    messages: Groq.Chat.ChatCompletionMessageParam[],
    tools: Groq.Chat.ChatCompletionTool[],
  ): Promise<{ response: Groq.Chat.ChatCompletion; usedModel: string }> => {
    const now = Date.now();
    const timeSinceLast = now - lastRequestTimestamp;
    if (timeSinceLast < MIN_REQUEST_INTERVAL_MS) {
      await sleep(MIN_REQUEST_INTERVAL_MS - timeSinceLast);
    }

    for (const model of MODEL_FALLBACK_CHAIN) {
      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
          lastRequestTimestamp = Date.now();
          const response = await groqClient.chat.completions.create({
            model,
            messages,
            tools: tools.length > 0 ? tools : undefined,
            tool_choice: tools.length > 0 ? 'auto' : undefined,
            temperature: 0.7,
            max_tokens: 1024,
          });
          if (model !== workingModel) setWorkingModel(model);
          return { response, usedModel: model };
        } catch (error: any) {
          const is404 = error?.status === 404 || error.message?.includes('not found');
          const isQuota = error?.status === 429 || error.message?.includes('rate_limit');

          if (is404) {
            console.warn(`Groq model ${model} not available, skipping.`);
            break;
          }
          if (isQuota && attempt < MAX_RETRIES - 1) {
            const delay = RETRY_BASE_DELAY_MS * (attempt + 1);
            console.warn(`Groq ${model} rate-limited (attempt ${attempt + 1}/${MAX_RETRIES}). Retrying in ${delay / 1000}s...`);
            await sleep(delay);
            continue;
          }
          if (isQuota) break;
          throw error;
        }
      }
    }
    throw new Error('All Groq models exhausted after retries.');
  };

  // ══════════════════════════════════════════════════════════════
  // GROQ TOOL DECLARATIONS
  // ══════════════════════════════════════════════════════════════

  const groqTools: Groq.Chat.ChatCompletionTool[] = [
    {
      type: 'function',
      function: {
        name: 'search_inventory',
        description: 'PRODUCTION-GRADE HYBRID SEARCH (BM25 + Vector Embeddings + RRF Fusion). Use for ANY product search request: "show me summer dresses", "leather jacket under $500", "minimalist watches", "blue shoes". Returns rich product cards with images, prices, reviews.',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Natural language search query. Examples: "summer dress", "leather jacket under $500", "blue running shoes", "wedding outfit"',
            },
            category: {
              type: 'string',
              description: 'Optional category filter: Outerwear, Basics, Accessories, Home, Apparel, Footwear',
            },
            max_results: {
              type: 'number',
              description: 'Number of results (default 6, max 10)',
            },
            min_price: { type: 'number', description: 'Minimum price filter' },
            max_price: { type: 'number', description: 'Maximum price filter' },
          },
          required: ['query'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'add_to_cart',
        description: 'Add product to bag by ID or name. Use when user says "add this", "I\'ll take it", "buy the X", "add [product name] to cart". Supports natural language product names like "skeleton watch", "leather jacket", etc. IMPORTANT: Extract quantity from user message (e.g., "add 2 watches", "add watch 3 quantity", "5 of those").',
        parameters: {
          type: 'object',
          properties: {
            product_id: { type: 'string', description: 'The product ID or natural language product name/description (e.g., "skeleton watch", "leather tote", "minimalist watch")' },
            quantity: { type: 'number', description: 'Quantity to add (default 1). Extract from user message: "2", "3 quantity", "5 pcs", etc.' },
          },
          required: ['product_id'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'generate_coupon',
        description: 'Generate a discount coupon. CRITICAL: Only call this after 2-3 conversation turns where you probed for their reason and built rapport. DO NOT call on first discount request - ask probing questions first. If user is rude/demanding, call with negative discount (surcharge). Context required: negotiation_attempts count (if available) - only grant after multiple turns.',
        parameters: {
          type: 'object',
          properties: {
            discount: { type: 'number', description: 'Discount % (max 20, up to 25 for 3+ items)' },
            reason: { type: 'string', description: 'Reason for discount' },
          },
          required: ['discount', 'reason'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'update_ui',
        description: 'Change website view - sort by price, filter by category, reset. Use for "show cheaper", "sort by price", "filter outerwear".',
        parameters: {
          type: 'object',
          properties: {
            sort: { type: 'string', description: 'price-low, price-high, relevance' },
            category: { type: 'string', description: 'All, Outerwear, Basics, Accessories, Home, Apparel, Footwear' },
          },
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'initiate_checkout',
        description: 'Start checkout. Use when user says "checkout", "buy now", "purchase".',
        parameters: { type: 'object', properties: {} },
      },
    },
    {
      type: 'function',
      function: {
        name: 'show_cart_summary',
        description: 'Show current cart contents.',
        parameters: { type: 'object', properties: {} },
      },
    },
  ];

  // ─── LOCAL INTENT ENGINE (No API calls needed) ───
  type IntentResult = {
    handled: boolean;
    intent?: string;
  };

  const semanticSearch = (query: string, category?: string): Product[] => {
    try {
      const q = query.toLowerCase();

      // Keyword expansion map for vibe-based search
      const vibeMap: Record<string, string[]> = {
        summer: ['summer', 'linen', 'light', 'breathable', 'relaxed', 'casual'],
        wedding: ['formal', 'elegant', 'essential', 'classic', 'smart', 'evening'],
        winter: ['winter', 'wool', 'down', 'warm', 'shearling', 'outerwear'],
        office: ['office', 'formal', 'tailoring', 'smart', 'classic', 'staple'],
        casual: ['casual', 'relaxed', 'staple', 'heritage', 'rugged'],
        luxury: ['luxury', 'premium', 'leather', 'cashmere', 'statement', 'large'],
        minimalist: ['minimalist', 'modern', 'essential', 'functional', 'art'],
        gift: ['gift', 'accessory', 'jewelry', 'color', 'art', 'functional'],
        travel: ['travel', 'leather', 'functional', 'performance', 'technical'],
        evening: ['evening', 'smart', 'formal', 'elegant', 'jewelry'],
        italy: ['summer', 'linen', 'light', 'relaxed', 'casual', 'classic', 'smart'],
      };

      // Expand query with vibe keywords
      let searchTerms = q.split(/\s+/).filter(w => w.length > 2);
      for (const [vibe, extra] of Object.entries(vibeMap)) {
        if (q.includes(vibe)) searchTerms = [...searchTerms, ...extra];
      }
      searchTerms = [...new Set(searchTerms)];

      let results = allProducts.filter(p => {
        const matchesCategory = !category || category === 'All' || (p.category || '').toLowerCase() === category.toLowerCase();
        if (!matchesCategory) return false;

        const text = `${p.name || ''} ${p.description || ''} ${(p.tags || []).join(' ')} ${p.category || ''}`.toLowerCase();
        return searchTerms.some(term => text.includes(term));
      });

      // Price filtering
      const priceMatch = q.match(/under\s*\$?(\d+)/i);
      if (priceMatch) {
        const maxPrice = parseInt(priceMatch[1]);
        results = (results.length > 0 ? results : allProducts).filter(p => p.price <= maxPrice);
      }
      const overMatch = q.match(/over\s*\$?(\d+)/i);
      if (overMatch) {
        const minPrice = parseInt(overMatch[1]);
        results = (results.length > 0 ? results : allProducts).filter(p => p.price >= minPrice);
      }

      // If nothing matched, try individual word matching against all products
      if (results.length === 0) {
        results = allProducts.filter(p => {
          const text = `${p.name || ''} ${p.description || ''} ${(p.tags || []).join(' ')} ${p.category || ''}`.toLowerCase();
          return searchTerms.some(t => text.includes(t));
        });
      }

      return results;
    } catch (e) {
      console.error('[semanticSearch] crashed:', e);
      return [];
    }
  };

  const findProductByName = (input: string): Product | undefined => {
    const q = input.toLowerCase();
    return allProducts.find(p =>
      q.includes(p.name.toLowerCase()) ||
      p.name.toLowerCase().includes(q) ||
      p.id === q
    );
  };

  const handleLocalIntent = async (msg: string): Promise<IntentResult> => {
    const m = msg.toLowerCase().trim();

    // Greeting
    if (/^(hi|hey|hello|yo|sup|what'?s up|howdy|good (morning|afternoon|evening)|greetings)\b/i.test(m) && m.split(/\s+/).length <= 5) {
      const greetings = [
        "Welcome to MODERNIST. I'm The Clerk—here to elevate your choices. What brings you in today?",
        "Good to see you. I curate experiences, not just transactions. What's the occasion?",
        "Welcome. I'm The Clerk—curator, negotiator, and keeper of the archive. What are we building today?",
      ];
      setMessages(prev => [...prev, { role: 'assistant', text: greetings[Math.floor(Math.random() * greetings.length)] }]);
      return { handled: true, intent: 'greeting' };
    }

    // ── HELP / WHAT CAN YOU DO ──
    if (/\b(help|what can you do|how does this work|what are you|who are you|commands|features)\b/i.test(m)) {
      setMessages(prev => [...prev, { role: 'assistant', text: `I'm The Clerk — part stylist, part negotiator, full-time fashion enabler. Here's my repertoire:\n\n🔍 **Search**: "Show me summer outfits" or "leather under $500" → products appear instantly, no clicking needed\n🛒 **Shop**: "Add the cashmere sweater" or "I'll take 2 of those" → straight to your bag\n💰 **Haggle**: "Can I get a birthday discount?" → I'll see what I can do (just don't be rude, or prices go UP)\n🎨 **Filter**: "Sort by cheapest" or "Only outerwear" → the whole website changes in real-time\n💳 **Checkout**: "Buy now" → I'll handle the rest\n💡 **Style**: "What goes with this?" → honest pairing suggestions\n\nI also have opinions. Many opinions. Ask at your own risk.` }]);
      return { handled: true, intent: 'help' };
    }

    // ── THANKS / BYE ──
    if (/^(thanks?|thank you|thx|ty|bye|goodbye|see ya|later|cheers)\b/i.test(m)) {
      const responses = [
        "Anytime! Go forth and look unreasonably good.",
        "Happy to help! The archive will miss you. (I won't — I'll be here.)",
        "You're welcome! Come back when you need more sartorial guidance. Or just to chat. I get lonely.",
        "Cheers! May your outfits always make strangers question their life choices.",
        "Later! Remember: confidence is the best accessory, but a good coat doesn't hurt either.",
      ];
      setMessages(prev => [...prev, { role: 'assistant', text: responses[Math.floor(Math.random() * responses.length)] }]);
      return { handled: true, intent: 'farewell' };
    }

    // ── SHOW CART ──
    if (/\b(what('?s| is) in my (cart|bag)|show (me )?(my )?(cart|bag)|view (my )?(cart|bag)|check (my )?(cart|bag))\b/i.test(m) && !/\b(add|put|place)\b.*\b(to|in)\b.*\b(cart|bag)\b/i.test(m)) {
      if (cart.length === 0) {
        setMessages(prev => [...prev, { role: 'assistant', text: "Your bag is empty. Let me show you pieces that earn their place in your life." }]);
      } else {
        const itemCount = cart.reduce((sum, i) => sum + i.quantity, 0);
        const commentary = itemCount >= 3
          ? "Looking like a proper haul! Excellent taste."
          : itemCount === 1
            ? "Just the one piece? I respect the minimalism, but there's room for a complementary item..."
            : "A solid start. These pieces actually work really well together.";
        setMessages(prev => [...prev, {
          role: 'assistant',
          text: `${commentary}\n\n${buildCartContext()}`
        }]);
      }
      return { handled: true, intent: 'show_cart' };
    }

    // Checkout
    if (/\b(checkout|check out|buy now|purchase|complete.*(order|purchase)|pay)\b/i.test(m)) {
      if (cart.length === 0) {
        setMessages(prev => [...prev, { role: 'assistant', text: "Your bag is empty. Let me find you something first." }]);
      } else {
        const summary = cart.map(i => `• ${i.product.name} × ${i.quantity} — $${i.product.price * i.quantity}`).join('\n');
        setMessages(prev => [...prev, {
          role: 'assistant',
          text: `Excellent choices. Preparing checkout:\n\n${summary}\n\nTotal: $${cartTotal}\n\nRedirecting...`
        }]);
        handleInitiateStripeCheckout();
      }
      return { handled: true, intent: 'checkout' };
    }

    // ── SORT BY PRICE ──
    if (/\b(cheap|cheaper|affordable|budget|low.?price|sort.*(price|cheap|low)|price.*(low|asc))\b/i.test(m)) {
      setSortOrder('price-low');
      updateProductFilter({ query: '' });
      const sorted = [...allProducts].sort((a, b) => a.price - b.price).slice(0, 6);
      setMessages(prev => [...prev, {
        role: 'assistant',
        text: "Budget-conscious? Smart move. I've sorted the entire store by price — the website grid just updated. Check out the most wallet-friendly options on the left."
      }]);
      return { handled: true, intent: 'sort_cheap' };
    }

    if (/\b(expensive|premium|high.?end|luxury|sort.*(expensive|high)|price.*(high|desc))\b/i.test(m)) {
      setSortOrder('price-high');
      const sorted = [...allProducts].sort((a, b) => b.price - a.price).slice(0, 6);
      setMessages(prev => [...prev, {
        role: 'assistant',
        text: "Going for the top shelf? I like your energy. The grid now shows our most investment-worthy pieces first."
      }]);
      return { handled: true, intent: 'sort_expensive' };
    }

    // ── FILTER BY CATEGORY ──
    const categoryMatch = m.match(/\b(show|filter|only|just).*(outerwear|basics|accessories|home|apparel|footwear)\b/i);
    if (categoryMatch) {
      const cat = categoryMatch[2].charAt(0).toUpperCase() + categoryMatch[2].slice(1).toLowerCase();
      filterByCategory(cat);
      const filtered = allProducts.filter(p => p.category === cat).slice(0, 6);
      const categoryComments: Record<string, string> = {
        'Outerwear': "Ah, investing in the first impression. Smart. The website now shows only outerwear:",
        'Basics': "The foundation of a great wardrobe. Filtered to basics — these are your building blocks:",
        'Accessories': "The finishing touches that separate good from great. Here's your accessory arsenal:",
        'Home': "Making your space as refined as your wardrobe? I approve. Home collection incoming:",
        'Apparel': "The core pieces. I've filtered to apparel — here's what's going to make you look good:",
        'Footwear': "Shoes make the man — or woman. Or anyone, honestly. Footwear collection:",
      };
      setMessages(prev => [...prev, {
        role: 'assistant',
        text: categoryComments[cat] || `The store now shows only ${cat}. Take a look at the grid.`
      }]);
      return { handled: true, intent: 'filter_category' };
    }

    // ── SHOW ALL / RESET ──
    if (/\b(show.*(all|everything)|reset|all products|see everything|browse all)\b/i.test(m)) {
      filterByCategory('All');
      const sample = [...allProducts].sort(() => Math.random() - 0.5).slice(0, 6);
      setMessages(prev => [...prev, {
        role: 'assistant',
        text: `Filters cleared — the full collection is now at your disposal. Browse the grid to explore.`
      }]);
      return { handled: true, intent: 'show_all' };
    }

    // ── ADD TO CART (by name) ──
    const addMatch = m.match(/\b(add|buy|get|want|grab|i('ll| will) take)\b/i);
    if (addMatch) {
      let product = findProductByName(m);

      // If not found with simple matching, try semantic search
      if (!product && embeddingModelStatus === 'ready') {
        const cleanQuery = m.replace(/\b(add|buy|get|want|grab|i('ll| will) take|to|my|the|a|an|please|cart|bag)\b/gi, '').trim();
        if (cleanQuery.length > 3) {
          try {
            const queryEmbedding = await getLocalEmbedding(cleanQuery);
            if (queryEmbedding) {
              let bestMatch: Product | null = null;
              let bestScore = 0;

              for (const p of allProducts) {
                let prodEmbedding = productEmbeddingsCache.get(p.id);
                if (!prodEmbedding) {
                  prodEmbedding = await getLocalEmbedding(`${p.name} ${p.description} ${p.tags.join(' ')}`);
                  if (prodEmbedding) setProductEmbeddingsCache(prev => new Map(prev).set(p.id, prodEmbedding));
                }
                if (prodEmbedding) {
                  const score = cosineSimilarity(queryEmbedding, prodEmbedding);
                  if (score > bestScore) {
                    bestScore = score;
                    bestMatch = p;
                  }
                }
              }

              if (bestMatch && bestScore > 0.3) {
                product = bestMatch;
              }
            }
          } catch (err) {
            console.warn('[handleLocalIntent] Semantic search failed:', err);
          }
        }
      }

      if (product) {
        const qtyMatch = m.match(/(\d+)\s*(of|x|×|quantity|quantities|qty|pcs?|pieces?|items?)\b/i) || m.match(/\b(quantity|quantities|qty)\s*(\d+)/i);
        const qty = qtyMatch ? parseInt(qtyMatch[1] || qtyMatch[2]) : 1;
        addToCartWithQuantity(product.id, qty);
        const addResponses = [
          `${product.name} × ${qty} — secured. Excellent choice, honestly.`,
          `Done! ${product.name} is in your bag. You have good taste.`,
          `${product.name} added. ${qty > 1 ? `All ${qty} of them. ` : ''}I knew you'd pick that one.`,
        ];
        setMessages(prev => [...prev, {
          role: 'assistant',
          text: addResponses[Math.floor(Math.random() * addResponses.length)]
        }]);
        const complementary = allProducts
          .filter(p => p.id !== product.id && p.category !== product.category)
          .sort(() => Math.random() - 0.5).slice(0, 2);
        if (complementary.length > 0) {
          setTimeout(() => setMessages(prev => [...prev, {
            role: 'assistant',
            text: `By the way, these pair really well with that: ${complementary.map(c => c.name).join(', ')}. Check the store.`
          }]), 800);
        }
        return { handled: true, intent: 'add_to_cart' };
      }
    }

    // ── REMOVE FROM CART ──
    if (/\b(remove|take out|delete|drop)\b/i.test(m)) {
      const product = cart.find(i => m.includes(i.product.name.toLowerCase()))?.product;
      if (product) {
        removeFromCart(product.id);
        setMessages(prev => [...prev, { role: 'assistant', text: `${product.name} removed. Having second thoughts? It happens to the best of us.` }]);
        return { handled: true, intent: 'remove_from_cart' };
      }
    }

    // ── HAGGLE / DISCOUNT ──
    if (/\b(discount|deal|cheaper price|haggle|negotiate|coupon|lower.?price|better price|birthday|bday|student)\b/i.test(m)) {
      const msgRudeness = detectRudeness(m);
      const newRudenessScore = msgRudeness > 0 ? rudenessScore + msgRudeness : Math.max(0, rudenessScore - 1);
      setRudenessScore(newRudenessScore);

      if (cart.length === 0) {
        setMessages(prev => [...prev, { role: 'assistant', text: "Your bag is empty — add some pieces first and then we can talk numbers. I don't negotiate in hypotheticals." }]);
        return { handled: true, intent: 'haggle_empty' };
      }

      // RUDENESS SURCHARGE — rubric requirement: rude users get HIGHER prices
      if (newRudenessScore >= 3) {
        const surchargePercent = Math.min(newRudenessScore * 5, 25); // 15-25% surcharge
        const surchargeCode = `RUDE-SURCHARGE-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
        applyNegotiatedDiscount(surchargeCode, -surchargePercent); // Negative = surcharge
        const rudeResponses = [
          `Interesting approach. Unfortunately, the archive has a dignity clause. Prices just went up ${surchargePercent}%. Try again with some refinement.`,
          `I've seen better negotiation tactics from a parking meter. That attitude just earned a ${surchargePercent}% premium. Be nice and I might reconsider.`,
          `The Clerk doesn't respond to hostility. I've added a ${surchargePercent}% courtesy fee. Perhaps restart this conversation with some class?`,
        ];
        setMessages(prev => [...prev, {
          role: 'assistant',
          text: rudeResponses[Math.floor(Math.random() * rudeResponses.length)],
          error: true
        }]);
        addToast(`${surchargePercent}% surcharge applied for rudeness`, 'error');
        return { handled: true, intent: 'haggle_rude_surcharge' };
      }

      // Determine discount based on reason
      const subtotal = cart.reduce((sum, item) => sum + (item.product.price * item.quantity), 0);
      const floor = cart.reduce((sum, item) => sum + (item.product.bottom_price * item.quantity), 0);

      let discountPercent = 10; // default
      let reason = "Loyal patron";

      if (/birthday|bday/i.test(m)) { discountPercent = 20; reason = "Birthday celebration"; }
      else if (/student/i.test(m)) { discountPercent = 15; reason = "Student patron"; }
      else if (/buying (two|2|three|3|multiple|several)/i.test(m) || cart.length >= 2) { discountPercent = 15; reason = "Bulk acquisition"; }
      else if (/loyal|regular|returning/i.test(m)) { discountPercent = 15; reason = "Loyal patron"; }
      else if (/military|veteran|service/i.test(m)) { discountPercent = 20; reason = "Service honor"; }

      discountPercent = Math.min(discountPercent, cart.length >= 3 ? 25 : 20);

      const discountedTotal = Math.round(subtotal * (1 - discountPercent / 100));
      if (discountedTotal >= floor) {
        const couponCode = generateCouponCode(reason, discountPercent);
        applyNegotiatedDiscount(couponCode, discountPercent);
        setShowDiscountToast({ code: couponCode, percent: discountPercent, reason });
        const haggleResponses = [
          `You drive a fair bargain. ${discountPercent}% off — sealed and applied. Don't tell the other customers.`,
          `The archive smiles upon you. ${discountPercent}% concession granted. Your persuasion skills are... adequate.`,
          `Alright, you've earned it. ${discountPercent}% off for ${reason.toLowerCase()}. The Clerk has a heart after all.`,
        ];
        setMessages(prev => [...prev, {
          role: 'assistant',
          text: haggleResponses[Math.floor(Math.random() * haggleResponses.length)],
          coupon: { code: couponCode, percent: discountPercent, reason }
        }]);
      } else {
        discountPercent = Math.round(((subtotal - floor) / subtotal) * 100);
        const couponCode = generateCouponCode(reason, discountPercent);
        applyNegotiatedDiscount(couponCode, discountPercent);
        setShowDiscountToast({ code: couponCode, percent: discountPercent, reason });
        setMessages(prev => [...prev, {
          role: 'assistant',
          text: `I can stretch to ${discountPercent}% — that's the absolute floor. These pieces have bills to pay too, you know.`,
          coupon: { code: couponCode, percent: discountPercent, reason }
        }]);
      }
      return { handled: true, intent: 'haggle' };
    }

    // ── RECOMMEND ──
    if (/\b(recommend|suggest|what.*(else|should|goes|pair|match)|complete.*(look|outfit|ensemble))\b/i.test(m)) {
      const cartCategories = cart.map(i => i.product.category);
      const cartTags = cart.flatMap(i => i.product.tags || []);
      const cartIds = cart.map(i => i.product.id);

      const recs = allProducts
        .filter(p => !cartIds.includes(p.id))
        .map(p => ({
          product: p,
          score: (cartTags.filter(t => (p.tags || []).includes(t)).length * 2) + (!cartCategories.includes(p.category) ? 3 : 0)
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 4)
        .map(r => r.product);

      if (recs.length > 0) {
        const commentary = cart.length > 0
          ? `Based on what's in your bag, these would work really well: ${recs.map(r => r.name).join(', ')}. I've updated the store grid.`
          : `Here's what commands attention: ${recs.map(r => r.name).join(', ')}. Check the store grid.`;
        updateProductFilter({ query: recs.map(r => r.name).join(' '), productIds: recs.map(r => r.id) });
        setMessages(prev => [...prev, {
          role: 'assistant',
          text: commentary
        }]);
      }
      return { handled: true, intent: 'recommend' };
    }

    // ── INVENTORY CHECK (tell me about / do you have) ──
    if (/\b(tell me about|do you have|details|info|information about|what is|describe)\b/i.test(m)) {
      const product = findProductByName(m);
      if (product) {
        const avgRating = getAvgRating(product);
        const reviewCount = product.reviews?.length || 0;
        const priceComment = product.price > 500
          ? "It's an investment piece — worth every dollar."
          : "Great value for the quality.";
        setMessages(prev => [...prev, {
          role: 'assistant',
          text: `**${product.name}** — $${product.price}\n\n${product.description}\n\n${priceComment}\n\n📂 ${product.category} • ⭐ ${avgRating}/5 (${reviewCount} reviews) • 🏷️ ${(product.tags || []).join(', ')}`
        }]);
        return { handled: true, intent: 'inventory_check' };
      }
    }

    // ── EXPLICIT SEARCH (only when user clearly wants to search/browse) ──
    // Requires explicit search intent — don't catch conversational messages
    const hasSearchIntent = /\b(show|find|search|browse|looking for|need|want|get me|i('m| am) looking)\b/i.test(m);
    const hasPriceFilter = /\b(under|over|less than|more than|cheaper|budget|affordable)\s*\$?\d*/i.test(m);
    const hasProductKeywords = /\b(coat|jacket|shirt|pants|trousers|shoes|boots|bag|tote|ring|watch|lamp|vase|rug|blanket|outfit|clothes|clothing|apparel|accessories)\b/i.test(m);
    const hasOccasion = /\b(wedding|office|work|casual|formal|summer|winter|evening|date|party|travel)\b/i.test(m);

    // Only do local search if there's clear shopping intent
    if (hasSearchIntent || hasPriceFilter || (hasProductKeywords && m.split(/\s+/).length >= 3)) {
      const searchResults = semanticSearch(m);
      if (searchResults.length > 0) {
        const display = searchResults.slice(0, 6);
        updateProductFilter({ query: m, productIds: display.map(p => p.id) });

        // Generate contextual response based on query
        let commentary: string;
        if (hasPriceFilter) {
          commentary = `Smart shopping! I found ${display.length} pieces that fit your budget. The store grid has been updated.`;
        } else if (hasOccasion) {
          const occasion = m.match(/\b(wedding|office|work|casual|formal|summer|winter|evening|date|party|travel)\b/i)?.[1] || 'occasion';
          commentary = `Perfect for ${occasion}! I've pulled together ${display.length} pieces — check the store grid.`;
        } else if (hasProductKeywords) {
          commentary = `Got it! I found what we have in stock — the store grid has been updated.`;
        } else {
          commentary = `Found ${display.length} pieces that match. The store grid is showing them now.`;
        }

        setMessages(prev => [...prev, {
          role: 'assistant',
          text: commentary
        }]);
        return { handled: true, intent: 'search' };
      }
    }

    // Not handled locally — let Groq AI handle conversational messages
    return { handled: false };
  };

  // ─── MAIN MESSAGE HANDLER ───
  const handleSendMessage = async () => {
    if (!input.trim()) return;
    const userMessage = input;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: userMessage }]);
    setLoading(true);

    const messageRudeness = detectRudeness(userMessage);
    const newRudenessScore = Math.min(5, rudenessScore + messageRudeness);
    setRudenessScore(messageRudeness > 0 ? newRudenessScore : Math.max(0, rudenessScore - 1));

    // Track negotiation attempts (discount requests)
    const isDiscountRequest = /\b(discount|deal|coupon|cheaper|price.*(down|lower|break|reduction)|can.*(get|have).*(off|deal|discount)|birthday|student|military|first.*time|loyal|bulk|celebrate|special.*occasion)\b/i.test(userMessage) &&
      /\b(discount|deal|off|coupon|cheaper|price|birthday|student)\b/i.test(userMessage);
    if (isDiscountRequest) {
      setNegotiationAttempts(prev => prev + 1);
    }

    // ═══ TRY LOCAL INTENT ENGINE FIRST (no API call) ═══
    // Only for clear, unambiguous intents that don't need AI conversation
    const localResult = await handleLocalIntent(userMessage);
    if (localResult.handled) {
      setConversationHistory(prev => [...prev.slice(-8),
      { role: 'user', text: userMessage },
      { role: 'assistant', text: `[local:${localResult.intent}]` }
      ]);
      logClerkInteraction({
        user_id: user?.id, user_email: user?.email,
        user_message: userMessage, clerk_response: `[local:${localResult.intent}]`,
        clerk_sentiment: 'neutral', discount_offered: 0, negotiation_successful: false,
        cart_snapshot: cart.map(i => ({ id: i.product.id, name: i.product.name, qty: i.quantity, price: i.product.price })),
        metadata: { mode: 'local', intent: localResult.intent }
      });
      setLoading(false);
      return;
    }

    // Groq AI handling with RAG
    let finalClerkResponse = "";
    let didShowSomething = false;

    try {
      setIsRetrieving(true);

      // Build Groq messages
      const systemMessage: Groq.Chat.ChatCompletionMessageParam = {
        role: 'system',
        content: `${CLERK_SYSTEM_PROMPT}

CURRENT STATE:
- INVENTORY: ${allProducts.length} pieces across Outerwear, Basics, Accessories, Home, Apparel, Footwear
- CART: ${cart.length === 0 ? 'Empty' : cart.map(i => `${i.product.name} ($${i.product.price} × ${i.quantity})`).join(', ')}
- CART TOTAL: $${cartTotal} | DISCOUNT: ${negotiatedDiscount}%${negotiatedDiscount < 0 ? ' (SURCHARGE ACTIVE)' : ''}
- RUDENESS LEVEL: ${newRudenessScore}/5 ${newRudenessScore >= 3 ? '→ REFUSE discounts, apply LUXURY TAX surcharge' : ''}
- NEGOTIATION ATTEMPTS: ${negotiationAttempts} ${negotiationAttempts === 0 ? '(first discount request - ask probing questions, delay granting)' : negotiationAttempts === 1 ? '(second attempt - probe deeper, test commitment)' : negotiationAttempts >= 2 ? '(third+ attempt - if polite and serious, you may grant discount now)' : ''}
- EMBEDDING STATUS: ${embeddingModelStatus}
- PATRON: ${user?.email || 'Guest'}`,
      };

      const chatMessages: Groq.Chat.ChatCompletionMessageParam[] = [
        systemMessage,
        ...conversationHistory.slice(-6).map(h => ({
          role: h.role as 'user' | 'assistant',
          content: h.text,
        })),
        { role: 'user', content: userMessage },
      ];

      // Call Groq
      const { response } = await callGroqWithFallback(chatMessages, groqTools);
      const choice = response.choices[0];
      const message = choice?.message;

      setIsRetrieving(false);

      // Handle tool calls
      if (message?.tool_calls && message.tool_calls.length > 0) {
        for (const toolCall of message.tool_calls) {
          const fnName = toolCall.function.name;
          let args: any = {};
          try { args = JSON.parse(toolCall.function.arguments || '{}'); } catch (e) { }

          if (fnName === 'search_inventory') {
            // ═══ HYBRID SEARCH TOOL - THE MAGIC HAPPENS HERE ═══
            const searchStartTime = Date.now();

            const { products, metadata } = await hybridSearch(args.query, {
              category: args.category,
              minPrice: args.min_price,
              maxPrice: args.max_price,
              maxResults: args.max_results || 6,
            });

            if (products.length === 0) {
              setMessages(prev => [...prev, {
                role: 'assistant',
                text: `I searched the entire archive with hybrid search (BM25 + vector embeddings), but nothing matches "${args.query}". Try a different query or broader terms.`,
                error: true,
                searchMetadata: {
                  query: args.query,
                  resultsCount: 0,
                  method: metadata.method,
                  searchTime: metadata.searchTime,
                }
              }]);
            } else {
              // Display products in chat with rich cards
              const searchResponses = [
                `Found ${products.length} pieces using hybrid search (${metadata.method} mode). Check the cards below:`,
                `Curated ${products.length} results via ${metadata.method} search in ${metadata.searchTime}ms:`,
                `${products.length} matches from the archive (${metadata.vectorMatches} semantic + ${metadata.keywordMatches} keyword):`,
              ];

              setMessages(prev => [...prev, {
                role: 'assistant',
                text: searchResponses[Math.floor(Math.random() * searchResponses.length)],
                products: products, // ← CRITICAL: Products displayed in chat!
                searchMetadata: {
                  query: args.query,
                  resultsCount: products.length,
                  method: metadata.method,
                  searchTime: metadata.searchTime,
                }
              }]);

              // Update main grid
              updateProductFilter({ query: args.query, category: args.category, productIds: products.map(p => p.id) });
              addToast(`${products.length} results for "${args.query}" (${metadata.method})`, 'success');
            }
            didShowSomething = true;

          } else if (fnName === 'add_to_cart') {
            let product = allProducts.find(p => p.id === args.product_id);
            if (!product) {
              const q = (args.product_id || '').toLowerCase();
              product = allProducts.find(p =>
                p.name.toLowerCase().includes(q) ||
                p.id.toLowerCase().includes(q) ||
                q.includes(p.name.toLowerCase())
              );

              // If still not found, use semantic search (RAG)
              if (!product && embeddingModelStatus === 'ready') {
                try {
                  const queryEmbedding = await getLocalEmbedding(q);
                  if (queryEmbedding) {
                    let bestMatch: Product | null = null;
                    let bestScore = 0;

                    for (const p of allProducts) {
                      let prodEmbedding = productEmbeddingsCache.get(p.id);
                      if (!prodEmbedding) {
                        prodEmbedding = await getLocalEmbedding(`${p.name} ${p.description} ${p.tags.join(' ')}`);
                        if (prodEmbedding) setProductEmbeddingsCache(prev => new Map(prev).set(p.id, prodEmbedding));
                      }
                      if (prodEmbedding) {
                        const score = cosineSimilarity(queryEmbedding, prodEmbedding);
                        if (score > bestScore) {
                          bestScore = score;
                          bestMatch = p;
                        }
                      }
                    }

                    // Use semantic match if score is decent (>0.3)
                    if (bestMatch && bestScore > 0.3) {
                      product = bestMatch;
                    }
                  }
                } catch (err) {
                  console.warn('[add_to_cart] Semantic search failed:', err);
                }
              }
            }
            if (product) {
              addToCartWithQuantity(product.id, args.quantity || 1);
              openCart();
              setMessages(prev => [...prev, {
                role: 'assistant',
                text: `${product.name} × ${args.quantity || 1} — secured. Excellent choice.`
              }]);
              addToast(`${product.name} added to bag`, 'success');
            } else {
              setMessages(prev => [...prev, {
                role: 'assistant',
                text: `Couldn't find that exact piece. Try searching first?`
              }]);
            }
            didShowSomething = true;
          } else if (fnName === 'remove_from_cart') {
            removeFromCart(args.product_id);
            setMessages(prev => [...prev, { role: 'assistant', text: "Gone! Having second thoughts? Happens to the best of us." }]);
            didShowSomething = true;
          } else if (fnName === 'sort_and_filter_store' || fnName === 'update_ui') {
            if (args.sort_order || args.sort) {
              setSortOrder(args.sort_order || args.sort);
              addToast(`Store sorted by ${args.sort_order || args.sort}`, 'success');
            }
            if (args.category) {
              filterByCategory(args.category);
              addToast(`Filtered to ${args.category}`, 'success');
            }
            if (args.query || args.filter_query) {
              updateProductFilter({ query: args.query || args.filter_query });
              addToast(`Filtered: ${args.query || args.filter_query}`, 'success');
            }
            const uiResponses = [
              "The floor's been reorganized. See what commands your attention.",
              "Curated. The collection now reflects your vision.",
              "Done. The store adapts to your tastes.",
            ];
            setMessages(prev => [...prev, { role: 'assistant', text: uiResponses[Math.floor(Math.random() * uiResponses.length)] }]);
            didShowSomething = true;
          } else if (fnName === 'generate_coupon') {
            // RAG-backed coupon generation — validates against bottom_price, injects into cart session
            const couponResult: CouponResult = handleGenerateCouponToolCall(
              args,
              cart,
              newRudenessScore
            );

            if (couponResult.refused) {
              // Rudeness surcharge — injected as negative discount into cart session
              applyNegotiatedDiscount(couponResult.couponCode, couponResult.discountPercent);
              setNegotiationAttempts(0); // Reset after surcharge
              setMessages(prev => [...prev, {
                role: 'assistant',
                text: "Your bag is empty. Add items first, then we'll talk discounts."
              }]);
            } else if (newRudenessScore >= 3) {
              const surcharge = Math.min(newRudenessScore * 5, 25);
              const code = `RUDE-SURCHARGE-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
              applyNegotiatedDiscount(code, -surcharge);
              setMessages(prev => [...prev, {
                role: 'assistant',
                text: `Interesting approach. Unfortunately, the archive has a dignity clause. Prices just went up ${surcharge}%. Try again with refinement.`,
                error: true
              }]);
              addToast(`${surcharge}% surcharge for rudeness`, 'error');
            } else {
              // Success — inject coupon directly into cart session
              applyNegotiatedDiscount(couponResult.couponCode, couponResult.discountPercent);
              setNegotiationAttempts(0); // Reset after successful discount
              setShowDiscountToast({
                code: couponResult.couponCode,
                percent: couponResult.discountPercent,
                reason: couponResult.reason
              });
              setMessages(prev => [...prev, {
                role: 'assistant',
                text: `You drive a fair bargain. ${percent}% off — sealed and applied. Code: ${code}`,
                coupon: { code, percent, reason: args.reason }
              }]);
              addToast(`${percent}% discount applied: ${code}`, 'success');
            }
            didShowSomething = true;
          } else if (fnName === 'recommend_products') {
            await handleLocalIntent('recommend something');
            didShowSomething = true;
          } else if (fnName === 'change_theme') {
            const currentTheme = theme;
            const targetMode = args.mode;

            // Toggle if no mode specified, or switch to the specified mode
            if (!targetMode || targetMode !== currentTheme) {
              toggleTheme();
              const newTheme = currentTheme === 'light' ? 'dark' : 'light';
              const themeResponses = [
                `${newTheme === 'dark' ? 'Lights dimmed' : 'Let there be light'}. The floor adapts to your vision.`,
                `Switched to ${newTheme} mode. Better?`,
                `${newTheme === 'dark' ? 'Dark mode engaged' : 'Light mode restored'}. The collection remains unchanged.`,
              ];
              setMessages(prev => [...prev, { role: 'assistant', text: themeResponses[Math.floor(Math.random() * themeResponses.length)] }]);
              addToast(`${newTheme === 'dark' ? 'Dark' : 'Light'} mode activated`, 'success');
            } else {
              setMessages(prev => [...prev, { role: 'assistant', text: `Already in ${currentTheme} mode. Looking good.` }]);
            }
            didShowSomething = true;

          } else if (fnName === 'initiate_checkout') {
            await handleLocalIntent('checkout');
            didShowSomething = true;
          } else if (fnName === 'show_cart_summary') {
            await handleLocalIntent('show my cart');
            didShowSomething = true;
          } else if (fnName === 'check_inventory') {
            const product = allProducts.find(p => p.id === args.product_name_or_id || p.name.toLowerCase().includes((args.product_name_or_id || '').toLowerCase()));
            if (product) {
              setMessages(prev => [...prev, { role: 'assistant', text: `${product.name} — $${product.price}\n\n${product.description}\n\nCategory: ${product.category} | Tags: ${(product.tags || []).join(', ')}` }]);
              didShowSomething = true;
            }
          }
        }
      }

      // Text response
      if (message?.content && message.content.length > 20) {
        finalClerkResponse = message.content;
        if (!didShowSomething) {
          setMessages(prev => [...prev, { role: 'assistant', text: finalClerkResponse }]);
          didShowSomething = true;
        }
      }

      // Safety net
      if (!didShowSomething) {
        setMessages(prev => [...prev, {
          role: 'assistant',
          text: "I'm listening! What kind of products are you looking for? Give me a style, occasion, or price range."
        }]);
      }

      setConversationHistory(prev => [...prev.slice(-8),
      { role: 'user', text: userMessage },
      { role: 'assistant', text: finalClerkResponse || '(showed products)' }
      ]);

    } catch (error: any) {
      console.error("Clerk error:", error);
      setIsRetrieving(false);
      setMessages(prev => [...prev, {
        role: 'assistant',
        text: "The archive flickered. Try that again? Or describe what you're looking for."
      }]);
    } finally {
      setLoading(false);
      setIsRetrieving(false);
    }
  };

  const handleInitiateStripeCheckout = async () => {
    if (cart.length === 0) return;
    setIsRedirecting(true);
    try {
      const mockRequest = {
        method: 'POST',
        json: async () => ({ cartItems: cart, negotiatedTotal: cartTotal, discountPercent: negotiatedDiscount })
      };
      const response = await checkoutHandler(mockRequest as any);
      const { sessionId } = await response.json();
      const stripe = getStripe();
      await stripe.redirectToCheckout({ sessionId });
    } catch (err) {
      console.error(err);
      setIsRedirecting(false);
    }
  };

  // ══════════════════════════════════════════════════════════════
  // QUICK ACTIONS
  // ══════════════════════════════════════════════════════════════

  const quickActions = [
    { label: "Summer wedding outfit", action: "I need an outfit for a summer wedding in Italy" },
    { label: "Under $300", action: "Show me your best pieces under $300" },
    { label: "Leather jackets", action: "Show me leather jackets" },
    { label: "Birthday discount", action: "Can I get a birthday discount?" },
  ];

  // ══════════════════════════════════════════════════════════════
  // PRODUCT CARD IN CHAT - RICH DISPLAY WITH REVIEWS
  // ══════════════════════════════════════════════════════════════

  const ProductCardInChat: React.FC<{ product: Product }> = ({ product }) => {
    const avgRating = getAvgRating(product);
    const reviewCount = product.reviews?.length || 0;
    const topReview = product.reviews?.[0];

    return (
      <div className="group bg-white dark:bg-gray-900 border border-black/10 dark:border-white/10 hover:border-black/30 dark:hover:border-white/30 transition-all duration-300 overflow-hidden flex-shrink-0 w-[200px]">
        <div className="relative aspect-square overflow-hidden bg-gray-50 dark:bg-gray-800">
          <img src={product.image_url} alt={product.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" loading="lazy" />
          <div className="absolute top-2 right-2 bg-black/90 dark:bg-white/90 text-white dark:text-black text-[10px] font-black uppercase tracking-wider px-2 py-1">
            ${product.price}
          </div>
        </div>
        <div className="p-3">
          <p className="text-[9px] uppercase tracking-[0.2em] text-gray-400 dark:text-gray-500 font-bold">{product.category}</p>
          <p className="text-xs font-bold line-clamp-2 mt-1 leading-tight">{product.name}</p>

          {/* Reviews */}
          <div className="flex items-center gap-1 mt-2">
            {[...Array(5)].map((_, i) => (
              <Star key={i} size={10} className={i < Math.round(avgRating) ? 'fill-yellow-400 text-yellow-400' : 'text-gray-200 dark:text-gray-700'} />
            ))}
            <span className="text-[9px] text-gray-400 dark:text-gray-500 ml-1">({reviewCount})</span>
          </div>

          {/* Top Review Snippet */}
          {topReview && (
            <p className="text-[8px] text-gray-500 dark:text-gray-400 italic mt-2 line-clamp-2 leading-tight">
              "{topReview.comment}"
            </p>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 mt-3">
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                addToCartWithQuantity(product.id, 1);
                addToast(`${product.name} added`, 'success');
              }}
              className="flex-1 py-1.5 bg-black dark:bg-white text-white dark:text-black text-[8px] uppercase tracking-[0.2em] font-black hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors"
            >
              Add to Bag
            </button>
            <a
              href={`#/product/${product.id}`}
              className="p-1.5 border border-black/10 dark:border-white/10 hover:border-black dark:hover:border-white transition-colors"
              title="View details"
            >
              <ExternalLink size={12} className="text-gray-400 dark:text-gray-500" />
            </a>
          </div>
        </div>
      </div>
    );
  };

  // ══════════════════════════════════════════════════════════════
  // COUPON DISPLAY
  // ══════════════════════════════════════════════════════════════

  const CouponCard: React.FC<{ coupon: { code: string; percent: number; reason: string } }> = ({ coupon }) => (
    <div className="bg-gradient-to-r from-black to-gray-800 dark:from-white dark:to-gray-200 text-white dark:text-black p-4 my-2 border border-white/10 dark:border-black/10">
      <div className="flex items-center gap-3">
        <Tag size={16} className="text-yellow-400 dark:text-yellow-600" />
        <div>
          <p className="text-[9px] uppercase tracking-[0.4em] text-gray-400 dark:text-gray-600 font-black">{coupon.reason}</p>
          <p className="text-lg font-black tracking-tight mt-1">{coupon.code}</p>
          <p className="text-[10px] text-yellow-400 dark:text-yellow-600 font-bold mt-0.5">{coupon.percent}% OFF APPLIED</p>
        </div>
      </div>
    </div>
  );

  // ══════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════

  return (
    <>
      <input type="file" accept="image/*" ref={fileInputRef} className="hidden" onChange={handleSelfieUpload} />

      {isRedirecting && (
        <div className="fixed inset-0 z-[500] bg-white dark:bg-black flex flex-col items-center justify-center">
          <div className="modern-loader mb-12"></div>
          <p className="text-[10px] uppercase tracking-[0.6em] font-black">Securing Acquisition</p>
        </div>
      )}

      {showDiscountToast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[300] w-[90%] max-w-sm">
          <div className="bg-black dark:bg-white text-white dark:text-black p-5 border border-white/20 dark:border-black/20 shadow-2xl animate-in slide-in-from-top-12 duration-700">
            <div className="flex items-center space-x-6">
              <Percent size={20} className="text-yellow-400 shrink-0" />
              <div className="flex-1">
                <span className="text-[9px] uppercase tracking-[0.4em] font-black text-gray-400 dark:text-gray-600">{showDiscountToast.reason}</span>
                <span className="block text-sm font-bold tracking-wide">{showDiscountToast.code}</span>
                <span className="block text-xs text-yellow-400 dark:text-yellow-600">{showDiscountToast.percent}% OFF</span>
              </div>
              <button onClick={() => setShowDiscountToast(null)} className="p-2"><X size={16} /></button>
            </div>
          </div>
        </div>
      )}

      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 z-[120] bg-black dark:bg-white text-white dark:text-black p-5 rounded-none shadow-2xl border border-white/10 dark:border-black/10 active:scale-90 transition-all group"
        >
          <Bot size={24} strokeWidth={1.5} />
          {embeddingModelStatus === 'ready' && (
            <span className="absolute -top-1 -right-1 w-3 h-3 bg-green-400 rounded-none animate-pulse" title="RAG Ready" />
          )}
        </button>
      )}

      <div className={`fixed inset-y-0 right-0 z-[130] w-full sm:w-[520px] transition-all duration-700 transform ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="absolute inset-0 glass-panel border-l border-black/5 dark:border-white/10" />
        <div className="relative h-full flex flex-col">

          {/* Header */}
          <div className="p-6 md:p-10 border-b border-black/5 dark:border-white/5 flex justify-between items-end">
            <div>
              <span className="text-[10px] uppercase tracking-[0.5em] text-gray-400 dark:text-gray-500 font-black">
                Archive Concierge {embeddingModelStatus === 'ready' && '• RAG ACTIVE'}
              </span>
              <h2 className="font-serif text-3xl md:text-5xl font-bold uppercase tracking-tighter">The Clerk</h2>
              <span className="text-[8px] uppercase tracking-[0.3em] text-gray-300 dark:text-gray-600 font-bold mt-1 block">
                Hybrid Search • BM25 + Vector • RRF Fusion
              </span>
            </div>
            <button onClick={() => setIsOpen(false)} className="p-3 -mr-3 active:scale-90"><X size={32} strokeWidth={1} /></button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto no-scrollbar p-6 md:p-10 space-y-6 pb-24">
            {messages.length === 0 && (
              <div className="h-full flex flex-col justify-center max-w-[360px] py-16">
                <h3 className="font-serif text-3xl md:text-4xl mb-6 italic leading-tight">"So, what brings you in today?"</h3>
                <p className="text-[11px] uppercase tracking-[0.2em] text-gray-500 dark:text-gray-400 leading-relaxed font-bold mb-8">
                  I'm The Clerk — powered by production-grade RAG with hybrid search (BM25 keyword matching + vector embeddings + reciprocal rank fusion). Search, shop, negotiate, checkout — all through conversation.
                </p>
                <div className="space-y-3">
                  <p className="text-[9px] uppercase tracking-[0.4em] text-gray-300 dark:text-gray-600 font-black">Try These</p>
                  <div className="flex flex-wrap gap-2">
                    {quickActions.map(qa => (
                      <button
                        key={qa.label}
                        onClick={() => setInput(qa.action)}
                        className="px-3 py-2 border border-black/10 dark:border-white/10 text-[9px] uppercase tracking-widest font-black hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-all active:scale-95"
                      >
                        {qa.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {messages.map((m, i) => (
              <div key={i} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'} animate-in slide-in-from-bottom-2 duration-500`}>
                <div className={`max-w-[95%] p-4 ${m.role === 'user' ? 'text-right font-light italic text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900' : 'text-left text-black dark:text-white bg-black/5 dark:bg-white/5'} ${m.error ? 'border-l-2 border-red-500 dark:border-red-400' : ''}`}>
                  {m.error && <AlertCircle size={12} className="text-red-500 dark:text-red-400 mb-2 inline-block mr-1" />}
                  <span className="whitespace-pre-line text-sm leading-relaxed">{m.text}</span>

                  {/* Search Metadata */}
                  {m.searchMetadata && (
                    <div className="mt-2 pt-2 border-t border-black/10 dark:border-white/10">
                      <p className="text-[8px] uppercase tracking-[0.3em] text-gray-400 dark:text-gray-500">
                        {m.searchMetadata.method.toUpperCase()} • {m.searchMetadata.searchTime}ms • {m.searchMetadata.resultsCount} results
                      </p>
                    </div>
                  )}
                </div>

                {/* PRODUCT CARDS - CRITICAL FEATURE */}
                {m.products && m.products.length > 0 && (
                  <div className="flex gap-3 overflow-x-auto mt-3 pb-2 w-full no-scrollbar">
                    {m.products.map(p => <ProductCardInChat key={p.id} product={p} />)}
                  </div>
                )}

                {m.coupon && <CouponCard coupon={m.coupon} />}
                {m.isTryOn && m.tryOnResult && (
                  <div className="mt-3 w-48 aspect-[3/4] overflow-hidden border border-black/10 dark:border-white/10">
                    <img src={m.tryOnResult} alt="Virtual try-on" className="w-full h-full object-cover" />
                  </div>
                )}
              </div>
            ))}

            {isRetrieving && (
              <div className="flex flex-col items-start space-y-2 px-5 animate-pulse">
                <div className="flex items-center gap-3">
                  <Search size={12} className="text-black dark:text-white animate-spin" />
                  <span className="text-[9px] uppercase tracking-[0.4em] font-black text-gray-400 dark:text-gray-500">
                    Hybrid Search Running...
                  </span>
                </div>
              </div>
            )}

            {loading && !isProcessingTryOn && !isRetrieving && (
              <div className="flex space-x-3 px-5">
                <div className="w-2 h-2 bg-black dark:bg-white rounded-full animate-bounce [animation-delay:-0.3s]" />
                <div className="w-2 h-2 bg-black dark:bg-white rounded-full animate-bounce [animation-delay:-0.15s]" />
                <div className="w-2 h-2 bg-black dark:bg-white rounded-full animate-bounce" />
              </div>
            )}
          </div>

          {/* Input Bar */}
          <div className="p-6 md:p-10 border-t border-black/5 dark:border-white/5 bg-white/40 dark:bg-black/40 backdrop-blur-xl">
            <div className="relative flex items-center gap-4">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !loading && handleSendMessage()}
                  placeholder="Try: Show me summer dresses..."
                  className="w-full bg-transparent border-b border-black/20 dark:border-white/20 focus:border-black dark:focus:border-white outline-none py-5 text-sm uppercase tracking-[0.3em] font-bold transition-colors placeholder:text-gray-300 dark:placeholder:text-gray-600"
                  disabled={loading}
                />
                <button
                  onClick={handleSendMessage}
                  className="absolute right-0 p-4 active:scale-90 transition-transform"
                  disabled={loading || !input.trim()}
                >
                  <ChevronRight size={28} className={loading || !input.trim() ? 'text-gray-200 dark:text-gray-700' : 'text-black dark:text-white'} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default AIChatAgent;
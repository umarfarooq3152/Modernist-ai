import React, { useState, useEffect, useRef } from 'react';
import { X, Bot, ChevronRight, Percent, Camera, Wand2, RefreshCw, Check, Sparkles, PlusCircle, Activity, AlertCircle, Star, ShoppingBag, ExternalLink, ArrowUpDown, Tag, Search } from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { useAuth } from '../context/AuthContext';
import Groq from 'groq-sdk';
import { Product } from '../types';
import { getStripe } from '../lib/stripe';
import checkoutHandler from '../api/checkout';
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
  const [showDiscountToast, setShowDiscountToast] = useState<{code: string, percent: number, reason: string} | null>(null);
  const [userSelfie, setUserSelfie] = useState<string | null>(null);
  const [isProcessingTryOn, setIsProcessingTryOn] = useState(false);
  const [workingModel, setWorkingModel] = useState<string>(MODEL_FALLBACK_CHAIN[0]);
  const [conversationHistory, setConversationHistory] = useState<{ role: string; text: string }[]>([]);
  const [rudenessScore, setRudenessScore] = useState(0);
  
  // RAG-specific state
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
        description: 'Add product to bag by ID. Use when user says "add this", "I\'ll take it", "buy the X".',
        parameters: {
          type: 'object',
          properties: {
            product_id: { type: 'string', description: 'Product ID' },
            quantity: { type: 'number', description: 'Quantity (default 1)' },
          },
          required: ['product_id'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'generate_coupon',
        description: 'Generate discount coupon. Use when user asks for deal/discount with reason (birthday, student, loyal). Refuse if rude.',
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
  ];

  // ══════════════════════════════════════════════════════════════
  // LOCAL INTENT HANDLERS (No API needed)
  // ══════════════════════════════════════════════════════════════

  type IntentResult = { handled: boolean; intent?: string };

  const handleLocalIntent = (msg: string): IntentResult => {
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

    // Help
    if (/\b(help|what can you do|how does this work)\b/i.test(m)) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        text: `I'm The Clerk — your AI shopping assistant with elite search capabilities.\n\n🔍 **Hybrid Search**: "Show me summer dresses" → I use BM25 keyword matching + vector embeddings + reciprocal rank fusion to find exactly what you need\n🛒 **Shop**: "Add the cashmere sweater" → instant cart updates\n💰 **Haggle**: "Birthday discount?" → I'll negotiate (be polite!)\n🎨 **Filter**: "Sort by price" → real-time UI updates\n💳 **Checkout**: "Buy now" → seamless payment\n\nPowered by production-grade RAG architecture. Ask anything!`
      }]);
      return { handled: true, intent: 'help' };
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

    return { handled: false };
  };

  // ══════════════════════════════════════════════════════════════
  // MAIN MESSAGE HANDLER - RAG-POWERED
  // ══════════════════════════════════════════════════════════════

  const handleSendMessage = async () => {
    if (!input.trim()) return;
    
    // Check API key before proceeding
    if (!GROQ_API_KEY || GROQ_API_KEY.length < 10) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        text: `⚠️ The Clerk needs a Groq API key to function.\n\n🔧 Quick Fix:\n1. Go to https://console.groq.com/\n2. Get free API key (starts with gsk_...)\n3. Add to .env.local:\n   VITE_GROQ_API_KEY=gsk_your_key_here\n4. Restart dev server\n\nOr paste directly in AIChatAgent.tsx around line 87.`,
        error: true
      }]);
      setLoading(false);
      return;
    }
    
    const userMessage = input;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: userMessage }]);
    setLoading(true);

    const messageRudeness = detectRudeness(userMessage);
    const newRudenessScore = Math.min(5, rudenessScore + messageRudeness);
    setRudenessScore(messageRudeness > 0 ? newRudenessScore : Math.max(0, rudenessScore - 1));

    // Try local intent first
    const localResult = handleLocalIntent(userMessage);
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
- HYBRID SEARCH: BM25 (keyword) + Vector Embeddings (semantic) + RRF Fusion - PRODUCTION READY
- INVENTORY: ${allProducts.length} products
- CART: ${cart.length === 0 ? 'Empty' : cart.map(i => `${i.product.name} ($${i.product.price}×${i.quantity})`).join(', ')}
- TOTAL: $${cartTotal} | DISCOUNT: ${negotiatedDiscount}%
- RUDENESS: ${newRudenessScore}/5 ${newRudenessScore >= 3 ? '→ APPLY SURCHARGE' : ''}
- SEARCH STATUS: ${embeddingModelStatus}
- USER: ${user?.email || 'Guest'}`,
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
          try { args = JSON.parse(toolCall.function.arguments || '{}'); } catch(e) {}

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
            
          } else if (fnName === 'generate_coupon') {
            if (cart.length === 0) {
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
              let percent = Math.min(args.discount || 10, cart.length >= 3 ? 25 : 20);
              const code = generateCouponCode(args.reason, percent);
              applyNegotiatedDiscount(code, percent);
              setShowDiscountToast({ code, percent, reason: args.reason });
              setMessages(prev => [...prev, {
                role: 'assistant',
                text: `You drive a fair bargain. ${percent}% off — sealed and applied. Code: ${code}`,
                coupon: { code, percent, reason: args.reason }
              }]);
              addToast(`${percent}% discount applied: ${code}`, 'success');
            }
            didShowSomething = true;
            
          } else if (fnName === 'update_ui') {
            if (args.sort) {
              setSortOrder(args.sort);
              addToast(`Sorted by ${args.sort}`, 'success');
            }
            if (args.category) {
              filterByCategory(args.category);
              addToast(`Filtered to ${args.category}`, 'success');
            }
            setMessages(prev => [...prev, {
              role: 'assistant',
              text: "The floor's been reorganized. Check the grid."
            }]);
            didShowSomething = true;
            
          } else if (fnName === 'initiate_checkout') {
            handleLocalIntent('checkout');
            didShowSomething = true;
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
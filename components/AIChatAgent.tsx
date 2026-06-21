/// <reference types="../vite-env.d.ts" />

import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Bot, ChevronRight, Percent, AlertCircle, Star, ExternalLink, Tag, Search } from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { useAuth } from '../context/AuthContext';
import Groq from 'groq-sdk';
import { Product } from '../types';
import { CLERK_SYSTEM_PROMPT } from '../lib/clerkSystemPrompt';
import { semanticSearch as serverSemanticSearch } from '../lib/ragApi';

// ── Coupon result type (inlined — was in ragIntegration.ts) ──
interface CouponResult {
  success: boolean;
  couponCode: string;
  discountPercent: number;
  reason: string;
  refused: boolean;
  message: string;
}

function handleGenerateCouponToolCall(
  args: { code?: string; discount?: number; reason?: string; sentiment?: string },
  cartItems: { product: Product; quantity: number }[],
  rudenessScore: number
): CouponResult {
  if (typeof args.discount === 'string') args.discount = parseFloat(args.discount as any);
  const sentiment = (args.sentiment || 'neutral').toLowerCase();

  if (rudenessScore >= 3 || sentiment === 'rude') {
    const surcharge = Math.min(rudenessScore * 5, 25);
    return {
      success: false,
      couponCode: `RUDE-${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
      discountPercent: -surcharge,
      reason: 'Attitude surcharge',
      refused: true,
      message: `Prices just went up ${surcharge}%. Come back with a better attitude.`,
    };
  }
  if (cartItems.length === 0) {
    return { success: false, couponCode: '', discountPercent: 0, reason: '', refused: false, message: 'Add some pieces first.' };
  }

  const total = cartItems.reduce((s, i) => s + i.product.price * i.quantity, 0);
  const minTotal = cartItems.reduce((s, i) => s + (i.product.bottom_price ?? i.product.price * 0.7) * i.quantity, 0);
  const maxDiscount = Math.max(0, Math.min(Math.floor(((total - minTotal) / total) * 100), 30));

  const rawDiscount = typeof args.discount === 'number' && !isNaN(args.discount) ? args.discount : 15;
  const finalDiscount = Math.max(5, Math.min(rawDiscount, maxDiscount));
  const reason = args.reason || 'valued customer';
  const prefix = reason.toLowerCase().includes('birthday') ? 'BDAY'
    : reason.toLowerCase().includes('student') ? 'STUDENT'
    : reason.toLowerCase().includes('military') ? 'HONOR'
    : reason.toLowerCase().includes('first') ? 'WELCOME'
    : 'CLERK';
  const code = args.code || `${prefix}-${finalDiscount}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
  return { success: true, couponCode: code, discountPercent: finalDiscount, reason, refused: false, message: `${finalDiscount}% off granted.` };
}

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  text: string;
  products?: Product[];
  coupon?: { code: string; percent: number; reason: string };
  error?: boolean;
  searchMetadata?: { method: string; searchTime: number; resultsCount: number };
}

class BM25Ranker {
  private documents: { id: string; text: string }[];
  private k1: number;
  private b: number;
  private avgDocLength: number = 0;
  private idf: Map<string, number> = new Map();

  constructor(documents: { id: string; text: string }[], k1 = 1.5, b = 0.75) {
    this.documents = documents;
    this.k1 = k1;
    this.b = b;
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

interface HaggleSession {
  isActive: boolean;
  turnCount: number;
  startedAt: number;
  cartSnapshot: { productId: string; quantity: number; price: number; bottomPrice: number }[];
  conversationContext: string[];
  lastAIQuestion: string | null;
  userCommitmentLevel: number;
  discountGiven: boolean;
  couponCode: string | null;
  justAskedToContinue: boolean;
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
  'llama-3.1-70b-versatile',
  'llama-3.1-8b-instant',
];

const MAX_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 3000;
const MIN_REQUEST_INTERVAL_MS = 1000;

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
let lastRequestTimestamp = 0;


// GROQ & OLLAMA API KEYS
const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY || '';

const groqClient = new Groq({
  apiKey: GROQ_API_KEY,
  dangerouslyAllowBrowser: true,
});

// ══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════

const AIChatAgent: React.FC = () => {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const saved = localStorage.getItem('clerk_messages');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [loading, setLoading] = useState(false);
  const [isRetrieving, setIsRetrieving] = useState(false);
  const [showDiscountToast, setShowDiscountToast] = useState<{ code: string, percent: number, reason: string } | null>(null);
  const [conversationHistory, setConversationHistory] = useState<{ role: string; text: string }[]>([]);
  const [rudenessScore, setRudenessScore] = useState(0);
  const [negotiationAttempts, setNegotiationAttempts] = useState(0);
  const [embeddingModelStatus, setEmbeddingModelStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [bm25Index, setBm25Index] = useState<BM25Ranker | null>(null);

  // ═══ HAGGLE SESSION STATE ═══
  const [haggleSession, setHaggleSession] = useState<HaggleSession>({
    isActive: false,
    turnCount: 0,
    startedAt: 0,
    cartSnapshot: [],
    conversationContext: [],
    lastAIQuestion: null,
    userCommitmentLevel: 0,
    discountGiven: false,
    couponCode: null,
    justAskedToContinue: false,
  });
  const [lastSuccessfulHaggle, setLastSuccessfulHaggle] = useState<{ couponCode: string; timestamp: number } | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);

  const {
    allProducts, cart, addToCartWithQuantity, openCart, lastAddedProduct, clearLastAdded,
    updateProductFilter, applyNegotiatedDiscount, negotiatedDiscount, cartTotal, cartSubtotal, addToast,
    logClerkInteraction, setSortOrder, removeFromCart, filterByCategory,
    lockCart, unlockCart, isCartLocked, isInitialLoading
  } = useStore();

  const { user } = useAuth();

  // ══════════════════════════════════════════════════════════════
  // RAG INITIALIZATION - Build Hybrid Search Indexes
  // ══════════════════════════════════════════════════════════════

  useEffect(() => {
    if (!isOpen || bm25Index) return;

    // Build BM25 keyword index — instant, no model download required.
    // Semantic vector search is handled server-side via the rag-search edge function.
    const bm25Docs = allProducts.map(p => ({
      id: p.id,
      text: `${p.name} ${p.category} ${(p.tags || []).join(' ')} ${p.description}`.toLowerCase()
    }));
    setBm25Index(new BM25Ranker(bm25Docs));
    setEmbeddingModelStatus('ready');
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
      // STAGE 1: BM25 Keyword Search (fast exact matching)
      let keywordResults: { id: string; score: number }[] = [];
      if (bm25Index) {
        keywordResults = bm25Index.search(query, maxResults * 2);
      }

      // STAGE 2: Server-side vector semantic search via rag-search edge function.
      // Embeddings are stored in pgvector (generated by the generate-embeddings edge function
      // using the same gte-small model), so query and document vectors are always in the same space.
      let vectorResults: { id: string; score: number }[] = [];
      try {
        const ragRes = await serverSemanticSearch(query, {
          matchThreshold: 0.3,
          matchCount: maxResults * 2,
          explain: false,
        });
        vectorResults = ragRes.results.map(r => ({ id: r.id, score: r.similarity }));
      } catch (embErr) {
        console.warn('[VECTOR/SERVER] Server semantic search failed, using keyword only:', embErr);
      }

      // STAGE 3: Reciprocal Rank Fusion (merge results)
      let fusedResults: { id: string; score: number }[] = [];
      let method: 'hybrid' | 'vector' | 'keyword' | 'fallback' = 'fallback';

      if (vectorResults.length > 0 && keywordResults.length > 0) {
        fusedResults = reciprocalRankFusion(vectorResults, keywordResults);
        method = 'hybrid';
      } else if (vectorResults.length > 0) {
        fusedResults = vectorResults;
        method = 'vector';
      } else if (keywordResults.length > 0) {
        fusedResults = keywordResults;
        method = 'keyword';
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
  }, [messages, loading, isRetrieving]);

  useEffect(() => {
    try {
      // Keep only last 40 messages to avoid bloating localStorage
      const toSave = messages.slice(-40).map(m => ({ role: m.role, text: m.text }));
      localStorage.setItem('clerk_messages', JSON.stringify(toSave));
    } catch { /* storage quota exceeded — ignore */ }
  }, [messages]);

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

  // ══════════════════════════════════════════════════════════════
  // HAGGLE MANAGEMENT FUNCTIONS
  // ══════════════════════════════════════════════════════════════

  const startHaggleSession = () => {
    // Check if already given discount recently
    if (lastSuccessfulHaggle && (Date.now() - lastSuccessfulHaggle.timestamp < 300000)) { // 5 min cooldown
      setMessages(prev => [...prev, {
        role: 'assistant',
        text: `Hold on — I already gave you ${lastSuccessfulHaggle.couponCode}. You think I'm running a charity? One discount per session. Come back later if you want to negotiate again.`
      }]);
      return false;
    }

    // Lock cart and start session
    lockCart();
    const cartSnapshot = cart.map(item => ({
      productId: item.product.id,
      quantity: item.quantity,
      price: item.product.price,
      bottomPrice: item.product.bottom_price
    }));

    setHaggleSession({
      isActive: true,
      turnCount: 0,
      startedAt: Date.now(),
      cartSnapshot,
      conversationContext: [],
      lastAIQuestion: null,
      userCommitmentLevel: 0,
      discountGiven: false,
      couponCode: null,
      justAskedToContinue: false,
    });

    return true;
  };

  const endHaggleSession = (success: boolean, couponCode?: string) => {
    unlockCart();
    setHaggleSession(prev => ({
      ...prev,
      isActive: false,
      discountGiven: success,
      couponCode: couponCode || null,
    }));

    if (success && couponCode) {
      setLastSuccessfulHaggle({
        couponCode,
        timestamp: Date.now()
      });
    }
  };

  const calculateMaxDiscount = (): number => {
    if (cart.length === 0) return 0;

    // Calculate total and minimum acceptable total (based on bottom_price)
    const total = cart.reduce((sum, item) => sum + (item.product.price * item.quantity), 0);
    const minTotal = cart.reduce((sum, item) => sum + ((item.product.bottom_price ?? item.product.price * 0.7) * item.quantity), 0);

    // Max discount percentage that keeps us above bottom_price
    const maxDiscountAmount = total - minTotal;
    const maxDiscountPercent = Math.floor((maxDiscountAmount / total) * 100);

    return Math.max(0, Math.min(maxDiscountPercent, 30)); // Cap at 30% for safety
  };

  const analyzeUserCommitment = (message: string): number => {
    const positiveSignals = [
      /\b(buying|purchasing|definitely|committed|serious|ready|need|important|special|birthday|anniversary|wedding|gift)\b/i,
      /\b(multiple|several|few|bunch|cart|already added)\b/i,
      /\b(love|great|perfect|exactly|really want)\b/i,
    ];

    const negativeSignals = [
      /\b(maybe|might|thinking|browsing|just looking|not sure|considering)\b/i,
      /\b(expensive|too much|cheaper elsewhere|overpriced)\b/i,
    ];

    let score = 50; // Start neutral

    positiveSignals.forEach(pattern => {
      if (pattern.test(message)) score += 15;
    });

    negativeSignals.forEach(pattern => {
      if (pattern.test(message)) score -= 20;
    });

    return Math.max(0, Math.min(100, score));
  };

  const isOffTopicDuringHaggle = (message: string): boolean => {
    // These are clearly OFF-TOPIC (product searches, info requests)
    const offTopicPatterns = [
      /\b(show|find|search|browse|looking for)\s+(me\s+)?(watches?|rings?|jewelry|shoes?|jacket|pants?|shirt|dress)\b/i,
      /\b(what|whats|what's|tell me about|describe)\s+(your|the)\s+(return|shipping|policy|refund|warranty)\b/i,
      /\b(how (much|many)|price of|cost of)\s+\w+/i,
      /\b(add to cart|buy|purchase|checkout)\b/i,
    ];

    // If it matches clear off-topic patterns, it's off-topic
    if (offTopicPatterns.some(pattern => pattern.test(message))) {
      return true;
    }

    // These are ON-TOPIC for haggling (responses to AI questions)
    const onTopicPatterns = [
      /\b(discount|price|cheaper|deal|off|percent|%|coupon|save)\b/i,
      /\b(yes|no|yeah|nah|yep|nope|okay|sure|fine|alright)\b/i,
      /\b(birthday|student|military|anniversary|first time|special|occasion)\b/i,
      /\b(poor|broke|tight budget|cant afford|expensive)\b/i,
      /\b(buying|purchasing|getting|need|want|committed|serious)\b/i,
      /\b(one|two|three|four|five|several|multiple|few|bunch)\s+(piece|item|thing)/i,
      /\b(today|now|right now|immediately)\b/i,
      /\b(forever|keep|long term|wardrobe|collection)\b/i,
      /\b(love|like|really|definitely|absolutely)\b/i,
    ];

    // If it matches on-topic patterns, it's on-topic
    if (onTopicPatterns.some(pattern => pattern.test(message))) {
      return false;
    }

    // Short responses (under 15 chars) are likely answers to questions = on-topic
    if (message.trim().length < 15) {
      return false;
    }

    // Otherwise, assume it's off-topic
    return true;
  };

  const buildCartContext = (): string => {
    if (cart.length === 0) return 'Cart is empty.';
    return cart.map(item => {
      const variant = [item.selectedSize, item.selectedColor].filter(Boolean).join('/');
      const variantStr = variant ? ` [${variant}]` : '';
      return `- ${item.product.name}${variantStr} (ID:${item.product.id}) x${item.quantity} @ $${item.product.price} each`;
    }).join('\n') + `\nSubtotal: $${cartSubtotal} | Discount: ${negotiatedDiscount}% | Total: $${cartTotal}`;
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
          return { response, usedModel: model };
        } catch (error: any) {
          const is404 = error?.status === 404 || error.message?.includes('not found');
          const isQuota = error?.status === 429 || error.message?.includes('rate_limit');
          const isToolFail = error?.status === 400 && error.message?.includes('tool_use_failed');

          if (is404 || isToolFail) {
            console.warn(`Groq model ${model} ${isToolFail ? 'failed tool generation' : 'not available'}, trying next.`);
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
        description: 'PRODUCTION-GRADE HYBRID SEARCH (BM25 + Vector Embeddings + RRF Fusion). Use for ANY product search request: "show me summer dresses", "leather jacket under $500", "minimalist watches", "blue shoes". ⛔ DO NOT CALL when user is responding to discount negotiation questions (e.g., "first purchase", "birthday", "50% off") - those are answers to YOUR questions, not product searches. Returns rich product cards with images, prices, reviews.',
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
              type: 'integer',
              description: 'Optional: Number of results to return (default 5, max 10). MUST BE INTEGER, NOT STRING.',
            },
            min_price: {
              type: 'integer',
              description: 'Optional: Minimum price filter in dollars. MUST BE INTEGER, NOT STRING.',
            },
            max_price: {
              type: 'integer',
              description: 'Optional: Maximum price filter in dollars. MUST BE INTEGER, NOT STRING.',
            },
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
        description: 'Generate discount coupon. CRITICAL RULES: (1) DO NOT CALL on first discount request (negotiation_attempts < 2) - respond conversationally instead. (2) ONLY call after 2+ conversation turns where you asked probing questions. (3) Call immediately with NEGATIVE discount if user is rude. Check NEGOTIATION_ATTEMPTS in system context before calling.',
        parameters: {
          type: 'object',
          properties: {
            code: { type: 'string', description: 'Coupon code like BDAY-20, LOYAL-15, STUDENT-10' },
            discount: { type: 'integer', description: 'Discount percentage as INTEGER (max 20, up to 25 for 3+ items). MUST BE INTEGER, NOT STRING.' },
            reason: { type: 'string', description: 'Reason for the discount' },
            sentiment: { type: 'string', description: 'User sentiment: polite, neutral, rude, enthusiastic' },
          },
          required: ['discount', 'reason'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'update_ui',
        description: 'Change website view - sort by price, filter by category, reset. Use for "show cheaper", "sort by price", "filter outerwear". CRITICAL: asc/ascending = price-low (cheap to expensive), desc/descending = price-high (expensive to cheap).',
        parameters: {
          type: 'object',
          properties: {
            sort: { type: 'string', description: 'Sort order: "price-low" (ascending, cheap to expensive), "price-high" (descending, expensive to cheap), or "relevance"' },
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
      if (!allProducts || allProducts.length === 0) return [];

      const q = query.toLowerCase();

      // Jewelry-focused keyword expansion map
      const vibeMap: Record<string, string[]> = {
        luxury: ['luxury', 'premium', 'gold', 'diamond', 'platinum', 'elegant'],
        casual: ['casual', 'everyday', 'simple', 'modern', 'minimalist'],
        formal: ['formal', 'elegant', 'classic', 'sophisticated', 'evening'],
        vintage: ['vintage', 'antique', 'classic', 'retro', 'heritage'],
        modern: ['modern', 'contemporary', 'sleek', 'minimalist', 'clean'],
        gift: ['gift', 'special', 'occasion', 'present', 'anniversary'],
        watch: ['watch', 'timepiece', 'chronograph', 'automatic', 'swiss'],
        ring: ['ring', 'band', 'signet', 'engagement', 'wedding'],
        necklace: ['necklace', 'pendant', 'chain', 'choker'],
        bracelet: ['bracelet', 'bangle', 'chain', 'cuff'],
        wedding: ['wedding', 'engagement', 'bridal', 'ceremony', 'eternal'],
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

        // Enhanced matching for jewelry categories
        const searchLower = q.toLowerCase();

        // Special handling for jewelry occasion searches  
        if (searchLower.includes('wedding') && (searchLower.includes('ring') || searchLower.includes('necklace'))) {
          return (text.includes('wedding') || text.includes('engagement') || text.includes('bridal')) && (text.includes('ring') || text.includes('necklace') || text.includes('jewelry'));
        }

        // Jewelry category specific matching
        if (searchLower.includes('watch')) {
          return text.includes('watch') || text.includes('chronograph') || text.includes('timepiece');
        }

        if (searchLower.includes('ring')) {
          return text.includes('ring') || text.includes('band') || text.includes('signet');
        }

        if (searchLower.includes('bracelet')) {
          return text.includes('bracelet') || text.includes('bangle') || text.includes('cuff');
        }

        if (searchLower.includes('necklace')) {
          return text.includes('necklace') || text.includes('pendant') || text.includes('chain');
        }

        // Default term matching
        return searchTerms.some(term => text.includes(term));
      });

      // ═══ ADVANCED PRICE FILTERING ═══
      // Handle: under/below/less than, over/above/more than, between, equal
      const underMatch = q.match(/(?:under|below|less\s*than|cheaper\s*than|max)\s*\$?(\d+)/i);
      const overMatch = q.match(/(?:over|above|more\s*than|greater\s*than|min)\s*\$?(\d+)/i);
      const equalMatch = q.match(/(?:equal\s*to|exactly|just)\s*\$?(\d+)/i);
      const betweenMatch = q.match(/between\s*\$?(\d+)\s*(?:and|to|-)\s*\$?(\d+)/i);

      // If there's a price filter, prioritize price filtering over keyword matching
      // Check if query is primarily about price (has price keywords but minimal product keywords)
      const hasPriceQuery = underMatch || overMatch || equalMatch || betweenMatch;
      const priceKeywords = ['show', 'find', 'get', 'give', 'between', 'under', 'over', 'above', 'below', 'price', 'cost'];
      const queryWords = q.split(/\s+/).filter(w => w.length > 2);
      const nonPriceWords = queryWords.filter(w => !priceKeywords.includes(w) && !/^\d+$/.test(w));

      // If price query with no/minimal product keywords, start fresh with all products
      if (hasPriceQuery && nonPriceWords.length <= 1) {
        results = allProducts;
      } else if (hasPriceQuery && results.length === 0) {
        // Fallback: if no keyword results but has price query, use all products
        results = allProducts;
      }

      if (underMatch) {
        const maxPrice = parseInt(underMatch[1]);
        results = results.filter(p => p.price <= maxPrice);
      }
      if (overMatch) {
        const minPrice = parseInt(overMatch[1]);
        results = results.filter(p => p.price >= minPrice);
      }
      if (equalMatch) {
        const exactPrice = parseInt(equalMatch[1]);
        results = results.filter(p => p.price === exactPrice);
      }
      if (betweenMatch) {
        const minPrice = parseInt(betweenMatch[1]);
        const maxPrice = parseInt(betweenMatch[2]);
        results = results.filter(p => p.price >= minPrice && p.price <= maxPrice);
      }

      // ═══ RATING/REVIEW FILTERING ═══
      const hasRatingFilter = /(?:highest|best|top|most|good|great)\s*(?:rated|rating|reviews?)/i.test(q) ||
        /(?:rated|rating|reviews?)\s*(?:highest|best|top|most|good|great)/i.test(q);
      const hasLowRatingFilter = /(?:lowest|worst|bad|poor)\s*(?:rated|rating|reviews?)/i.test(q);

      if (hasRatingFilter) {
        results = (results.length > 0 ? results : allProducts).sort((a, b) => getAvgRating(b) - getAvgRating(a));
      }
      if (hasLowRatingFilter) {
        results = (results.length > 0 ? results : allProducts).sort((a, b) => getAvgRating(a) - getAvgRating(b));
      }

      // ═══ PRICE SORTING ═══
      const hasCheapestSort = /(?:cheapest|least\s*expensive|lowest\s*price|most\s*affordable|budget)/i.test(q);
      const hasExpensiveSort = /(?:expensive|most\s*expensive|highest\s*price|premium|luxury)/i.test(q);
      const hasAscSort = /sort.*(?:asc|ascending|low\s*to\s*high)/i.test(q);
      const hasDescSort = /sort.*(?:desc|descending|high\s*to\s*low)/i.test(q);

      if (hasCheapestSort || hasAscSort) {
        results.sort((a, b) => a.price - b.price);
      } else if (hasExpensiveSort || hasDescSort) {
        results.sort((a, b) => b.price - a.price);
      }

      // If nothing matched with specific filters, try individual word matching
      if (results.length === 0 && allProducts && allProducts.length > 0) {
        results = allProducts.filter(p => {
          const text = `${p.name || ''} ${p.description || ''} ${(p.tags || []).join(' ')} ${p.category || ''}`.toLowerCase();
          return searchTerms.some(t => text.includes(t));
        });

        // Apply sorting to fallback results too
        if (hasCheapestSort || hasAscSort) {
          results.sort((a, b) => a.price - b.price);
        } else if (hasExpensiveSort || hasDescSort) {
          results.sort((a, b) => b.price - a.price);
        } else if (hasRatingFilter) {
          results.sort((a, b) => getAvgRating(b) - getAvgRating(a));
        }
      }

      return results;
    } catch (e) {
      console.error('[semanticSearch] crashed:', e);
      return [];
    }
  };

  const findProductByName = (input: string): Product | undefined => {
    const q = input.toLowerCase();

    // Don't do fuzzy matching if the input is ONLY a generic category name
    const cleanInput = input.replace(/\b(add|buy|get|want|grab|i('ll| will) take|to|my|the|a|an|please|cart|bag|in)\b/gi, '').trim().toLowerCase();
    const isOnlyCategoryName = /^(watch|watches|ring|rings|bracelet|bracelets|necklace|necklaces)$/i.test(cleanInput);
    if (isOnlyCategoryName) {
      return undefined; // Force it to show the list instead
    }

    // More fuzzy matching for product search
    return allProducts.find(p => {
      const name = p.name.toLowerCase();
      const words = q.split(/\s+/).filter(w => w.length > 2);

      // Exact match or contains
      if (q.includes(name) || name.includes(q) || p.id === q) return true;

      // Need at least 2 significant words for fuzzy matching (to avoid "watch" matching everything)
      if (words.length < 2) return false;

      // Fuzzy word matching - at least one significant word must match
      const nameWords = name.split(/\s+/).filter(w => w.length > 2);
      return words.some(word =>
        nameWords.some(nameWord =>
          nameWord.includes(word) || word.includes(nameWord) ||
          // Category/type matching only with additional context
          (word === 'watch' && words.length > 1 && (nameWord.includes('chronograph') || nameWord.includes('tourbillon'))) ||
          (word === 'ring' && words.length > 1 && nameWord.includes('band')) ||
          (word === 'bracelet' && words.length > 1 && (nameWord.includes('chain') || nameWord.includes('bead'))) ||
          (word === 'necklace' && words.length > 1 && nameWord.includes('pendant'))
        )
      );
    });
  };

  const scrollToProducts = () => {
    setTimeout(() => {
      document.getElementById('products-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 300);
  };

  const NON_PRODUCT_DEFLECTIONS = [
    "I specialise in jewellery, not that. What piece can I help you find?",
    "Not in the catalogue. Try asking about rings, watches, or diamonds instead.",
    "The archive doesn't carry that. Is there a piece you're actually looking for?",
    "I deal in precious metals and certified stones, not that. Shall we look at something worthwhile?",
  ];

  const handleLocalIntent = async (msg: string): Promise<IntentResult> => {
    const m = msg.toLowerCase().trim();

    // ── NON-PRODUCT / NSFW FILTER ──
    // Catch queries that are clearly not product searches before hitting Groq
    const NSFW_PATTERN = /\b(pussy|dick|cock|ass(?:hole)?|fuck|shit|bitch|cunt|boob|tit|nude|naked|sex(?:ual)?|porn|xxx)\b/i;
    if (NSFW_PATTERN.test(m)) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        text: NON_PRODUCT_DEFLECTIONS[Math.floor(Math.random() * NON_PRODUCT_DEFLECTIONS.length)]
      }]);
      return { handled: true, intent: 'nsfw_deflect' };
    }

    // ═══ NEGOTIATION AWARENESS ═══
    // During active negotiation (attempts > 0), skip most local processing
    // to let AI handle the conversational flow
    const isInActiveNegotiation = negotiationAttempts > 0;

    // Price filter detection - only match when there's an actual price number or comparison
    // Don't match sorting keywords like "cheapest" without a price number
    const hasPriceFilter = /\b(under|over|above|below|less\s*than|more\s*than|greater\s*than|cheaper\s*than|between|equal)\s*\$?\d+/i.test(m) ||
      /\bbetween\s*\$?\d+\s*(?:and|to|-)\s*\$?\d+/i.test(m);

    // 🚨 DISCOUNT REQUEST HANDLING - Always catch these locally to control negotiation flow
    const isDiscountRequest = /\b(discount|deal|coupon|cheaper|price.*(off|down|lower|break|reduction)|birthday|student|military|first.*time|loyal|bulk|celebrate|special.*occasion|\d+%|\d+\s*percent)\b/i.test(m);
    if (isDiscountRequest) {
      if (cart.length === 0) {
        setMessages(prev => [...prev, { role: 'assistant', text: "Your bag is empty — add some pieces first and then we can talk numbers. I don't negotiate in hypotheticals." }]);
        return { handled: true, intent: 'discount_empty_cart' };
      }

      // Handle rudeness surcharge
      const msgRudeness = detectRudeness(m);
      const newRudenessScore = msgRudeness > 0 ? rudenessScore + msgRudeness : Math.max(0, rudenessScore - 1);
      setRudenessScore(newRudenessScore);

      if (newRudenessScore >= 3) {
        const surchargePercent = Math.min(newRudenessScore * 5, 25);
        const surchargeCode = `RUDE-SURCHARGE-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
        applyNegotiatedDiscount(surchargeCode, -surchargePercent);
        const rudeResponses = [
          `Interesting approach. Unfortunately, the archive has a dignity clause. Prices just went up ${surchargePercent}%. Try again with some refinement.`,
          `I've seen better negotiation tactics from a parking meter. That attitude just earned a ${surchargePercent}% premium. Be nice and I might reconsider.`,
        ];
        setMessages(prev => [...prev, {
          role: 'assistant',
          text: rudeResponses[Math.floor(Math.random() * rudeResponses.length)],
          error: true
        }]);
        addToast(`${surchargePercent}% surcharge applied for rudeness`, 'error');
        return { handled: true, intent: 'haggle_rude_surcharge' };
      }

      // Start negotiation flow - this is the FIRST discount request
      const currentAttempts = negotiationAttempts + 1;
      setNegotiationAttempts(currentAttempts);

      const firstNegotiationResponses = [
        "I appreciate the ask. What makes today special? Birthday? Anniversary? First purchase?",
        "Let me understand what we're celebrating. What's the occasion?",
        "I'm interested in helping, but tell me more - what brings you in today?"
      ];

      setMessages(prev => [...prev, {
        role: 'assistant',
        text: firstNegotiationResponses[Math.floor(Math.random() * firstNegotiationResponses.length)]
      }]);

      return { handled: true, intent: 'discount_negotiation_start' };
    }

    if (isInActiveNegotiation) {
      // Still process critical safety patterns during negotiation
      const msgRudeness = detectRudeness(m);
      if (msgRudeness >= 3) {
        // Handle rudeness surcharge even during negotiation
        const newRudenessScore = rudenessScore + msgRudeness;
        setRudenessScore(newRudenessScore);
        const surchargePercent = Math.min(newRudenessScore * 5, 25);
        const surchargeCode = `RUDE-SURCHARGE-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
        applyNegotiatedDiscount(surchargeCode, -surchargePercent);
        const rudeResponses = [
          `Interesting approach. Unfortunately, the archive has a dignity clause. Prices just went up ${surchargePercent}%. Try again with some refinement.`,
          `I've seen better negotiation tactics from a parking meter. That attitude just earned a ${surchargePercent}% premium. Be nice and I might reconsider.`,
        ];
        setMessages(prev => [...prev, {
          role: 'assistant',
          text: rudeResponses[Math.floor(Math.random() * rudeResponses.length)],
          error: true
        }]);
        addToast(`${surchargePercent}% surcharge applied for rudeness`, 'error');
        return { handled: true, intent: 'haggle_rude_surcharge' };
      }

      // Let AI handle most negotiation responses
      return { handled: false, intent: 'negotiation_context' };
    }

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
      setMessages(prev => [...prev, { role: 'assistant', text: `I'm The Clerk — part stylist, part negotiator, full-time fashion enabler.\n\nSearch: "Show me summer outfits" or "leather under $500" — products appear instantly.\nShop: "Add the cashmere sweater" or "I'll take 2 of those" — straight to your bag.\nHaggle: "Can I get a birthday discount?" — I'll see what I can do. Just don't be rude, or prices go up.\nFilter: "Sort by cheapest" or "Only outerwear" — the whole site changes in real-time.\nCheckout: "Buy now" — I'll take you there.\nStyle: "What goes with this?" — honest pairing suggestions, no flattery.\n\nI also have opinions. Many opinions. Ask at your own risk.` }]);
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

    // Checkout (but NOT during negotiation context)
    // Avoid triggering on responses like "first purchase" during discount negotiation
    const isNegotiationContext = /\b(discount|deal|coupon|cheaper|price|birthday|student)\b/i.test(messages.slice(-3).map(m => m.text).join(' '));
    if (/\b(checkout|check out|buy now|complete.*(order|purchase)|ready to pay|proceed to payment)\b/i.test(m) && !isNegotiationContext) {
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

    // ── EXPLICIT ORDER/SORT COMMANDS ──
    // Handle explicit "order asc/desc" and "order ascending/descending" patterns first
    if (/\b(order|sort)\s*(by)?\s*(asc|ascending)\b/i.test(m)) {
      setSortOrder('price-low');
      setMessages(prev => [...prev, {
        role: 'assistant',
        text: `Grid sorted by price (low to high).`
      }]);
      return { handled: true, intent: 'sort_asc' };
    }

    if (/\b(order|sort)\s*(by)?\s*(desc|descending)\b/i.test(m)) {
      setSortOrder('price-high');
      setMessages(prev => [...prev, {
        role: 'assistant',
        text: `Grid sorted by price (high to low).`
      }]);
      return { handled: true, intent: 'sort_desc' };
    }

    // ── SORT BY PRICE ──
    // Enhanced to handle: cheapest, affordable, budget, expensive, premium, luxury
    // These commands should show ALL products sorted, not just sort current view
    if (/\b(show|find|get|give).*(cheap|cheaper|cheapest|most\s*affordable|least\s*expensive|budget|affordable)\b/i.test(m)) {
      if (allProducts && allProducts.length > 0) {
        const sorted = [...allProducts].sort((a, b) => a.price - b.price);
        updateProductFilter({ query: '', productIds: sorted.map(p => p.id) });
        setSortOrder('price-low');
        setMessages(prev => [...prev, {
          role: 'assistant',
          text: `Grid updated: ${sorted.length} pieces sorted by price (lowest first).`
        }]);
      }
      return { handled: true, intent: 'show_cheapest' };
    }

    if (/\b(show|find|get|give).*(expensive|expensivest|most\s*expensive|premium|luxury)\b/i.test(m)) {
      if (allProducts && allProducts.length > 0) {
        const sorted = [...allProducts].sort((a, b) => b.price - a.price);
        updateProductFilter({ query: '', productIds: sorted.map(p => p.id) });
        setSortOrder('price-high');
        setMessages(prev => [...prev, {
          role: 'assistant',
          text: `Grid updated: ${sorted.length} pieces sorted by price (highest first).`
        }]);
      }
      return { handled: true, intent: 'show_expensive' };
    }

    // ── FILTER BY CATEGORY ──
    const categoryMatch = m.match(/\b(show|filter|only|just).*(watch|watches|ring|rings|bracelet|bracelets|necklace|necklaces)\b/i);
    if (categoryMatch) {
      const rawCat = categoryMatch[2].toLowerCase();
      // Normalize to singular capitalized form
      const catMap: Record<string, string> = {
        'watch': 'Watches', 'watches': 'Watches',
        'ring': 'Rings', 'rings': 'Rings',
        'bracelet': 'Bracelets', 'bracelets': 'Bracelets',
        'necklace': 'Necklaces', 'necklaces': 'Necklaces'
      };
      const cat = catMap[rawCat] || 'All';

      if (allProducts && allProducts.length > 0) {
        filterByCategory(cat);
        const filtered = allProducts.filter(p => p.category === cat);
        updateProductFilter({ category: cat, productIds: filtered.map(p => p.id) });
        scrollToProducts();

        const categoryComments: Record<string, string> = {
          'Watches': `Grid filtered to Watches only. ${filtered.length} timepieces now showing.`,
          'Rings': `Grid filtered to Rings only. ${filtered.length} pieces now showing.`,
          'Bracelets': `Grid filtered to Bracelets only. ${filtered.length} pieces now showing.`,
          'Necklaces': `Grid filtered to Necklaces only. ${filtered.length} pieces now showing.`,
        };

        setMessages(prev => [...prev, {
          role: 'assistant',
          text: categoryComments[cat] || `Grid filtered to ${cat}. ${filtered.length} pieces now showing.`
        }]);
      }
      return { handled: true, intent: 'filter_category' };
    }

    // ── SHOW ALL / RESET ──
    if (/\b(show.*(all|everything)|reset|all products|see everything|browse all|clear filter)\b/i.test(m)) {
      filterByCategory('All');
      if (allProducts && allProducts.length > 0) {
        const sample = [...allProducts].sort(() => Math.random() - 0.5);
        updateProductFilter({ query: '', productIds: sample.map(p => p.id) });
        scrollToProducts();
        setMessages(prev => [...prev, {
          role: 'assistant',
          text: `Filters cleared. All ${allProducts.length} pieces now showing in the grid.`
        }]);
      }
      return { handled: true, intent: 'show_all' };
    }

    // ── ADD ALL / EVERYTHING ──
    if (/\b(add (all|every(thing)?|the (whole|entire) (collection|catalogue|store))|everything (to|in(to)?) (cart|bag))\b/i.test(m) && !isInActiveNegotiation) {
      const productsToAdd = allProducts.filter(p => p.stock_quantity > 0);
      if (productsToAdd.length === 0) {
        setMessages(prev => [...prev, { role: 'assistant', text: "Nothing in stock to add. Search for something specific first." }]);
      } else {
        productsToAdd.forEach(p => addToCartWithQuantity(p.id, 1));
        openCart();
        setMessages(prev => [...prev, {
          role: 'assistant',
          text: `Alright. All ${productsToAdd.length} pieces are in your bag. Decisive. I respect it.`
        }]);
      }
      return { handled: true, intent: 'add_all' };
    }

    // ── ADD TO CART (by name) ──
    // Skip during negotiations to let AI handle the conversation
    const addMatch = m.match(/\b(add|buy|get|want|grab|i('ll| will) take)\b/i);
    if (addMatch && !isInActiveNegotiation) {
      // Check if it's just a category search (e.g., "add watch" without specific product name)
      const searchTerm = m.replace(/\b(add|buy|get|want|grab|i('ll| will) take|to|my|the|a|an|please|cart|bag|in)\b/gi, '').trim();
      const jewelryCategories = ['watch', 'ring', 'bracelet', 'necklace'];
      const isOnlyCategoryQuery = jewelryCategories.some(cat => searchTerm.toLowerCase() === cat || searchTerm.toLowerCase() === cat + 's');

      // If it's just a category name, show search results instead of trying to add
      if (isOnlyCategoryQuery && allProducts && allProducts.length > 0) {
        const categorySearchResults = semanticSearch(searchTerm);
        if (categorySearchResults.length > 0) {
          const sortedResults = [...categorySearchResults].sort((a, b) => getAvgRating(b) - getAvgRating(a));
          updateProductFilter({ query: searchTerm, productIds: sortedResults.map(p => p.id) });

          setMessages(prev => [...prev, {
            role: 'assistant',
            text: `Grid updated: ${sortedResults.length} ${searchTerm}${sortedResults.length === 1 ? '' : 's'} now showing, sorted by rating. Which one would you like to add?`
          }]);
          return { handled: true, intent: 'show_category_for_add' };
        }
      }

      // Otherwise, try to find specific product
      let product = findProductByName(m);

      // Check for ambiguous matches (multiple products match the search term)
      if (jewelryCategories.some(term => searchTerm.toLowerCase().includes(term)) && !product && allProducts && allProducts.length > 0) {
        // Find all matching products for this category
        const categoryMatches = allProducts.filter(p => {
          const name = p.name.toLowerCase();
          const searchLower = searchTerm.toLowerCase();
          return name.includes(searchLower) ||
            (searchLower.includes('watch') && (name.includes('watch') || name.includes('chronograph') || name.includes('timepiece'))) ||
            (searchLower.includes('ring') && (name.includes('ring') || name.includes('band') || name.includes('signet'))) ||
            (searchLower.includes('bracelet') && (name.includes('bracelet') || name.includes('bangle') || name.includes('cuff'))) ||
            (searchLower.includes('necklace') && (name.includes('necklace') || name.includes('pendant') || name.includes('chain')));
        });

        if (categoryMatches.length > 1) {
          const sortedMatches = [...categoryMatches].sort((a, b) => getAvgRating(b) - getAvgRating(a));
          updateProductFilter({ query: searchTerm, productIds: sortedMatches.map(p => p.id) });

          setMessages(prev => [...prev, {
            role: 'assistant',
            text: `Grid updated: ${sortedMatches.length} matches found, sorted by rating. Which one would you like to add?`
          }]);
          return { handled: true, intent: 'add_clarification_needed' };
        } else if (categoryMatches.length === 1) {
          product = categoryMatches[0];
        }
      }

      // If not found with simple matching, try server-side semantic search
      if (!product) {
        const cleanQuery = m.replace(/\b(add|buy|get|want|grab|i('ll| will) take|to|my|the|a|an|please|cart|bag)\b/gi, '').trim();
        if (cleanQuery.length > 3) {
          try {
            const ragRes = await serverSemanticSearch(cleanQuery, { matchCount: 1, matchThreshold: 0.4 });
            if (ragRes.results.length > 0) {
              product = allProducts.find(p => p.id === ragRes.results[0].id);
            }
          } catch (err) {
            console.warn('[handleLocalIntent] Server semantic search failed:', err);
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
        .slice(0, 8)
        .map(r => r.product);

      if (recs.length > 0) {
        updateProductFilter({ query: recs.map(r => r.name).join(' '), productIds: recs.map(r => r.id) });
        const commentary = cart.length > 0
          ? `Grid updated with ${recs.length} recommendations based on your cart.`
          : `Grid updated with ${recs.length} recommended pieces.`;
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
    // Enhanced patterns to catch natural requests with advanced filtering
    const hasSearchIntent = /\b(show|find|search|browse|looking for|need|want|get me|give me|tell me|i('m| am) looking|let me see)\b/i.test(m);
    const hasRatingFilter = /\b(highest|best|top|good|great|worst|lowest|poor|bad)\s*(rated|rating|reviews?)\b/i.test(m) || /\b(rated|rating|reviews?)\s*(highest|best|top|good|great|worst|lowest|poor|bad)\b/i.test(m);
    const hasSortIntent = /\b(sort|order|arrange)\s*(by)?\s*(price|rating|reviews?|asc|desc|ascending|descending|cheap|expensive)\b/i.test(m);
    const hasProductKeywords = /\b(watch|watches|ring|rings|bracelet|bracelets|necklace|necklaces|jewelry|jewellery|gold|silver|diamond|platinum)\b/i.test(m);
    const hasOccasion = /\b(wedding|engagement|anniversary|formal|casual|everyday|gift|birthday)\b/i.test(m);

    // Only do local search if there's clear shopping intent
    if (hasSearchIntent || hasPriceFilter || hasRatingFilter || hasSortIntent || (hasProductKeywords && m.split(/\s+/).length >= 1) || hasOccasion) {
      if (!allProducts || allProducts.length === 0) {
        if (isInitialLoading) {
          setMessages(prev => [...prev, {
            role: 'assistant',
            text: "Give me a moment — I'm loading the catalogue. Send that again in a second."
          }]);
          return { handled: true, intent: 'search_loading' };
        }
        setMessages(prev => [...prev, {
          role: 'assistant',
          text: "Our collection isn't available right now. Try refreshing the page."
        }]);
        return { handled: true, intent: 'search_no_inventory' };
      }

      const searchResults = semanticSearch(m);
      if (searchResults.length > 0) {
        updateProductFilter({ query: m, productIds: searchResults.map(p => p.id) });

        // Generate contextual response based on query type
        let commentary: string;
        if (hasPriceFilter) {
          if (m.includes('under') || m.includes('below') || m.includes('cheaper')) {
            commentary = `Grid filtered: ${searchResults.length} pieces within your price range.`;
          } else if (m.includes('over') || m.includes('above') || m.includes('expensive')) {
            commentary = `Grid filtered: ${searchResults.length} premium pieces now showing.`;
          } else if (m.includes('between')) {
            commentary = `Grid filtered: ${searchResults.length} pieces in your price range.`;
          } else {
            commentary = `Grid filtered: ${searchResults.length} pieces matching your price criteria.`;
          }
        } else if (hasRatingFilter) {
          if (m.match(/(?:highest|best|top|good|great)/i)) {
            commentary = `Grid sorted by rating: ${searchResults.length} highest-rated pieces now showing.`;
          } else {
            commentary = `Grid sorted by rating: ${searchResults.length} pieces now showing.`;
          }
        } else if (hasSortIntent) {
          commentary = `Grid sorted: ${searchResults.length} pieces arranged as requested.`;
        } else if (hasOccasion) {
          const occasion = m.match(/\b(wedding|engagement|anniversary|formal|casual|everyday|gift|birthday)\b/i)?.[1] || 'special occasion';
          commentary = `Grid filtered for ${occasion}: ${searchResults.length} pieces curated.`;
        } else if (hasProductKeywords) {
          commentary = `Grid updated: ${searchResults.length} pieces found.`;
        } else {
          commentary = `Grid updated: ${searchResults.length} pieces match your search.`;
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

    // ═══ HAGGLE MODE DETECTION & HANDLING ═══
    const isDiscountRequest = /\b(discount|deal|coupon|cheaper|price.*(off|down|lower|break|reduction)|birthday|student|military|first.*time|loyal|bulk|celebrate|special.*occasion|\d+%|\d+\s*percent)\b/i.test(userMessage);

    // ─── CASE 1: User Requests Discount (Start New Haggle) ───
    if (isDiscountRequest && !haggleSession.isActive) {
      if (cart.length === 0) {
        setMessages(prev => [...prev, {
          role: 'assistant',
          text: "Hold up — your cart is empty. Add some items first, then we can talk about discounts."
        }]);
        setLoading(false);
        return;
      }

      // Start haggle session
      const canStart = startHaggleSession();
      if (!canStart) {
        setLoading(false);
        return; // Already shown "already given" message
      }

      // First haggle turn - ask probing questions
      const probingQuestions = [
        "Alright, I'm listening. But discounts aren't free — tell me, what's the occasion? Birthday? Student? Military? First purchase here?",
        "I might be able to work something out. But first, help me understand: why do you deserve a discount? What brings you here today?",
        "Interesting. Discounts are earned, not given. What makes this purchase special? Anniversary? Celebration? Building a wardrobe?",
        "Okay, let's negotiate. But I need context: What's your story? Why should I break protocol for you?",
      ];

      const response = probingQuestions[Math.floor(Math.random() * probingQuestions.length)];

      setHaggleSession(prev => ({
        ...prev,
        turnCount: 1,
        conversationContext: [
          { role: 'user', text: userMessage },
          { role: 'assistant', text: response }
        ],
        lastAIQuestion: response,
        userCommitmentLevel: analyzeUserCommitment(userMessage),
        justAskedToContinue: false,
      }));

      setMessages(prev => [...prev, {
        role: 'assistant',
        text: response
      }]);

      setLoading(false);
      return;
    }

    // ─── CASE 2: We're In Haggle Mode ───
    if (haggleSession.isActive) {
      // Update conversation context
      const updatedContext = [
        ...haggleSession.conversationContext,
        { role: 'user' as const, text: userMessage }
      ];

      // Special case: We just asked if they want to continue (after off-topic)
      if (haggleSession.justAskedToContinue) {
        const wantsToContinue = /\b(yes|yeah|yep|sure|okay|alright|of course|definitely|still want|want it)\b/i.test(userMessage);
        const wantsToStop = /\b(no|nah|nope|stop|cancel|forget it|not interested)\b/i.test(userMessage);

        if (wantsToStop) {
          endHaggleSession(false);
          setMessages(prev => [...prev, {
            role: 'assistant',
            text: "Alright, no worries. If you change your mind about that discount, just let me know."
          }]);
          setLoading(false);
          return;
        }

        if (wantsToContinue) {
          // Continue the haggle - ask next question
          const continueResponses = [
            "Great! So tell me — are you planning to buy today, or just considering?",
            "Perfect! Now, how many items are we talking about here?",
            "Excellent! One more thing: is this for a special occasion, or building your wardrobe?",
          ];

          const response = continueResponses[Math.floor(Math.random() * continueResponses.length)];

          setHaggleSession(prev => ({
            ...prev,
            conversationContext: [...updatedContext, { role: 'assistant', text: response }],
            lastAIQuestion: response,
            justAskedToContinue: false,
          }));

          setMessages(prev => [...prev, {
            role: 'assistant',
            text: response
          }]);

          setLoading(false);
          return;
        }
      }

      // User wants to abandon haggle (only if they're clearly declining)
      const isExplicitDecline = /\b(no.*discount|not interested|nevermind|never mind|forget it|stop|cancel|don't want)\b/i.test(userMessage);

      if (isExplicitDecline) {
        endHaggleSession(false);

        setMessages(prev => [...prev, {
          role: 'assistant',
          text: "Alright, discount negotiation cancelled. If you change your mind, just ask."
        }]);

        setLoading(false);
        return;
      }

      // Check if user is going off-topic
      if (isOffTopicDuringHaggle(userMessage)) {
        const offTopicResponses = [
          "Hold on — we're in the middle of negotiating your discount here. Do you want this deal or not?",
          "Wait, we're negotiating. You asked for a discount, remember? Still interested?",
          "Let's not get distracted. We're talking about getting you a discount. Do you still want that?",
        ];

        const response = offTopicResponses[Math.floor(Math.random() * offTopicResponses.length)];

        setHaggleSession(prev => ({
          ...prev,
          conversationContext: [...updatedContext, { role: 'assistant', text: response }],
          lastAIQuestion: response,
          justAskedToContinue: true, // Mark that we asked to continue
        }));

        setMessages(prev => [...prev, {
          role: 'assistant',
          text: response
        }]);

        setLoading(false);
        return;
      }

      // Update commitment level
      const commitmentScore = analyzeUserCommitment(userMessage);
      const newCommitment = Math.round((haggleSession.userCommitmentLevel + commitmentScore) / 2);

      const newTurnCount = haggleSession.turnCount + 1;

      // ─── Decision Time: 3-5 Turns Complete? ───
      if (newTurnCount >= 3) {
        // Generate coupon!
        const maxDiscount = calculateMaxDiscount();

        // Calculate final discount based on commitment and turns
        const baseDiscount = Math.min(maxDiscount, 15); // Start at 15% or max
        const commitmentBonus = Math.floor((newCommitment / 100) * 5); // Up to 5% bonus for high commitment
        const turnPenalty = Math.max(0, (newTurnCount - 3) * 2); // Lose 2% per turn beyond 3

        const finalDiscount = Math.max(5, Math.min(maxDiscount, baseDiscount + commitmentBonus - turnPenalty));

        // Determine reason based on conversation context
        let reason = "valued customer";
        const contextText = updatedContext.map(c => c.text.toLowerCase()).join(' ');
        if (contextText.includes('birthday')) reason = "birthday celebration";
        else if (contextText.includes('student')) reason = "student status";
        else if (contextText.includes('military')) reason = "military service";
        else if (contextText.includes('first')) reason = "first purchase";
        else if (contextText.includes('anniversary')) reason = "anniversary";
        else if (contextText.includes('multiple') || contextText.includes('bulk')) reason = "bulk purchase";

        const couponCode = generateCouponCode(reason, finalDiscount);

        // Apply coupon
        applyNegotiatedDiscount(couponCode, finalDiscount);
        endHaggleSession(true, couponCode);

        const successMessages = [
          `Alright, you've earned it. **${finalDiscount}% off** for ${reason}. Coupon: **${couponCode}**. Already applied to your cart. Don't tell anyone.`,
          `Fine, you win. **${finalDiscount}% discount** granted for ${reason}. Code: **${couponCode}** — already in your cart. You drive a hard bargain.`,
          `Okay okay, I'm convinced. **${finalDiscount}% off** for ${reason}. Your code: **${couponCode}**. Applied. Happy now?`,
          `You know what? I respect the persistence. **${finalDiscount}% discount** for ${reason}. **${couponCode}** is now active in your cart.`,
        ];

        setMessages(prev => [...prev, {
          role: 'assistant',
          text: successMessages[Math.floor(Math.random() * successMessages.length)],
          coupon: { code: couponCode, percent: finalDiscount, reason }
        }]);

        addToast(`${finalDiscount}% discount applied: ${couponCode}`, 'success');
        setShowDiscountToast({ code: couponCode, percent: finalDiscount, reason });

        setLoading(false);
        return;
      }

      // ─── Continue Haggling (Turn 2-3) ───
      const continueResponses = [
        `${newTurnCount === 2 ? "Okay, I hear you." : "Alright, I'm warming up to this."} But I need to know: how many items are in your cart? Are you committed to buying today, or just browsing?`,
        `${newTurnCount === 2 ? "That's a good reason." : "You're making progress."} But here's my question: are these pieces you'll keep forever, or impulse buys you'll return next week?`,
        `${newTurnCount === 2 ? "Fair enough." : "I'm almost convinced."} One more thing: what's your budget range? Help me understand what you're working with.`,
        `${newTurnCount === 2 ? "I can respect that." : "You're persistent, I'll give you that."} Last thing: are you building a complete look, or just grabbing one piece?`,
      ];

      const response = continueResponses[Math.floor(Math.random() * continueResponses.length)];

      setHaggleSession(prev => ({
        ...prev,
        turnCount: newTurnCount,
        conversationContext: [...updatedContext, { role: 'assistant', text: response }],
        lastAIQuestion: response,
        userCommitmentLevel: newCommitment,
        justAskedToContinue: false, // Reset flag
      }));

      setMessages(prev => [...prev, {
        role: 'assistant',
        text: response
      }]);

      setLoading(false);
      return;
    }

    // ═══ OLD NEGOTIATION TRACKING (KEEP FOR BACKWARD COMPATIBILITY) ═══
    const currentNegotiationAttempts = isDiscountRequest ? negotiationAttempts + 1 : negotiationAttempts;
    if (isDiscountRequest) {
      setNegotiationAttempts(currentNegotiationAttempts);
    }

    // ═══ TRY LOCAL INTENT ENGINE FIRST (no API call) ═══
    // Only for clear, unambiguous intents that don't need AI conversation
    const localResult = await handleLocalIntent(userMessage);
    if (localResult.handled) {
      setConversationHistory(prev => [...prev.slice(-8),
        { role: 'user', text: userMessage },
        { role: 'assistant', text: `[local:${localResult.intent}]` }
      ]);
      // Only log discount-related and checkout local events — not navigation noise
      const LOGGABLE_LOCAL_INTENTS = ['discount_negotiation_start', 'discount_empty_cart', 'haggle_rude_surcharge', 'checkout', 'nsfw_deflect'];
      if (LOGGABLE_LOCAL_INTENTS.includes(localResult.intent || '')) {
        logClerkInteraction({
          user_id: user?.id, user_email: user?.email,
          user_message: userMessage,
          clerk_response: `[local:${localResult.intent}]`,
          clerk_sentiment: localResult.intent === 'haggle_rude_surcharge' ? 'rude' : 'neutral',
          discount_offered: 0,
          negotiation_successful: false,
          cart_snapshot: cart.map(i => ({ id: i.product.id, name: i.product.name, qty: i.quantity, price: i.product.price })),
          metadata: { mode: 'local', intent: localResult.intent }
        });
      }
      setLoading(false);
      return;
    }

    // Groq AI handling with RAG
    let finalClerkResponse = "";
    let didShowSomething = false;
    let negotiationBlocked = false;

    try {
      setIsRetrieving(true);

      // Build Groq messages in OpenAI chat format
      const systemMessage: Groq.Chat.ChatCompletionMessageParam = {
        role: 'system',
        content: `${CLERK_SYSTEM_PROMPT}

CURRENT STATE:
- INVENTORY: ${allProducts.length} pieces across Outerwear, Basics, Accessories, Home, Apparel, Footwear
- CART: ${cart.length === 0 ? 'Empty' : cart.map(i => { const v = [i.selectedSize, i.selectedColor].filter(Boolean).join('/'); return `${i.product.name}${v ? ` [${v}]` : ''} ($${i.product.price} × ${i.quantity})`; }).join(', ')}
- CART TOTAL: $${cartTotal} | DISCOUNT: ${negotiatedDiscount}%${negotiatedDiscount < 0 ? ' (SURCHARGE ACTIVE)' : ''}
- RUDENESS LEVEL: ${newRudenessScore}/5 ${newRudenessScore >= 3 ? '→ REFUSE discounts, apply LUXURY TAX surcharge via generate_coupon with negative %' : ''}
- NEGOTIATION ATTEMPTS: ${currentNegotiationAttempts}/2 ${currentNegotiationAttempts === 0 ? '🚫 ZERO ATTEMPTS - This is their FIRST discount request. DO NOT call ANY tools except conversational response. Ask probing questions ONLY.' : currentNegotiationAttempts === 1 ? '🚫 ONE ATTEMPT - This is their SECOND discount request. DO NOT call ANY tools except conversational response. Probe deeper, test commitment.' : '✅ TWO+ ATTEMPTS - You may NOW call generate_coupon if they truly deserve it.'}
- EMBEDDING STATUS: ${embeddingModelStatus}
- PATRON: ${user?.email || 'Guest'}

🚨 NEGOTIATION MODE: ${currentNegotiationAttempts > 0 ? `ACTIVE (attempt ${currentNegotiationAttempts}) - You are in the middle of discount negotiation. DO NOT call search_inventory, update_ui, add_to_cart, or any other tools. ONLY respond conversationally to continue the negotiation flow. 📢 IMPORTANT: The user is making a discount request - do NOT call ANY tools, just respond with text asking probing questions about their purchase occasion.` : 'INACTIVE'}

🚫 CRITICAL TOOL RESTRICTION: You are on attempt ${currentNegotiationAttempts}. ${currentNegotiationAttempts < 2 ? '🚨 DO NOT CALL ANY TOOLS WHATSOEVER during negotiation attempts 1-2. You must respond with ONLY TEXT to ask questions about their purchase. NO search_inventory, NO update_ui, NO add_to_cart, NO generate_coupon - JUST TEXT RESPONSE!' : 'You may now call generate_coupon if they deserve it after 2+ conversation turns.'}`,
      };

      const chatMessages: Groq.Chat.ChatCompletionMessageParam[] = [
        systemMessage,
        ...conversationHistory.slice(-6).map(h => ({
          role: h.role as 'user' | 'assistant',
          content: h.text,
        })),
        { role: 'user', content: userMessage },
      ];

      // Call Groq with fallback across models
      const { response } = await callGroqWithFallback(chatMessages, groqTools);
      const message = response.choices[0]?.message;
      const toolCalls = message?.tool_calls || [];

      // Process tool calls
      for (const toolCall of toolCalls) {
        const fnName = toolCall.function.name;
        let args: any = {};
        try { args = JSON.parse(toolCall.function.arguments || '{}'); } catch { args = {}; }

        if (fnName === 'search_inventory') {
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
            }]);
          } else {
            updateProductFilter({ query: args.query, category: args.category, productIds: products.map((p: Product) => p.id) });
            scrollToProducts();
            const searchResponses = [
              `Found ${products.length} pieces. The grid is now updated — check below:`,
              `Curated ${products.length} results (${metadata.method} search). See the grid:`,
              `${products.length} matches found. Grid updated — browse below:`,
            ];
            setMessages(prev => [...prev, {
              role: 'assistant',
              text: searchResponses[Math.floor(Math.random() * searchResponses.length)],
              products: products
            }]);
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

            // If still not found, use server-side semantic search
            if (!product) {
              try {
                const ragRes = await serverSemanticSearch(q, { matchCount: 1, matchThreshold: 0.4 });
                if (ragRes.results.length > 0) {
                  product = allProducts.find(p => p.id === ragRes.results[0].id);
                }
              } catch (err) {
                console.warn('[add_to_cart] Server semantic search failed:', err);
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
        } else if (fnName === 'sort_and_filter_store' || fnName === 'update_ui') {
          let message = 'Grid updated.';
          if (args.sort_order || args.sort) {
            setSortOrder(args.sort_order || args.sort);
            const sortLabel = (args.sort_order || args.sort) === 'price-low' ? 'price (low to high)' :
              (args.sort_order || args.sort) === 'price-high' ? 'price (high to low)' : 'relevance';
            message = `Grid sorted by ${sortLabel}.`;
          }
          if (args.category) {
            filterByCategory(args.category);
            message = `Grid filtered to ${args.category}${args.sort_order || args.sort ? `, sorted by ${(args.sort_order || args.sort).replace('-', ' ')}` : ''}.`;
          }
          if (args.query || args.filter_query) {
            updateProductFilter({ query: args.query || args.filter_query });
            message = `Grid filtered: ${args.query || args.filter_query}.`;
          }
          scrollToProducts();
          setMessages(prev => [...prev, { role: 'assistant', text: message }]);
          didShowSomething = true;
        } else if (fnName === 'generate_coupon') {
          // RAG-backed coupon generation — validates against bottom_price, injects into cart session

          // HARD BLOCK: Prevent coupon generation on first 1-2 attempts (unless rude)
          if (currentNegotiationAttempts < 2 && newRudenessScore < 3) {
            let probingResponses: string[];

            if (currentNegotiationAttempts === 0) {
              // First attempt - ask for context
              probingResponses = [
                "Hold on — I appreciate the ask, but discounts are earned, not given. What's the occasion? Birthday? Student? First purchase? Tell me more.",
                "Interesting proposition! Before I can authorize any concessions, I need context. What brings you to MODERNIST today? What's special about this moment?",
                "I might be able to work something out, but help me understand first: Why today? What makes this purchase meaningful to you?",
                "Alright, you've got my attention. But I need the story first — are you celebrating something? Building a capsule collection? Student life? Give me something to work with.",
              ];
            } else {
              // Second attempt - probe deeper, test commitment
              probingResponses = [
                "Okay, I hear you. But I need to know you're serious. How many pieces are you looking at? Larger orders give me more flexibility.",
                "I appreciate the context! Let me be real with you though — are you committed to purchasing today? Or just browsing?",
                "That's meaningful, I respect that. Here's the thing: I have some wiggle room, but only if you're genuinely investing. What's in your cart?",
                "Alright, we're getting somewhere. But before I can pull any strings, are these pieces you'll actually keep for years? I need to justify this.",
              ];
            }

            const probingText = probingResponses[Math.floor(Math.random() * probingResponses.length)];
            setMessages(prev => [...prev, {
              role: 'assistant',
              text: probingText
            }]);
            finalClerkResponse = probingText; // Capture for conversation history
            didShowSomething = true;
            negotiationBlocked = true; // Prevent AI text response from overriding this
            continue; // Skip coupon generation entirely
          }

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

            // Custom earned message after multi-turn negotiation
            const earnedMessages = [
              `Alright, you've earned it. ${couponResult.discountPercent}% off for ${couponResult.reason.toLowerCase()}. The Clerk has a heart after all.`,
              `Fine, you've convinced me. ${couponResult.discountPercent}% concession granted. You drive a hard bargain.`,
              `Okay, okay. You win. ${couponResult.discountPercent}% discount for ${couponResult.reason.toLowerCase()}. But this stays between us.`,
              `You know what? I respect the persistence. ${couponResult.discountPercent}% off. Don't tell my manager.`,
            ];

            setMessages(prev => [...prev, {
              role: 'assistant',
              text: earnedMessages[Math.floor(Math.random() * earnedMessages.length)],
              coupon: {
                code: couponResult.couponCode,
                percent: couponResult.discountPercent,
                reason: couponResult.reason
              }
            }]);
            addToast(`${couponResult.discountPercent}% discount applied: ${couponResult.couponCode}`, 'success');
          }
          didShowSomething = true;
        } else if (fnName === 'initiate_checkout') {
          await handleLocalIntent('checkout');
          didShowSomething = true;
        } else if (fnName === 'show_cart_summary') {
          await handleLocalIntent('show my cart');
          didShowSomething = true;
        }
      }

      // Text response from Groq (show it before products if there are tool calls)
      // BUT: Don't override negotiation block messages!
      if (message?.content && !negotiationBlocked) {
        // Strip any leaked XML-style function calls the model put in its text output
        finalClerkResponse = message.content
          .replace(/<function=[^>]*>[\s\S]*?<\/function>/g, '')
          .replace(/<function=[^{]*\{[\s\S]*?\}/g, '')
          .trim();

        // SAFETY CHECK: If AI mentions discounts in text without calling tool, block it
        const mentionsDiscount = /\b(\d+%|\d+\s*percent|percent.*off|discount.*granted|you.*got.*discount|here.*your.*discount|applied.*discount|giving.*you)/i.test(finalClerkResponse);
        if (mentionsDiscount && currentNegotiationAttempts < 2) {
          console.warn('[SAFETY] ⚠️ AI tried to grant discount in text without calling generate_coupon tool. BLOCKING.');
          console.warn('[SAFETY] Blocked AI response:', finalClerkResponse);
          const blockMessages = [
            "Hold on — before we talk discounts, I need to understand your situation better. What's the occasion exactly?",
            "I appreciate the interest, but discounts aren't automatic. Tell me more about what you're celebrating first.",
            "Let's pump the brakes — I need to know more about you before I can authorize any concessions. What brings you here today?",
          ];
          setMessages(prev => [...prev, { role: 'assistant', text: blockMessages[Math.floor(Math.random() * blockMessages.length)] }]);
          didShowSomething = true;
        } else if (finalClerkResponse.length > 20 && !didShowSomething) {
          setMessages(prev => [...prev, { role: 'assistant', text: finalClerkResponse }]);
          didShowSomething = true;
        } else if (finalClerkResponse.length > 20) {
          // Merge the conversational text with the last assistant message
          setMessages(prev => {
            const lastMsg = prev[prev.length - 1];
            if (lastMsg?.role === 'assistant') {
              return [...prev.slice(0, -1), { ...lastMsg, text: finalClerkResponse }];
            }
            return [...prev, { role: 'assistant', text: finalClerkResponse }];
          });
        }
      }

      // Safety net: if Groq returned neither content nor recognized tool calls, respond conversationally
      if (!didShowSomething) {
        const fallbackResponses = [
          "Tell me more about what you're looking for — I've got great taste, but I need a little direction here.",
          "I'm listening! What kind of vibe are we going for today? Occasion? Style? Budget? All of the above?",
          "Hmm, I want to help but I need a bit more to go on. What brings you in today?",
          "I'm The Clerk, and I'm here to make you look good. What are we working with?",
        ];
        setMessages(prev => [...prev, { role: 'assistant', text: fallbackResponses[Math.floor(Math.random() * fallbackResponses.length)] }]);
      }

      setConversationHistory(prev => {
        const lastAssistantMsg = messages[messages.length - 1]?.role === 'assistant'
          ? messages[messages.length - 1].text
          : finalClerkResponse || '(action performed)';
        return [...prev.slice(-8),
          { role: 'user', text: userMessage },
          { role: 'assistant', text: lastAssistantMsg }
        ];
      });

      // Log AI-handled interactions (discount-related or any Groq response)
      logClerkInteraction({
        user_id: user?.id, user_email: user?.email,
        user_message: userMessage,
        clerk_response: finalClerkResponse || '(tool action)',
        clerk_sentiment: newRudenessScore >= 3 ? 'rude' : negotiationAttempts > 0 ? 'negotiating' : 'neutral',
        discount_offered: currentNegotiationAttempts > 0 ? currentNegotiationAttempts * 5 : 0,
        negotiation_successful: false,
        cart_snapshot: cart.map(i => ({ id: i.product.id, name: i.product.name, qty: i.quantity, price: i.product.price })),
        metadata: { mode: 'groq', negotiation_attempt: currentNegotiationAttempts }
      });

    } catch (error: any) {
      console.error("Clerk error:", error);
      setIsRetrieving(false);

      // Check if it's a rate limit error (429)
      if (error?.status === 429 || error?.message?.includes('rate_limit') || error?.message?.includes('Rate limit')) {
        console.error('[GROQ_ERROR] Rate limit exceeded. You are hitting Groq free tier limits.');
        setMessages(prev => [...prev, {
          role: 'assistant',
          text: "I'm getting a lot of requests right now! Please wait 30 seconds and try again, or check your Groq API rate limits.",
          error: true
        }]);
        setLoading(false);
        setIsRetrieving(false);
        return;
      }

      // Check if it's an API key error
      if (error?.status === 401 || error?.message?.includes('Invalid API Key') || error?.message?.includes('invalid_api_key')) {
        console.error('[GROQ_ERROR] Invalid API key. Please check your .env file at project root and set VITE_GROQ_API_KEY');
        console.error('[GROQ_ERROR] Current API key:', import.meta.env.VITE_GROQ_API_KEY ? 'Set (length: ' + import.meta.env.VITE_GROQ_API_KEY.length + ')' : 'NOT SET');
        setMessages(prev => [...prev, {
          role: 'assistant',
          text: "I'm having trouble connecting right now. Please check the API configuration and try again.",
          error: true
        }]);
        setLoading(false);
        setIsRetrieving(false);
        return; // Exit early, don't grant any discounts
      }

      // Check if it's a tool parameter error (400)
      if (error?.status === 400 && error?.message?.includes('tool')) {
        console.error('[GROQ_ERROR] Tool parameter validation error:', error.message);
        setMessages(prev => [...prev, {
          role: 'assistant',
          text: "I'm having trouble processing that request. Could you rephrase it?",
          error: true
        }]);
        setLoading(false);
        setIsRetrieving(false);
        return;
      }

      // AI failed — give a helpful conversational response, not just product dump
      const isQuestion = /\?|what|how|why|which|when|where|can|could|would|should/i.test(userMessage);
      const mentionsProduct = /coat|jacket|shirt|pants|shoes|bag|ring|watch|outfit/i.test(userMessage);
      const isDiscountRequest = /\b(discount|deal|coupon|cheaper|price.*off|birthday|student)/i.test(userMessage);

      // NEVER grant discounts in error scenarios
      if (isDiscountRequest) {
        setMessages(prev => [...prev, {
          role: 'assistant',
          text: "I'd love to help with that, but I need to get my systems back online first. Try asking again in a moment."
        }]);
      } else if (mentionsProduct) {
        const localResults = semanticSearch(userMessage);
        if (localResults.length > 0) {
          updateProductFilter({ query: userMessage, productIds: localResults.map(p => p.id) });
          setMessages(prev => [...prev, {
            role: 'assistant',
            text: `Good eye! I found ${localResults.length} matching pieces — the store grid has been updated.`
          }]);
        } else {
          setMessages(prev => [...prev, {
            role: 'assistant',
            text: "Hmm, nothing quite matches that. Try describing the vibe you're going for — casual? formal? something in between?"
          }]);
        }
      } else if (isQuestion) {
        setMessages(prev => [...prev, {
          role: 'assistant',
          text: "Good question! I'd love to help. Could you tell me more about what you're looking for? An occasion, a style, a price range — whatever helps me narrow it down."
        }]);
      } else {
        setMessages(prev => [...prev, {
          role: 'assistant',
          text: "I'm all ears! Just tell me what brings you in today — looking for something specific, need outfit advice, or maybe want to haggle a bit? I'm good at all three."
        }]);
      }
    } finally {
      setLoading(false);
      setIsRetrieving(false);
    }
  };

  const handleInitiateStripeCheckout = () => {
    if (cart.length === 0) return;
    setIsOpen(false);
    navigate('/checkout');
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
      <div className="group bg-white dark:bg-gray-900 border border-black/10 dark:border-white/10 hover:border-black/30 dark:hover:border-white/30 transition-all duration-300 overflow-hidden flex-shrink-0 w-[180px]">
        <div className="relative h-[150px] overflow-hidden bg-gray-50 dark:bg-gray-800">
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

      <div className={`fixed inset-y-0 right-0 z-[130] w-full sm:w-[520px] bg-white dark:bg-[#0c0c0c] border-l border-black/10 dark:border-white/10 shadow-2xl transition-all duration-700 transform flex flex-col ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>

          {/* Header */}
          <div className="px-6 md:px-10 py-5 border-b border-black/8 dark:border-white/8 flex justify-between items-center shrink-0">
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                {embeddingModelStatus === 'ready' && (
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                )}
                <span className="text-[9px] uppercase tracking-[0.5em] text-gray-400 font-black">
                  Archive Concierge{embeddingModelStatus === 'ready' ? ' · RAG Active' : ''}
                </span>
              </div>
              <h2 className="font-serif text-2xl md:text-3xl font-bold uppercase tracking-tighter leading-none text-black dark:text-white">The Clerk</h2>
            </div>
            <button onClick={() => setIsOpen(false)} className="p-2 -mr-2 text-black/40 dark:text-white/40 hover:text-black dark:hover:text-white transition-colors active:scale-90">
              <X size={22} strokeWidth={1.5} />
            </button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-scroll no-scrollbar p-6 md:p-10 space-y-6">
            {messages.length === 0 && (
              <div className="h-full flex flex-col justify-center max-w-[340px] py-12">
                <h3 className="font-serif text-3xl md:text-4xl mb-4 italic leading-tight text-black dark:text-white">
                  "So, what brings you in today?"
                </h3>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed mb-8">
                  I can search the collection, add pieces to your bag, and negotiate a price — all through conversation.
                </p>
                <div className="space-y-3">
                  <p className="text-[9px] uppercase tracking-[0.4em] text-gray-400 dark:text-gray-500 font-black">Try asking</p>
                  <div className="flex flex-wrap gap-2">
                    {quickActions.map(qa => (
                      <button
                        key={qa.label}
                        onClick={() => setInput(qa.action)}
                        className="px-3 py-2 border border-black/15 dark:border-white/15 text-[9px] uppercase tracking-widest font-black text-black dark:text-white hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-all active:scale-95"
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

                {m.role === 'user' ? (
                  <div className="max-w-[80%] bg-black dark:bg-white text-white dark:text-black px-5 py-3 text-sm font-light">
                    <span className="whitespace-pre-line leading-relaxed">{m.text}</span>
                  </div>
                ) : (
                  <div className={`max-w-[95%] ${m.error ? 'border-l-2 border-red-400 pl-4 py-1' : ''}`}>
                    {m.error && (
                      <div className="flex items-start gap-2 mb-1">
                        <AlertCircle size={13} className="text-red-400 mt-0.5 shrink-0" />
                        <span className="text-[9px] uppercase tracking-widest font-bold text-red-400">Connection error</span>
                      </div>
                    )}
                    <span className="whitespace-pre-line text-sm leading-relaxed text-black dark:text-white">{m.text}</span>

                    {m.searchMetadata && (
                      <p className="mt-2 text-[8px] uppercase tracking-[0.3em] text-gray-300 dark:text-gray-600">
                        {m.searchMetadata.method} · {m.searchMetadata.searchTime}ms · {m.searchMetadata.resultsCount} results
                      </p>
                    )}
                  </div>
                )}

                {m.products && m.products.length > 0 && (
                  <div className="flex gap-3 overflow-x-auto mt-4 pb-2 w-full no-scrollbar">
                    {m.products.map(p => <ProductCardInChat key={p.id} product={p} />)}
                  </div>
                )}

                {m.coupon && <CouponCard coupon={m.coupon} />}
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

            {loading && !isRetrieving && (
              <div className="flex space-x-3 px-5">
                <div className="w-2 h-2 bg-black dark:bg-white rounded-full animate-bounce [animation-delay:-0.3s]" />
                <div className="w-2 h-2 bg-black dark:bg-white rounded-full animate-bounce [animation-delay:-0.15s]" />
                <div className="w-2 h-2 bg-black dark:bg-white rounded-full animate-bounce" />
              </div>
            )}
          </div>

          {/* Input Bar */}
          <div className="p-6 md:p-10 border-t border-black/10 dark:border-white/10 bg-white dark:bg-[#0c0c0c]">
            <div className="relative flex items-center gap-4">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !loading && handleSendMessage()}
                  placeholder="Try: Show me summer dresses..."
                  className="w-full bg-transparent border-b border-black/20 dark:border-white/20 focus:border-black dark:focus:border-white outline-none py-5 text-sm uppercase tracking-[0.3em] font-bold text-black dark:text-white transition-colors placeholder:text-gray-400 dark:placeholder:text-gray-500"
                  disabled={loading}
                />
                <button
                  onClick={handleSendMessage}
                  className="absolute right-0 p-4 active:scale-90 transition-transform"
                  disabled={loading || !input.trim()}
                >
                  <ChevronRight size={28} className={loading || !input.trim() ? 'text-gray-300 dark:text-gray-600' : 'text-black dark:text-white'} />
                </button>
              </div>
            </div>
          </div>
      </div>
    </>
  );
};

export default AIChatAgent;
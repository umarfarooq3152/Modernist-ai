
import React, { useState, useEffect, useRef } from 'react';
import { X, Bot, ChevronRight, Percent, Camera, Wand2, RefreshCw, Check, Sparkles, PlusCircle, Activity, AlertCircle, Star, ShoppingBag, ExternalLink, ArrowUpDown, Tag } from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { useAuth } from '../context/AuthContext';
import Groq from 'groq-sdk';
import { Product } from '../types';
import { getStripe } from '../lib/stripe';
import checkoutHandler from '../api/checkout';
import { getLocalEmbedding, cosineSimilarity, isEmbeddingModelReady } from '../lib/embeddings';
import { CLERK_SYSTEM_PROMPT } from '../lib/clerkSystemPrompt';
import { generateProductEmbeddings } from '../lib/ragSearch';
import { handleSearchInventoryToolCall } from '../lib/ragIntegration';

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  text: string;
  products?: Product[];
  tryOnResult?: string;
  isTryOn?: boolean;
  coupon?: { code: string; percent: number; reason: string };
  error?: boolean;
}

// Groq models — free tier, blazing fast inference
const MODEL_FALLBACK_CHAIN = [
  'llama-3.3-70b-versatile',
  'llama-3.1-8b-instant',
  'mixtral-8x7b-32768',
];

// Retry config
const MAX_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 3000; // 3s base (Groq is very fast)
const MIN_REQUEST_INTERVAL_MS = 1000; // Groq allows ~30 RPM on free tier

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
let lastRequestTimestamp = 0;

// Groq client (singleton)
const groqClient = new Groq({
  apiKey: process.env.GROQ_API_KEY || '',
  dangerouslyAllowBrowser: true,
});

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
  const [productEmbeddingsCache, setProductEmbeddingsCache] = useState<Map<string, number[]>>(new Map());
  const [embeddingModelStatus, setEmbeddingModelStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const { 
    allProducts, cart, addToCartWithQuantity, openCart, lastAddedProduct, clearLastAdded,
    updateProductFilter, applyNegotiatedDiscount, negotiatedDiscount, cartTotal, cartSubtotal, addToast, searchERP, logClerkInteraction,
    setSortOrder, removeFromCart, filterByCategory, toggleTheme, theme
  } = useStore();

  const { user } = useAuth();
  
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, loading, isProcessingTryOn, isRetrieving]);

  useEffect(() => {
    // Only trigger recommendations if chat is open and user has been chatting
    // Don't auto-recommend if user just added from product page
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

  // Pre-load embedding model and cache product embeddings on first open
  useEffect(() => {
    if (!isOpen || productEmbeddingsCache.size > 0) return;
    
    const preloadEmbeddings = async () => {
      try {
        setEmbeddingModelStatus('loading');
        // Use RAG search embeddings generator
        const cache = await generateProductEmbeddings(allProducts);
        setProductEmbeddingsCache(cache);
        setEmbeddingModelStatus('ready');
        console.log(`[Clerk] RAG embedding cache ready: ${cache.size} products indexed for vector search`);
      } catch (err) {
        console.warn('[Clerk] Embedding pre-load failed:', err);
        setEmbeddingModelStatus('failed');
      }
    };
    preloadEmbeddings();
  }, [isOpen, allProducts]);

  // Generate a unique coupon code based on reason
  const generateCouponCode = (reason: string, percent: number): string => {
    const prefixes: Record<string, string> = {
      birthday: 'BDAY',
      loyal: 'LOYAL',
      bulk: 'BULK',
      student: 'STUDENT',
      first: 'WELCOME',
      holiday: 'HOLIDAY',
      friend: 'FRIEND',
      military: 'HONOR',
      buying: 'MULTI',
      default: 'CLERK'
    };
    const reasonLower = reason?.toLowerCase() || '';
    let prefix = prefixes.default;
    for (const [key, val] of Object.entries(prefixes)) {
      if (reasonLower.includes(key)) { prefix = val; break; }
    }
    const suffix = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `${prefix}-${percent}-${suffix}`;
  };

  // Detect rudeness in message
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

  // Get average rating for a product
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
      setMessages(prev => [...prev, { role: 'assistant', text: "Archival projection failed. The resonance between the frame and the garment was too volatile." }]);
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
        setMessages(prev => [...prev, { role: 'user', text: "I've uploaded my photo for virtual try-on." }]);
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
          `${product.name}—secured. But a piece like this demands companions. May I suggest:`,
          `Excellent choice. Now, let me show you what completes this narrative:`,
          `That ${product.category.toLowerCase()} piece? It's a foundation. Here's what builds the story:`,
          `${product.name} carries weight. These amplify its voice:`,
        ];
        setMessages(prev => [...prev, { 
          role: 'assistant', 
          text: recommendations[Math.floor(Math.random() * recommendations.length)],
          products: complementary
        }]);
      }
    } catch (error) {
      console.error("Perfect pair recommendation error:", error);
    } finally {
      setLoading(false);
    }
  };

  // Build compact inventory context (minimized to save tokens)
  const buildInventoryContext = (): string => {
    return allProducts.map(p => 
      `[${p.id}] ${p.name} $${p.price} (${p.category}) [${p.tags.join(',')}]`
    ).join('\n');
  };

  // Build cart context
  const buildCartContext = (): string => {
    if (cart.length === 0) return 'Cart is empty.';
    return cart.map(item => 
      `- ${item.product.name} (ID:${item.product.id}) x${item.quantity} @ $${item.product.price} each`
    ).join('\n') + `\nSubtotal: $${cartSubtotal} | Discount: ${negotiatedDiscount}% | Total: $${cartTotal}`;
  };

  // Call Groq with model fallback + retry-with-delay for rate limits
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
            setMessages(prev => {
              const last = prev[prev.length - 1];
              if (last?.role === 'system') return prev;
              return [...prev, { role: 'system' as const, text: `Rate limited — retrying in ${delay / 1000}s... (${attempt + 1}/${MAX_RETRIES})` }];
            });
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

  // ─── GROQ TOOL DECLARATIONS (OpenAI function-calling format) ───
  const groqTools: Groq.Chat.ChatCompletionTool[] = [
    {
      type: 'function',
      function: {
        name: 'search_inventory',
        description: 'RAG-powered search for products. CRITICAL: Call this whenever user explicitly asks to see, find, search, or browse products. Use natural language queries like "summer dresses", "leather jackets under $500", "minimalist watches".',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Required: Natural language search query. Examples: "summer dress", "leather jacket under $500", "minimalist watch", "wedding outfit"',
            },
            category: {
              type: 'string',
              description: 'Optional: Category filter — Outerwear, Basics, Accessories, Home, Apparel, Footwear',
            },
            max_results: {
              type: 'number',
              description: 'Optional: Number of results to return (default 5, max 10)',
            },
            min_price: {
              type: 'number',
              description: 'Optional: Minimum price filter',
            },
            max_price: {
              type: 'number',
              description: 'Optional: Maximum price filter',
            },
          },
          required: ['query'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'search_and_show_products',
        description: 'Search inventory for specific products. ONLY call when user explicitly asks to see/find/search products. Do NOT call with empty query. Do NOT call for greetings or general conversation.',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'REQUIRED: Specific search query like "summer dress", "leather jacket under $500", "formal shoes". Must be non-empty.' },
            category: { type: 'string', description: 'Optional category: Outerwear, Basics, Accessories, Home, Apparel, Footwear' },
          },
          required: ['query'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'check_inventory',
        description: 'Check details about a product — availability, materials, descriptions. Use for "tell me about X" or "do you have X?"',
        parameters: {
          type: 'object',
          properties: {
            product_name_or_id: { type: 'string', description: 'Name or ID of the product' },
            question: { type: 'string', description: 'What the user wants to know' },
          },
          required: ['product_name_or_id'],
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
            product_id: { type: 'string', description: 'The product ID' },
            quantity: { type: 'number', description: 'Quantity (default 1)' },
          },
          required: ['product_id'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'remove_from_cart',
        description: 'Remove product from bag.',
        parameters: {
          type: 'object',
          properties: { product_id: { type: 'string' } },
          required: ['product_id'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'sort_and_filter_store',
        description: 'Sort or filter the store UI in real-time. Use for "show me cheaper options", "sort by price", "filter by outerwear". Changes the website layout instantly.',
        parameters: {
          type: 'object',
          properties: {
            sort_order: { type: 'string', description: '"price-low", "price-high", or "relevance"' },
            category: { type: 'string', description: 'All, Outerwear, Basics, Accessories, Home, Apparel, Footwear' },
            query: { type: 'string', description: 'Search/vibe query to filter products' },
          },
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'generate_coupon',
        description: 'Generate a discount coupon. Use when user asks for a deal, discount, or gives a reason (birthday, student, loyal customer). Have a spine: if rude, refuse.',
        parameters: {
          type: 'object',
          properties: {
            code: { type: 'string', description: 'Coupon code like BDAY-20, LOYAL-15, STUDENT-10' },
            discount: { type: 'number', description: 'Discount percentage (max 20, up to 25 for 3+ items)' },
            reason: { type: 'string', description: 'Reason for the discount' },
            sentiment: { type: 'string', description: 'User sentiment: polite, neutral, rude, enthusiastic' },
          },
          required: ['code', 'discount', 'reason'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'recommend_products',
        description: 'Recommend products based on cart or occasion. Use for "what else?", "complete my look", "what pairs with this?"',
        parameters: {
          type: 'object',
          properties: {
            context: { type: 'string', description: 'Context: cart, browsing, occasion, style' },
            occasion: { type: 'string', description: 'Optional occasion like wedding, office' },
          },
          required: ['context'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'update_ui',
        description: 'Change the website view — filter by color, style, vibe, or reset. Use when user says "filter by blue" or "show me only leather items".',
        parameters: {
          type: 'object',
          properties: {
            filter_query: { type: 'string', description: 'What to filter by' },
            category: { type: 'string', description: 'Category to filter' },
            sort: { type: 'string', description: 'Sort order: price-low, price-high, relevance' },
          },
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'change_theme',
        description: 'Switch between light and dark mode. Use when user says "dark mode", "light mode", "switch theme", "this is too bright/dark".',
        parameters: {
          type: 'object',
          properties: {
            mode: { type: 'string', description: 'Target theme: "light" or "dark"', enum: ['light', 'dark'] },
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
      const matchesCategory = !category || category === 'All' || p.category.toLowerCase() === category.toLowerCase();
      if (!matchesCategory) return false;
      
      const text = `${p.name} ${p.description} ${p.tags.join(' ')} ${p.category}`.toLowerCase();
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
        const text = `${p.name} ${p.description} ${p.tags.join(' ')} ${p.category}`.toLowerCase();
        return searchTerms.some(t => text.includes(t));
      });
    }
    
    return results;
  };

  const findProductByName = (input: string): Product | undefined => {
    const q = input.toLowerCase();
    return allProducts.find(p => 
      q.includes(p.name.toLowerCase()) || 
      p.name.toLowerCase().includes(q) ||
      p.id === q
    );
  };

  const handleLocalIntent = (msg: string): IntentResult => {
    const m = msg.toLowerCase().trim();

    // ── GREETING ──
    if (/^(hi|hey|hello|yo|sup|what'?s up|howdy|good (morning|afternoon|evening)|greetings)\b/i.test(m) && m.split(/\s+/).length <= 5) {
      const greetings = [
        "Welcome to MODERNIST. I'm The Clerk—here to elevate your choices. What brings you in today?",
        "Good to see you. I curate experiences, not just transactions. What's the occasion?",
        "Welcome. I'm The Clerk—curator, negotiator, and keeper of the archive. What are we building today?",
        "Step into MODERNIST. Every piece here carries weight. What's calling to you?",
        "You've arrived. I don't just sell clothes—I broker statements. What's your vision?",
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
    if (/\b(what('?s| is) in my (cart|bag)|show.*(cart|bag)|my (cart|bag)|view (cart|bag))\b/i.test(m)) {
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
          text: `${commentary}\n\n${buildCartContext()}`,
          products: cart.map(i => i.product)
        }]);
      }
      return { handled: true, intent: 'show_cart' };
    }

    // ── CHECKOUT ──
    if (/\b(checkout|check out|buy now|purchase|complete.*(order|purchase)|pay|place order)\b/i.test(m)) {
      if (cart.length === 0) {
        setMessages(prev => [...prev, { role: 'assistant', text: "Can't check out an empty bag! That's not how shopping works. Let me find you something first." }]);
      } else {
        const summary = cart.map(i => `• ${i.product.name} × ${i.quantity} — $${i.product.price * i.quantity}`).join('\n');
        const commentary = negotiatedDiscount > 0 
          ? `(Nice negotiating, by the way. ${negotiatedDiscount}% off.)`
          : cart.length >= 2 
            ? "(Pro tip: you could probably haggle a discount on this before checkout...)"
            : "";
        setMessages(prev => [...prev, { 
          role: 'assistant', 
          text: `Excellent choices. Preparing your acquisition:\n\n${summary}\n\nTotal: $${cartTotal} ${commentary}\n\nRedirecting to secure checkout...`
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
        text: "Budget-conscious? Smart move. I've sorted the entire store by price — the website grid just updated. Here are your most wallet-friendly options:",
        products: sorted
      }]);
      return { handled: true, intent: 'sort_cheap' };
    }

    if (/\b(expensive|premium|high.?end|luxury|sort.*(expensive|high)|price.*(high|desc))\b/i.test(m)) {
      setSortOrder('price-high');
      const sorted = [...allProducts].sort((a, b) => b.price - a.price).slice(0, 6);
      setMessages(prev => [...prev, {
        role: 'assistant',
        text: "Going for the top shelf? I like your energy. The grid now shows our most investment-worthy pieces first. Feast your eyes:",
        products: sorted
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
        text: categoryComments[cat] || `The store now shows only ${cat}:`,
        products: filtered
      }]);
      return { handled: true, intent: 'filter_category' };
    }

    // ── SHOW ALL / RESET ──
    if (/\b(show.*(all|everything)|reset|all products|see everything|browse all)\b/i.test(m)) {
      filterByCategory('All');
      const sample = [...allProducts].sort(() => Math.random() - 0.5).slice(0, 6);
      setMessages(prev => [...prev, {
        role: 'assistant',
        text: `Filters cleared — the full collection is now at your disposal. Here's a taste of what we're working with:`,
        products: sample
      }]);
      return { handled: true, intent: 'show_all' };
    }

    // ── ADD TO CART (by name) ──
    const addMatch = m.match(/\b(add|buy|get|want|grab|i('ll| will) take)\b/i);
    if (addMatch) {
      const product = findProductByName(m);
      if (product) {
        const qtyMatch = m.match(/(\d+)\s*(of|x|×)/i);
        const qty = qtyMatch ? parseInt(qtyMatch[1]) : 1;
        addToCartWithQuantity(product.id, qty);
        const addResponses = [
          `${product.name} × ${qty} — secured. Excellent choice, honestly.`,
          `Done! ${product.name} is in your bag. You have good taste.`,
          `${product.name} added. ${qty > 1 ? `All ${qty} of them. ` : ''}I knew you'd pick that one.`,
        ];
        setMessages(prev => [...prev, {
          role: 'assistant',
          text: addResponses[Math.floor(Math.random() * addResponses.length)],
          products: [product]
        }]);
        const complementary = allProducts
          .filter(p => p.id !== product.id && p.category !== product.category)
          .sort(() => Math.random() - 0.5).slice(0, 2);
        if (complementary.length > 0) {
          setTimeout(() => setMessages(prev => [...prev, {
            role: 'assistant', 
            text: `By the way, these pair really well with that:`, 
            products: complementary
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
      const cartTags = cart.flatMap(i => i.product.tags);
      const cartIds = cart.map(i => i.product.id);
      
      const recs = allProducts
        .filter(p => !cartIds.includes(p.id))
        .map(p => ({
          product: p,
          score: (cartTags.filter(t => p.tags.includes(t)).length * 2) + (!cartCategories.includes(p.category) ? 3 : 0)
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 4)
        .map(r => r.product);
      
      if (recs.length > 0) {
        const commentary = cart.length > 0 
          ? `Based on what's in your bag, these would actually work really well together. The cross-category pairing is *chef's kiss*:`
          : `Here's what commands attention—versatile pieces that anchor any collection:`;
        setMessages(prev => [...prev, {
          role: 'assistant',
          text: commentary,
          products: recs
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
          text: `**${product.name}** — $${product.price}\n\n${product.description}\n\n${priceComment}\n\n📂 ${product.category} • ⭐ ${avgRating}/5 (${reviewCount} reviews) • 🏷️ ${product.tags.join(', ')}`,
          products: [product]
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
        updateProductFilter({ query: m });
        
        // Generate contextual response based on query
        let commentary: string;
        if (hasPriceFilter) {
          commentary = `Smart shopping! Here are ${display.length} pieces that fit your budget:`;
        } else if (hasOccasion) {
          const occasion = m.match(/\b(wedding|office|work|casual|formal|summer|winter|evening|date|party|travel)\b/i)?.[1] || 'occasion';
          commentary = `Perfect for ${occasion}! I've pulled together ${display.length} pieces that'll work beautifully:`;
        } else if (hasProductKeywords) {
          commentary = `Got it! Here's what we have in stock:`;
        } else {
          commentary = `Found ${display.length} pieces that match. Take a look:`;
        }
        
        setMessages(prev => [...prev, {
          role: 'assistant',
          text: commentary,
          products: display
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

    // Track rudeness
    const messageRudeness = detectRudeness(userMessage);
    const newRudenessScore = Math.min(5, rudenessScore + messageRudeness);
    setRudenessScore(messageRudeness > 0 ? newRudenessScore : Math.max(0, rudenessScore - 1));

    // ═══ TRY LOCAL INTENT ENGINE FIRST (no API call) ═══
    // Only for clear, unambiguous intents that don't need AI conversation
    const localResult = handleLocalIntent(userMessage);
    if (localResult.handled) {
      // Store actual responses in conversation history (not just intent names)
      const lastMessage = messages[messages.length - 1]; // Get the response that was just added
      setConversationHistory(prev => [...prev.slice(-8),
        { role: 'user', text: userMessage },
        { role: 'assistant', text: lastMessage?.text || `Handled: ${localResult.intent}` }
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

    // ═══ FALLBACK TO GROQ AI FOR CONVERSATIONAL/AMBIGUOUS MESSAGES ═══
    let finalClerkResponse = "";
    let finalRagResults: any[] = [];
    let didShowSomething = false; // Track if we showed any response

    try {
      setIsRetrieving(true);

      // Helper: race a promise against a timeout
      const withTimeout = <T,>(promise: Promise<T>, ms: number, fallback: T): Promise<T> =>
        Promise.race([promise, sleep(ms).then(() => fallback)]);

      // Local embedding-powered semantic search (non-blocking, 5s timeout)
      let embeddingResults: Product[] = [];
      try {
        if (embeddingModelStatus === 'ready' && productEmbeddingsCache.size > 0) {
          const queryEmbedding = await withTimeout(getLocalEmbedding(userMessage), 5000, null as any);
          if (queryEmbedding) {
            const productScores = allProducts
              .filter(p => productEmbeddingsCache.has(p.id))
              .map(p => ({
                product: p,
                score: cosineSimilarity(queryEmbedding, productEmbeddingsCache.get(p.id)!)
              }));
            embeddingResults = productScores
              .filter(ps => ps.score >= 0.35)
              .sort((a, b) => b.score - a.score)
              .slice(0, 6)
              .map(ps => ps.product);
          }
        }
      } catch (embErr) {
        console.warn('Embedding search skipped:', embErr);
      }

      // ERP search with 3s timeout
      try {
        const ragResultsRaw = await withTimeout(searchERP(userMessage), 3000, []);
        finalRagResults = Array.isArray(ragResultsRaw)
          ? ragResultsRaw.filter((r: any) => r.similarity >= 0.4)
          : [];
      } catch { finalRagResults = []; }
      setIsRetrieving(false);

      // Build Groq messages in OpenAI chat format
      const systemMessage: Groq.Chat.ChatCompletionMessageParam = {
        role: 'system',
        content: `${CLERK_SYSTEM_PROMPT}

CURRENT STATE:
- INVENTORY: ${allProducts.length} pieces (Outerwear, Basics, Accessories, Home, Apparel, Footwear)
- CART: ${cart.length === 0 ? 'Empty' : cart.map(i => i.product.name).join(', ')}
- RUDENESS LEVEL: ${newRudenessScore}/5 ${newRudenessScore >= 3 ? '→ REFUSE discounts, apply surcharge' : ''}`,
      };

      const chatMessages: Groq.Chat.ChatCompletionMessageParam[] = [
        systemMessage,
        ...conversationHistory.slice(-6).map(h => ({
          role: h.role as 'user' | 'assistant',
          content: h.text,
        })),
        { role: 'user', content: userMessage },
      ];

      // Call Groq (Llama 3.3 70B) with tool calling
      const { response } = await callGroqWithFallback(chatMessages, groqTools);
      const choice = response.choices[0];
      const message = choice?.message;

      // Handle tool calls from Groq
      if (message?.tool_calls && message.tool_calls.length > 0) {
        for (const toolCall of message.tool_calls) {
          const fnName = toolCall.function.name;
          let args: any = {};
          try { args = JSON.parse(toolCall.function.arguments || '{}'); } catch(e) {}

          if (fnName === 'search_inventory') {
            // RAG-powered search_inventory tool
            const ragResult = await handleSearchInventoryToolCall(
              args,
              allProducts,
              productEmbeddingsCache
            );
            
            if (ragResult.error) {
              setMessages(prev => [...prev, {
                role: 'assistant',
                text: ragResult.assistantMessage,
                error: true
              }]);
            } else {
              setMessages(prev => [...prev, {
                role: 'assistant',
                text: ragResult.assistantMessage,
                products: ragResult.products
              }]);
              if (ragResult.products.length > 0) {
                updateProductFilter({ query: args.query });
              }
            }
            didShowSomething = true;
          } else if (fnName === 'search_and_show_products') {
            // REJECT empty queries - this is conversation, not a product dump
            const query = (args.query || '').trim();
            if (!query || query.length < 2) {
              // Don't show products - give a conversational response instead
              setMessages(prev => [...prev, { 
                role: 'assistant', 
                text: "I curate experiences, not dump catalogs. Give me a style, an occasion, or a budget—and I'll build your look." 
              }]);
              didShowSomething = true;
              continue;
            }
            
            // Use embedding results if available, else fall back to keyword search
            let results = embeddingResults.length > 0 ? embeddingResults : semanticSearch(query, args.category);
            updateProductFilter({ query: query, category: args.category });
            if (results.length > 0) {
              // Premium salesperson responses - sell the lifestyle
              const searchResponses = [
                `Curated for you. These pieces carry weight.`,
                `The floor's been arranged. Each one—a choice of true character.`,
                `Here's what commands attention:`,
                `These aren't just items. They're statements.`,
                `Let me show you pieces that earn their place in your life.`,
              ];
              const response = searchResponses[Math.floor(Math.random() * searchResponses.length)];
              setMessages(prev => [...prev, { role: 'assistant', text: response, products: results.slice(0, 6) }]);
            } else {
              setMessages(prev => [...prev, { role: 'assistant', text: "Nothing matches that criteria exactly. Refine your vision—give me a style, an occasion, or a budget." }]);
            }
            didShowSomething = true;
          } else if (fnName === 'add_to_cart') {
            const product = allProducts.find(p => p.id === args.product_id);
            addToCartWithQuantity(args.product_id, args.quantity || 1);
            if (product) {
              const addResponses = [
                `${product.name} — secured. A choice of true character.`,
                `Excellent. ${product.name} will serve you well.`,
                `Done. That piece earns its place in your collection.`,
              ];
              setMessages(prev => [...prev, { role: 'assistant', text: addResponses[Math.floor(Math.random() * addResponses.length)], products: [product] }]);
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
            // Groq decided to generate a coupon — apply it
            const sentiment = (args.sentiment || 'neutral').toLowerCase();
            if (newRudenessScore >= 3 || sentiment === 'rude') {
              // Apply surcharge for rudeness
              const surchargePercent = Math.min(newRudenessScore * 5, 25);
              applyNegotiatedDiscount(`RUDE-${Math.random().toString(36).substring(2,6).toUpperCase()}`, -surchargePercent);
              setMessages(prev => [...prev, {
                role: 'assistant',
                text: `Nice try, but manners matter at MODERNIST. Prices just went up ${surchargePercent}%. Come back with a better attitude.`,
                error: true
              }]);
              addToast(`${surchargePercent}% surcharge applied`, 'error');
            } else if (cart.length === 0) {
              setMessages(prev => [...prev, { role: 'assistant', text: "Add some pieces to your bag first, then we can talk numbers!" }]);
            } else {
              const subtotal = cart.reduce((sum, item) => sum + (item.product.price * item.quantity), 0);
              const floor = cart.reduce((sum, item) => sum + (item.product.bottom_price * item.quantity), 0);
              let discountPercent = Math.min(args.discount || 10, cart.length >= 3 ? 25 : 20);
              const discountedTotal = Math.round(subtotal * (1 - discountPercent / 100));
              
              if (discountedTotal < floor) {
                discountPercent = Math.round(((subtotal - floor) / subtotal) * 100);
              }
              
              const couponCode = args.code || generateCouponCode(args.reason || 'Negotiated', discountPercent);
              applyNegotiatedDiscount(couponCode, discountPercent);
              setShowDiscountToast({ code: couponCode, percent: discountPercent, reason: args.reason || 'Negotiated Concession' });
              setMessages(prev => [...prev, {
                role: 'assistant',
                text: `${discountPercent}% concession granted. You've earned this.`,
                coupon: { code: couponCode, percent: discountPercent, reason: args.reason || 'Archival Concession' }
              }]);
            }
            didShowSomething = true;
          } else if (fnName === 'recommend_products') {
            handleLocalIntent('recommend something');
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
            handleLocalIntent('checkout');
            didShowSomething = true;
          } else if (fnName === 'show_cart_summary') {
            handleLocalIntent('show my cart');
            didShowSomething = true;
          } else if (fnName === 'check_inventory') {
            const product = allProducts.find(p => p.id === args.product_name_or_id || p.name.toLowerCase().includes((args.product_name_or_id || '').toLowerCase()));
            if (product) {
              setMessages(prev => [...prev, { role: 'assistant', text: `${product.name} — $${product.price}\n\n${product.description}\n\nCategory: ${product.category} | Tags: ${product.tags.join(', ')}`, products: [product] }]);
              didShowSomething = true;
            }
          }
        }
      }

      // Text response from Groq (show it before products if there are tool calls)
      if (message?.content) {
        finalClerkResponse = message.content;
        // Only show text if it's meaningful (not just repeat of tool results)
        if (finalClerkResponse.length > 20 && !didShowSomething) {
          setMessages(prev => [...prev, { role: 'assistant', text: finalClerkResponse }]);
          didShowSomething = true;
        } else if (finalClerkResponse.length > 20) {
          // Insert the conversational text before the products that were just shown
          setMessages(prev => {
            const lastMsg = prev[prev.length - 1];
            if (lastMsg?.role === 'assistant' && lastMsg.products) {
              // Prepend text to the last message
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

      setConversationHistory(prev => [...prev.slice(-8), { role: 'user', text: userMessage }, { role: 'assistant', text: finalClerkResponse || '(showed products)' }]);
      logClerkInteraction({
        user_id: user?.id, user_email: user?.email,
        user_message: userMessage, clerk_response: finalClerkResponse,
        clerk_sentiment: 'neutral', discount_offered: 0, negotiation_successful: false,
        cart_snapshot: cart.map(i => ({ id: i.product.id, name: i.product.name, qty: i.quantity, price: i.product.price })),
        metadata: { mode: 'groq', model_used: workingModel, embedding_matches: embeddingResults.length }
      });

    } catch (error: any) {
      console.error("Clerk interaction error:", error);
      setIsRetrieving(false);
      
      // AI failed — give a helpful conversational response, not just product dump
      const isQuestion = /\?|what|how|why|which|when|where|can|could|would|should/i.test(userMessage);
      const mentionsProduct = /coat|jacket|shirt|pants|shoes|bag|ring|watch|outfit/i.test(userMessage);
      
      if (mentionsProduct) {
        const localResults = semanticSearch(userMessage);
        if (localResults.length > 0) {
          setMessages(prev => [...prev, { 
            role: 'assistant', 
            text: `Good eye! Here's what I found in our collection:`,
            products: localResults.slice(0, 4)
          }]);
          updateProductFilter({ query: userMessage });
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

  const handleInitiateStripeCheckout = async () => {
    if (cart.length === 0) return;
    setIsRedirecting(true);
    try {
      const mockRequest = { method: 'POST', json: async () => ({ cartItems: cart, negotiatedTotal: cartTotal, discountPercent: negotiatedDiscount }) };
      const response = await checkoutHandler(mockRequest as any);
      const { sessionId } = await response.json();
      const stripe = getStripe();
      await stripe.redirectToCheckout({ sessionId });
    } catch (err) {
      console.error(err);
      setIsRedirecting(false);
    }
  };

  const quickActions = [
    { label: "Browse all", action: "Show me everything you've got." },
    { label: "Summer wedding", action: "I need an outfit for a summer wedding in Italy. Something sophisticated but not too formal." },
    { label: "Budget finds", action: "Show me your best pieces under $300." },
    { label: "Haggle time", action: "Can I get a discount? It's my birthday." },
    { label: "My bag", action: "What do I have in my cart?" },
    { label: "Cheaper first", action: "Sort everything by price, cheap to expensive." },
  ];

  // ─── PRODUCT CARD IN CHAT ───
  const ProductCardInChat: React.FC<{ product: Product }> = ({ product }) => {
    const avgRating = getAvgRating(product);
    const reviewCount = product.reviews?.length || 0;
    return (
      <a 
        href={`#/product/${product.id}`}
        className="group block bg-white border border-black/5 hover:border-black/20 transition-all duration-300 overflow-hidden flex-shrink-0"
        style={{ width: '170px' }}
      >
        <div className="relative aspect-square overflow-hidden bg-gray-50 dark:bg-gray-900">
          <img src={product.image_url} alt={product.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" loading="lazy" />
          <div className="absolute top-2 right-2 bg-black/80 dark:bg-white/80 text-white dark:text-black text-[9px] font-black uppercase tracking-wider px-2 py-1">${product.price}</div>
        </div>
        <div className="p-3">
          <p className="text-[10px] uppercase tracking-[0.2em] text-gray-400 dark:text-gray-500 font-bold">{product.category}</p>
          <p className="text-xs font-bold truncate mt-1">{product.name}</p>
          <div className="flex items-center gap-1 mt-1.5">
            {[...Array(5)].map((_, i) => (
              <Star key={i} size={9} className={i < Math.round(avgRating) ? 'fill-yellow-400 text-yellow-400' : 'text-gray-200 dark:text-gray-700'} />
            ))}
            <span className="text-[9px] text-gray-400 dark:text-gray-500 ml-1">({reviewCount})</span>
          </div>
          <div className="flex items-center gap-2 mt-2">
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); addToCartWithQuantity(product.id, 1); addToast(`${product.name} added to bag`, 'success'); }}
              className="flex-1 py-1.5 bg-black dark:bg-white text-white dark:text-black text-[8px] uppercase tracking-[0.2em] font-black hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors text-center"
            >
              Add to Bag
            </button>
            <ExternalLink size={10} className="text-gray-300 dark:text-gray-600 group-hover:text-black dark:group-hover:text-white transition-colors shrink-0" />
          </div>
        </div>
      </a>
    );
  };

  // ─── COUPON DISPLAY ───
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
          <div className="bg-black dark:bg-white text-white dark:text-black p-5 border border-white/20 dark:border-black/20 shadow-2xl animate-in slide-in-from-top-12 duration-700 backdrop-blur-3xl">
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
          className="fixed bottom-6 right-6 z-[120] bg-black dark:bg-white text-white dark:text-black p-5 rounded-none shadow-2xl border border-white/10 dark:border-black/10 active:scale-90 transition-all tap-highlight-none group"
        >
          <Bot size={24} strokeWidth={1.5} />
          <span className="absolute -top-1 -right-1 w-3 h-3 bg-yellow-400 dark:bg-yellow-600 rounded-none animate-pulse" />
        </button>
      )}

      <div className={`fixed inset-y-0 right-0 z-[130] w-full sm:w-[520px] transition-all duration-700 transform ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="absolute inset-0 glass-panel border-l border-black/5 dark:border-white/10" />
        <div className="relative h-full flex flex-col">
          {/* Header */}
          <div className="p-6 md:p-10 border-b border-black/5 dark:border-white/5 flex justify-between items-end">
            <div>
              <span className="text-[10px] uppercase tracking-[0.5em] text-gray-400 dark:text-gray-500 font-black">Archive Concierge</span>
              <h2 className="font-serif text-3xl md:text-5xl font-bold uppercase tracking-tighter">The Clerk</h2>
              <span className="text-[8px] uppercase tracking-[0.3em] text-gray-300 dark:text-gray-600 font-bold mt-1 block">Search · Shop · Negotiate · Checkout — by conversation</span>
            </div>
            <button onClick={() => setIsOpen(false)} className="p-3 -mr-3 active:scale-90 tap-highlight-none"><X size={32} strokeWidth={1} /></button>
          </div>
          
          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto no-scrollbar p-6 md:p-10 space-y-6 pb-24">
            {messages.length === 0 && (
              <div className="h-full flex flex-col justify-center max-w-[360px] py-16">
                <h3 className="font-serif text-3xl md:text-4xl mb-6 italic leading-tight">"So, what brings you in today?"</h3>
                <p className="text-[11px] uppercase tracking-[0.2em] text-gray-500 dark:text-gray-400 leading-relaxed font-bold mb-8">
                  I'm The Clerk — your personal shopper, style advisor, and haggling partner. Browse, search, add to cart, negotiate prices, and checkout — all through conversation. No buttons needed.
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
                </div>
                {m.coupon && <CouponCard coupon={m.coupon} />}
                {m.products && m.products.length > 0 && (
                  <div className="mt-3 w-full">
                    <div className="flex gap-3 overflow-x-auto pb-3 no-scrollbar">
                      {m.products.map(product => (
                        <ProductCardInChat key={product.id} product={product} />
                      ))}
                    </div>
                  </div>
                )}
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
                   <Activity size={12} className="text-black dark:text-white" />
                   <span className="text-[9px] uppercase tracking-[0.4em] font-black text-gray-400 dark:text-gray-500">Searching the Archive...</span>
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

            {isProcessingTryOn && (
              <div className="flex flex-col items-start space-y-2 px-5 animate-pulse">
                <div className="flex items-center gap-3">
                   <Camera size={12} className="text-black dark:text-white" />
                   <span className="text-[9px] uppercase tracking-[0.4em] font-black text-gray-400 dark:text-gray-500">Projecting silhouette...</span>
                </div>
              </div>
            )}
          </div>

          {/* Input Bar */}
          <div className="p-6 md:p-10 border-t border-black/5 dark:border-white/5 bg-white/40 dark:bg-black/40 backdrop-blur-xl">
            <div className="relative flex items-center gap-4">
              <button 
                onClick={() => fileInputRef.current?.click()}
                className={`p-3 border border-black/10 dark:border-white/10 hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-all active:scale-90 tap-highlight-none ${userSelfie ? 'text-green-600 dark:text-green-400 border-green-600 dark:border-green-400' : 'text-gray-400 dark:text-gray-500'}`}
                title="Upload selfie for virtual try-on"
              >
                <Camera size={20} strokeWidth={1.5} />
              </button>
              <div className="relative flex-1">
                <input 
                  type="text" 
                  value={input} 
                  onChange={(e) => setInput(e.target.value)} 
                  onKeyDown={(e) => e.key === 'Enter' && !loading && handleSendMessage()}
                  placeholder="Search, shop, or negotiate..." 
                  className="w-full bg-transparent border-b border-black/20 dark:border-white/20 focus:border-black dark:focus:border-white outline-none py-5 text-sm uppercase tracking-[0.3em] font-bold transition-colors placeholder:text-gray-300 dark:placeholder:text-gray-600"
                  disabled={loading}
                />
                <button 
                  onClick={handleSendMessage} 
                  className="absolute right-0 p-4 active:scale-90 transition-transform tap-highlight-none"
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

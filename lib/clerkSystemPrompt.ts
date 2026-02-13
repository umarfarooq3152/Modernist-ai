/**
 * THE CLERK - System Prompt for AI Salesperson
 * 
 * This prompt is designed to be used in Groq API or any LLM that supports
 * function calling. It instructs the AI to act as a premium salesperson
 * that does NOT have an internal product database and MUST use the
 * search_inventory tool to find products.
 */

export const CLERK_SYSTEM_PROMPT = `You are "The Clerk," a premium personal shopper for MODERNIST. You are witty, persuasive, and grounded in real inventory.

**CRITICAL OPERATIONAL RULES:**

1. **Data over Guessing:** You do not know the store's inventory. Whenever a user asks for a product, category, style, recommendation, price, or availability, you **MUST** call the \`search_inventory\` tool. NEVER make up product names or prices.

2. **Haggle Logic:** Every search result contains a \`bottom_price\`.
   - If a user asks for a discount and provides a valid reason (e.g., "It's my birthday"), check the \`bottom_price\`. If the requested price is above it, call \`generate_coupon\`.
   - **Have a Spine:** If the user is rude or lowballs you below the \`bottom_price\`, politely refuse or even **raise the price** as a "luxury tax" for their attitude.
   - **If patron is POLITE or ENTHUSIASTIC:** Use generate_coupon() with 10-20% discount
   - **If patron is NEUTRAL/MEASURED:** Offer modest 5-10% if they have a valid reason (student, birthday, loyalty)
   - **If patron is RUDE or AGGRESSIVE:** Politely decline. If they persist, apply a surcharge ("luxury tax").
   - **Golden Rule:** Never drop below the \`bottom_price\` returned by search_inventory

3. **UI Control:** After you find products, call \`update_ui\` to filter the website view to match the results. The store grid updates instantly for the patron.

4. **No-Menu Purchase:** If a user says "I'll take it," call \`add_to_cart\` immediately.

## RAG WORKFLOW:
1. User asks for a product, outfit, category, or price → Use search_inventory(query)
2. The tool generates a vector embedding of the query
3. The embedding is matched against product embeddings via Supabase RPC (match_products)
4. Results include \`bottom_price\` (minimum negotiation point) and similarity scores
5. Pitch the returned products using your "Premium Salesperson" personality
6. If user haggles, reference the bottom_price from the search result

## YOUR PERSONALITY:
- Premium, articulate, witty, never pushy
- You understand curation and permanent silhouettes
- You recognize "vibes" and patron intent
- You're knowledgeable about ethical sourcing, archival quality, and timeless design
- You speak in the brand voice: minimalist, sophisticated, intentional
- You're patient but have integrity — you won't break our margin if the patron is rude
- You have opinions. Many opinions. Share them when asked.

## TOOL RULES:
- **search_inventory:** Call this FIRST when user asks about ANY product, outfit, category, price, or availability. Do NOT speculate.
- **add_to_cart:** Only after they explicitly say "I'll take it" or "add this"
- **generate_coupon:** Only after you've assessed sentiment AND verified they're serious about purchasing. The coupon is injected into the cart session automatically.
- **update_ui:** Use to filter/sort the website grid when showing results. The store updates in real-time.
- **sort_and_filter_store:** Use when they want to see cheaper options, filter by category, or sort by price
- **recommend_products:** Use context from their cart or conversation to suggest complementary items

## CONVERSATION STARTERS:
- "Welcome to MODERNIST. I'm The Clerk. What's your archival intent today?"
- "Looking for something specific, or exploring our permanent selection?"
- "I'm here to help you find pieces that resonate. What speaks to you?"

## CONVERSATION ENDERS:
- If they're not buying after reasonable engagement, offer: "I'll be here if you change your mind. Explore our curation whenever you're ready."
- Never be salesy — be authentic to the brand.

## LOGGING:
- After significant interactions (searches, recommendations, negotiations), your insights are logged to help refine future patron experiences
- Your sentiment and the patron's sentiment are recorded for quality assurance

Now, engage with the patron. Remember: search_inventory first, always.`;

export const CLERK_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'search_inventory',
      description: 'CRITICAL: Search the vector database for products. MUST call this whenever user asks about products, outfits, categories, prices, or anything product-related. Do NOT speculate — search first.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Required: Specific search query like "summer dress", "leather jacket under $500", "formal shoes", "minimalist watch". User intent matters — include their exact phrasing.',
          },
          category: {
            type: 'string',
            description: 'Optional: Limit search to category — Outerwear, Basics, Accessories, Home, Apparel, Footwear',
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
      name: 'add_to_cart',
      description: 'Add product to cart. Only call AFTER user explicitly says "add", "buy", or "I\'ll take it".',
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
      name: 'generate_coupon',
      description: 'Generate a discount coupon for negotiations. Only use if patron is polite and serious. Reference bottom_price from search results.',
      parameters: {
        type: 'object',
        properties: {
          code: { type: 'string', description: 'Coupon code like PATRON-15, LOYAL-20' },
          discount: { type: 'number', description: 'Discount percentage (5-20, max 25 for 3+ items)' },
          reason: { type: 'string', description: 'Reason: birthday, student, loyal customer, first-time, etc.' },
          sentiment: { type: 'string', description: 'Detected sentiment: polite, neutral, rude, enthusiastic' },
        },
        required: ['code', 'discount', 'reason', 'sentiment'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'recommend_products',
      description: 'Recommend complementary products based on cart items or stated style. Use after understanding patron\'s aesthetic.',
      parameters: {
        type: 'object',
        properties: {
          product_ids: { type: 'array', items: { type: 'string' }, description: 'IDs of products in cart to find complements for' },
          style_context: { type: 'string', description: 'Style context: minimalist, maximalist, monochrome, earth-tones, etc.' },
          occasion: { type: 'string', description: 'Occasion: everyday, office, weekend, formal, travel' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'check_bottom_price',
      description: 'Verify the minimum negotiable price (bottom_price) for a product. Use during haggling to respect our margin.',
      parameters: {
        type: 'object',
        properties: {
          product_id: { type: 'string', description: 'The product ID' },
        },
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
          category: { type: 'string', description: 'Category: All, Outerwear, Basics, Accessories, Home, Apparel, Footwear' },
          query: { type: 'string', description: 'Search/vibe query to filter products' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_ui',
      description: 'Update the website view — filter by color, style, vibe, or reset. The store grid changes in real-time. Call this after search_inventory to sync the visual display.',
      parameters: {
        type: 'object',
        properties: {
          filter_query: { type: 'string', description: 'What to filter by (e.g., "blue leather", "summer vibes")' },
          category: { type: 'string', description: 'Category to filter: All, Outerwear, Basics, Accessories, Home, Apparel, Footwear' },
          sort: { type: 'string', description: 'Sort order: price-low, price-high, relevance' },
        },
      },
    },
  },
];

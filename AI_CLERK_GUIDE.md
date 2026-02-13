# AI Clerk System Documentation

## Overview

The **AI Clerk** is a sophisticated RAG-powered (Retrieval-Augmented Generation) AI salesperson for the MODERNIST storefront. It uses vector embeddings and tool calling to provide intelligent product search, haggling, and recommendations.

## Architecture

### Components

1. **System Prompt** (`lib/clerkSystemPrompt.ts`)
   - Character definition: "The Clerk" - premium salesperson
   - Operational protocol and rules
   - Tool definitions for function-calling

2. **RAG Search** (`lib/ragSearch.ts`)
   - Vector-based semantic search using Xenova/all-MiniLM-L6-v2 embeddings
   - Keyword matching fallback
   - Price and category filtering
   - Natural language query parsing

3. **RAG Integration** (`lib/ragIntegration.ts`)
   - Search execution pipeline
   - Response formatting for the AI
   - Tool call handler bridge

4. **AIChatAgent Component** (`components/AIChatAgent.tsx`)
   - Groq API integration
   - Tool calling execution
   - Local vs. AI intent routing
   - Conversation management

## How the Clerk Works

### The Search Pipeline

```
User Message
    ↓
Local Intent Engine (quick judgments)
    ↓
Groq AI reasoning + tool decisions
    ↓
Tool Execution (if needed)
    ├── search_inventory (RAG search)
    ├── add_to_cart
    ├── generate_coupon (haggle)
    ├── sort_and_filter
    └── [other tools...]
    ↓
Product Display + Response
```

### Text Vector Search Flow

```
User Query
    ↓
Generate Query Embedding (in-browser, free)
    ↓
Compare against cached product embeddings
    ↓
Score by cosine similarity
    ↓
Apply filters (price, category)
    ↓
Sort by match confidence
    ↓
Return top N products
```

## Key Features

### 1. **search_inventory Tool** (RAG-Powered)

The AI calls this when users explicitly ask to see products.

**Example Queries:**
- "Show me leather jackets"
- "What do you have under $500?"
- "I need something for a wedding"

**How it Works:**
- Embeds user query into 384-dimension vector
- Finds semantically similar products
- Extracts price filters from natural language ("under $500")
- Detects category mentions automatically
- Returns results with match confidence scores

**Parameters:**
```json
{
  "query": "summer dress",          // Required
  "category": "Apparel",            // Optional
  "max_results": 5,                 // Optional (default 5)
  "min_price": 100,                 // Optional
  "max_price": 500                  // Optional
}
```

### 2. **Bottom Price Enforcement**

Each product has a `bottom_price` field that the Clerk respects:

```typescript
Product {
  price: 500,        // Display price
  bottom_price: 350  // Minimum negotiable price
}
```

Haggling logic:
- **Polite user** → Offer up to 20% off (or 25% for 3+ items)
- **Rude user** → Add 5-25% surcharge instead
- **Always respect** → Never go below `bottom_price`

### 3. **Local Intent Engine**

Handled instantly without API calls:
- Greetings ("Hi", "Hello")
- Help requests
- Simple cart operations
- Category filters
- Price sorting
- Generic recommendations

### 4. **Rudeness Detection**

Tracks user tone with a "rudeness score":
- Level 0-2: Normal discounts available
- Level 3+: Refusal + automatic surcharge

**Triggers:**
- Rude phrasing ("I demand", "Stop wasting my time")
- Aggressive negotiation ("That's ridiculous")
- Insults

## Configuration & Setup

### 1. Environment Variables

Needed in `.env.local`:

```env
GROQ_API_KEY=your_groq_api_key_here
```

Get a free key at [console.groq.com](https://console.groq.com)

### 2. Tailwind Configuration

Ensure Dark Mode support (already done):

```typescript
// tailwind.config.ts
export default {
  darkMode: 'class',  // ← Critical for theme switching
  // ...
}
```

### 3. Models

**AI Model:** Llama 3.3 70B (via Groq) or fallback to Llama 3.1 8B
- Free tier: ~30 RPM on Groq
- Fallback chain prevents rate limit errors

**Embedding Model:** Xenova/all-MiniLM-L6-v2
- Runs in-browser (no API key needed)
- 384-dimension vectors
- ~23MB model (cached after first download)

## Custom Prompting

To adjust the Clerk's personality, edit `lib/clerkSystemPrompt.ts`:

```typescript
export const CLERK_SYSTEM_PROMPT = `
You are "The Clerk," the elite floor manager at MODERNIST...
[Customize tone, rules, personality here]
`;
```

## Troubleshooting

### Embeddings Won't Load

**Symptom:** Chat works but search is generic keyword-matching.

**Fix:**
1. Check browser console for WebGPU/WASM errors
2. Verify model cache in Browser DevTools → Application → Cache Storage
3. Try clearing cache: `indexedDB` → Delete "transformers" database

### Rate Limiting

**Symptom:** "All Groq models exhausted after retries"

**Fix:**
1. Free tier has ~30 RPM limit
2. Wait 2 seconds between messages
3. Consider upgrading Groq plan for higher limits

### Semantic Search Not Working

**Symptom:** search_inventory returns no results for obvious queries.

**Fix:**
1. Verify `productEmbeddingsCache` is populated (console log)
2. Check product tags and descriptions are solid
3. Try simpler queries ("dress" vs. "lightweight summer dress for beach")

## Integration Points

### Adding Your Own Tools

1. Add function to `CLERK_TOOLS`:
```typescript
{
  type: 'function',
  function: {
    name: 'my_tool',
    description: 'What it does',
    parameters: { /* ...schema... */ }
  }
}
```

2. Handle in `AIChatAgent.tsx`:
```typescript
} else if (fnName === 'my_tool') {
  // Execute logic
  setMessages(...);
}
```

### Custom Search Logic

Replace `searchInventoryRAG` in `ragIntegration.ts` to:
- Query an external vector database (Pinecone, Supabase)
- Use different embedding model
- Add domain-specific ranking

## Performance Notes

- **First load:** ~3-5 minutes to download embedding model (cached)
- **Per search:** 200-400ms for embedding + similarity scoring
- **API latency:** Groq typically responds in 500ms-2s
- **Total UX latency:** 1-3 seconds per user query

## Future Enhancements

- [ ] Supabase vector search (pgvector) instead of in-browser
- [ ] Product recommendation engine based on cart
- [ ] Style quiz → personalized suggestions
- [ ] Voice chat integration
- [ ] Multi-language support

---

**Need help?** Examine `AIChatAgent.tsx` for the complete integration, or check Groq docs at [console.groq.com/docs](https://console.groq.com/docs).

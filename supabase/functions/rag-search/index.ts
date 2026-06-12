/**
 * rag-search — Supabase Edge Function
 *
 * Full RAG pipeline:
 *  1. Embed the query using Supabase AI `gte-small` (same model as stored embeddings)
 *  2. Run pgvector similarity search via `match_products` RPC
 *  3. Optionally generate an LLM explanation via Groq
 *
 * POST /rag-search
 * Body: {
 *   query: string,
 *   match_threshold?: number,   default 0.3
 *   match_count?: number,       default 8
 *   source_product_id?: string, for similar_products lookup
 *   explain?: boolean,          generate LLM context string
 * }
 *
 * Public endpoint — no auth required so the storefront can call it freely.
 * (search results are non-sensitive public product data)
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const serviceClient = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

// @ts-ignore
const embeddingModel = new Supabase.ai.Session("gte-small");

async function generateGroqExplanation(query: string, products: any[]): Promise<string | null> {
  const groqKey = Deno.env.get("GROQ_API_KEY");
  if (!groqKey || products.length === 0) return null;

  try {
    const productList = products
      .slice(0, 5)
      .map((p, i) => `${i + 1}. ${p.name} (${p.category}) — $${p.price} — ${p.description?.slice(0, 80)}`)
      .join("\n");

    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${groqKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: [
          {
            role: "system",
            content: `You are The Clerk, the AI concierge for MODERNIST — a luxury minimalist fashion archive.
Respond in 1-2 sentences. Be architectural, sophisticated, slightly witty. Never generic.`,
          },
          {
            role: "user",
            content: `A patron searched for: "${query}"
These are the top matching pieces from our archive:\n${productList}

Write a 1-2 sentence archival introduction for these results that feels like a personal curation, not a search engine.`,
          },
        ],
        max_tokens: 120,
        temperature: 0.7,
      }),
    });

    if (!res.ok) return null;
    const data = await res.json();
    return data.choices?.[0]?.message?.content?.trim() || null;
  } catch {
    return null;
  }
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  let body: any = {};
  try { body = await req.json(); } catch { /* allow empty body */ }

  const {
    query,
    match_threshold = 0.3,
    match_count = 8,
    source_product_id,
    explain = false,
  } = body;

  // ── Path 1: Similar products for a given product ID ──
  if (source_product_id && !query) {
    const { data, error } = await serviceClient.rpc("similar_products", {
      source_product_id,
      match_count: match_count || 4,
    });
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
    return new Response(JSON.stringify({ results: data || [], query: null, explanation: null }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!query || typeof query !== "string" || query.trim().length < 2) {
    return new Response(JSON.stringify({ error: "query must be at least 2 characters" }), {
      status: 400,
      headers: corsHeaders,
    });
  }

  // ── Path 2: Semantic search ──

  // Step 1: Embed the query using the same gte-small model as stored embeddings
  let queryEmbedding: number[];
  try {
    queryEmbedding = await embeddingModel.run(query.trim(), { mean_pool: true, normalize: true });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: `Embedding failed: ${err.message}` }), {
      status: 500,
      headers: corsHeaders,
    });
  }

  // Step 2: pgvector similarity search
  const { data: results, error } = await serviceClient.rpc("match_products", {
    query_embedding: queryEmbedding,
    match_threshold,
    match_count,
  });

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
  }

  const products = results || [];

  // Step 3: Optional LLM explanation
  let explanation: string | null = null;
  if (explain && products.length > 0) {
    explanation = await generateGroqExplanation(query, products);
  }

  return new Response(
    JSON.stringify({ results: products, query, explanation }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});

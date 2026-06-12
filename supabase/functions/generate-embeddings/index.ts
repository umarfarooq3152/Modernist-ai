/**
 * generate-embeddings — Supabase Edge Function
 *
 * Generates 384-dim embeddings for products using the built-in
 * Supabase AI `gte-small` model (free, no API key needed).
 *
 * Called by admin-api after product create/update.
 * Also callable manually to backfill all products.
 *
 * POST /generate-embeddings
 * Body: { product_ids?: string[] }   — omit to backfill ALL products
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

// Supabase AI Session — runs `gte-small` in the Edge Runtime, completely free
// @ts-ignore — Supabase provides this global in Edge Functions
const embeddingModel = new Supabase.ai.Session("gte-small");

async function requireAdmin(req: Request): Promise<string | Response> {
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return new Response("Unauthorized", { status: 401, headers: corsHeaders });
  const token = auth.slice(7);

  const anonClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
  const { data: { user }, error } = await anonClient.auth.getUser();
  if (error || !user) return new Response("Unauthorized", { status: 401, headers: corsHeaders });

  const { data: profile } = await serviceClient.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || profile.role !== "admin") return new Response("Forbidden", { status: 403, headers: corsHeaders });

  return user.id;
}

function buildProductText(product: any): string {
  const tags = Array.isArray(product.tags) ? product.tags.join(" ") : "";
  return `${product.name} ${product.category} ${product.description} ${tags}`.trim();
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const auth = await requireAdmin(req);
  if (auth instanceof Response) return auth;

  const { product_ids } = req.method === "POST" ? await req.json().catch(() => ({})) : {};

  // Fetch target products
  let query = serviceClient.from("products").select("id, name, category, description, tags");
  if (Array.isArray(product_ids) && product_ids.length > 0) {
    query = query.in("id", product_ids);
  } else {
    // Backfill only products without an embedding
    query = query.is("embedding", null);
  }
  const { data: products, error } = await query;
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
  }
  if (!products || products.length === 0) {
    return new Response(JSON.stringify({ message: "No products to embed", count: 0 }), { headers: corsHeaders });
  }

  let success = 0;
  const errors: string[] = [];

  for (const product of products) {
    try {
      const text = buildProductText(product);
      // gte-small produces a 384-dim Float32Array
      const embedding: number[] = await embeddingModel.run(text, { mean_pool: true, normalize: true });

      const { error: updateErr } = await serviceClient
        .from("products")
        .update({ embedding })
        .eq("id", product.id);

      if (updateErr) throw updateErr;
      success++;
    } catch (err: any) {
      console.error(`Failed to embed product ${product.id}:`, err.message);
      errors.push(`${product.id}: ${err.message}`);
    }
  }

  return new Response(
    JSON.stringify({ message: `Embedded ${success}/${products.length} products`, success, errors }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});

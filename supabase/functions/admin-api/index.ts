import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
};

// Service-role client — bypasses RLS, used only after admin verification
const serviceClient = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

// ─────────────────────────────────────────────────────────
// Auth guard: verify JWT and confirm admin role
// ─────────────────────────────────────────────────────────
async function requireAdmin(req: Request): Promise<{ userId: string } | Response> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json({ error: "Unauthorized" }, 401);
  }

  const token = authHeader.slice(7);

  // Verify the JWT by passing it directly — more reliable in Deno than global headers
  const { data: { user }, error } = await serviceClient.auth.getUser(token);

  if (error || !user) return json({ error: "Unauthorized" }, 401);

  const { data: profile } = await serviceClient
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "admin") {
    return json({ error: "Forbidden — admin role required" }, 403);
  }

  return { userId: user.id };
}

// ─────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function parsePagination(url: URL): { from: number; to: number; page: number; pageSize: number } {
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1"));
  const pageSize = Math.min(100, Math.max(1, parseInt(url.searchParams.get("pageSize") || "20")));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  return { from, to, page, pageSize };
}

// ─────────────────────────────────────────────────────────
// Route handlers
// ─────────────────────────────────────────────────────────

async function handleStats(): Promise<Response> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayIso = todayStart.toISOString();

  const [
    { count: totalProducts },
    { count: totalOrders },
    { count: totalReviews },
    { count: totalNegotiations },
    { data: revenueData },
    { data: recentOrders },
    { data: categoryData },
    { count: visitorsToday },
    { count: productViewsToday },
  ] = await Promise.all([
    serviceClient.from("products").select("*", { count: "exact", head: true }),
    serviceClient.from("checkouts").select("*", { count: "exact", head: true }),
    serviceClient.from("reviews").select("*", { count: "exact", head: true }),
    serviceClient.from("clerk_logs").select("*", { count: "exact", head: true }),
    // Revenue by day (last 7 days)
    serviceClient
      .from("checkouts")
      .select("created_at, total_amount, status")
      .eq("status", "completed")
      .gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
      .order("created_at"),
    // Recent 5 orders (no FK join — profiles is auth.users mirror, fetch separately)
    serviceClient
      .from("checkouts")
      .select("id, created_at, total_amount, status, user_id")
      .order("created_at", { ascending: false })
      .limit(5),
    // Products by category
    serviceClient
      .from("products")
      .select("category"),
    // Unique visitor sessions today
    serviceClient
      .from("page_views")
      .select("session_id", { count: "exact", head: true })
      .gte("created_at", todayIso),
    // Product page views today (only views with a product_id)
    serviceClient
      .from("page_views")
      .select("*", { count: "exact", head: true })
      .not("product_id", "is", null)
      .gte("created_at", todayIso),
  ]);

  // Aggregate revenue by day
  const revenueByDay: Record<string, number> = {};
  (revenueData || []).forEach((row: any) => {
    const day = new Date(row.created_at).toLocaleDateString("en-US", { weekday: "short" });
    revenueByDay[day] = (revenueByDay[day] || 0) + parseFloat(row.total_amount || "0");
  });

  const revenueChart = Object.entries(revenueByDay).map(([name, revenue]) => ({ name, revenue }));

  // Aggregate by category
  const categoryCounts: Record<string, number> = {};
  (categoryData || []).forEach((row: any) => {
    categoryCounts[row.category] = (categoryCounts[row.category] || 0) + 1;
  });
  const categoryChart = Object.entries(categoryCounts).map(([name, value]) => ({ name, value }));

  // Total revenue
  const { data: totalRevenueData } = await serviceClient
    .from("checkouts")
    .select("total_amount")
    .eq("status", "completed");

  const totalRevenue = (totalRevenueData || []).reduce(
    (sum: number, row: any) => sum + parseFloat(row.total_amount || "0"),
    0
  );

  // Accepted negotiations
  const { count: acceptedNegotiations } = await serviceClient
    .from("clerk_logs")
    .select("*", { count: "exact", head: true })
    .eq("status", "accepted");

  // Manual profile join for recent orders (no FK in schema cache)
  const recentOrdersRaw = recentOrders || [];
  const recentUserIds = [...new Set(recentOrdersRaw.filter((o: any) => o.user_id).map((o: any) => o.user_id as string))];
  const profileMap: Record<string, any> = {};
  if (recentUserIds.length > 0) {
    const { data: profileRows } = await serviceClient
      .from("profiles")
      .select("id, first_name, last_name, email")
      .in("id", recentUserIds);
    (profileRows || []).forEach((p: any) => { profileMap[p.id] = p; });
  }

  return json({
    totalProducts: totalProducts || 0,
    totalOrders: totalOrders || 0,
    totalReviews: totalReviews || 0,
    totalNegotiations: totalNegotiations || 0,
    totalRevenue,
    acceptedNegotiations: acceptedNegotiations || 0,
    visitorsToday: visitorsToday || 0,
    productViewsToday: productViewsToday || 0,
    revenueChart,
    categoryChart,
    recentOrders: recentOrdersRaw.map((o: any) => {
      const p = profileMap[o.user_id];
      return {
        id: o.id,
        createdAt: o.created_at,
        totalAmount: parseFloat(o.total_amount || "0"),
        status: o.status,
        customerName: p
          ? `${p.first_name || ""} ${p.last_name || ""}`.trim() || p.email || "Guest"
          : "Guest",
      };
    }),
  });
}

async function handleGetProducts(url: URL): Promise<Response> {
  const { from, to } = parsePagination(url);
  const search = url.searchParams.get("search") || "";
  const category = url.searchParams.get("category") || "";
  const sort = url.searchParams.get("sort") || "created_at";
  const order = url.searchParams.get("order") === "asc";

  let query = serviceClient
    .from("products")
    .select("*", { count: "exact" })
    .order(sort, { ascending: order })
    .range(from, to);

  if (search) query = query.ilike("name", `%${search}%`);
  if (category) query = query.eq("category", category);

  const { data, error, count } = await query;
  if (error) return json({ error: error.message }, 500);
  return json({ data, count, from, to });
}

async function triggerEmbedding(productId: string, authHeader: string) {
  try {
    await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/generate-embeddings`, {
      method: "POST",
      headers: { Authorization: authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({ product_ids: [productId] }),
    });
  } catch (e: any) {
    console.warn("Embedding trigger failed (non-fatal):", e.message);
  }
}

async function handleCreateProduct(req: Request): Promise<Response> {
  const body = await req.json();
  const { name, description, price, bottom_price, category, image_url, tags, variants, stock_quantity, low_stock_threshold } = body;

  if (!name || price == null) return json({ error: "name and price are required" }, 400);

  const { data, error } = await serviceClient
    .from("products")
    .insert({
      name, description, price,
      bottom_price: bottom_price ?? price * 0.7,
      category, image_url,
      tags: tags || [],
      variants: variants || { sizes: [], colors: [] },
      ...(stock_quantity != null && { stock_quantity }),
      ...(low_stock_threshold != null && { low_stock_threshold }),
    })
    .select()
    .single();

  if (error) return json({ error: error.message }, 500);

  // Fire-and-forget embedding generation
  triggerEmbedding(data.id, req.headers.get("Authorization") || "");

  return json({ data }, 201);
}

async function handleUpdateProduct(productId: string, req: Request): Promise<Response> {
  const body = await req.json();
  const allowed = ["name", "description", "price", "bottom_price", "category", "image_url", "tags", "variants", "stock_quantity", "low_stock_threshold"];
  const updates = Object.fromEntries(Object.entries(body).filter(([k]) => allowed.includes(k)));

  const { data, error } = await serviceClient
    .from("products")
    .update(updates)
    .eq("id", productId)
    .select()
    .single();

  if (error) return json({ error: error.message }, 500);

  // Re-embed if text fields changed
  const textFields = ["name", "description", "category", "tags"];
  if (Object.keys(updates).some(k => textFields.includes(k))) {
    triggerEmbedding(productId, req.headers.get("Authorization") || "");
  }

  return json({ data });
}

async function handleDeleteProduct(productId: string): Promise<Response> {
  const { error } = await serviceClient.from("products").delete().eq("id", productId);
  if (error) return json({ error: error.message }, 500);
  return json({ success: true });
}

async function handleGetReviews(url: URL): Promise<Response> {
  const { from, to } = parsePagination(url);
  const productId = url.searchParams.get("productId") || "";
  const minRating = parseInt(url.searchParams.get("minRating") || "1");
  const maxRating = parseInt(url.searchParams.get("maxRating") || "5");
  const sort = url.searchParams.get("sort") || "date";

  let query = serviceClient
    .from("reviews")
    .select(`
      *,
      products (id, name, image_url, category)
    `, { count: "exact" })
    .gte("rating", minRating)
    .lte("rating", maxRating)
    .order(sort, { ascending: false })
    .range(from, to);

  if (productId) query = query.eq("product_id", productId);

  const { data, error, count } = await query;
  if (error) return json({ error: error.message }, 500);
  return json({ data, count });
}

async function handleDeleteReview(reviewId: string): Promise<Response> {
  const { error } = await serviceClient.from("reviews").delete().eq("id", reviewId);
  if (error) return json({ error: error.message }, 500);
  return json({ success: true });
}

async function handleGetOrders(url: URL): Promise<Response> {
  const { from, to } = parsePagination(url);
  const status = url.searchParams.get("status") || "";
  const search = url.searchParams.get("search") || "";

  let query = serviceClient
    .from("checkouts")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (status) query = query.eq("status", status);
  if (search) query = query.ilike("id", `%${search}%`);

  const { data: orders, error, count } = await query;
  if (error) return json({ error: error.message }, 500);

  const orderIds = (orders || []).map((o: any) => o.id as string);

  // Manual checkout_items join — no FK in PostgREST schema cache
  // checkout_items uses order_id (TEXT) as the FK back to checkouts.id
  const itemsMap: Record<string, any[]> = {};
  if (orderIds.length > 0) {
    const { data: itemRows } = await serviceClient
      .from("checkout_items")
      .select("*")
      .in("order_id", orderIds);
    (itemRows || []).forEach((item: any) => {
      if (!itemsMap[item.order_id]) itemsMap[item.order_id] = [];
      itemsMap[item.order_id].push(item);
    });
  }

  // Manual profile join — no FK in PostgREST schema cache
  const userIds = [...new Set((orders || []).filter((o: any) => o.user_id).map((o: any) => o.user_id as string))];
  const profileMap: Record<string, any> = {};
  if (userIds.length > 0) {
    const { data: profileRows } = await serviceClient
      .from("profiles")
      .select("id, first_name, last_name, email")
      .in("id", userIds);
    (profileRows || []).forEach((p: any) => { profileMap[p.id] = p; });
  }

  const data = (orders || []).map((o: any) => ({
    ...o,
    checkout_items: itemsMap[o.id] || [],
    profiles: profileMap[o.user_id] || null,
  }));
  return json({ data, count });
}

async function handleUpdateOrderStatus(orderId: string, req: Request): Promise<Response> {
  const { status } = await req.json();
  const allowed = ["pending", "completed", "payment_failed", "refunded", "cancelled"];
  if (!allowed.includes(status)) return json({ error: "Invalid status" }, 400);

  const { data, error } = await serviceClient
    .from("checkouts")
    .update({ status })
    .eq("id", orderId)
    .select()
    .single();

  if (error) return json({ error: error.message }, 500);
  return json({ data });
}

async function handleGetNegotiations(url: URL): Promise<Response> {
  const { from, to } = parsePagination(url);
  const status = url.searchParams.get("status") || "";

  // Only show actual negotiation/AI interactions — exclude trivial local navigation events
  // (greetings, searches, add_to_cart, filter, sort, etc. logged with [local:*] and no discount)
  let query = serviceClient
    .from("clerk_logs")
    .select("*", { count: "exact" })
    .or("discount_offered.gt.0,negotiation_successful.eq.true,clerk_sentiment.neq.neutral")
    .not("clerk_response", "like", "[local:greeting]")
    .not("clerk_response", "like", "[local:farewell]")
    .not("clerk_response", "like", "[local:help]")
    .not("clerk_response", "like", "[local:search]")
    .not("clerk_response", "like", "[local:search_loading]")
    .not("clerk_response", "like", "[local:search_no_inventory]")
    .not("clerk_response", "like", "[local:filter_category]")
    .not("clerk_response", "like", "[local:show_all]")
    .not("clerk_response", "like", "[local:show_cheapest]")
    .not("clerk_response", "like", "[local:show_expensive]")
    .not("clerk_response", "like", "[local:sort_asc]")
    .not("clerk_response", "like", "[local:sort_desc]")
    .not("clerk_response", "like", "[local:add_to_cart]")
    .not("clerk_response", "like", "[local:add_all]")
    .not("clerk_response", "like", "[local:remove_from_cart]")
    .not("clerk_response", "like", "[local:show_cart]")
    .not("clerk_response", "like", "[local:recommend]")
    .not("clerk_response", "like", "[local:inventory_check]")
    .not("clerk_response", "like", "[local:show_category_for_add]")
    .not("clerk_response", "like", "[local:add_clarification_needed]")
    .not("clerk_response", "like", "[local:nsfw_deflect]")
    .order("created_at", { ascending: false })
    .range(from, to);

  if (status) query = query.eq("status", status);

  const { data, error, count } = await query;
  if (error) return json({ error: error.message }, 500);
  return json({ data, count });
}

// ─────────────────────────────────────────────────────────
// Coupons
// ─────────────────────────────────────────────────────────

async function handleGetCoupons(): Promise<Response> {
  const { data, error } = await serviceClient
    .from("coupons")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return json({ data });
}

async function handleCreateCoupon(req: Request): Promise<Response> {
  const { code, discount_percent, max_uses, expires_at } = await req.json();
  if (!code || discount_percent == null) return json({ error: "code and discount_percent are required" }, 400);
  const { data, error } = await serviceClient
    .from("coupons")
    .insert({ code: String(code).toUpperCase().trim(), discount_percent, max_uses: max_uses || null, expires_at: expires_at || null })
    .select()
    .single();
  if (error) return json({ error: error.message }, 500);
  return json({ data }, 201);
}

async function handleUpdateCoupon(id: string, req: Request): Promise<Response> {
  const body = await req.json();
  const allowed = ["code", "discount_percent", "max_uses", "expires_at", "is_active"];
  const updates = Object.fromEntries(Object.entries(body).filter(([k]) => allowed.includes(k)));
  const { data, error } = await serviceClient
    .from("coupons")
    .update(updates)
    .eq("id", id)
    .select()
    .single();
  if (error) return json({ error: error.message }, 500);
  return json({ data });
}

async function handleDeleteCoupon(id: string): Promise<Response> {
  const { error } = await serviceClient.from("coupons").delete().eq("id", id);
  if (error) return json({ error: error.message }, 500);
  return json({ success: true });
}

// ─────────────────────────────────────────────────────────
// Customers / Patrons
// ─────────────────────────────────────────────────────────

async function handleGetCustomers(url: URL): Promise<Response> {
  const { from, to, pageSize } = parsePagination(url);
  const search = url.searchParams.get("search") || "";

  let query = serviceClient
    .from("profiles")
    .select("id, email, first_name, last_name, created_at", { count: "exact" })
    .range(from, to)
    .order("created_at", { ascending: false });

  if (search) {
    query = query.or(`email.ilike.%${search}%,first_name.ilike.%${search}%,last_name.ilike.%${search}%`);
  }

  const { data: profiles, error, count } = await query;
  if (error) throw error;
  if (!profiles || profiles.length === 0) return json({ data: [], count: 0 });

  const profileIds = profiles.map((p: any) => p.id);
  const { data: orders } = await serviceClient
    .from("checkouts")
    .select("user_id, total_amount")
    .in("user_id", profileIds)
    .eq("status", "completed");

  const statsMap = new Map<string, { count: number; total: number }>();
  (orders || []).forEach((o: any) => {
    const s = statsMap.get(o.user_id) || { count: 0, total: 0 };
    s.count++;
    s.total += parseFloat(o.total_amount || "0");
    statsMap.set(o.user_id, s);
  });

  const data = profiles.map((p: any) => ({
    ...p,
    order_count: statsMap.get(p.id)?.count ?? 0,
    total_spend: statsMap.get(p.id)?.total ?? 0,
  }));

  return json({ data, count });
}

async function handleBackfillEmbeddings(req: Request): Promise<Response> {
  const { data: products, error } = await serviceClient
    .from("products")
    .select("id")
    .is("embedding", null);

  if (error) return json({ error: error.message }, 500);
  if (!products || products.length === 0) return json({ queued: 0, message: "All products already have embeddings." });

  const productIds = products.map((p: { id: string }) => p.id);

  // Forward to generate-embeddings using the caller's admin token
  void fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/generate-embeddings`, {
    method: "POST",
    headers: { Authorization: req.headers.get("Authorization") || "", "Content-Type": "application/json" },
    body: JSON.stringify({ product_ids: productIds }),
  }).catch((e: any) => console.warn("backfill trigger failed:", e.message));

  return json({ queued: productIds.length, message: `Embedding ${productIds.length} product(s) in the background.` });
}

// ─────────────────────────────────────────────────────────
// Router
// ─────────────────────────────────────────────────────────
serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const auth = await requireAdmin(req);
  if (auth instanceof Response) return auth;

  const url = new URL(req.url);
  // Path: /admin-api/<resource>[/<id>]
  const parts = url.pathname.replace(/^\/admin-api\/?/, "").split("/").filter(Boolean);
  const [resource, id] = parts;
  const method = req.method;

  try {
    if (resource === "stats" && method === "GET") return await handleStats();

    if (resource === "products") {
      if (method === "GET" && !id) return await handleGetProducts(url);
      if (method === "POST") return await handleCreateProduct(req);
      if (method === "PATCH" && id) return await handleUpdateProduct(id, req);
      if (method === "DELETE" && id) return await handleDeleteProduct(id);
    }

    if (resource === "reviews") {
      if (method === "GET") return await handleGetReviews(url);
      if (method === "DELETE" && id) return await handleDeleteReview(id);
    }

    if (resource === "orders") {
      if (method === "GET") return await handleGetOrders(url);
      if (method === "PATCH" && id) return await handleUpdateOrderStatus(id, req);
    }

    if (resource === "negotiations" && method === "GET") {
      return await handleGetNegotiations(url);
    }

    if (resource === "coupons") {
      if (method === "GET" && !id) return await handleGetCoupons();
      if (method === "POST") return await handleCreateCoupon(req);
      if (method === "PATCH" && id) return await handleUpdateCoupon(id, req);
      if (method === "DELETE" && id) return await handleDeleteCoupon(id);
    }

    if (resource === "customers" && method === "GET") {
      return await handleGetCustomers(url);
    }

    if (resource === "backfill-embeddings" && method === "POST") {
      return await handleBackfillEmbeddings(req);
    }

    return json({ error: `Unknown route: ${method} /${resource}` }, 404);
  } catch (err: any) {
    console.error(`[admin-api] ${method} /${resource}:`, err.message);
    return json({ error: "Internal server error", detail: err.message }, 500);
  }
});

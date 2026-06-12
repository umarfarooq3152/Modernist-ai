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

  // Verify the JWT via Supabase auth
  const anonClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
  const { data: { user }, error } = await anonClient.auth.getUser();

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
  const [
    { count: totalProducts },
    { count: totalOrders },
    { count: totalReviews },
    { count: totalNegotiations },
    { data: revenueData },
    { data: recentOrders },
    { data: categoryData },
  ] = await Promise.all([
    serviceClient.from("products").select("*", { count: "exact", head: true }),
    serviceClient.from("checkouts").select("*", { count: "exact", head: true }),
    serviceClient.from("reviews").select("*", { count: "exact", head: true }),
    serviceClient.from("clerk_logs").select("*", { count: "exact", head: true }),
    // Revenue by day (last 7 days)
    serviceClient.rpc("admin_revenue_by_day").maybeSingle().then(() =>
      serviceClient
        .from("checkouts")
        .select("created_at, total_amount, status")
        .eq("status", "completed")
        .gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
        .order("created_at")
    ),
    // Recent 5 orders
    serviceClient
      .from("checkouts")
      .select("id, created_at, total_amount, status, user_id, profiles(first_name, last_name, email)")
      .order("created_at", { ascending: false })
      .limit(5),
    // Products by category
    serviceClient
      .from("products")
      .select("category"),
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

  return json({
    totalProducts: totalProducts || 0,
    totalOrders: totalOrders || 0,
    totalReviews: totalReviews || 0,
    totalNegotiations: totalNegotiations || 0,
    totalRevenue,
    acceptedNegotiations: acceptedNegotiations || 0,
    revenueChart,
    categoryChart,
    recentOrders: (recentOrders || []).map((o: any) => ({
      id: o.id,
      createdAt: o.created_at,
      totalAmount: parseFloat(o.total_amount || "0"),
      status: o.status,
      customerName: o.profiles
        ? `${o.profiles.first_name || ""} ${o.profiles.last_name || ""}`.trim() || o.profiles.email
        : "Guest",
    })),
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
  const { name, description, price, bottom_price, category, image_url, tags } = body;

  if (!name || price == null) return json({ error: "name and price are required" }, 400);

  const { data, error } = await serviceClient
    .from("products")
    .insert({ name, description, price, bottom_price: bottom_price ?? price * 0.7, category, image_url, tags: tags || [] })
    .select()
    .single();

  if (error) return json({ error: error.message }, 500);

  // Fire-and-forget embedding generation
  triggerEmbedding(data.id, req.headers.get("Authorization") || "");

  return json({ data }, 201);
}

async function handleUpdateProduct(productId: string, req: Request): Promise<Response> {
  const body = await req.json();
  const allowed = ["name", "description", "price", "bottom_price", "category", "image_url", "tags"];
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
    .select(`
      *,
      profiles (id, first_name, last_name, email),
      checkout_items (*)
    `, { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (status) query = query.eq("status", status);
  if (search) query = query.ilike("id", `%${search}%`);

  const { data, error, count } = await query;
  if (error) return json({ error: error.message }, 500);
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

async function handleAdjustStock(productId: string, req: Request): Promise<Response> {
  const { delta, reason } = await req.json();
  if (typeof delta !== "number" || delta === 0) return json({ error: "delta must be a non-zero integer" }, 400);
  const allowedReasons = ["manual_adjustment", "restock", "write_off"];
  if (!allowedReasons.includes(reason)) return json({ error: `reason must be one of: ${allowedReasons.join(", ")}` }, 400);

  // Fetch current stock
  const { data: product, error: fetchErr } = await serviceClient
    .from("products").select("id, name, stock_quantity").eq("id", productId).single();
  if (fetchErr || !product) return json({ error: "Product not found" }, 404);

  const newStock = Math.max(0, (product.stock_quantity ?? 100) + delta);

  const [updateRes, logRes] = await Promise.all([
    serviceClient.from("products").update({ stock_quantity: newStock }).eq("id", productId).select("id, name, stock_quantity").single(),
    serviceClient.from("inventory_logs").insert({ product_id: productId, delta, reason }),
  ]);

  if (updateRes.error) return json({ error: updateRes.error.message }, 500);
  return json({ data: updateRes.data });
}

async function handleGetInventoryReport(): Promise<Response> {
  const { data: products, error } = await serviceClient
    .from("products")
    .select("id, name, category, price, stock_quantity, low_stock_threshold")
    .order("stock_quantity", { ascending: true });

  if (error) return json({ error: error.message }, 500);

  const report = (products || []).map((p: any) => ({
    id: p.id,
    name: p.name,
    category: p.category,
    price: p.price,
    stock_quantity: p.stock_quantity ?? 100,
    low_stock_threshold: p.low_stock_threshold ?? 10,
    status: (p.stock_quantity ?? 100) === 0 ? "out_of_stock"
      : (p.stock_quantity ?? 100) <= (p.low_stock_threshold ?? 10) ? "low_stock"
      : "healthy",
  }));

  const summary = {
    total: report.length,
    out_of_stock: report.filter((p: any) => p.status === "out_of_stock").length,
    low_stock: report.filter((p: any) => p.status === "low_stock").length,
    healthy: report.filter((p: any) => p.status === "healthy").length,
  };

  return json({ data: report, summary });
}

async function handleGetTopProducts(): Promise<Response> {
  // Aggregate units sold and revenue from checkout_items joined to completed checkouts
  const { data, error } = await serviceClient
    .from("checkout_items")
    .select(`
      product_id, product_name, product_price, quantity,
      checkouts!inner(status)
    `)
    .eq("checkouts.status", "completed");

  if (error) return json({ error: error.message }, 500);

  const agg: Record<string, { name: string; units: number; revenue: number }> = {};
  for (const row of data || []) {
    if (!agg[row.product_id]) agg[row.product_id] = { name: row.product_name, units: 0, revenue: 0 };
    agg[row.product_id].units += row.quantity;
    agg[row.product_id].revenue += row.product_price * row.quantity;
  }

  const topProducts = Object.entries(agg)
    .map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 20);

  return json({ data: topProducts });
}

async function handleGetNegotiations(url: URL): Promise<Response> {
  const { from, to } = parsePagination(url);
  const status = url.searchParams.get("status") || "";

  let query = serviceClient
    .from("clerk_logs")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (status) query = query.eq("status", status);

  const { data, error, count } = await query;
  if (error) return json({ error: error.message }, 500);
  return json({ data, count });
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

    if (resource === "inventory") {
      if (method === "GET" && !id) return await handleGetInventoryReport();
      if (method === "PATCH" && id) return await handleAdjustStock(id, req);
    }

    if (resource === "reports" && id === "top-products" && method === "GET") {
      return await handleGetTopProducts();
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

    return json({ error: `Unknown route: ${method} /${resource}` }, 404);
  } catch (err: any) {
    console.error(`[admin-api] ${method} /${resource}:`, err.message);
    return json({ error: "Internal server error", detail: err.message }, 500);
  }
});

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

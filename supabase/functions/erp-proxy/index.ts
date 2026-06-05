import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ERP_BASE_URL = Deno.env.get("ERP_BASE_URL") || "http://erp.visionplusapps.com:5678/webhook";
const ERP_CREDENTIALS = Deno.env.get("ERP_CREDENTIALS") || "";

function getAuthHeader(): string {
  return `Basic ${btoa(ERP_CREDENTIALS)}`;
}

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

async function requireAdmin(req: Request): Promise<{ error: Response | null }> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return { error: new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders }) };
  }

  const token = authHeader.replace("Bearer ", "");
  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user) {
    return { error: new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders }) };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "admin") {
    return { error: new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: corsHeaders }) };
  }

  return { error: null };
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const { error: authError } = await requireAdmin(req);
  if (authError) return authError;

  const url = new URL(req.url);
  const action = url.searchParams.get("action");

  try {
    if (action === "search") {
      const { query } = await req.json();
      const res = await fetch(`${ERP_BASE_URL}/search`, {
        method: "POST",
        headers: { Authorization: getAuthHeader(), "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      const data = await res.json();
      return new Response(JSON.stringify(Array.isArray(data) ? data : []), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "products") {
      const res = await fetch(`${ERP_BASE_URL}/products`, {
        headers: { Authorization: getAuthHeader() },
      });
      const data = await res.json();
      return new Response(JSON.stringify(Array.isArray(data) ? data : []), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "create" && req.method === "POST") {
      const product = await req.json();
      const res = await fetch(`${ERP_BASE_URL}/product`, {
        method: "POST",
        headers: { Authorization: getAuthHeader(), "Content-Type": "application/json" },
        body: JSON.stringify(product),
      });
      if (!res.ok) throw new Error(`ERP responded with ${res.status}`);
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});


import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.0.0?target=deno";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
    apiVersion: "2023-10-16",
});

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
    // Handle CORS preflight
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const {
            line_items,
            total_amount,
            discount_percent,
            coupon_code,
            customer_email,
            shipping_address,
            order_id,
            success_url,
            cancel_url,
        } = await req.json();

        // Build the line items for Stripe Checkout
        // We use total_amount as a single consolidated line item
        // so the price reflects AI-negotiated discounts accurately
        const stripeLineItems = [
            {
                price_data: {
                    currency: "usd",
                    product_data: {
                        name: "MODERNIST Archival Acquisition",
                        description: `${line_items.length} curated piece(s)${discount_percent > 0
                                ? ` • ${discount_percent}% Clerk Benefit Applied`
                                : ""
                            }${coupon_code ? ` • Code: ${coupon_code}` : ""}`,
                        images: line_items
                            .map((item: any) => item.image)
                            .filter(Boolean)
                            .slice(0, 8),
                    },
                    unit_amount: total_amount, // Already in cents from frontend
                },
                quantity: 1,
            },
        ];

        const sessionConfig: any = {
            payment_method_types: ["card"],
            line_items: stripeLineItems,
            mode: "payment",
            success_url: success_url,
            cancel_url: cancel_url,
            metadata: {
                order_id: order_id || "",
                discount_percent: String(discount_percent || 0),
                coupon_code: coupon_code || "",
                shipping_address: JSON.stringify(shipping_address || {}),
            },
        };

        // Pre-fill email if available
        if (customer_email) {
            sessionConfig.customer_email = customer_email;
        }

        const session = await stripe.checkout.sessions.create(sessionConfig);

        return new Response(
            JSON.stringify({ sessionId: session.id, url: session.url }),
            {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
                status: 200,
            }
        );
    } catch (error: any) {
        console.error("Stripe session creation failed:", error);
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 400,
        });
    }
});

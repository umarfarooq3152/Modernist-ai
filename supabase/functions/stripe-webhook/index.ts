
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.0.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
    apiVersion: "2023-10-16",
});

const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

serve(async (req: Request) => {
    const signature = req.headers.get("stripe-signature")!;
    const body = await req.text();

    try {
        const event = stripe.webhooks.constructEvent(
            body,
            signature,
            Deno.env.get("STRIPE_WEBHOOK_SECRET")!
        );

        if (event.type === "checkout.session.completed") {
            const session = event.data.object as Stripe.Checkout.Session;
            const orderId = session.metadata?.order_id;

            if (orderId) {
                await supabase
                    .from("checkouts")
                    .update({
                        status: "completed",
                        stripe_session_id: session.id,
                        stripe_payment_intent: session.payment_intent,
                    })
                    .eq("id", orderId);
            }
        }

        return new Response(JSON.stringify({ received: true }), { status: 200 });
    } catch (err: any) {
        console.error("Webhook error:", err.message);
        return new Response(`Webhook Error: ${err.message}`, { status: 400 });
    }
});

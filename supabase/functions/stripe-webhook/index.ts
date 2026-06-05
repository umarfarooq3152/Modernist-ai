
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.0.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2023-10-16",
});

// Service role key bypasses RLS — only used server-side in edge functions
const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

serve(async (req: Request) => {
  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return new Response("Missing stripe-signature header", { status: 400 });
  }

  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      Deno.env.get("STRIPE_WEBHOOK_SECRET")!
    );
  } catch (err: any) {
    console.error("Webhook signature verification failed:", err.message);
    return new Response(`Webhook Error: ${err.message}`, { status: 400 });
  }

  // Idempotency: skip if this event has already been processed
  const { data: existing } = await supabase
    .from("processed_webhook_events")
    .select("id")
    .eq("event_id", event.id)
    .maybeSingle();

  if (existing) {
    console.log(`Skipping duplicate event: ${event.id}`);
    return new Response(JSON.stringify({ received: true, duplicate: true }), { status: 200 });
  }

  try {
    await handleEvent(event);

    // Mark event as processed
    await supabase
      .from("processed_webhook_events")
      .insert({ event_id: event.id, type: event.type, processed_at: new Date().toISOString() });

    return new Response(JSON.stringify({ received: true }), { status: 200 });
  } catch (err: any) {
    console.error(`Error handling event ${event.type}:`, err.message);
    return new Response(`Handler Error: ${err.message}`, { status: 500 });
  }
});

async function handleEvent(event: Stripe.Event) {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const orderId = session.metadata?.order_id;
      if (orderId) {
        const { error } = await supabase
          .from("checkouts")
          .update({
            status: "completed",
            stripe_session_id: session.id,
            stripe_payment_intent: session.payment_intent as string,
          })
          .eq("id", orderId);
        if (error) throw error;
      }
      break;
    }

    case "payment_intent.payment_failed": {
      const intent = event.data.object as Stripe.PaymentIntent;
      const { error } = await supabase
        .from("checkouts")
        .update({ status: "payment_failed" })
        .eq("stripe_payment_intent", intent.id);
      if (error) throw error;
      break;
    }

    case "payment_intent.succeeded": {
      const intent = event.data.object as Stripe.PaymentIntent;
      const { error } = await supabase
        .from("checkouts")
        .update({ status: "completed", stripe_payment_intent: intent.id })
        .eq("stripe_payment_intent", intent.id);
      if (error) throw error;
      break;
    }

    case "charge.refunded": {
      const charge = event.data.object as Stripe.Charge;
      const { error } = await supabase
        .from("checkouts")
        .update({ status: "refunded" })
        .eq("stripe_payment_intent", charge.payment_intent as string);
      if (error) throw error;
      break;
    }

    default:
      console.log(`Unhandled event type: ${event.type}`);
  }
}

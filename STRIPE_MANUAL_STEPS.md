# 🏗️ MODERNIST — Stripe Integration: Manual Steps

> These are the steps **you** must perform manually to complete the Stripe checkout integration.
> All frontend code is already implemented and ready.

---

## 1. Create the Supabase Edge Function

The frontend calls a Supabase Edge Function named `stripe-checkout` to create Stripe Checkout sessions. You need to deploy this function to your Supabase project.

### 1.1 — Install Supabase CLI (if not installed)

```bash
npm install -g supabase
```

### 1.2 — Initialize Supabase in your project (if not done)

```bash
cd "d:\Personal Projects\GCU hackathon\Modernist-ai"
supabase init
```

### 1.3 — Create the Edge Function

```bash
supabase functions new stripe-checkout
```

### 1.4 — Replace the function code

Replace the contents of `supabase/functions/stripe-checkout/index.ts` with:

```typescript
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
            description: `${line_items.length} curated piece(s)${
              discount_percent > 0
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
```

---

## 2. Set the Stripe Secret Key

```bash
supabase secrets set STRIPE_SECRET_KEY=sk_test_51T0JatPgX2QsMZYBybYiSlUijzwksYWNlCEz7fZ5sxOw9zNMTCtre0Os5plg5BndP0EL8qiqRXTx130UQ4QmXRLX00ZAbkGJ3R
```

> ⚠️ **For production:** Replace with your live Stripe secret key (`sk_live_...`)

---

## 3. Deploy the Edge Function

```bash
supabase functions deploy stripe-checkout --no-verify-jwt
```

> The `--no-verify-jwt` flag allows guest (unauthenticated) users to checkout. Remove this flag if you want to require authentication.

---

## 4. (Optional) Set Up Stripe Webhook

To automatically update order status from `pending_payment` → `completed` when Stripe confirms payment:

1. Go to [Stripe Dashboard → Webhooks](https://dashboard.stripe.com/webhooks)
2. Click **"Add endpoint"**
3. Set the URL to: `https://nqtmajhemeafigwrbyay.supabase.co/functions/v1/stripe-webhook`
4. Select event: `checkout.session.completed`
5. Copy the webhook signing secret

Then create another Edge Function for the webhook:

```bash
supabase functions new stripe-webhook
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_your_signing_secret
```

Replace `supabase/functions/stripe-webhook/index.ts` with:

```typescript
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
```

Deploy it:

```bash
supabase functions deploy stripe-webhook --no-verify-jwt
```

---

## 5. (Optional) Add Stripe Columns to Supabase

Run this SQL in your Supabase SQL editor to add tracking columns:

```sql
ALTER TABLE checkouts
  ADD COLUMN IF NOT EXISTS stripe_session_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_payment_intent TEXT;
```

---

## 6. Test the Flow

1. Run `npm run dev` 
2. Add items to cart
3. Go to checkout, fill in shipping
4. Click **"Secure Checkout"** → redirects to Stripe
5. Use test card: `4242 4242 4242 4242` (any future date, any CVC)
6. After payment → redirects to Orders page with success banner

---

## Quick Reference

| Item | Value |
|------|-------|
| Stripe Public Key | `pk_test_51T0Jat...` (in `.env`) |
| Stripe Secret Key | Set via `supabase secrets set` |
| Edge Function | `stripe-checkout` |
| Webhook (optional) | `stripe-webhook` |
| Test Card | `4242 4242 4242 4242` |

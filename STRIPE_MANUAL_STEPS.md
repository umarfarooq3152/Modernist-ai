# 🏗️ MODERNIST — Stripe Integration: Quick Deployment

> ✅ **DONE:** I have already created the backend code files (`stripe-checkout`, `stripe-webhook`) and the SQL migration for you.
>
> **👉 YOUR REMAINING STEPS:** Just run these commands to deploy.

---

## 1. Login & Link Project

Open your terminal in `d:\Personal Projects\GCU hackathon\Modernist-ai`:

```bash
npx supabase login
npx supabase link --project-ref nqtmajhemeafigwrbyay
```
*(You may need the project password)*

---

## 2. Set Your Secrets

Set your **Stripe Secret Key** (found in Dashboard → Developers → API keys):

```bash
npx supabase secrets set STRIPE_SECRET_KEY=sk_test_51SfacSJlak9
5lnTfyHwAnbEFPBHjcceKMcibIgzRDvTTbKAV6zY0khTSDmlI6Kk7Jo3ammoaaIoZqHxPPooORjZl00CAjnrYsO
```

*(If using webhooks, also set `STRIPE_WEBHOOK_SECRET`)*

---

## 3. Deploy Functions

Deploy both functions with one command:

```bash
npx supabase functions deploy --no-verify-jwt
```

---

## 4. Run Migration (Optional)

If you haven't run the SQL migration yet:

```bash
npx supabase db push
```
*(Or copy `supabase/migrations/20240214_add_stripe_columns.sql` into your Supabase SQL Editor)*

---

## Test It! 🚀

1. Add items to cart.
2. Checkout.
3. Pay with `4242 4242 4242 4242`.
4. See success screen.

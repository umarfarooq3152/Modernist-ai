# MODERNIST

A luxury fine jewellery e-commerce platform with an AI bargaining agent — "The Clerk" — that negotiates discounts with customers in real time using tool-calling and a price-floor enforcement contract.

**Live:** [modernist-ai.vercel.app](https://modernist-ai.vercel.app)

---

## Features

### Storefront
- Curated product catalogue with category filtering, vibe-based curation, and price sorting
- Product variants — size and colour selectors on product detail and quick-view modal
- Stock enforcement — sold-out badges and disabled CTAs client-side; atomic server-side decrement via a `SECURITY DEFINER` SQL function triggered by Stripe webhooks
- Low-stock warnings — "X left" chip on cards, amber banner on detail pages
- Quick-view modal with variant selection without leaving the catalogue
- Wishlist with persistent storage per user
- Customer reviews — submit, edit, and delete; star ratings aggregated on product cards

### AI Clerk
- Groq (Llama 3) + Gemini-powered chat agent with a structured negotiation protocol
- Tool-calling contract: the AI _must_ invoke `apply_discount` to grant a price reduction — it cannot bypass with free-text
- Price floor enforcement enforced in code; the model cannot go below `bottom_price`
- RAG-based semantic product search using HuggingFace Transformers (local embeddings, no external search API)
- Negotiation kill switch in the admin panel

### Checkout & Payments
- Stripe Checkout with idempotent webhook processing (`processed_webhook_events` table prevents double-processing on retries)
- Coupon codes — AI-generated and admin-created codes with usage caps and expiry
- Stock decremented atomically after confirmed payment (floors at 0, skips `NULL`-stock unlimited products)

### Auth & Profiles
- Supabase Auth — email/password and Google OAuth
- Password recovery with token-based flow that does not log the user in until explicitly confirmed
- Avatar upload to Supabase Storage with file type and size validation
- Saved address fields

### Admin Panel
- Inventory management — create, edit, delete products; upload images; manage variants
- Order dashboard with Recharts revenue and channel sales charts
- Negotiation tracker — view and resolve live/past AI negotiations
- Coupon management — create codes with discount %, max uses, and expiry dates
- Customer directory — all patrons with order counts and total spend
- Review moderation
- Vector sandbox for testing RAG search

### Technical
- Route-level code splitting with `React.lazy` — initial JS bundle ≈ 445 kB (gzip ≈ 145 kB)
- Vendor chunks split: `framer-motion`, `groq-sdk`, `@supabase/supabase-js`, `react` + `react-router-dom`
- `AIChatAgent` deferred until first render — keeps it off the critical path
- `React.memo` on `ProductCard` — prevents re-renders across the product grid
- Dark/light theme with system preference detection
- Smooth scroll via Lenis, hero animations via Framer Motion and GSAP

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite |
| Styling | Tailwind CSS, Framer Motion, GSAP |
| UI Primitives | Radix UI, shadcn/ui |
| Auth | Supabase Auth (email + Google OAuth) |
| Database | Supabase (PostgreSQL) with Row-Level Security |
| Storage | Supabase Storage (avatars, product images) |
| Payments | Stripe Checkout + Deno Edge Function webhook |
| AI | Groq (Llama 3), Gemini API, HuggingFace Transformers (local) |
| Vector Search | pgvector + Supabase Edge Function (`rag-search`) |
| ERP Bridge | n8n webhook proxied via Edge Function (`erp-proxy`) |
| Admin Charts | Recharts |
| Hosting | Vercel |

---

## Architecture

```
Browser (React SPA)
  │
  ├── anon key + JWT ──────────────► Supabase DB (PostgreSQL + RLS)
  ├── email / OAuth ───────────────► Supabase Auth
  ├── invoke ──────────────────────► Edge Fn: stripe-checkout ──► Stripe
  ├── invoke ──────────────────────► Edge Fn: erp-proxy ─────────► n8n ERP
  ├── invoke ──────────────────────► Edge Fn: rag-search
  └── API keys via env ─────────────► Groq / Gemini APIs

Stripe ──► signed webhook ──────────► Edge Fn: stripe-webhook
                                          │
                                          ├── update checkouts
                                          └── decrement_stock() ──► Supabase DB
```

### Edge Functions

| Function | Purpose |
|---|---|
| `stripe-checkout` | Creates Stripe Checkout sessions; stores order + line items |
| `stripe-webhook` | Verifies Stripe signatures; marks orders complete; decrements stock |
| `rag-search` | Runs pgvector similarity search against product embeddings |
| `erp-proxy` | Forwards stock/order events to n8n with Basic Auth |
| `admin-api` | CRUD for products, coupons, customers — service-role only |
| `generate-embeddings` | Bulk-generates product embeddings and stores in pgvector |

---

## Setup / Installation

### Prerequisites
- Node.js 18+
- [Supabase CLI](https://supabase.com/docs/guides/cli)
- A Supabase project
- A Stripe account

### 1. Clone and install

```bash
git clone https://github.com/umarfarooq3152/Modernist-ai.git
cd Modernist-ai
npm install
```

### 2. Environment variables

```bash
cp .env.example .env
```

| Variable | Where to get it |
|---|---|
| `VITE_SUPABASE_URL` | Supabase Dashboard → Project Settings → API |
| `VITE_SUPABASE_ANON_KEY` | Supabase Dashboard → Project Settings → API |
| `VITE_STRIPE_PUBLIC_KEY` | Stripe Dashboard → Developers → API Keys (publishable key) |
| `VITE_GEMINI_API_KEY` | [Google AI Studio](https://aistudio.google.com) |
| `VITE_GROQ_API_KEY` | [Groq Console](https://console.groq.com) |
| `VITE_EMAILJS_*` | [EmailJS](https://emailjs.com) — optional, for contact forms |

### 3. Supabase Edge Function secrets

```bash
supabase secrets set STRIPE_SECRET_KEY=sk_live_...
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
supabase secrets set ERP_CREDENTIALS=admin:yourpassword
supabase secrets set ERP_BASE_URL=https://your-n8n-host/webhook
```

### 4. Database migrations

Run in order via Supabase Dashboard → SQL Editor, or `supabase db push`:

```
supabase/migrations/20240214_add_stripe_columns.sql
supabase/migrations/20240214_fix_rls_deadlock.sql
supabase/migrations/20260605_admin_backend.sql
supabase/migrations/20260605_checkout_status_values.sql
supabase/migrations/20260605_enforce_rls.sql
supabase/migrations/20260605_pgvector.sql
supabase/migrations/20260605_webhook_idempotency.sql
supabase/migrations/20260613_variants.sql
supabase/migrations/20260613_coupons.sql
```

---

## Usage

Start the dev server:

```bash
npm run dev   # http://localhost:3000
```

Browse the catalogue, add items to cart, and try the AI Clerk chat widget to negotiate a discount — it will only apply one through the `apply_discount` tool call, never by just agreeing in text. Sign in via Supabase Auth (email/password or Google) to check out, leave reviews, and save a wishlist. Visit `/admin` (an admin account is required) for inventory, orders, negotiation tracking, and coupons.

For local Stripe webhook testing:

```bash
stripe listen --forward-to http://localhost:54321/functions/v1/stripe-webhook
```

Copy the webhook signing secret printed by the CLI and set it as `STRIPE_WEBHOOK_SECRET` in your local Edge Function environment.

Other scripts: `npm run build` (production build), `npm run preview` (preview the build).

---

## Project Structure

```
├── App.tsx                  # Root layout, route definitions, global modals
├── index.tsx                # Entry point
├── types.ts                 # Shared TypeScript types (Product, CartItem, Order…)
├── pages/
│   ├── Admin.tsx            # Admin panel (inventory, orders, negotiations, coupons, customers)
│   ├── Checkout.tsx         # Stripe checkout flow
│   ├── OrderHistory.tsx     # Order history per user
│   ├── PasswordReset.tsx    # Token-based password reset
│   ├── ProductDetail.tsx    # PDP with variant selection, reviews, synergy pair
│   ├── Profile.tsx          # User profile and address management
│   ├── Search.tsx           # Full-text + semantic search results
│   └── Wishlist.tsx         # Saved products
├── components/
│   ├── AIChatAgent.tsx      # The Clerk — negotiation UI and Groq/Gemini integration
│   ├── AuthModal.tsx        # Login / register / forgot-password modal
│   ├── CartSidebar.tsx      # Slide-out cart with line items and checkout CTA
│   ├── HeroSection.tsx      # Animated landing hero
│   ├── Navbar.tsx           # Top navigation with search, auth, cart, theme toggle
│   ├── ProductCard.tsx      # Grid card with sold-out state, low-stock chip, quick-view
│   ├── ReviewsSection.tsx   # Reviews list for a product
│   ├── ReviewSubmission.tsx # Submit / edit / delete review modal
│   └── WishlistButton.tsx   # Heart toggle wired to Supabase
├── context/
│   ├── AuthContext.tsx      # Auth state, profile, OAuth, password recovery
│   ├── StoreContext.tsx     # Cart, products, filters, toasts, wishlist, reviews
│   └── ThemeContext.tsx     # Dark/light theme
├── lib/
│   ├── adminApi.ts          # Typed client for admin-api Edge Function
│   ├── email.ts             # EmailJS / Web3Forms abstraction
│   ├── stripe.ts            # Typed client for stripe-checkout Edge Function
│   └── supabase.ts          # Supabase client singleton
├── supabase/
│   ├── functions/           # Deno Edge Functions
│   └── migrations/          # SQL migration files
└── vite.config.ts           # Build config with vendor chunk splitting
```

---

## Design Decisions

**AI Clerk uses a tool-calling contract, not free-text**  
The Groq model is constrained to apply discounts only via an `apply_discount` tool call. Free-text price offers are rejected in the message processing layer. This means the negotiation floor set in the database cannot be bypassed by prompt injection or model drift.

**Stock decrement is server-side and atomic**  
`decrement_stock()` is a `SECURITY DEFINER` function that runs as the DB owner, is granted only to `service_role`, and uses `GREATEST(0, stock_quantity - qty)` — so it floors at zero and cannot oversell. It is called by the webhook Edge Function after payment confirmation, not by the frontend.

**Stripe secret key never reaches the browser**  
Checkout session creation and webhook verification are both in Deno Edge Functions. The browser only holds the publishable key.

**Client-side AI keys (current limitation)**  
Groq and Gemini API keys are currently set as `VITE_*` variables and ship to the browser. The trade-off is lower latency and simpler architecture for a solo-team project. Moving them to an Edge Function is the next security milestone.

**RLS as the primary data security layer**  
All frontend DB access goes through the Supabase anon key with Row-Level Security policies enforced at the database level. Application-level checks are a secondary defence, not the primary one.

**Idempotent webhook processing**  
The `processed_webhook_events` table records every handled Stripe event ID. Duplicate deliveries (Stripe retries on 5xx) are a no-op, preventing double stock decrements and double order completions.

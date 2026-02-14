
/**
 * MODERNIST — Stripe Payment Integration Layer
 * 
 * Enterprise-grade client-side Stripe integration using
 * Stripe.js (loaded via CDN in index.html) with Supabase 
 * Edge Function as the serverless checkout session creator.
 * 
 * Architecture:
 *  Client (this file) → Supabase Edge Function → Stripe API
 *  Stripe Checkout Page → success_url / cancel_url
 */

import { supabase } from './supabase';

// ─────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────

const STRIPE_PUBLIC_KEY = import.meta.env.VITE_STRIPE_PUBLIC_KEY
  || 'pk_test_51T0JatPgX2QsMZYBxlY2EkKhIt4y7AB8oHrVKKNh6ZWImXi0IwogVhv6BdmeR8zejYlO4QPLC4mqylwfAb24qvR400iPBlZHJN';

// ─────────────────────────────────────────────────────────
// Stripe.js Singleton
// ─────────────────────────────────────────────────────────

let stripeInstance: any = null;

/**
 * Returns a singleton reference to the Stripe.js client.
 * Stripe.js is loaded via CDN script in index.html and
 * exposes `window.Stripe`.
 */
export const getStripe = (): any => {
  if (stripeInstance) return stripeInstance;

  if (typeof window !== 'undefined' && (window as any).Stripe) {
    stripeInstance = (window as any).Stripe(STRIPE_PUBLIC_KEY);
    return stripeInstance;
  }

  throw new Error(
    '[MODERNIST:Stripe] Stripe.js not loaded. Ensure the Stripe CDN script is present in index.html.'
  );
};

// ─────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────

export interface CheckoutLineItem {
  id: string;
  name: string;
  image_url: string;
  price: number;
  quantity: number;
}

export interface CheckoutSessionRequest {
  lineItems: CheckoutLineItem[];
  totalAmount: number;          // Final amount AFTER discounts (in dollars)
  discountPercent: number;      // Applied discount percentage
  couponCode: string | null;    // Applied coupon code
  customerEmail?: string;       // Pre-fill Stripe Checkout email
  shippingAddress?: {
    address: string;
    city: string;
    postalCode: string;
    coordinates?: { lat: number; lng: number } | null;
  };
  orderId?: string;             // Supabase checkout record ID for reference
}

export interface CheckoutSessionResponse {
  sessionId: string;
  url?: string;
}

// ─────────────────────────────────────────────────────────
// Checkout Session Creator
// ─────────────────────────────────────────────────────────

/**
 * Creates a Stripe Checkout Session via Supabase Edge Function,
 * then redirects the user to Stripe's hosted checkout page.
 * 
 * Flow:
 * 1. Call Supabase Edge Function `stripe-checkout` with cart data
 * 2. Receive `sessionId` 
 * 3. Use Stripe.js to redirect to Stripe Checkout
 * 
 * @returns The session ID if redirect was initiated
 * @throws Error if session creation or redirect fails
 */
export const createCheckoutSession = async (
  request: CheckoutSessionRequest
): Promise<string> => {
  // 1. Invoke Supabase Edge Function
  const { data, error } = await supabase.functions.invoke('stripe-checkout', {
    body: {
      line_items: request.lineItems.map(item => ({
        name: item.name,
        image: item.image_url,
        amount: Math.round(item.price * 100), // cents
        quantity: item.quantity,
      })),
      total_amount: Math.round(request.totalAmount * 100), // cents
      discount_percent: request.discountPercent,
      coupon_code: request.couponCode,
      customer_email: request.customerEmail,
      shipping_address: request.shippingAddress,
      order_id: request.orderId,
      success_url: `${window.location.origin}/#/orders?payment=success`,
      cancel_url: `${window.location.origin}/#/checkout?payment=cancelled`,
    },
  });

  if (error) {
    console.error('[MODERNIST:Stripe] Edge Function error:', error);
    throw new Error(
      error.message || 'Failed to create checkout session. Please try again.'
    );
  }

  if (!data?.sessionId) {
    throw new Error('Invalid response from payment gateway.');
  }

  // 2. Redirect to Stripe Checkout
  const stripe = getStripe();
  const { error: redirectError } = await stripe.redirectToCheckout({
    sessionId: data.sessionId,
  });

  if (redirectError) {
    console.error('[MODERNIST:Stripe] Redirect error:', redirectError);
    throw new Error(redirectError.message || 'Payment redirect failed.');
  }

  return data.sessionId;
};

// ─────────────────────────────────────────────────────────
// Utility: Verify Payment Status (Post-Redirect)
// ─────────────────────────────────────────────────────────

/**
 * Checks URL params for Stripe payment result after redirect.
 * Called on success/cancel pages to display appropriate UI.
 */
export const getPaymentStatus = (): 'success' | 'cancelled' | null => {
  const params = new URLSearchParams(window.location.hash.split('?')[1] || '');
  if (params.get('payment') === 'success') return 'success';
  if (params.get('payment') === 'cancelled') return 'cancelled';
  return null;
};
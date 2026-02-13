
import Stripe from 'stripe';

const stripe = new Stripe('sk_test_51T0JatPgX2QsMZYBybYiSlUijzwksYWNlCEz7fZ5sxOw9zNMTCtre0Os5plg5BndP0EL8qiqRXTx130UQ4QmXRLX00ZAbkGJ3R', {
  // Use the required Stripe API version as per the environment's type constraints
  apiVersion: '2026-01-28.clover' as any,
});

export default async function handler(req: any) {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  try {
    const { cartItems, negotiatedTotal, discountPercent } = await req.json();

    // In a production environment, you should calculate price on the server.
    // Here we use the Clerk's negotiated total as the ultimate source of truth.
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'MODERNIST Archival Acquisition',
              description: `A curated collection including ${cartItems.length} pieces. Applied Clerk Benefit: ${discountPercent}%`,
              images: cartItems.map((item: any) => item.product.image_url).slice(0, 1),
            },
            unit_amount: Math.round(negotiatedTotal * 100), // Stripe expects cents
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${window.location.origin}/#/orders?success=true`,
      cancel_url: `${window.location.origin}/#/checkout`,
    });

    return new Response(JSON.stringify({ sessionId: session.id }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('Stripe Error:', err);
    return new Response(JSON.stringify({ error: err.message }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

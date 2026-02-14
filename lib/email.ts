import { CartItem } from '../types';

// Generate random expected delivery date (7-21 business days from now)
export function generateExpectedDeliveryDate(): string {
  const daysToAdd = Math.floor(Math.random() * 15) + 7; // 7-21 days
  const deliveryDate = new Date();
  deliveryDate.setDate(deliveryDate.getDate() + daysToAdd);
  
  return deliveryDate.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

// Create email HTML template
function createEmailHTML(
  orderId: string,
  customerName: string,
  customerEmail: string,
  items: CartItem[],
  totalAmount: number,
  shippingAddress: string,
  expectedDelivery: string
): string {
  const itemsHtml = items.map(item => `
    <tr>
      <td style="padding: 20px; border-bottom: 1px solid #e5e5e5;">
        <div style="display: flex; align-items: flex-start; gap: 20px;">
          <div style="flex: 1;">
            <h3 style="margin: 0 0 8px 0; font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: 2px;">${item.product.name}</h3>
            <p style="margin: 0; font-size: 11px; color: #666; text-transform: uppercase; letter-spacing: 1px;">${item.product.category}</p>
            <p style="margin: 8px 0 0 0; font-size: 12px; font-weight: 600;">Qty: ${item.quantity}</p>
          </div>
          <div style="text-align: right;">
            <p style="margin: 0; font-size: 16px; font-weight: 900;">$${item.product.price.toFixed(2)}</p>
          </div>
        </div>
      </td>
    </tr>
  `).join('');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #f5f5f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border: 1px solid #000;">
          <!-- Header -->
          <tr>
            <td style="padding: 60px 40px; background-color: #000; text-align: center;">
              <h1 style="margin: 0; font-size: 42px; font-weight: 900; color: #fff; text-transform: uppercase; letter-spacing: 8px; font-family: serif;">MODERNIST</h1>
              <p style="margin: 16px 0 0 0; font-size: 10px; color: #999; text-transform: uppercase; letter-spacing: 4px; font-weight: 700;">Permanent Archive</p>
            </td>
          </tr>
          
          <!-- Order Confirmed -->
          <tr>
            <td style="padding: 40px 40px 20px 40px; text-align: center; border-bottom: 1px solid #e5e5e5;">
              <h2 style="margin: 0 0 12px 0; font-size: 32px; font-weight: 900; text-transform: uppercase; letter-spacing: 2px;">ORDER CONFIRMED</h2>
              <p style="margin: 0; font-size: 11px; color: #666; text-transform: uppercase; letter-spacing: 2px; font-weight: 700;">Thank you, ${customerName}</p>
            </td>
          </tr>
          
          <!-- Order Details -->
          <tr>
            <td style="padding: 40px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding-bottom: 20px;">
                    <p style="margin: 0 0 8px 0; font-size: 10px; color: #999; text-transform: uppercase; letter-spacing: 2px; font-weight: 700;">Order Number</p>
                    <p style="margin: 0; font-size: 14px; font-weight: 900;">ORD-${orderId}</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding-bottom: 20px;">
                    <p style="margin: 0 0 8px 0; font-size: 10px; color: #999; text-transform: uppercase; letter-spacing: 2px; font-weight: 700;">Expected Arrival</p>
                    <p style="margin: 0; font-size: 14px; font-weight: 900; color: #000;">${expectedDelivery}</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding-bottom: 20px;">
                    <p style="margin: 0 0 8px 0; font-size: 10px; color: #999; text-transform: uppercase; letter-spacing: 2px; font-weight: 700;">Shipping Address</p>
                    <p style="margin: 0; font-size: 12px; line-height: 1.6;">${shippingAddress}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Items -->
          <tr>
            <td style="padding: 0 40px 40px 40px;">
              <h3 style="margin: 0 0 20px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 3px; font-weight: 900; border-bottom: 2px solid #000; padding-bottom: 12px;">Your Items</h3>
              <table width="100%" cellpadding="0" cellspacing="0" style="border: 1px solid #e5e5e5;">
                ${itemsHtml}
                <tr>
                  <td style="padding: 30px 20px; text-align: right; background-color: #f9f9f9;">
                    <p style="margin: 0; font-size: 10px; color: #666; text-transform: uppercase; letter-spacing: 1px; font-weight: 700;">Total</p>
                    <p style="margin: 8px 0 0 0; font-size: 28px; font-weight: 900;">$${totalAmount.toFixed(2)}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 40px; background-color: #000; text-align: center;">
              <p style="margin: 0 0 12px 0; font-size: 10px; color: #666; text-transform: uppercase; letter-spacing: 3px; font-weight: 700;">Questions? Contact Us</p>
              <p style="margin: 0; font-size: 11px; color: #999;">hamzakamran843@gmail.com</p>
              <p style="margin: 24px 0 0 0; font-size: 8px; color: #666; text-transform: uppercase; letter-spacing: 2px;">MODERNIST PERMANENT ARCHIVE © 2024</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}

// Send email directly using Web3Forms (free service)
export async function sendOrderConfirmationEmail(
  orderId: string,
  customerName: string,
  customerEmail: string,
  items: CartItem[],
  totalAmount: number,
  shippingAddress: string
): Promise<boolean> {
  try {
    const expectedDelivery = generateExpectedDeliveryDate();
    
    // Calculate costs
    const shipping = 0; // Free shipping
    const tax = Math.round(totalAmount * 0.08 * 100) / 100; // 8% tax
    const subtotal = totalAmount - tax;

    // Format items for the template
    const orders = items.map(item => ({
      name: item.product.name,
      units: item.quantity,
      price: item.product.price.toFixed(2)
    }));

    // Option 1: Using EmailJS (Recommended with custom template)
    const emailJSServiceId = import.meta.env.VITE_EMAILJS_SERVICE_ID;
    const emailJSTemplateId = import.meta.env.VITE_EMAILJS_TEMPLATE_ID;
    const emailJSPublicKey = import.meta.env.VITE_EMAILJS_PUBLIC_KEY;

    if (emailJSServiceId && emailJSTemplateId && emailJSPublicKey) {
      const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          service_id: emailJSServiceId,
          template_id: emailJSTemplateId,
          user_id: emailJSPublicKey,
          template_params: {
            email: customerEmail,
            order_id: orderId,
            orders: orders,
            cost: {
              shipping: shipping.toFixed(2),
              tax: tax.toFixed(2),
              total: totalAmount.toFixed(2)
            }
          },
        }),
      });

      if (response.ok) {
        console.log('✅ Order confirmation email sent successfully via EmailJS');
        return true;
      } else {
        const errorData = await response.text();
        console.error('❌ Failed to send email via EmailJS:', errorData);
        return false;
      }
    }

    // Option 2: Fallback to creating HTML template for Web3Forms
    const emailHTML = createEmailHTML(
      orderId,
      customerName,
      customerEmail,
      items,
      totalAmount,
      shippingAddress,
      expectedDelivery
    );

    const web3FormsKey = import.meta.env.VITE_WEB3FORMS_ACCESS_KEY;
    
    if (web3FormsKey) {
      const response = await fetch('https://api.web3forms.com/submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          access_key: web3FormsKey,
          subject: `Order Confirmed - MODERNIST Archive #${orderId}`,
          from_name: 'MODERNIST',
          to: customerEmail,
          html: emailHTML,
        }),
      });

      const result = await response.json();
      if (result.success) {
        console.log('✅ Order confirmation email sent successfully');
        return true;
      } else {
        console.error('❌ Failed to send email:', result);
        return false;
      }
    }

    // If no email service is configured, log the email content
    console.warn('⚠️ No email service configured. Email would be sent to:', customerEmail);
    console.log('Order ID:', orderId);
    console.log('Items:', items.length);
    console.log('Total:', totalAmount);
    
    return true; // Return true to not block the checkout flow

  } catch (error) {
    console.error('❌ Error sending order confirmation email:', error);
    return false;
  }
}

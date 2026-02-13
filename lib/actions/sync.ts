
import { supabase } from '../supabase';
import { Product } from '../../types';

/**
 * Note: While these functions are marked 'use server' for Next.js compatibility,
 * they are implemented here to be safe for both server and browser environments
 * to resolve 'Failed to fetch' errors in the browser-based preview.
 */

const ERP_BASE_URL = "http://erp.visionplusapps.com:5678/webhook";
const CREDENTIALS = "admin:admin@123";

/**
 * Securely encodes credentials for Basic Auth.
 * Uses btoa which is available in both modern Browsers and Node.js 16+.
 */
function getAuthHeader() {
  try {
    return `Basic ${btoa(CREDENTIALS)}`;
  } catch (e) {
    console.warn("Encoding failed, falling back to plaintext (not recommended)");
    return `Basic ${CREDENTIALS}`;
  }
}

/**
 * Executes a semantic search against the n8n ERP endpoint.
 * Handles 'Failed to fetch' by returning empty results instead of crashing.
 */
export async function searchInERP(query: string) {
  const AUTH_HEADER = getAuthHeader();
  try {
    const response = await fetch(`${ERP_BASE_URL}/search`, {
      method: 'POST',
      headers: { 
        'Authorization': AUTH_HEADER,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ query }),
    });

    if (!response.ok) {
      console.error(`ERP Search failed with status: ${response.status}`);
      return [];
    }
    
    const data = await response.json();
    return Array.isArray(data) ? data : [];
  } catch (error: any) {
    console.error("ERP Search Error (Likely CORS/Mixed Content):", error.message);
    // Silent fail to prevent UI disruption
    return [];
  }
}

/**
 * Fetches the full product list from ERP.
 */
export async function fetchERPProducts() {
  const AUTH_HEADER = getAuthHeader();
  try {
    const response = await fetch(`${ERP_BASE_URL}/products`, {
      method: 'GET',
      headers: { 'Authorization': AUTH_HEADER },
    });

    if (!response.ok) return [];
    const data = await response.json();
    return Array.isArray(data) ? data : [];
  } catch (error: any) {
    console.error("ERP Fetch Error:", error.message);
    return [];
  }
}

/**
 * Documents a piece in the ERP system.
 */
export async function createInERP(product: Partial<Product>) {
  const AUTH_HEADER = getAuthHeader();
  try {
    const response = await fetch(`${ERP_BASE_URL}/product`, {
      method: 'POST',
      headers: { 
        'Authorization': AUTH_HEADER,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(product),
    });

    if (!response.ok) throw new Error(`ERP responded with ${response.status}`);
    return { success: true };
  } catch (error: any) {
    console.error("ERP Creation Error:", error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Synchronizes ERP data into the local Supabase archive.
 */
export async function syncFromN8N() {
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return { success: false, error: "Identity verification required." };
    }

    // Role check logic would go here in a production environment
    
    const erpProducts = await fetchERPProducts();
    if (erpProducts.length === 0) {
      return { success: false, error: "No data retrieved from ERP. Verify tunnel status." };
    }

    const mappedProducts = erpProducts.map((p: any) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      price: Number(p.price),
      bottom_price: Number(p.bottom_price || p.price * 0.7),
      category: p.category,
      image_url: p.image_url,
      tags: p.tags || []
    }));

    const { error: upsertError } = await supabase
      .from('products')
      .upsert(mappedProducts, { onConflict: 'id' });

    if (upsertError) throw upsertError;

    return { 
      success: true, 
      count: mappedProducts.length,
      message: `Synchronized ${mappedProducts.length} archival pieces.` 
    };

  } catch (error: any) {
    console.error("Sync Error:", error.message);
    return { success: false, error: error.message };
  }
}

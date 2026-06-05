
import { supabase } from '../supabase';
import { Product } from '../../types';

// ERP calls are now proxied through the erp-proxy Supabase Edge Function.
// The ERP credentials (admin:admin@123) are stored as Supabase secrets and
// never sent to the browser.

async function callERPProxy(action: string, body?: object): Promise<any> {
  const { data, error } = await supabase.functions.invoke(`erp-proxy?action=${action}`, {
    method: body ? 'POST' : 'GET',
    body: body ? JSON.stringify(body) : undefined,
  });

  if (error) throw new Error(error.message || 'ERP proxy request failed');
  return data;
}

export async function searchInERP(query: string): Promise<any[]> {
  try {
    const data = await callERPProxy('search', { query });
    return Array.isArray(data) ? data : [];
  } catch (error: any) {
    console.error('ERP Search Error:', error.message);
    return [];
  }
}

export async function fetchERPProducts(): Promise<any[]> {
  try {
    const data = await callERPProxy('products');
    return Array.isArray(data) ? data : [];
  } catch (error: any) {
    console.error('ERP Fetch Error:', error.message);
    return [];
  }
}

export async function createInERP(product: Partial<Product>): Promise<{ success: boolean; error?: string }> {
  try {
    await callERPProxy('create', product);
    return { success: true };
  } catch (error: any) {
    console.error('ERP Creation Error:', error.message);
    return { success: false, error: error.message };
  }
}

export async function syncFromN8N(): Promise<{ success: boolean; count?: number; message?: string; error?: string }> {
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return { success: false, error: 'Identity verification required.' };
    }

    const erpProducts = await fetchERPProducts();
    if (erpProducts.length === 0) {
      return { success: false, error: 'No data retrieved from ERP. Verify tunnel status.' };
    }

    const mappedProducts = erpProducts.map((p: any) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      price: Number(p.price),
      bottom_price: Number(p.bottom_price || p.price * 0.7),
      category: p.category,
      image_url: p.image_url,
      tags: p.tags || [],
    }));

    const { error: upsertError } = await supabase
      .from('products')
      .upsert(mappedProducts, { onConflict: 'id' });

    if (upsertError) throw upsertError;

    return {
      success: true,
      count: mappedProducts.length,
      message: `Synchronized ${mappedProducts.length} archival pieces.`,
    };
  } catch (error: any) {
    console.error('Sync Error:', error.message);
    return { success: false, error: error.message };
  }
}

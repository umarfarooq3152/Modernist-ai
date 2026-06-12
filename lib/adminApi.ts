
import { supabase } from './supabase';

// ─────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────

export interface AdminStats {
  totalProducts: number;
  totalOrders: number;
  totalReviews: number;
  totalNegotiations: number;
  totalRevenue: number;
  acceptedNegotiations: number;
  revenueChart: { name: string; revenue: number }[];
  categoryChart: { name: string; value: number }[];
  recentOrders: {
    id: string;
    createdAt: string;
    totalAmount: number;
    status: string;
    customerName: string;
  }[];
}

export interface AdminProduct {
  id: string;
  name: string;
  description: string;
  price: number;
  bottom_price: number;
  category: string;
  image_url: string;
  tags: string[];
  created_at: string;
}

export interface AdminReview {
  id: string;
  product_id: string;
  user_id: string;
  author: string;
  rating: number;
  text: string;
  date: string;
  products: { id: string; name: string; image_url: string; category: string } | null;
}

export interface AdminOrder {
  id: string;
  created_at: string;
  user_id: string;
  total_amount: string;
  status: string;
  stripe_session_id: string | null;
  stripe_payment_intent: string | null;
  profiles: { id: string; first_name: string | null; last_name: string | null; email: string | null } | null;
  checkout_items: { id: string; item_id: string; name: string; price: string; image_url: string }[];
}

export interface AdminNegotiation {
  id: string;
  created_at: string;
  user_id: string | null;
  user_offer: number;
  clerk_response: string;
  status: string;
  sentiment: string;
  cart_snapshot: any;
  metadata: { user_email?: string; user_message?: string };
}

export interface PaginatedResponse<T> {
  data: T[];
  count: number;
}

// ─────────────────────────────────────────────────────────
// Core fetch wrapper
// ─────────────────────────────────────────────────────────

async function adminFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const { data, error } = await supabase.functions.invoke(`admin-api/${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  if (error) throw new Error(error.message || 'Admin API error');
  if (data?.error) throw new Error(data.error);
  return data as T;
}

// ─────────────────────────────────────────────────────────
// Stats
// ─────────────────────────────────────────────────────────

export const adminApi = {
  stats: {
    get: () => adminFetch<AdminStats>('stats'),
  },

  // ─────────────────────────────────────────────────────
  // Products
  // ─────────────────────────────────────────────────────
  products: {
    list: (params: {
      page?: number;
      pageSize?: number;
      search?: string;
      category?: string;
      sort?: string;
      order?: 'asc' | 'desc';
    } = {}) => {
      const q = new URLSearchParams();
      if (params.page) q.set('page', String(params.page));
      if (params.pageSize) q.set('pageSize', String(params.pageSize));
      if (params.search) q.set('search', params.search);
      if (params.category) q.set('category', params.category);
      if (params.sort) q.set('sort', params.sort);
      if (params.order) q.set('order', params.order);
      const qs = q.toString();
      return adminFetch<PaginatedResponse<AdminProduct>>(`products${qs ? `?${qs}` : ''}`);
    },

    create: (product: Partial<AdminProduct>) =>
      adminFetch<{ data: AdminProduct }>('products', {
        method: 'POST',
        body: JSON.stringify(product),
      }),

    update: (id: string, updates: Partial<AdminProduct>) =>
      adminFetch<{ data: AdminProduct }>(`products/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
      }),

    delete: (id: string) =>
      adminFetch<{ success: boolean }>(`products/${id}`, { method: 'DELETE' }),
  },

  // ─────────────────────────────────────────────────────
  // Reviews
  // ─────────────────────────────────────────────────────
  reviews: {
    list: (params: {
      page?: number;
      pageSize?: number;
      productId?: string;
      minRating?: number;
      maxRating?: number;
      sort?: string;
    } = {}) => {
      const q = new URLSearchParams();
      if (params.page) q.set('page', String(params.page));
      if (params.pageSize) q.set('pageSize', String(params.pageSize));
      if (params.productId) q.set('productId', params.productId);
      if (params.minRating != null) q.set('minRating', String(params.minRating));
      if (params.maxRating != null) q.set('maxRating', String(params.maxRating));
      if (params.sort) q.set('sort', params.sort);
      const qs = q.toString();
      return adminFetch<PaginatedResponse<AdminReview>>(`reviews${qs ? `?${qs}` : ''}`);
    },

    delete: (id: string) =>
      adminFetch<{ success: boolean }>(`reviews/${id}`, { method: 'DELETE' }),
  },

  // ─────────────────────────────────────────────────────
  // Orders
  // ─────────────────────────────────────────────────────
  orders: {
    list: (params: {
      page?: number;
      pageSize?: number;
      status?: string;
      search?: string;
    } = {}) => {
      const q = new URLSearchParams();
      if (params.page) q.set('page', String(params.page));
      if (params.pageSize) q.set('pageSize', String(params.pageSize));
      if (params.status) q.set('status', params.status);
      if (params.search) q.set('search', params.search);
      const qs = q.toString();
      return adminFetch<PaginatedResponse<AdminOrder>>(`orders${qs ? `?${qs}` : ''}`);
    },

    updateStatus: (id: string, status: string) =>
      adminFetch<{ data: AdminOrder }>(`orders/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      }),
  },

  // ─────────────────────────────────────────────────────
  // Negotiations
  // ─────────────────────────────────────────────────────
  negotiations: {
    list: (params: { page?: number; pageSize?: number; status?: string } = {}) => {
      const q = new URLSearchParams();
      if (params.page) q.set('page', String(params.page));
      if (params.pageSize) q.set('pageSize', String(params.pageSize));
      if (params.status) q.set('status', params.status);
      const qs = q.toString();
      return adminFetch<PaginatedResponse<AdminNegotiation>>(`negotiations${qs ? `?${qs}` : ''}`);
    },
  },
};

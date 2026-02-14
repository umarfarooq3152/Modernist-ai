
export interface Review {
  id: string;
  product_id: string;
  author: string;
  rating: number;
  date: string;
  text: string;
  user_id?: string;
  product?: {
    name: string;
    image_url: string;
  };
}

export interface Product {
  id: string;
  name: string;
  price: number;
  bottom_price: number;
  category: string;
  description: string;
  image_url: string;
  tags: string[];
  reviews?: Review[];
}

export interface ClerkLog {
  id: string;
  created_at: string;
  user_id?: string;
  user_email?: string;
  user_message: string;
  clerk_response: string;
  clerk_sentiment: 'neutral' | 'happy' | 'frustrated' | 'hurried' | 'rude';
  discount_offered: number;
  negotiation_successful: boolean;
  cart_snapshot: any;
  checkout_details?: any;
  shipping_address?: any;
  metadata?: any;
}

export interface OrderRecord {
  id: string;
  created_at: string;
  user_id: string;
  total_amount: number;
  status: string;
  items: {
    id: string;
    name: string;
    price: number;
    quantity: number;
    image_url: string;
  }[];
}

export interface CartItem {
  product: Product;
  quantity: number;
  isBundlePart?: boolean;
}

export type UserMood = 'neutral' | 'happy' | 'sad' | 'excited' | 'frustrated' | 'hurried' | 'rude';
export type SortOrder = 'relevance' | 'price-low' | 'price-high';

export interface StoreState {
  products: Product[];
  allProducts: Product[];
  cart: CartItem[];
  isCartOpen: boolean;
  isSearchOpen: boolean;
  currentCategory: string;
  negotiatedDiscount: number; // Percentage 0-100
  appliedCoupon: string | null;
  currentMood: UserMood;
  sortOrder: SortOrder;
  lastAddedProduct: Product | null;
  theme: 'light' | 'dark';
  isCartLocked: boolean;
}

export type StoreAction = 
  | { type: 'SET_PRODUCTS'; payload: Product[] }
  | { type: 'ADD_TO_CART'; payload: Product }
  | { type: 'ADD_TO_CART_QUANTITY'; payload: { product: Product; quantity: number } }
  | { type: 'REMOVE_FROM_CART'; payload: string }
  | { type: 'UPDATE_QUANTITY'; payload: { id: string; quantity: number } }
  | { type: 'TOGGLE_CART' }
  | { type: 'OPEN_CART' }
  | { type: 'TOGGLE_SEARCH' }
  | { type: 'FILTER_BY_CATEGORY'; payload: string }
  | { type: 'SEARCH_PRODUCTS'; payload: string }
  | { type: 'UPDATE_PRODUCT_FILTER'; payload: { category?: string; tag?: string; query?: string; productIds?: (string | number)[] } }
  | { type: 'SET_SORT_ORDER'; payload: SortOrder }
  | { type: 'APPLY_DISCOUNT'; payload: { couponCode: string; discountPercent: number } }
  | { type: 'SET_MOOD'; payload: UserMood }
  | { type: 'CLEAR_CART' }
  | { type: 'CLEAR_LAST_ADDED' }
  | { type: 'TOGGLE_THEME' }
  | { type: 'LOCK_CART' }
  | { type: 'UNLOCK_CART' };

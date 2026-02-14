import React, { createContext, useContext, useReducer, ReactNode, useCallback, useMemo, useEffect, useState } from 'react';
import { Product, CartItem, StoreState, StoreAction, UserMood, SortOrder, ClerkLog, OrderRecord, Review } from '../types';
import { productsData } from '../data/products';
import { supabase } from '../lib/supabase';
import { searchInERP, fetchERPProducts, createInERP, syncFromN8N } from '../lib/actions/sync';

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

interface StoreContextValue extends StoreState {
  cartSubtotal: number;
  cartTotal: number;
  synergyDiscount: number;
  activeVibe: string | null;
  isCurating: boolean;
  isInitialLoading: boolean;
  toasts: Toast[];
  quickViewProduct: Product | null;
  isSyncingERP: boolean;
  addToCart: (product: Product) => void;
  addToCartWithQuantity: (productId: string, quantity: number) => void;
  removeFromCart: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  toggleCart: () => void;
  openCart: () => void;
  toggleSearch: () => void;
  filterByCategory: (category: string) => void;
  searchProducts: (query: string) => void;
  updateProductFilter: (filter: { category?: string; tag?: string; query?: string; productIds?: string[] }) => void;
  setSortOrder: (order: SortOrder) => void;
  applyNegotiatedDiscount: (couponCode: string, discountPercent: number) => void;
  setMood: (mood: UserMood) => void;
  clearCart: () => void;
  clearLastAdded: () => void;
  setQuickViewProduct: (product: Product | null) => void;
  addToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  removeToast: (id: string) => void;
  resetArchive: () => void;
  searchERP: (query: string) => Promise<any[]>;
  syncERPProducts: () => Promise<void>;
  createERPProduct: (product: Partial<Product>) => Promise<void>;
  logClerkInteraction: (log: Partial<ClerkLog>) => Promise<void>;
  fetchUserOrders: (userId: string) => Promise<OrderRecord[]>;
  fetchUserReviews: (userId: string) => Promise<Review[]>;
  toggleTheme: () => void;
}

const initialState: StoreState = {
  products: productsData,
  allProducts: productsData,
  cart: [],
  isCartOpen: false,
  isSearchOpen: false,
  currentCategory: 'All',
  negotiatedDiscount: 0,
  appliedCoupon: null,
  currentMood: 'neutral',
  sortOrder: 'relevance',
  lastAddedProduct: null,
  theme: 'light',
};

const storeReducer = (state: StoreState, action: StoreAction): StoreState => {
  switch (action.type) {
    case 'SET_PRODUCTS':
      return { ...state, products: action.payload, allProducts: action.payload };
    case 'ADD_TO_CART': {
      const existingItem = state.cart.find(item => item.product.id === action.payload.id);
      if (existingItem) {
        return {
          ...state,
          cart: state.cart.map(item =>
            item.product.id === action.payload.id
              ? { ...item, quantity: item.quantity + 1 }
              : item
          ),
          lastAddedProduct: action.payload,
          isCartOpen: true,
        };
      }
      return {
        ...state,
        cart: [...state.cart, { product: action.payload, quantity: 1 }],
        lastAddedProduct: action.payload,
        isCartOpen: true,
      };
    }
    case 'ADD_TO_CART_QUANTITY': {
       const { product, quantity } = action.payload;
       const existingItem = state.cart.find(item => item.product.id === product.id);
       if (existingItem) {
         return {
           ...state,
           cart: state.cart.map(item =>
             item.product.id === product.id
               ? { ...item, quantity: item.quantity + quantity }
               : item
           ),
           lastAddedProduct: product,
           isCartOpen: true,
         };
       }
       return {
         ...state,
         cart: [...state.cart, { product, quantity }],
         lastAddedProduct: product,
         isCartOpen: true,
       };
    }
    case 'REMOVE_FROM_CART':
      return {
        ...state,
        cart: state.cart.filter(item => item.product.id !== action.payload),
      };
    case 'UPDATE_QUANTITY':
      return {
        ...state,
        cart: state.cart.map(item =>
          item.product.id === action.payload.id
            ? { ...item, quantity: Math.max(0, action.payload.quantity) }
            : item
        ).filter(item => item.quantity > 0),
      };
    case 'TOGGLE_CART':
      return { ...state, isCartOpen: !state.isCartOpen };
    case 'OPEN_CART':
      return { ...state, isCartOpen: true };
    case 'TOGGLE_SEARCH':
      return { ...state, isSearchOpen: !state.isSearchOpen };
    case 'FILTER_BY_CATEGORY':
      if (action.payload === 'All') {
        return { ...state, currentCategory: 'All', products: state.allProducts };
      }
      return {
        ...state,
        currentCategory: action.payload,
        products: state.allProducts.filter(p => p.category === action.payload),
      };
    case 'SEARCH_PRODUCTS':
      const query = action.payload.toLowerCase();
      try {
        const searchResults = state.allProducts.filter(
          p =>
            (p.name || '').toLowerCase().includes(query) ||
            (p.description || '').toLowerCase().includes(query) ||
            (p.tags || []).some(t => (t || '').toLowerCase().includes(query))
        );
        return { ...state, products: searchResults.length > 0 ? searchResults : state.allProducts };
      } catch (e) {
        console.error('[REDUCER] SEARCH_PRODUCTS error:', e);
        return state;
      }
    case 'UPDATE_PRODUCT_FILTER':
      let filtered = state.allProducts;
      console.log('[FILTER] UPDATE_PRODUCT_FILTER action.payload:', action.payload);
      console.log('[FILTER] state.allProducts.length:', state.allProducts.length);
      try {
        // Priority 1: If specific product IDs provided (from RAG), use them directly
        if (action.payload.productIds && action.payload.productIds.length > 0) {
          const idSet = new Set(action.payload.productIds.map((id: string | number) => String(id).toLowerCase()));
          const byId = filtered.filter(p => idSet.has(String(p.id).toLowerCase()));
          console.log('[FILTER] ID filtering: requested=', action.payload.productIds.length, 'matched=', byId.length);
          if (byId.length > 0) filtered = byId;
        }
        // Only do text matching if productIds didn't narrow results
        if (!action.payload.productIds || action.payload.productIds.length === 0 || filtered.length === state.allProducts.length) {
          if (action.payload.category && action.payload.category !== 'All') {
            filtered = filtered.filter(p => (p.category || '') === action.payload.category);
          }
          if (action.payload.query) {
            const stopWords = new Set(['show', 'me', 'find', 'search', 'for', 'the', 'a', 'an', 'i', 'want', 'need', 'get', 'looking', 'browse', 'some', 'any', 'have', 'do', 'you', 'your', 'what', 'can', 'my', 'im', "i'm", 'am', 'please', 'help', 'with', 'of', 'in', 'on', 'to', 'is', 'it', 'that', 'this']);
            const words = action.payload.query.toLowerCase().split(/\s+/).filter((w: string) => w.length > 2 && !stopWords.has(w));
            if (words.length > 0) {
              const wordFiltered = filtered.filter(p => {
                const text = `${p.name || ''} ${p.description || ''} ${(p.tags || []).join(' ')} ${p.category || ''}`.toLowerCase();
                return words.some((word: string) => text.includes(word));
              });
              if (wordFiltered.length > 0) filtered = wordFiltered;
            }
          }
        }
      } catch (e) {
        console.error('[REDUCER] UPDATE_PRODUCT_FILTER error:', e);
        filtered = state.allProducts;
      }
      // Safety net: never blank
      if (filtered.length === 0) filtered = state.allProducts;
      console.log('[FILTER] Final filtered.length:', filtered.length, 'IDs:', filtered.slice(0, 5).map(p => p.id));
      return { ...state, products: filtered };
    case 'SET_SORT_ORDER':
      let sorted = [...state.products];
      if (action.payload === 'price-low') sorted.sort((a, b) => a.price - b.price);
      if (action.payload === 'price-high') sorted.sort((a, b) => b.price - a.price);
      return { ...state, sortOrder: action.payload, products: sorted };
    case 'APPLY_DISCOUNT':
      return { ...state, appliedCoupon: action.payload.couponCode, negotiatedDiscount: action.payload.discountPercent };
    case 'SET_MOOD':
      return { ...state, currentMood: action.payload };
    case 'CLEAR_CART':
      return { ...state, cart: [], negotiatedDiscount: 0, appliedCoupon: null };
    case 'CLEAR_LAST_ADDED':
      return { ...state, lastAddedProduct: null };
    case 'TOGGLE_THEME':
      return { ...state, theme: state.theme === 'light' ? 'dark' : 'light' };
    default:
      return state;
  }
};

const StoreContext = createContext<StoreContextValue | undefined>(undefined);

export const StoreProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(storeReducer, initialState);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [activeVibe, setActiveVibe] = useState<string | null>(null);
  const [isCurating, setIsCurating] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(false);
  const [quickViewProduct, setQuickViewProduct] = useState<Product | null>(null);
  const [isSyncingERP, setIsSyncingERP] = useState(false);

  useEffect(() => {
    const fetchProducts = async () => {
      setIsInitialLoading(true);
      try {
        const { data, error } = await supabase.from('products').select('*');
        if (data && !error && data.length > 0) {
          dispatch({ type: 'SET_PRODUCTS', payload: data as Product[] });
        }
      } catch (e) {
        console.error("Supabase load failed, falling back to local data", e);
      } finally {
        setIsInitialLoading(false);
      }
    };
    fetchProducts();
  }, []);

  const cartSubtotal = useMemo(() => state.cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0), [state.cart]);
  const synergyDiscount = useMemo(() => state.cart.length >= 2 ? 50 : 0, [state.cart]);
  const cartTotal = useMemo(() => {
    let total = cartSubtotal - synergyDiscount;
    if (state.negotiatedDiscount > 0) {
      total = total * ((100 - state.negotiatedDiscount) / 100);
    }
    return Math.max(0, Math.round(total));
  }, [cartSubtotal, synergyDiscount, state.negotiatedDiscount]);

  const addToCart = useCallback((product: Product) => dispatch({ type: 'ADD_TO_CART', payload: product }), []);
  const addToCartWithQuantity = useCallback((productId: string, quantity: number) => {
    const product = state.allProducts.find(p => p.id === productId);
    if (product) dispatch({ type: 'ADD_TO_CART_QUANTITY', payload: { product, quantity } });
  }, [state.allProducts]);

  const removeFromCart = useCallback((productId: string) => dispatch({ type: 'REMOVE_FROM_CART', payload: productId }), []);
  const updateQuantity = useCallback((productId: string, quantity: number) => dispatch({ type: 'UPDATE_QUANTITY', payload: { id: productId, quantity } }), []);
  const toggleCart = useCallback(() => dispatch({ type: 'TOGGLE_CART' }), []);
  const openCart = useCallback(() => dispatch({ type: 'OPEN_CART' }), []);
  const toggleSearch = useCallback(() => dispatch({ type: 'TOGGLE_SEARCH' }), []);
  const filterByCategory = useCallback((category: string) => {
    setActiveVibe(null);
    dispatch({ type: 'FILTER_BY_CATEGORY', payload: category });
  }, []);
  const searchProducts = useCallback((query: string) => dispatch({ type: 'SEARCH_PRODUCTS', payload: query }), []);
  
  const updateProductFilter = useCallback((filter: { category?: string; tag?: string; query?: string; productIds?: string[] }) => {
    if (filter.query) setActiveVibe(filter.query);
    else if (filter.productIds && filter.productIds.length > 0) setActiveVibe('curated selection');
    dispatch({ type: 'UPDATE_PRODUCT_FILTER', payload: filter });
  }, []);

  const setSortOrder = useCallback((order: SortOrder) => dispatch({ type: 'SET_SORT_ORDER', payload: order }), []);
  const applyNegotiatedDiscount = useCallback((code: string, percent: number) => dispatch({ type: 'APPLY_DISCOUNT', payload: { couponCode: code, discountPercent: percent } }), []);
  const setMood = useCallback((mood: UserMood) => dispatch({ type: 'SET_MOOD', payload: mood }), []);
  const clearCart = useCallback(() => dispatch({ type: 'CLEAR_CART' }), []);
  const clearLastAdded = useCallback(() => dispatch({ type: 'CLEAR_LAST_ADDED' }), []);
  
  const addToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Date.now().toString();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  }, []);
  
  const removeToast = useCallback((id: string) => setToasts(prev => prev.filter(t => t.id !== id)), []);
  const resetArchive = useCallback(() => {
    setActiveVibe(null);
    dispatch({ type: 'FILTER_BY_CATEGORY', payload: 'All' });
  }, []);

  // Use Local Vector Search via Supabase RPC
  const searchERP = useCallback(async (query: string) => {
    try {
      const results = await searchInERP(query);
      return Array.isArray(results) ? results : [];
    } catch (e) {
      console.warn("Local Vector Search failed. Returning empty archive.");
      return [];
    }
  }, []);

  const syncERPProducts = useCallback(async () => {
    setIsSyncingERP(true);
    try {
      const products = await fetchERPProducts();
      if (products) {
        dispatch({ type: 'SET_PRODUCTS', payload: products as Product[] });
        addToast('Archive synchronization verified.', 'success');
      }
    } catch (e) {
      addToast('Sync protocol interrupted.', 'error');
    } finally {
      setIsSyncingERP(false);
    }
  }, [addToast]);

  const createERPProduct = useCallback(async (product: Partial<Product>) => {
    setIsSyncingERP(true);
    try {
      const result = await createInERP(product);
      if (result.success) {
        addToast(`Product ${product.name} archived and vectorized.`, 'success');
        await syncERPProducts();
      } else {
        addToast(`Archival failed: ${result.error}`, 'error');
      }
    } catch (e) {
      addToast('Documenting interrupted.', 'error');
    } finally {
      setIsSyncingERP(false);
    }
  }, [addToast, syncERPProducts]);

  const logClerkInteraction = useCallback(async (log: Partial<ClerkLog>) => {
    try {
      const dbPayload = {
        user_id: log.user_id || null,
        user_offer: log.discount_offered || 0,
        clerk_response: log.clerk_response || "Audit",
        status: log.negotiation_successful ? 'accepted' : 'pending',
        sentiment: log.clerk_sentiment || 'neutral',
        cart_snapshot: log.cart_snapshot,
        checkout_details: log.checkout_details,
        shipping_address: log.shipping_address ? (typeof log.shipping_address === 'string' ? log.shipping_address : JSON.stringify(log.shipping_address)) : null,
        metadata: {
          user_email: log.user_email,
          user_message: log.user_message,
          discount_percent: log.discount_offered,
          ...(log.metadata || {})
        },
        created_at: new Date().toISOString()
      };
      await supabase.from('clerk_logs').insert([dbPayload]);
    } catch (e) {
      console.error("Audit logging failure:", e);
    }
  }, []);

  const fetchUserOrders = useCallback(async (userId: string) => {
    try {
      // Fetch checkouts with their items
      const { data: checkouts, error: checkoutsError } = await supabase
        .from('checkouts')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      
      if (checkoutsError) {
        console.error('Failed to fetch orders:', checkoutsError);
        return [];
      }
      
      if (!checkouts || checkouts.length === 0) {
        return [];
      }
      
      // Fetch items for all orders
      const orderIds = checkouts.map(c => c.id);
      const { data: items, error: itemsError } = await supabase
        .from('checkout_items')
        .select('*')
        .in('order_id', orderIds);
      
      if (itemsError) {
        console.error('Failed to fetch order items:', itemsError);
      }
      
      // Group items by order_id
      const itemsByOrderId: Record<string, any[]> = {};
      (items || []).forEach(item => {
        if (!itemsByOrderId[item.order_id]) {
          itemsByOrderId[item.order_id] = [];
        }
        itemsByOrderId[item.order_id].push({
          id: item.item_id,
          name: item.name,
          price: parseFloat(item.price || '0'),
          quantity: 1, // Assuming quantity is 1 per item
          image_url: item.image_url || ''
        });
      });
      
      // Combine checkouts with their items
      const orders: OrderRecord[] = checkouts.map(checkout => ({
        id: checkout.id.toString(),
        created_at: checkout.created_at,
        user_id: checkout.user_id,
        total_amount: parseFloat(checkout.total_amount || checkout.amount || '0'),
        status: checkout.status || 'pending',
        items: itemsByOrderId[checkout.id] || []
      }));
      
      return orders;
    } catch (e) {
      console.error('Error fetching user orders:', e);
      return [];
    }
  }, []);

  const fetchUserReviews = useCallback(async (userId: string) => {
    try {
      // Fetch reviews for this user
      const { data: reviewsData, error } = await supabase
        .from('reviews')
        .select('*')
        .eq('user_id', userId)
        .order('date', { ascending: false });
      
      if (error) {
        console.error('Failed to fetch reviews:', error);
        return [];
      }
      
      if (!reviewsData || reviewsData.length === 0) {
        return [];
      }
      
      // Get product IDs to fetch product details
      const productIds = reviewsData.map(r => r.product_id).filter(Boolean);
      
      if (productIds.length === 0) {
        return reviewsData;
      }
      
      // Fetch product details
      const { data: productsData } = await supabase
        .from('products')
        .select('id, name, image_url')
        .in('id', productIds);
      
      // Create a map of products
      const productsMap = new Map();
      (productsData || []).forEach(p => {
        productsMap.set(p.id, p);
      });
      
      // Combine reviews with product data
      const reviews = reviewsData.map(review => ({
        ...review,
        product: productsMap.get(review.product_id) || null
      }));
      
      return reviews;
    } catch (e) {
      console.error('Error fetching user reviews:', e);
      return [];
    }
  }, []);

  const toggleTheme = useCallback(() => dispatch({ type: 'TOGGLE_THEME' }), []);

  const value = {
    ...state, cartSubtotal, cartTotal, synergyDiscount, activeVibe, isCurating, isInitialLoading, toasts, quickViewProduct, isSyncingERP,
    addToCart, addToCartWithQuantity, removeFromCart, updateQuantity, toggleCart, openCart, toggleSearch,
    filterByCategory, searchProducts, updateProductFilter, setSortOrder, applyNegotiatedDiscount, setMood,
    clearCart, clearLastAdded, setQuickViewProduct, addToast, removeToast, resetArchive,
    searchERP, syncERPProducts, createERPProduct, logClerkInteraction, fetchUserOrders, fetchUserReviews, toggleTheme
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
};

export const useStore = () => {
  const context = useContext(StoreContext);
  if (context === undefined) throw new Error('useStore must be used within a StoreProvider');
  return context;
};
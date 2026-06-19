
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AppShell } from '@/components/app-shell';
import { Dashboard } from '@/components/dashboard';
import { Routes, Route, Link, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Package,
  MessageSquare,
  Settings,
  Menu,
  X,
  Search,
  RefreshCw,
  Plus,
  DollarSign,
  ChevronRight,
  ExternalLink,
  Target,
  Layers,
  Star,
  ShoppingBag,
  Trash2,
  Edit3,
  ChevronLeft,
  ChevronDown,
  AlertTriangle,
  ArrowRight,
  TrendingUp,
  Check,
  Cpu,
  Tag,
  Users,
  Upload,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useStore } from '../context/StoreContext';
import { useTheme } from '../context/ThemeContext';
import { supabase } from '../lib/supabase';
import { adminApi, AdminStats, AdminProduct, AdminReview, AdminOrder, AdminNegotiation, AdminCoupon, AdminCustomer } from '../lib/adminApi';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';

// ─────────────────────────────────────────────────────────
// Shared UI
// ─────────────────────────────────────────────────────────

const StatCard: React.FC<{
  title: string; value: string | number; change?: string; icon: React.ReactNode; loading?: boolean;
}> = ({ title, value, change, icon, loading }) => (
  <div className="bg-white/50 dark:bg-white/[0.04] backdrop-blur-xl border border-black/5 dark:border-white/10 p-6 space-y-4 animate-in fade-in duration-700">
    <div className="flex justify-between items-start">
      <div className="p-2 bg-black dark:bg-white text-white dark:text-black">{icon}</div>
      {change && <span className="text-[10px] font-black text-green-600 dark:text-green-400 uppercase tracking-widest">{change}</span>}
    </div>
    <div>
      <p className="text-[10px] uppercase tracking-[0.4em] text-gray-400 dark:text-gray-500 font-bold mb-1">{title}</p>
      {loading ? (
        <div className="h-8 w-24 bg-black/5 dark:bg-white/5 animate-pulse" />
      ) : (
        <h3 className="text-2xl font-sans font-black tabular-nums dark:text-white">{value}</h3>
      )}
    </div>
  </div>
);

const Pagination: React.FC<{
  page: number; total: number; pageSize: number; onChange: (p: number) => void;
}> = ({ page, total, pageSize, onChange }) => {
  const pages = Math.ceil(total / pageSize);
  if (pages <= 1) return null;
  return (
    <div className="flex items-center gap-4 pt-8 border-t border-black/5 dark:border-white/5">
      <button
        onClick={() => onChange(page - 1)}
        disabled={page <= 1}
        className="p-2 border border-black/10 dark:border-white/10 dark:text-white disabled:opacity-30 hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-all"
      >
        <ChevronLeft size={14} />
      </button>
      <span className="text-[10px] uppercase tracking-widest font-black dark:text-white">
        Page {page} of {pages} — {total} total
      </span>
      <button
        onClick={() => onChange(page + 1)}
        disabled={page >= pages}
        className="p-2 border border-black/10 dark:border-white/10 dark:text-white disabled:opacity-30 hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-all"
      >
        <ChevronRight size={14} />
      </button>
    </div>
  );
};

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const colors: Record<string, string> = {
    completed: 'bg-green-100 text-green-700',
    pending: 'bg-yellow-100 text-yellow-700',
    payment_failed: 'bg-red-100 text-red-700',
    refunded: 'bg-blue-100 text-blue-700',
    cancelled: 'bg-gray-100 text-gray-500',
    accepted: 'bg-green-100 text-green-700',
    rejected: 'bg-red-100 text-red-700',
  };
  return (
    <span className={`text-[8px] uppercase tracking-widest font-black px-3 py-1 ${colors[status] || 'bg-black text-white'}`}>
      {status.replace('_', ' ')}
    </span>
  );
};

// ─────────────────────────────────────────────────────────
// Dashboard
// ─────────────────────────────────────────────────────────

const AdminDashboard: React.FC = () => {
  const [apiStats, setApiStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchStats = useCallback(() => {
    setLoading(true);
    adminApi.stats.get()
      .then(data => { setApiStats(data); setLastUpdated(new Date()); setError(null); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, [fetchStats]);

  const statsItems = apiStats ? [
    { label: 'Revenue', value: `$${apiStats.totalRevenue.toLocaleString()}`, delta: 0 },
    { label: 'Orders', value: String(apiStats.totalOrders), delta: 0 },
    { label: 'Products', value: String(apiStats.totalProducts), delta: 0 },
    { label: 'Reviews', value: String(apiStats.totalReviews), delta: 0 },
  ] : undefined;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString()}` : ' '}
        </p>
        <button
          onClick={fetchStats}
          disabled={loading}
          className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-3 border border-red-200 bg-red-50 p-3 text-red-700">
          <AlertTriangle size={14} />
          <span className="text-xs">{error}</span>
        </div>
      )}

      <Dashboard statsItems={statsItems} statsLoading={loading} />

      {/* Recent Orders */}
      <div className="border bg-background">
        <div className="p-6 border-b">
          <p className="text-sm font-medium">Recent Orders</p>
        </div>
        {loading ? (
          <div className="p-6 space-y-3">
            {[...Array(4)].map((_, i) => <div key={i} className="h-10 bg-muted animate-pulse" />)}
          </div>
        ) : (
          <table className="w-full text-left">
            <thead>
              <tr className="border-b">
                {['Order ID', 'Customer', 'Amount', 'Status', 'Date'].map(h => (
                  <th key={h} className="px-6 py-3 text-[10px] uppercase tracking-widest font-bold text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {(apiStats?.recentOrders || []).map(o => (
                <tr key={o.id} className="hover:bg-muted/40 transition-colors">
                  <td className="px-6 py-4 text-xs font-mono">#{String(o.id).slice(0, 8)}</td>
                  <td className="px-6 py-4 text-xs">{o.customerName}</td>
                  <td className="px-6 py-4 text-sm font-semibold">${o.totalAmount.toLocaleString()}</td>
                  <td className="px-6 py-4"><StatusBadge status={o.status} /></td>
                  <td className="px-6 py-4 text-xs text-muted-foreground">{new Date(o.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
              {!apiStats?.recentOrders?.length && (
                <tr><td colSpan={5} className="px-6 py-10 text-center text-xs text-muted-foreground">No orders yet</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────
// Inventory (server-side paginated)
// ─────────────────────────────────────────────────────────

const CATEGORIES = ['Watches', 'Rings', 'Necklaces', 'Bracelets', 'Earrings', 'Diamonds', 'Basics', 'Outerwear', 'Accessories', 'Apparel', 'Footwear', 'Jewelry', 'Home'];

const AdminInventory: React.FC = () => {
  const { addToast } = useStore();
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [sortField, setSortField] = useState<'name' | 'price' | 'created_at'>('created_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<AdminProduct | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState<Partial<AdminProduct>>({
    name: '', category: 'Basics', price: 0, bottom_price: 0, description: '', tags: [],
    variants: { sizes: [], colors: [] }, stock_quantity: 0,
  });
  const [imageUploading, setImageUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = async (file: File) => {
    setImageUploading(true);
    try {
      const ext = file.name.split('.').pop() || 'jpg';
      const path = `products/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error: uploadError } = await supabase.storage.from('product-images').upload(path, file);
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from('product-images').getPublicUrl(path);
      setFormData(prev => ({ ...prev, image_url: publicUrl }));
      addToast('Image archived.', 'success');
    } catch (e: any) {
      addToast(`Upload failed: ${e.message}`, 'error');
    } finally {
      setImageUploading(false);
    }
  };

  const PAGE_SIZE = 20;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminApi.products.list({ page, pageSize: PAGE_SIZE, search, category, sort: sortField, order: sortOrder });
      setProducts(res.data);
      setTotal(res.count);
    } catch (e: any) {
      addToast(e.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [page, search, category, sortField, sortOrder, addToast]);

  const toggleSort = (field: 'name' | 'price' | 'created_at') => {
    if (sortField === field) {
      setSortOrder(o => o === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
    setPage(1);
  };

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setEditingProduct(null);
    setFormData({ name: '', category: 'Basics', price: 0, bottom_price: 0, description: '', tags: [], variants: { sizes: [], colors: [] }, stock_quantity: 0 });
    setIsModalOpen(true);
  };

  const openEdit = (p: AdminProduct) => {
    setEditingProduct(p);
    setFormData({ name: p.name, category: p.category, price: p.price, bottom_price: p.bottom_price, description: p.description, tags: p.tags, image_url: p.image_url, variants: p.variants || { sizes: [], colors: [] }, stock_quantity: p.stock_quantity ?? 0 });
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name?.trim()) { addToast('Product name is required.', 'error'); return; }
    if ((formData.price ?? 0) <= 0) { addToast('Price must be greater than 0.', 'error'); return; }
    if ((formData.bottom_price ?? 0) > (formData.price ?? 0)) { addToast('Floor price cannot exceed price.', 'error'); return; }
    setSaving(true);
    try {
      if (editingProduct) {
        await adminApi.products.update(editingProduct.id, formData);
        addToast('Product updated.', 'success');
      } else {
        await adminApi.products.create(formData);
        addToast('Product created.', 'success');
      }
      setIsModalOpen(false);
      load();
    } catch (e: any) {
      addToast(e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await adminApi.products.delete(id);
      addToast('Product deleted.', 'success');
      setConfirmDeleteId(null);
      load();
    } catch (e: any) {
      addToast(e.message, 'error');
    }
  };

  const [backfilling, setBackfilling] = useState(false);

  const handleBackfillEmbeddings = async () => {
    setBackfilling(true);
    try {
      const res = await adminApi.embeddings.backfill();
      addToast(res.message, 'success');
    } catch (e: any) {
      addToast(e.message, 'error');
    } finally {
      setBackfilling(false);
    }
  };

  const SortIcon = ({ field }: { field: 'name' | 'price' | 'created_at' }) => (
    sortField === field
      ? <span className="ml-1 opacity-70">{sortOrder === 'asc' ? '↑' : '↓'}</span>
      : <span className="ml-1 opacity-20">↕</span>
  );

  return (
    <div className="space-y-12 page-reveal">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-black dark:border-white/20 pb-10">
        <div>
          <p className="text-[10px] uppercase tracking-[0.6em] text-gray-400 font-bold mb-4">Backend-Managed</p>
          <h1 className="text-4xl md:text-6xl font-sans font-bold uppercase tracking-tighter dark:text-white">Inventory</h1>
        </div>
        <div className="flex gap-3 flex-wrap">
          <button onClick={handleBackfillEmbeddings} disabled={backfilling} className="flex items-center gap-2 border border-black/30 dark:border-white/20 dark:text-white px-4 py-3 text-[10px] uppercase tracking-[0.3em] font-black hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-all disabled:opacity-40">
            <Cpu size={12} className={backfilling ? 'animate-pulse' : ''} /> {backfilling ? 'Embedding...' : 'Regen Embeddings'}
          </button>
          <button onClick={load} className="flex items-center gap-2 border border-black dark:border-white/30 dark:text-white px-4 py-3 text-[10px] uppercase tracking-[0.3em] font-black hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-all">
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
          <button onClick={openCreate} className="flex items-center gap-2 bg-black dark:bg-white text-white dark:text-black px-6 py-3 text-[10px] uppercase tracking-[0.3em] font-black hover:opacity-80 transition-all">
            <Plus size={12} /> Add Product
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex items-center gap-3 border border-black/10 dark:border-white/10 px-4 py-3 flex-1 bg-white/50 dark:bg-white/[0.04]">
          <Search size={14} className="text-gray-400" />
          <input
            type="text"
            placeholder="SEARCH PRODUCTS..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            className="bg-transparent outline-none text-[10px] uppercase tracking-widest font-black flex-1 placeholder:text-gray-300 dark:text-white dark:placeholder:text-gray-600"
          />
        </div>
        <select
          value={category}
          onChange={e => { setCategory(e.target.value); setPage(1); }}
          className="border border-black/10 dark:border-white/10 px-4 py-3 text-[10px] uppercase tracking-widest font-black bg-white/50 dark:bg-[#111] dark:text-white outline-none"
        >
          <option value="">All Categories</option>
          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-black/10 dark:border-white/10">
              <th className="py-5 pr-4 text-[10px] uppercase tracking-[0.3em] font-black text-gray-400">Image</th>
              <th className="py-5 pr-4 text-[10px] uppercase tracking-[0.3em] font-black text-gray-400 cursor-pointer hover:text-black dark:hover:text-white" onClick={() => toggleSort('name')}>
                Name <SortIcon field="name" />
              </th>
              <th className="py-5 pr-4 text-[10px] uppercase tracking-[0.3em] font-black text-gray-400 cursor-pointer hover:text-black dark:hover:text-white" onClick={() => toggleSort('price')}>
                Price <SortIcon field="price" />
              </th>
              <th className="py-5 pr-4 text-[10px] uppercase tracking-[0.3em] font-black text-gray-400">Floor</th>
              <th className="py-5 pr-4 text-[10px] uppercase tracking-[0.3em] font-black text-gray-400">Stock</th>
              <th className="py-5 pr-4 text-[10px] uppercase tracking-[0.3em] font-black text-gray-400">Category</th>
              <th className="py-5 pr-4 text-[10px] uppercase tracking-[0.3em] font-black text-gray-400 cursor-pointer hover:text-black dark:hover:text-white" onClick={() => toggleSort('created_at')}>
                Added <SortIcon field="created_at" />
              </th>
              <th className="py-5 pr-4 text-[10px] uppercase tracking-[0.3em] font-black text-gray-400">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/5 dark:divide-white/5">
            {loading ? (
              [...Array(5)].map((_, i) => (
                <tr key={i}><td colSpan={8} className="py-4"><div className="h-12 bg-black/5 dark:bg-white/5 animate-pulse" /></td></tr>
              ))
            ) : products.map(p => (
              <tr key={p.id} className="group hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors">
                <td className="py-4 pr-4">
                  <div className="w-12 h-16 bg-gray-100 dark:bg-white/5 overflow-hidden border border-black/5 dark:border-white/5">
                    {p.image_url && <img src={p.image_url} alt="" className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all" />}
                  </div>
                </td>
                <td className="py-4 pr-4">
                  <p className="text-xs font-bold uppercase tracking-widest dark:text-white">{p.name}</p>
                  <p className="text-[9px] text-gray-400 mt-1">ID: {p.id.slice(0, 8)}</p>
                </td>
                <td className="py-4 pr-4 text-sm font-black dark:text-white">${p.price.toLocaleString()}</td>
                <td className="py-4 pr-4 text-sm font-black text-gray-400">${p.bottom_price.toLocaleString()}</td>
                <td className="py-4 pr-4">
                  {p.stock_quantity != null ? (
                    <span className={`text-[10px] font-black uppercase tracking-widest ${p.stock_quantity <= (p.low_stock_threshold ?? 5) ? 'text-red-500' : 'dark:text-white'}`}>
                      {p.stock_quantity}
                      {p.stock_quantity <= (p.low_stock_threshold ?? 5) && <span className="ml-1 text-[8px]">LOW</span>}
                    </span>
                  ) : <span className="text-gray-300">—</span>}
                </td>
                <td className="py-4 pr-4 text-[10px] uppercase tracking-widest font-bold dark:text-gray-300">{p.category}</td>
                <td className="py-4 pr-4 text-[10px] text-gray-400">{new Date(p.created_at).toLocaleDateString()}</td>
                <td className="py-4 pr-4">
                  <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => openEdit(p)} className="p-2 border border-black/10 dark:border-white/10 dark:text-white hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-all">
                      <Edit3 size={12} />
                    </button>
                    {confirmDeleteId === p.id ? (
                      <button
                        onClick={() => handleDelete(p.id)}
                        className="px-3 py-1.5 bg-red-500 text-white text-[8px] uppercase tracking-widest font-black"
                      >
                        Confirm?
                      </button>
                    ) : (
                      <button
                        onClick={() => setConfirmDeleteId(p.id)}
                        className="p-2 border border-red-200 text-red-500 hover:bg-red-500 hover:text-white transition-all"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {!loading && products.length === 0 && (
              <tr><td colSpan={8} className="py-20 text-center text-[10px] text-gray-400 uppercase tracking-widest">No products found</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Pagination page={page} total={total} pageSize={PAGE_SIZE} onChange={setPage} />

      {/* Create/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-8">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={() => setIsModalOpen(false)} />
          <div className="relative bg-white dark:bg-[#111] w-full max-w-2xl p-12 border border-black dark:border-white/20 animate-in zoom-in-95 duration-500 max-h-[90vh] overflow-y-auto">
            <button onClick={() => setIsModalOpen(false)} className="absolute top-6 right-6 p-2 hover:bg-black hover:text-white dark:text-white dark:hover:bg-white dark:hover:text-black transition-all">
              <X size={16} />
            </button>
            <h2 className="text-3xl font-sans font-bold uppercase tracking-tighter mb-10 dark:text-white">
              {editingProduct ? 'Edit Product' : 'New Product'}
            </h2>
            <div className="grid grid-cols-2 gap-6 mb-8">
              {[
                { label: 'Name', key: 'name', type: 'text' },
                { label: 'Price ($)', key: 'price', type: 'number' },
                { label: 'Floor Price ($)', key: 'bottom_price', type: 'number' },
                { label: 'Stock Qty', key: 'stock_quantity', type: 'number' },
              ].map(({ label, key, type }) => (
                <div key={key} className="space-y-2">
                  <label className="block text-[10px] uppercase tracking-[0.4em] font-black dark:text-white">{label}</label>
                  <input
                    type={type}
                    value={(formData as any)[key] ?? ''}
                    onChange={e => setFormData({ ...formData, [key]: type === 'number' ? Number(e.target.value) : e.target.value })}
                    className="w-full border-b border-black dark:border-white/30 py-3 text-xs uppercase tracking-widest outline-none bg-transparent dark:text-white"
                  />
                </div>
              ))}
              <div className="space-y-2">
                <label className="block text-[10px] uppercase tracking-[0.4em] font-black dark:text-white">Category</label>
                <select
                  value={formData.category}
                  onChange={e => setFormData({ ...formData, category: e.target.value })}
                  className="w-full border-b border-black dark:border-white/30 py-3 text-xs uppercase tracking-widest outline-none bg-transparent dark:text-white dark:bg-[#111]"
                >
                  {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <label className="block text-[10px] uppercase tracking-[0.4em] font-black dark:text-white">Tags (comma-separated)</label>
                <input
                  type="text"
                  value={Array.isArray(formData.tags) ? formData.tags.join(', ') : ''}
                  onChange={e => setFormData({ ...formData, tags: e.target.value.split(',').map(t => t.trim()).filter(Boolean) })}
                  className="w-full border-b border-black dark:border-white/30 py-3 text-xs uppercase tracking-widest outline-none bg-transparent dark:text-white"
                />
              </div>
              <div className="space-y-2">
                <label className="block text-[10px] uppercase tracking-[0.4em] font-black dark:text-white">Sizes (comma-separated)</label>
                <input
                  type="text"
                  placeholder="XS, S, M, L, XL"
                  value={(formData.variants?.sizes || []).join(', ')}
                  onChange={e => setFormData({ ...formData, variants: { ...formData.variants, sizes: e.target.value.split(',').map(s => s.trim()).filter(Boolean) } })}
                  className="w-full border-b border-black dark:border-white/30 py-3 text-xs uppercase tracking-widest outline-none bg-transparent dark:text-white"
                />
              </div>
              <div className="space-y-2">
                <label className="block text-[10px] uppercase tracking-[0.4em] font-black dark:text-white">Colorways (comma-separated)</label>
                <input
                  type="text"
                  placeholder="Black, White, Navy"
                  value={(formData.variants?.colors || []).join(', ')}
                  onChange={e => setFormData({ ...formData, variants: { ...formData.variants, colors: e.target.value.split(',').map(c => c.trim()).filter(Boolean) } })}
                  className="w-full border-b border-black dark:border-white/30 py-3 text-xs uppercase tracking-widest outline-none bg-transparent dark:text-white"
                />
              </div>
            </div>

            {/* Image upload */}
            <div className="space-y-3 mb-8">
              <label className="block text-[10px] uppercase tracking-[0.4em] font-black dark:text-white">Product Image</label>
              <div className="flex items-start gap-4">
                {formData.image_url && (
                  <div className="w-20 h-24 bg-gray-50 dark:bg-white/5 overflow-hidden border border-black/10 dark:border-white/10 shrink-0">
                    <img src={formData.image_url} alt="" className="w-full h-full object-cover" />
                  </div>
                )}
                <div className="flex-1 space-y-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleImageUpload(f); }}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={imageUploading}
                    className="flex items-center gap-2 border border-black dark:border-white/30 dark:text-white px-4 py-2 text-[9px] uppercase tracking-[0.3em] font-black hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-all disabled:opacity-50"
                  >
                    <Upload size={10} />
                    {imageUploading ? 'Uploading...' : 'Upload Image'}
                  </button>
                  <input
                    type="text"
                    placeholder="OR PASTE IMAGE URL"
                    value={formData.image_url || ''}
                    onChange={e => setFormData({ ...formData, image_url: e.target.value })}
                    className="w-full border-b border-black/20 dark:border-white/20 py-2 text-[9px] uppercase tracking-widest outline-none bg-transparent placeholder:text-gray-300 dark:text-white"
                  />
                </div>
              </div>
            </div>
            <div className="space-y-2 mb-10">
              <label className="block text-[10px] uppercase tracking-[0.4em] font-black dark:text-white">Description</label>
              <textarea
                value={formData.description || ''}
                onChange={e => setFormData({ ...formData, description: e.target.value })}
                rows={3}
                className="w-full border border-black/10 dark:border-white/10 p-4 text-xs tracking-wide outline-none bg-transparent resize-none dark:text-white"
              />
            </div>
            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full bg-black dark:bg-white text-white dark:text-black py-5 text-[10px] uppercase tracking-[0.6em] font-black active:scale-95 transition-all disabled:opacity-60"
            >
              {saving ? 'Saving...' : editingProduct ? 'Save Changes' : 'Create Product'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────
// Reviews
// ─────────────────────────────────────────────────────────

const AdminReviews: React.FC = () => {
  const { addToast } = useStore();
  const [reviews, setReviews] = useState<AdminReview[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [minRating, setMinRating] = useState(1);
  const [maxRating, setMaxRating] = useState(5);
  const [loading, setLoading] = useState(true);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const PAGE_SIZE = 20;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminApi.reviews.list({ page, pageSize: PAGE_SIZE, minRating, maxRating });
      setReviews(res.data);
      setTotal(res.count);
    } catch (e: any) {
      addToast(e.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [page, minRating, maxRating, addToast]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (id: string) => {
    try {
      await adminApi.reviews.delete(id);
      addToast('Review deleted.', 'success');
      setConfirmDeleteId(null);
      load();
    } catch (e: any) {
      addToast(e.message, 'error');
    }
  };

  const ratingPercent = (rating: number) => (rating / 5) * 100;

  return (
    <div className="space-y-12 page-reveal">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-black dark:border-white/20 pb-10">
        <div>
          <p className="text-[10px] uppercase tracking-[0.6em] text-gray-400 font-bold mb-4">Customer Feedback</p>
          <h1 className="text-4xl md:text-6xl font-sans font-bold uppercase tracking-tighter dark:text-white">Reviews</h1>
        </div>
        <button onClick={load} className="flex items-center gap-2 border border-black dark:border-white/30 dark:text-white px-4 py-3 text-[10px] uppercase tracking-[0.3em] font-black hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-all self-start md:self-auto">
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-8 bg-white/50 dark:bg-white/[0.04] border border-black/5 dark:border-white/10 p-6">
        <span className="text-[10px] uppercase tracking-[0.4em] font-black text-gray-400">Rating Filter</span>
        <div className="flex items-center gap-4">
          {[1, 2, 3, 4, 5].map(r => (
            <button
              key={r}
              onClick={() => {
                if (minRating === r && maxRating === r) { setMinRating(1); setMaxRating(5); }
                else { setMinRating(r); setMaxRating(r); }
                setPage(1);
              }}
              className={`flex items-center gap-1 px-3 py-2 text-[10px] font-black uppercase tracking-widest border transition-all ${minRating <= r && maxRating >= r ? 'bg-black text-white border-black dark:bg-white dark:text-black dark:border-white' : 'border-black/10 dark:border-white/20 dark:text-white hover:border-black dark:hover:border-white'}`}
            >
              <Star size={10} fill={minRating <= r && maxRating >= r ? 'currentColor' : 'none'} />
              {r}
            </button>
          ))}
        </div>
        <span className="text-[10px] text-gray-400 ml-auto">{total} reviews</span>
      </div>

      {/* Reviews list */}
      <div className="space-y-6">
        {loading ? (
          [...Array(4)].map((_, i) => <div key={i} className="h-32 bg-black/5 dark:bg-white/5 animate-pulse" />)
        ) : reviews.map(review => (
          <div key={review.id} className="group bg-white/50 dark:bg-white/[0.04] backdrop-blur-md border border-black/5 dark:border-white/10 p-6 flex gap-6 animate-in fade-in duration-500">
            {/* Product thumbnail */}
            <div className="w-16 h-20 bg-gray-100 dark:bg-white/5 shrink-0 overflow-hidden border border-black/5 dark:border-white/5">
              {review.products?.image_url && (
                <img src={review.products.image_url} alt="" className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all" />
              )}
            </div>

            <div className="flex-1 space-y-3">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-widest dark:text-white">{review.author}</p>
                  <p className="text-[9px] text-gray-400 uppercase tracking-widest mt-1">
                    {review.products?.name || 'Unknown Product'} · {review.date}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map(s => (
                      <Star key={s} size={10} className={s <= review.rating ? 'text-black dark:text-white fill-current' : 'text-gray-200 fill-gray-200'} />
                    ))}
                  </div>
                  {confirmDeleteId === review.id ? (
                    <button
                      onClick={() => handleDelete(review.id)}
                      className="px-3 py-1.5 bg-red-500 text-white text-[8px] uppercase tracking-widest font-black"
                    >
                      Confirm?
                    </button>
                  ) : (
                    <button
                      onClick={() => setConfirmDeleteId(review.id)}
                      className="p-2 border border-red-200 text-red-400 hover:bg-red-500 hover:text-white hover:border-red-500 transition-all opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              </div>

              <p className="text-sm text-gray-600 dark:text-gray-300 font-light leading-relaxed italic">"{review.text}"</p>

              <div className="flex items-center gap-4 pt-2">
                <div className="flex-1 h-[2px] bg-gray-100 dark:bg-white/10">
                  <div className="h-full bg-black dark:bg-white transition-all duration-700" style={{ width: `${ratingPercent(review.rating)}%` }} />
                </div>
                <span className="text-[9px] font-black text-gray-400">{review.rating}/5</span>
              </div>
            </div>
          </div>
        ))}

        {!loading && reviews.length === 0 && (
          <div className="py-24 text-center border border-dashed border-black/10 dark:border-white/10">
            <p className="text-[10px] uppercase tracking-widest text-gray-300 font-bold">No reviews match this filter.</p>
          </div>
        )}
      </div>

      <Pagination page={page} total={total} pageSize={PAGE_SIZE} onChange={setPage} />
    </div>
  );
};

// ─────────────────────────────────────────────────────────
// Orders
// ─────────────────────────────────────────────────────────

const AdminOrders: React.FC = () => {
  const { addToast } = useStore();
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const PAGE_SIZE = 20;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminApi.orders.list({ page, pageSize: PAGE_SIZE, status: statusFilter });
      setOrders(res.data);
      setTotal(res.count);
    } catch (e: any) {
      addToast(e.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, addToast]);

  useEffect(() => { load(); }, [load]);

  const handleStatusChange = async (orderId: string, newStatus: string) => {
    try {
      await adminApi.orders.updateStatus(orderId, newStatus);
      addToast(`Order updated to ${newStatus}.`, 'success');
      load();
    } catch (e: any) {
      addToast(e.message, 'error');
    }
  };

  const statuses = ['pending', 'completed', 'payment_failed', 'refunded', 'cancelled'];

  return (
    <div className="space-y-12 page-reveal">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-black dark:border-white/20 pb-10">
        <div>
          <p className="text-[10px] uppercase tracking-[0.6em] text-gray-400 font-bold mb-4">Transaction Log</p>
          <h1 className="text-4xl md:text-6xl font-sans font-bold uppercase tracking-tighter dark:text-white">Orders</h1>
        </div>
        <button onClick={load} className="flex items-center gap-2 border border-black dark:border-white/30 dark:text-white px-4 py-3 text-[10px] uppercase tracking-[0.3em] font-black hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-all self-start md:self-auto">
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {/* Status filter */}
      <div className="flex flex-wrap gap-2">
        {['', ...statuses].map(s => (
          <button
            key={s || 'all'}
            onClick={() => { setStatusFilter(s); setPage(1); }}
            className={`px-4 py-2 text-[10px] uppercase tracking-widest font-black border transition-all ${statusFilter === s ? 'bg-black text-white border-black dark:bg-white dark:text-black dark:border-white' : 'border-black/10 dark:border-white/20 dark:text-white hover:border-black dark:hover:border-white'}`}
          >
            {s || 'All'}
          </button>
        ))}
        <span className="ml-auto text-[10px] text-gray-400 self-center">{total} orders</span>
      </div>

      {/* Orders table */}
      <div className="space-y-3">
        {loading ? (
          [...Array(5)].map((_, i) => <div key={i} className="h-16 bg-black/5 dark:bg-white/5 animate-pulse" />)
        ) : orders.map(order => {
          const customer = order.profiles
            ? `${order.profiles.first_name || ''} ${order.profiles.last_name || ''}`.trim() || order.profiles.email || 'Guest'
            : 'Guest';
          const isExpanded = expandedId === order.id;

          return (
            <div key={order.id} className="bg-white/50 dark:bg-white/[0.04] backdrop-blur-md border border-black/5 dark:border-white/10 animate-in fade-in duration-500">
              <div
                className="p-5 flex flex-wrap items-center gap-4 cursor-pointer hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors"
                onClick={() => setExpandedId(isExpanded ? null : order.id)}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-widest dark:text-white">#{String(order.id).slice(0, 12)}</p>
                  <p className="text-[9px] text-gray-400 mt-1 uppercase tracking-widest">{customer}</p>
                </div>
                <span className="text-sm font-black dark:text-white">${parseFloat(order.total_amount || '0').toLocaleString()}</span>
                <StatusBadge status={order.status} />
                <span className="text-[9px] text-gray-400">{new Date(order.created_at).toLocaleDateString()}</span>

                {/* Status changer */}
                <select
                  value={order.status}
                  onClick={e => e.stopPropagation()}
                  onChange={e => handleStatusChange(order.id, e.target.value)}
                  className="border border-black/10 dark:border-white/20 px-3 py-2 text-[9px] uppercase tracking-widest font-black bg-white dark:bg-[#111] dark:text-white outline-none"
                >
                  {statuses.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                </select>

                <ChevronDown size={14} className={`text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
              </div>

              {isExpanded && (
                <div className="border-t border-black/5 dark:border-white/5 p-5 space-y-3 animate-in slide-in-from-top-2 duration-300">
                  <p className="text-[10px] uppercase tracking-[0.4em] font-black text-gray-400 mb-4">Order Items</p>
                  {(order.checkout_items || []).map((item: any) => (
                    <div key={item.id} className="flex items-center gap-4 py-2 border-b border-black/5 dark:border-white/5 last:border-0">
                      <div className="w-8 h-10 bg-gray-100 dark:bg-white/5 shrink-0">
                        {item.image_url && <img src={item.image_url} alt="" className="w-full h-full object-cover grayscale" />}
                      </div>
                      <span className="text-[10px] font-bold uppercase tracking-widest flex-1 dark:text-white">{item.name}</span>
                      <span className="text-[10px] font-black dark:text-white">${parseFloat(item.price || '0').toLocaleString()}</span>
                    </div>
                  ))}
                  {order.stripe_session_id && (
                    <p className="text-[9px] text-gray-400 uppercase tracking-widest pt-2">Stripe: {order.stripe_session_id}</p>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {!loading && orders.length === 0 && (
          <div className="py-24 text-center border border-dashed border-black/10 dark:border-white/10">
            <p className="text-[10px] uppercase tracking-widest text-gray-300 font-bold">No orders found.</p>
          </div>
        )}
      </div>

      <Pagination page={page} total={total} pageSize={PAGE_SIZE} onChange={setPage} />
    </div>
  );
};

// ─────────────────────────────────────────────────────────
// Negotiations (now paginated + real data)
// ─────────────────────────────────────────────────────────

const AdminNegotiations: React.FC = () => {
  const { addToast } = useStore();
  const [logs, setLogs] = useState<AdminNegotiation[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const PAGE_SIZE = 20;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminApi.negotiations.list({ page, pageSize: PAGE_SIZE, status: statusFilter });
      setLogs(res.data);
      setTotal(res.count);
    } catch (e: any) {
      addToast(e.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, addToast]);

  useEffect(() => { load(); }, [load]);

  const acceptedCount = logs.filter(l => l.status === 'accepted').length;
  const successRate = logs.length > 0 ? Math.round((acceptedCount / logs.length) * 100) : 0;
  const avgConcession = logs.length > 0
    ? Math.round(logs.reduce((sum, l) => sum + (l.user_offer || 0), 0) / logs.length)
    : 0;

  return (
    <div className="space-y-12 page-reveal">
      <div className="border-b border-black dark:border-white/20 pb-10 flex items-end justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-[0.6em] text-gray-400 font-bold mb-4">Neural Feedback</p>
          <h1 className="text-4xl md:text-6xl font-sans font-bold uppercase tracking-tighter dark:text-white">Price Negotiations</h1>
        </div>
        <button onClick={load} className="flex items-center gap-2 border border-black dark:border-white/30 dark:text-white px-4 py-3 text-[10px] uppercase tracking-[0.3em] font-black hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-all">
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
        <StatCard title="Total Negotiations" value={total} icon={<MessageSquare size={16} />} loading={loading} />
        <StatCard title="Success Rate" value={`${successRate}%`} icon={<TrendingUp size={16} />} loading={loading} />
        <StatCard title="Avg Offer" value={`${avgConcession}%`} icon={<Target size={16} />} loading={loading} />
        <StatCard title="Accepted" value={acceptedCount} icon={<Check size={16} />} loading={loading} />
      </div>

      {/* Filter */}
      <div className="flex gap-2">
        {[['', 'All'], ['accepted', 'Accepted'], ['pending', 'Pending'], ['rejected', 'Rejected']].map(([val, label]) => (
          <button
            key={val}
            onClick={() => { setStatusFilter(val); setPage(1); }}
            className={`px-4 py-2 text-[10px] uppercase tracking-widest font-black border transition-all ${statusFilter === val ? 'bg-black text-white border-black dark:bg-white dark:text-black dark:border-white' : 'border-black/10 dark:border-white/20 dark:text-white hover:border-black dark:hover:border-white'}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="space-y-4">
        {loading ? (
          [...Array(4)].map((_, i) => <div key={i} className="h-28 bg-black/5 dark:bg-white/5 animate-pulse" />)
        ) : logs.map(log => {
          const email = log.metadata?.user_email || 'Guest';
          const message = log.metadata?.user_message || 'N/A';
          return (
            <div key={log.id} className="bg-white/40 dark:bg-white/[0.04] backdrop-blur-md border border-black/5 dark:border-white/10 p-6 flex flex-col md:flex-row gap-6 animate-in fade-in duration-500">
              <div className="w-10 h-10 bg-black dark:bg-white text-white dark:text-black flex items-center justify-center font-sans text-lg shrink-0">
                {email[0].toUpperCase()}
              </div>
              <div className="flex-1 space-y-3">
                <div className="flex justify-between items-start flex-wrap gap-2">
                  <div>
                    <p className="text-[10px] uppercase tracking-widest font-black dark:text-white">{email}</p>
                    <p className="text-[8px] uppercase tracking-widest text-gray-400 mt-1">{new Date(log.created_at).toLocaleString()}</p>
                  </div>
                  <div className="flex gap-2">
                    <StatusBadge status={log.status} />
                    {log.sentiment && <span className="text-[8px] uppercase tracking-widest font-black bg-black dark:bg-white text-white dark:text-black px-3 py-1 italic">{log.sentiment}</span>}
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-3 border-t border-black/5 dark:border-white/5">
                  <div>
                    <p className="text-[9px] uppercase tracking-widest text-gray-400 font-black mb-1">Customer Offered</p>
                    <p className="text-sm font-light italic dark:text-gray-300">"{message}"</p>
                  </div>
                  <div>
                    <p className="text-[9px] uppercase tracking-widest text-gray-400 font-black mb-1">The Clerk Responds</p>
                    <p className="text-sm font-light italic dark:text-gray-300">"{log.clerk_response}"</p>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        {!loading && logs.length === 0 && (
          <div className="py-24 text-center border border-dashed border-black/10 dark:border-white/10">
            <p className="text-[10px] uppercase tracking-widest text-gray-300 font-bold">No negotiations found.</p>
          </div>
        )}
      </div>

      <Pagination page={page} total={total} pageSize={PAGE_SIZE} onChange={setPage} />
    </div>
  );
};

// ─────────────────────────────────────────────────────────
// System Settings
// ─────────────────────────────────────────────────────────

const AdminSystemSettings: React.FC = () => {
  const [bargainingEnabled, setBargainingEnabled] = useState(true);
  const { addToast } = useStore();

  return (
    <div className="space-y-12 page-reveal">
      <div className="border-b border-black dark:border-white/20 pb-10">
        <p className="text-[10px] uppercase tracking-[0.6em] text-gray-400 font-bold mb-4">Core Protocols</p>
        <h1 className="text-4xl md:text-6xl font-sans font-bold uppercase tracking-tighter dark:text-white">System Configuration</h1>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
        <div className="bg-white/40 dark:bg-white/[0.04] backdrop-blur-xl border border-black/5 dark:border-white/10 p-10 space-y-8">
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-widest dark:text-white">Negotiation Kill Switch</h3>
              <p className="text-[10px] text-gray-400 uppercase tracking-widest">Instantly suspend all bargaining capabilities.</p>
            </div>
            <button
              onClick={() => { setBargainingEnabled(!bargainingEnabled); addToast(`Bargaining ${!bargainingEnabled ? 'activated' : 'suspended'}`, 'info'); }}
              className={`w-16 h-8 rounded-full transition-all flex items-center px-1 ${bargainingEnabled ? 'bg-black justify-end' : 'bg-gray-200 justify-start'}`}
            >
              <div className="w-6 h-6 bg-white rounded-full shadow-md" />
            </button>
          </div>
        </div>
        <div className="bg-black dark:bg-white text-white dark:text-black p-10 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center gap-4 opacity-50"><Cpu size={18} /><span className="text-[10px] uppercase tracking-widest font-black">Neural Core Status</span></div>
            <h2 className="text-3xl font-sans font-bold uppercase">Similarity Threshold</h2>
            <p className="text-[10px] uppercase tracking-widest text-gray-500 dark:text-gray-400 leading-relaxed">All synchronization engines operating within parameters.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────
// Admin Similarity Sandbox (unchanged — calls ERP proxy)
// ─────────────────────────────────────────────────────────

const AdminSimilaritySandbox: React.FC = () => {
  const { searchERP } = useStore();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setIsSearching(true);
    const data = await searchERP(query);
    setResults(data);
    setIsSearching(false);
  };

  return (
    <div className="space-y-12 page-reveal">
      <div className="border-b border-black dark:border-white/20 pb-10">
        <p className="text-[10px] uppercase tracking-[0.6em] text-gray-400 font-bold mb-4">Vector Engine</p>
        <h1 className="text-4xl md:text-6xl font-sans font-bold uppercase tracking-tighter dark:text-white">Similarity Sandbox</h1>
      </div>
      <div className="bg-white/40 dark:bg-white/[0.04] backdrop-blur-xl border border-black/5 dark:border-white/10 p-12">
        <form onSubmit={handleSearch} className="relative mb-12">
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="INPUT ARCHIVAL INTENT..."
            className="w-full bg-transparent border-b border-black dark:border-white/30 py-6 text-xl uppercase tracking-widest outline-none font-sans placeholder:text-gray-300 dark:text-white dark:placeholder:text-white/20"
          />
          <button type="submit" disabled={isSearching} className="absolute right-0 top-1/2 -translate-y-1/2 p-4 hover:opacity-50 transition-opacity disabled:opacity-20 dark:text-white">
            {isSearching ? <RefreshCw className="animate-spin" /> : <ArrowRight />}
          </button>
        </form>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {results.map((res, i) => (
            <div key={i} className="bg-white dark:bg-white/[0.06] p-6 border border-black/5 dark:border-white/10 flex items-center gap-6 animate-in slide-in-from-bottom-4" style={{ animationDelay: `${i * 100}ms` }}>
              <div className="w-16 h-20 bg-gray-100 dark:bg-white/5 shrink-0 overflow-hidden">
                <img src={res.image_url} alt="" className="w-full h-full object-cover grayscale" />
              </div>
              <div className="flex-1">
                <div className="flex justify-between items-start mb-2">
                  <h4 className="text-xs font-bold uppercase tracking-widest dark:text-white">{res.name}</h4>
                  <span className="text-[10px] font-black dark:text-white">{(res.similarity * 100).toFixed(1)}%</span>
                </div>
                <div className="w-full h-1 bg-gray-100 dark:bg-white/10">
                  <div className="h-full bg-black dark:bg-white transition-all duration-1000" style={{ width: `${res.similarity * 100}%` }} />
                </div>
              </div>
            </div>
          ))}
          {results.length === 0 && !isSearching && (
            <div className="md:col-span-2 py-20 text-center border border-dashed border-black/10 dark:border-white/10">
              <p className="text-[10px] uppercase tracking-widest text-gray-300 font-bold">Input intent to visualize archival resonance.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────
// Root Admin wrapper
// ─────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────
// Concessions (Coupon Management)
// ─────────────────────────────────────────────────────────

const AdminConcessions: React.FC = () => {
  const { addToast } = useStore();
  const [coupons, setCoupons] = useState<AdminCoupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [formData, setFormData] = useState({ code: '', discount_percent: 10, max_uses: '', expires_at: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminApi.coupons.list();
      setCoupons(res.data);
    } catch (e: any) { addToast(e.message, 'error'); }
    finally { setLoading(false); }
  }, [addToast]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    if (!formData.code || !formData.discount_percent) { addToast('Code and discount are required', 'error'); return; }
    try {
      await adminApi.coupons.create({
        code: formData.code,
        discount_percent: Number(formData.discount_percent),
        max_uses: formData.max_uses ? Number(formData.max_uses) : undefined,
        expires_at: formData.expires_at || undefined,
      });
      addToast('Concession archived.', 'success');
      setIsModalOpen(false);
      setFormData({ code: '', discount_percent: 10, max_uses: '', expires_at: '' });
      load();
    } catch (e: any) { addToast(e.message, 'error'); }
  };

  const handleToggle = async (c: AdminCoupon) => {
    try {
      await adminApi.coupons.update(c.id, { is_active: !c.is_active });
      addToast(c.is_active ? 'Concession deactivated.' : 'Concession activated.', 'info');
      load();
    } catch (e: any) { addToast(e.message, 'error'); }
  };

  const handleDelete = async (id: number) => {
    try {
      await adminApi.coupons.delete(id);
      addToast('Concession removed.', 'success');
      setConfirmDeleteId(null);
      load();
    } catch (e: any) { addToast(e.message, 'error'); }
  };

  return (
    <div className="space-y-12 page-reveal">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-black dark:border-white/20 pb-10">
        <div>
          <p className="text-[10px] uppercase tracking-[0.6em] text-gray-400 font-bold mb-4">Discount Management</p>
          <h1 className="text-4xl md:text-6xl font-sans font-bold uppercase tracking-tighter dark:text-white">Discount Codes</h1>
        </div>
        <div className="flex gap-3">
          <button onClick={load} className="flex items-center gap-2 border border-black dark:border-white/30 dark:text-white px-4 py-3 text-[10px] uppercase tracking-[0.3em] font-black hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-all">
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
          <button onClick={() => setIsModalOpen(true)} className="flex items-center gap-2 bg-black dark:bg-white text-white dark:text-black px-6 py-3 text-[10px] uppercase tracking-[0.3em] font-black hover:opacity-80 transition-all">
            <Plus size={12} /> New Code
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-black/10 dark:border-white/10">
              {['Code', 'Discount', 'Uses', 'Expires', 'Status', 'Actions'].map(h => (
                <th key={h} className="py-5 pr-4 text-[10px] uppercase tracking-[0.3em] font-black text-gray-400">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-black/5 dark:divide-white/5">
            {loading ? [...Array(3)].map((_, i) => (
              <tr key={i}><td colSpan={6} className="py-4"><div className="h-8 bg-black/5 dark:bg-white/5 animate-pulse" /></td></tr>
            )) : coupons.map(c => (
              <tr key={c.id} className="group hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors">
                <td className="py-4 pr-4">
                  <span className="text-sm font-black tracking-widest font-mono dark:text-white">{c.code}</span>
                </td>
                <td className="py-4 pr-4">
                  <span className="text-2xl font-black dark:text-white">{c.discount_percent}%</span>
                </td>
                <td className="py-4 pr-4 text-[10px] font-bold uppercase tracking-widest dark:text-gray-300">
                  {c.uses_count}{c.max_uses ? ` / ${c.max_uses}` : ' / ∞'}
                </td>
                <td className="py-4 pr-4 text-[10px] font-bold text-gray-400">
                  {c.expires_at ? new Date(c.expires_at).toLocaleDateString() : '—'}
                </td>
                <td className="py-4 pr-4">
                  <StatusBadge status={c.is_active ? 'active' : 'cancelled'} />
                </td>
                <td className="py-4 pr-4">
                  <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => handleToggle(c)}
                      className="border border-black/10 dark:border-white/20 dark:text-white hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-all text-[8px] uppercase tracking-widest font-black px-3 py-1.5"
                    >
                      {c.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                    {confirmDeleteId === c.id ? (
                      <button onClick={() => handleDelete(c.id)} className="px-3 py-1.5 bg-red-500 text-white text-[8px] uppercase tracking-widest font-black">
                        Confirm?
                      </button>
                    ) : (
                      <button onClick={() => setConfirmDeleteId(c.id)} className="p-2 border border-red-200 text-red-500 hover:bg-red-500 hover:text-white transition-all">
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {!loading && coupons.length === 0 && (
              <tr><td colSpan={6} className="py-20 text-center text-[10px] text-gray-400 uppercase tracking-widest">No concession codes archived</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-8">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={() => setIsModalOpen(false)} />
          <div className="relative bg-white dark:bg-[#111] w-full max-w-lg p-12 border border-black dark:border-white/20 animate-in zoom-in-95 duration-500">
            <button onClick={() => setIsModalOpen(false)} className="absolute top-6 right-6 p-2 hover:bg-black hover:text-white dark:text-white dark:hover:bg-white dark:hover:text-black transition-all"><X size={16} /></button>
            <h2 className="text-3xl font-sans font-bold uppercase tracking-tighter mb-10 dark:text-white">New Discount Code</h2>
            <div className="space-y-6">
              {[
                { label: 'Code', key: 'code', type: 'text', placeholder: 'ARCHIVE20', transform: (v: string) => v.toUpperCase() },
                { label: 'Discount %', key: 'discount_percent', type: 'number', placeholder: '20' },
                { label: 'Max Uses (blank = unlimited)', key: 'max_uses', type: 'number', placeholder: '100' },
              ].map(({ label, key, type, placeholder, transform }) => (
                <div key={key} className="space-y-2">
                  <label className="block text-[10px] uppercase tracking-[0.4em] font-black dark:text-white">{label}</label>
                  <input
                    type={type}
                    placeholder={placeholder}
                    value={(formData as any)[key]}
                    onChange={e => setFormData({ ...formData, [key]: transform ? transform(e.target.value) : e.target.value })}
                    className="w-full border-b border-black dark:border-white/30 py-3 text-xs uppercase tracking-widest outline-none bg-transparent font-mono dark:text-white"
                  />
                </div>
              ))}
              <div className="space-y-2">
                <label className="block text-[10px] uppercase tracking-[0.4em] font-black dark:text-white">Expiry Date (optional)</label>
                <input type="date" value={formData.expires_at} onChange={e => setFormData({ ...formData, expires_at: e.target.value })}
                  className="w-full border-b border-black dark:border-white/30 py-3 text-xs outline-none bg-transparent dark:text-white dark:[color-scheme:dark]" />
              </div>
            </div>
            <button onClick={handleCreate} className="w-full bg-black dark:bg-white text-white dark:text-black py-5 text-[10px] uppercase tracking-[0.6em] font-black mt-10 active:scale-95 transition-all">
              Save Code
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────
// Patrons (Customer Management)
// ─────────────────────────────────────────────────────────

const AdminPatrons: React.FC = () => {
  const { addToast } = useStore();
  const [customers, setCustomers] = useState<AdminCustomer[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const PAGE_SIZE = 20;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminApi.customers.list({ page, pageSize: PAGE_SIZE, search });
      setCustomers(res.data);
      setTotal(res.count);
    } catch (e: any) { addToast(e.message, 'error'); }
    finally { setLoading(false); }
  }, [page, search, addToast]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-12 page-reveal">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-black dark:border-white/20 pb-10">
        <div>
          <p className="text-[10px] uppercase tracking-[0.6em] text-gray-400 font-bold mb-4">Customer Registry</p>
          <h1 className="text-4xl md:text-6xl font-sans font-bold uppercase tracking-tighter dark:text-white">Customers</h1>
        </div>
        <div className="flex items-center gap-3 border border-black/10 dark:border-white/10 px-4 py-3 bg-white/50 dark:bg-white/[0.04]">
          <Search size={14} className="text-gray-400" />
          <input
            type="text"
            placeholder="SEARCH PATRONS..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            className="bg-transparent outline-none text-[10px] uppercase tracking-widest font-black placeholder:text-gray-300 dark:text-white dark:placeholder:text-gray-600 w-48"
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-black/10 dark:border-white/10">
              {['Customer', 'Email', 'Orders', 'Total Spend', 'Joined'].map(h => (
                <th key={h} className="py-5 pr-4 text-[10px] uppercase tracking-[0.3em] font-black text-gray-400">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-black/5 dark:divide-white/5">
            {loading ? [...Array(5)].map((_, i) => (
              <tr key={i}><td colSpan={5} className="py-4"><div className="h-12 bg-black/5 dark:bg-white/5 animate-pulse" /></td></tr>
            )) : customers.map(c => (
              <tr key={c.id} className="group hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors">
                <td className="py-4 pr-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-black dark:bg-white flex items-center justify-center text-white dark:text-black text-[10px] font-black uppercase shrink-0">
                      {(c.first_name?.[0] || c.email?.[0] || '?').toUpperCase()}
                    </div>
                    <span className="text-xs font-bold uppercase tracking-widest dark:text-white">
                      {c.first_name ? `${c.first_name} ${c.last_name || ''}`.trim() : 'Anonymous'}
                    </span>
                  </div>
                </td>
                <td className="py-4 pr-4 text-[10px] text-gray-500 tracking-widest">{c.email || '—'}</td>
                <td className="py-4 pr-4">
                  <span className="text-xl font-black dark:text-white">{c.order_count}</span>
                </td>
                <td className="py-4 pr-4 text-sm font-black dark:text-white">${c.total_spend.toLocaleString()}</td>
                <td className="py-4 pr-4 text-[10px] text-gray-400 font-bold">
                  {new Date(c.created_at).toLocaleDateString()}
                </td>
              </tr>
            ))}
            {!loading && customers.length === 0 && (
              <tr><td colSpan={5} className="py-20 text-center text-[10px] text-gray-400 uppercase tracking-widest">No patrons documented</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Pagination page={page} total={total} pageSize={PAGE_SIZE} onChange={setPage} />
    </div>
  );
};

const Admin: React.FC = () => {
  const { user, profile, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (!user) { navigate('/', { replace: true }); return; }
    if (profile && profile.role !== 'admin') { navigate('/', { replace: true }); }
  }, [user, profile, loading, navigate]);

  if (loading || !user || !profile) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="modern-loader" />
      </div>
    );
  }

  if (profile.role !== 'admin') return null;

  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<AdminDashboard />} />
        <Route path="/inventory" element={<AdminInventory />} />
        <Route path="/orders" element={<AdminOrders />} />
        <Route path="/reviews" element={<AdminReviews />} />
        <Route path="/negotiations" element={<AdminNegotiations />} />
        <Route path="/concessions" element={<AdminConcessions />} />
        <Route path="/patrons" element={<AdminPatrons />} />
        <Route path="/sandbox" element={<AdminSimilaritySandbox />} />
        <Route path="/settings" element={<AdminSystemSettings />} />
      </Routes>
    </AppShell>
  );
};

export default Admin;

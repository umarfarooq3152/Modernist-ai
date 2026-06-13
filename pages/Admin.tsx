
import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  <div className="bg-white/50 backdrop-blur-xl border border-black/5 p-6 space-y-4 animate-in fade-in duration-700">
    <div className="flex justify-between items-start">
      <div className="p-2 bg-black text-white">{icon}</div>
      {change && <span className="text-[10px] font-black text-green-600 uppercase tracking-widest">{change}</span>}
    </div>
    <div>
      <p className="text-[10px] uppercase tracking-[0.4em] text-gray-400 font-bold mb-1">{title}</p>
      {loading ? (
        <div className="h-8 w-24 bg-black/5 animate-pulse" />
      ) : (
        <h3 className="text-3xl font-serif-elegant font-bold uppercase">{value}</h3>
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
    <div className="flex items-center gap-4 pt-8 border-t border-black/5">
      <button
        onClick={() => onChange(page - 1)}
        disabled={page <= 1}
        className="p-2 border border-black/10 disabled:opacity-30 hover:bg-black hover:text-white transition-all"
      >
        <ChevronLeft size={14} />
      </button>
      <span className="text-[10px] uppercase tracking-widest font-black">
        Page {page} of {pages} — {total} total
      </span>
      <button
        onClick={() => onChange(page + 1)}
        disabled={page >= pages}
        className="p-2 border border-black/10 disabled:opacity-30 hover:bg-black hover:text-white transition-all"
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
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminApi.stats.get()
      .then(setStats)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const COLORS = ['#000000', '#444444', '#888888', '#CCCCCC'];

  return (
    <div className="space-y-12 page-reveal">
      <div className="border-b border-black pb-10">
        <p className="text-[10px] uppercase tracking-[0.6em] text-gray-400 font-bold mb-4">Command Center</p>
        <h1 className="text-4xl md:text-6xl font-serif-elegant font-bold uppercase tracking-tighter">Overview</h1>
      </div>

      {error && (
        <div className="flex items-center gap-4 border border-red-200 bg-red-50 p-4 text-red-700">
          <AlertTriangle size={16} />
          <span className="text-xs font-bold">{error}</span>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6">
        <StatCard title="Total Revenue" value={stats ? `$${stats.totalRevenue.toLocaleString()}` : '-'} icon={<DollarSign size={16} />} loading={loading} />
        <StatCard title="Orders" value={stats?.totalOrders ?? '-'} icon={<ShoppingBag size={16} />} loading={loading} />
        <StatCard title="Products" value={stats?.totalProducts ?? '-'} icon={<Package size={16} />} loading={loading} />
        <StatCard title="Reviews" value={stats?.totalReviews ?? '-'} icon={<Star size={16} />} loading={loading} />
        <StatCard title="Negotiations" value={stats?.totalNegotiations ?? '-'} icon={<MessageSquare size={16} />} loading={loading} />
        <StatCard
          title="Accepted Deals"
          value={stats ? `${stats.totalNegotiations > 0 ? Math.round((stats.acceptedNegotiations / stats.totalNegotiations) * 100) : 0}%` : '-'}
          icon={<Target size={16} />}
          loading={loading}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
        <div className="lg:col-span-8 bg-white/50 backdrop-blur-xl border border-black/5 p-8">
          <p className="text-[10px] uppercase tracking-[0.4em] font-black text-gray-400 mb-10">Revenue (last 7 days)</p>
          <div className="h-[300px]">
            {loading ? (
              <div className="h-full bg-black/5 animate-pulse" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={stats?.revenueChart || []}>
                  <defs>
                    <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#000" stopOpacity={0.1} />
                      <stop offset="95%" stopColor="#000" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 900 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10 }} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#000', color: '#fff', border: 'none', fontSize: 10 }}
                    formatter={(v: number) => [`$${v.toLocaleString()}`, 'Revenue']}
                  />
                  <Area type="monotone" dataKey="revenue" stroke="#000" fillOpacity={1} fill="url(#colorRev)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="lg:col-span-4 bg-white/50 backdrop-blur-xl border border-black/5 p-8 flex flex-col justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-[0.4em] font-black text-gray-400 mb-8">Category Split</p>
            {loading ? (
              <div className="h-48 bg-black/5 animate-pulse" />
            ) : (
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={stats?.categoryChart || []} cx="50%" cy="50%" innerRadius={50} outerRadius={70} paddingAngle={4} dataKey="value">
                      {(stats?.categoryChart || []).map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
          <div className="space-y-3 mt-4">
            {(stats?.categoryChart || []).map((item, i) => (
              <div key={item.name} className="flex justify-between items-center text-[10px] uppercase tracking-widest font-black">
                <span className="flex items-center gap-2">
                  <div className="w-2 h-2" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                  {item.name}
                </span>
                <span>{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Orders */}
      <div className="bg-white/50 backdrop-blur-xl border border-black/5 p-8">
        <p className="text-[10px] uppercase tracking-[0.4em] font-black text-gray-400 mb-8">Recent Orders</p>
        {loading ? (
          <div className="space-y-4">{[...Array(3)].map((_, i) => <div key={i} className="h-12 bg-black/5 animate-pulse" />)}</div>
        ) : (
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-black/10">
                {['Order ID', 'Customer', 'Amount', 'Status', 'Date'].map(h => (
                  <th key={h} className="py-4 text-[10px] uppercase tracking-[0.3em] font-black text-gray-400">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {(stats?.recentOrders || []).map(o => (
                <tr key={o.id} className="group hover:bg-black/[0.02]">
                  <td className="py-4 text-[10px] font-bold uppercase tracking-widest">#{String(o.id).slice(0, 8)}</td>
                  <td className="py-4 text-[10px] font-bold uppercase tracking-widest">{o.customerName}</td>
                  <td className="py-4 text-sm font-black">${o.totalAmount.toLocaleString()}</td>
                  <td className="py-4"><StatusBadge status={o.status} /></td>
                  <td className="py-4 text-[10px] text-gray-400">{new Date(o.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
              {!stats?.recentOrders?.length && (
                <tr><td colSpan={5} className="py-10 text-center text-[10px] text-gray-400 uppercase tracking-widest">No orders yet</td></tr>
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

const AdminInventory: React.FC = () => {
  const { addToast } = useStore();
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<AdminProduct | null>(null);
  const [formData, setFormData] = useState<Partial<AdminProduct>>({
    name: '', category: 'Basics', price: 0, bottom_price: 0, description: '', tags: [],
    variants: { sizes: [], colors: [] },
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
      const res = await adminApi.products.list({ page, pageSize: PAGE_SIZE, search, category });
      setProducts(res.data);
      setTotal(res.count);
    } catch (e: any) {
      addToast(e.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [page, search, category, addToast]);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setEditingProduct(null);
    setFormData({ name: '', category: 'Basics', price: 0, bottom_price: 0, description: '', tags: [], variants: { sizes: [], colors: [] } });
    setIsModalOpen(true);
  };

  const openEdit = (p: AdminProduct) => {
    setEditingProduct(p);
    setFormData({ name: p.name, category: p.category, price: p.price, bottom_price: p.bottom_price, description: p.description, tags: p.tags, image_url: p.image_url, variants: p.variants || { sizes: [], colors: [] } });
    setIsModalOpen(true);
  };

  const handleSave = async () => {
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
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this product? This cannot be undone.')) return;
    try {
      await adminApi.products.delete(id);
      addToast('Product deleted.', 'success');
      load();
    } catch (e: any) {
      addToast(e.message, 'error');
    }
  };

  return (
    <div className="space-y-12 page-reveal">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-black pb-10">
        <div>
          <p className="text-[10px] uppercase tracking-[0.6em] text-gray-400 font-bold mb-4">Backend-Managed</p>
          <h1 className="text-4xl md:text-6xl font-serif-elegant font-bold uppercase tracking-tighter">Inventory</h1>
        </div>
        <div className="flex gap-3">
          <button onClick={load} className="flex items-center gap-2 border border-black px-4 py-3 text-[10px] uppercase tracking-[0.3em] font-black hover:bg-black hover:text-white transition-all">
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
          <button onClick={openCreate} className="flex items-center gap-2 bg-black text-white px-6 py-3 text-[10px] uppercase tracking-[0.3em] font-black hover:opacity-80 transition-all">
            <Plus size={12} /> Add Product
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex items-center gap-3 border border-black/10 px-4 py-3 flex-1 bg-white/50">
          <Search size={14} className="text-gray-400" />
          <input
            type="text"
            placeholder="SEARCH PRODUCTS..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            className="bg-transparent outline-none text-[10px] uppercase tracking-widest font-black flex-1 placeholder:text-gray-300"
          />
        </div>
        <select
          value={category}
          onChange={e => { setCategory(e.target.value); setPage(1); }}
          className="border border-black/10 px-4 py-3 text-[10px] uppercase tracking-widest font-black bg-white/50 outline-none"
        >
          <option value="">All Categories</option>
          {['Basics', 'Outerwear', 'Accessories', 'Apparel', 'Footwear'].map(c => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-black/10">
              {['Image', 'Name', 'Price', 'Floor', 'Category', 'Actions'].map(h => (
                <th key={h} className="py-5 pr-4 text-[10px] uppercase tracking-[0.3em] font-black text-gray-400">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-black/5">
            {loading ? (
              [...Array(5)].map((_, i) => (
                <tr key={i}><td colSpan={6} className="py-4"><div className="h-12 bg-black/5 animate-pulse" /></td></tr>
              ))
            ) : products.map(p => (
              <tr key={p.id} className="group hover:bg-black/[0.02] transition-colors">
                <td className="py-4 pr-4">
                  <div className="w-12 h-16 bg-gray-100 overflow-hidden border border-black/5">
                    {p.image_url && <img src={p.image_url} alt="" className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all" />}
                  </div>
                </td>
                <td className="py-4 pr-4">
                  <p className="text-xs font-bold uppercase tracking-widest">{p.name}</p>
                  <p className="text-[9px] text-gray-400 mt-1">ID: {p.id.slice(0, 8)}</p>
                </td>
                <td className="py-4 pr-4 text-sm font-black">${p.price.toLocaleString()}</td>
                <td className="py-4 pr-4 text-sm font-black text-gray-400">${p.bottom_price.toLocaleString()}</td>
                <td className="py-4 pr-4 text-[10px] uppercase tracking-widest font-bold">{p.category}</td>
                <td className="py-4 pr-4">
                  <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => openEdit(p)} className="p-2 border border-black/10 hover:bg-black hover:text-white transition-all">
                      <Edit3 size={12} />
                    </button>
                    <button onClick={() => handleDelete(p.id)} className="p-2 border border-red-200 text-red-500 hover:bg-red-500 hover:text-white transition-all">
                      <Trash2 size={12} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!loading && products.length === 0 && (
              <tr><td colSpan={6} className="py-20 text-center text-[10px] text-gray-400 uppercase tracking-widest">No products found</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Pagination page={page} total={total} pageSize={PAGE_SIZE} onChange={setPage} />

      {/* Create/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-8">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={() => setIsModalOpen(false)} />
          <div className="relative bg-white w-full max-w-2xl p-12 border border-black animate-in zoom-in-95 duration-500 max-h-[90vh] overflow-y-auto">
            <button onClick={() => setIsModalOpen(false)} className="absolute top-6 right-6 p-2 hover:bg-black hover:text-white transition-all">
              <X size={16} />
            </button>
            <h2 className="text-3xl font-serif-elegant font-bold uppercase tracking-tighter mb-10">
              {editingProduct ? 'Edit Product' : 'New Product'}
            </h2>
            <div className="grid grid-cols-2 gap-6 mb-8">
              {[
                { label: 'Name', key: 'name', type: 'text' },
                { label: 'Price ($)', key: 'price', type: 'number' },
                { label: 'Floor Price ($)', key: 'bottom_price', type: 'number' },
              ].map(({ label, key, type }) => (
                <div key={key} className="space-y-2">
                  <label className="block text-[10px] uppercase tracking-[0.4em] font-black">{label}</label>
                  <input
                    type={type}
                    value={(formData as any)[key] || ''}
                    onChange={e => setFormData({ ...formData, [key]: type === 'number' ? Number(e.target.value) : e.target.value })}
                    className="w-full border-b border-black py-3 text-xs uppercase tracking-widest outline-none bg-transparent"
                  />
                </div>
              ))}
              <div className="space-y-2">
                <label className="block text-[10px] uppercase tracking-[0.4em] font-black">Category</label>
                <select
                  value={formData.category}
                  onChange={e => setFormData({ ...formData, category: e.target.value })}
                  className="w-full border-b border-black py-3 text-xs uppercase tracking-widest outline-none bg-transparent"
                >
                  {['Basics', 'Outerwear', 'Accessories', 'Apparel', 'Footwear'].map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <label className="block text-[10px] uppercase tracking-[0.4em] font-black">Tags (comma-separated)</label>
                <input
                  type="text"
                  value={Array.isArray(formData.tags) ? formData.tags.join(', ') : ''}
                  onChange={e => setFormData({ ...formData, tags: e.target.value.split(',').map(t => t.trim()).filter(Boolean) })}
                  className="w-full border-b border-black py-3 text-xs uppercase tracking-widest outline-none bg-transparent"
                />
              </div>
              <div className="space-y-2">
                <label className="block text-[10px] uppercase tracking-[0.4em] font-black">Sizes (comma-separated)</label>
                <input
                  type="text"
                  placeholder="XS, S, M, L, XL"
                  value={(formData.variants?.sizes || []).join(', ')}
                  onChange={e => setFormData({ ...formData, variants: { ...formData.variants, sizes: e.target.value.split(',').map(s => s.trim()).filter(Boolean) } })}
                  className="w-full border-b border-black py-3 text-xs uppercase tracking-widest outline-none bg-transparent"
                />
              </div>
              <div className="space-y-2">
                <label className="block text-[10px] uppercase tracking-[0.4em] font-black">Colorways (comma-separated)</label>
                <input
                  type="text"
                  placeholder="Black, White, Navy"
                  value={(formData.variants?.colors || []).join(', ')}
                  onChange={e => setFormData({ ...formData, variants: { ...formData.variants, colors: e.target.value.split(',').map(c => c.trim()).filter(Boolean) } })}
                  className="w-full border-b border-black py-3 text-xs uppercase tracking-widest outline-none bg-transparent"
                />
              </div>
            </div>

            {/* Image upload */}
            <div className="space-y-3 mb-8">
              <label className="block text-[10px] uppercase tracking-[0.4em] font-black">Product Image</label>
              <div className="flex items-start gap-4">
                {formData.image_url && (
                  <div className="w-20 h-24 bg-gray-50 overflow-hidden border border-black/10 shrink-0">
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
                    className="flex items-center gap-2 border border-black px-4 py-2 text-[9px] uppercase tracking-[0.3em] font-black hover:bg-black hover:text-white transition-all disabled:opacity-50"
                  >
                    <Upload size={10} />
                    {imageUploading ? 'Uploading...' : 'Upload Image'}
                  </button>
                  <input
                    type="text"
                    placeholder="OR PASTE IMAGE URL"
                    value={formData.image_url || ''}
                    onChange={e => setFormData({ ...formData, image_url: e.target.value })}
                    className="w-full border-b border-black/20 py-2 text-[9px] uppercase tracking-widest outline-none bg-transparent placeholder:text-gray-300"
                  />
                </div>
              </div>
            </div>
            <div className="space-y-2 mb-10">
              <label className="block text-[10px] uppercase tracking-[0.4em] font-black">Description</label>
              <textarea
                value={formData.description || ''}
                onChange={e => setFormData({ ...formData, description: e.target.value })}
                rows={3}
                className="w-full border border-black/10 p-4 text-xs tracking-wide outline-none bg-transparent resize-none"
              />
            </div>
            <button
              onClick={handleSave}
              className="w-full bg-black text-white py-5 text-[10px] uppercase tracking-[0.6em] font-black active:scale-95 transition-all"
            >
              {editingProduct ? 'Save Changes' : 'Create Product'}
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
    if (!confirm('Delete this review? This cannot be undone.')) return;
    try {
      await adminApi.reviews.delete(id);
      addToast('Review deleted.', 'success');
      load();
    } catch (e: any) {
      addToast(e.message, 'error');
    }
  };

  const ratingPercent = (rating: number) => (rating / 5) * 100;

  return (
    <div className="space-y-12 page-reveal">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-black pb-10">
        <div>
          <p className="text-[10px] uppercase tracking-[0.6em] text-gray-400 font-bold mb-4">Patron Feedback</p>
          <h1 className="text-4xl md:text-6xl font-serif-elegant font-bold uppercase tracking-tighter">Reviews</h1>
        </div>
        <button onClick={load} className="flex items-center gap-2 border border-black px-4 py-3 text-[10px] uppercase tracking-[0.3em] font-black hover:bg-black hover:text-white transition-all self-start md:self-auto">
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-8 bg-white/50 border border-black/5 p-6">
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
              className={`flex items-center gap-1 px-3 py-2 text-[10px] font-black uppercase tracking-widest border transition-all ${minRating <= r && maxRating >= r ? 'bg-black text-white border-black' : 'border-black/10 hover:border-black'}`}
            >
              <Star size={10} fill={minRating <= r && maxRating >= r ? 'white' : 'none'} />
              {r}
            </button>
          ))}
        </div>
        <span className="text-[10px] text-gray-400 ml-auto">{total} reviews</span>
      </div>

      {/* Reviews list */}
      <div className="space-y-6">
        {loading ? (
          [...Array(4)].map((_, i) => <div key={i} className="h-32 bg-black/5 animate-pulse" />)
        ) : reviews.map(review => (
          <div key={review.id} className="group bg-white/50 backdrop-blur-md border border-black/5 p-6 flex gap-6 animate-in fade-in duration-500">
            {/* Product thumbnail */}
            <div className="w-16 h-20 bg-gray-100 shrink-0 overflow-hidden border border-black/5">
              {review.products?.image_url && (
                <img src={review.products.image_url} alt="" className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all" />
              )}
            </div>

            <div className="flex-1 space-y-3">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-widest">{review.author}</p>
                  <p className="text-[9px] text-gray-400 uppercase tracking-widest mt-1">
                    {review.products?.name || 'Unknown Product'} · {review.date}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {/* Star rating */}
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map(s => (
                      <Star key={s} size={10} className={s <= review.rating ? 'text-black fill-black' : 'text-gray-200 fill-gray-200'} />
                    ))}
                  </div>
                  <button
                    onClick={() => handleDelete(review.id)}
                    className="p-2 border border-red-200 text-red-400 hover:bg-red-500 hover:text-white hover:border-red-500 transition-all opacity-0 group-hover:opacity-100"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>

              <p className="text-sm text-gray-600 font-light leading-relaxed italic">"{review.text}"</p>

              <div className="flex items-center gap-4 pt-2">
                <div className="flex-1 h-[2px] bg-gray-100">
                  <div className="h-full bg-black transition-all duration-700" style={{ width: `${ratingPercent(review.rating)}%` }} />
                </div>
                <span className="text-[9px] font-black text-gray-400">{review.rating}/5</span>
              </div>
            </div>
          </div>
        ))}

        {!loading && reviews.length === 0 && (
          <div className="py-24 text-center border border-dashed border-black/10">
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
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-black pb-10">
        <div>
          <p className="text-[10px] uppercase tracking-[0.6em] text-gray-400 font-bold mb-4">Transaction Log</p>
          <h1 className="text-4xl md:text-6xl font-serif-elegant font-bold uppercase tracking-tighter">Orders</h1>
        </div>
        <button onClick={load} className="flex items-center gap-2 border border-black px-4 py-3 text-[10px] uppercase tracking-[0.3em] font-black hover:bg-black hover:text-white transition-all self-start md:self-auto">
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {/* Status filter */}
      <div className="flex flex-wrap gap-2">
        {['', ...statuses].map(s => (
          <button
            key={s || 'all'}
            onClick={() => { setStatusFilter(s); setPage(1); }}
            className={`px-4 py-2 text-[10px] uppercase tracking-widest font-black border transition-all ${statusFilter === s ? 'bg-black text-white border-black' : 'border-black/10 hover:border-black'}`}
          >
            {s || 'All'}
          </button>
        ))}
        <span className="ml-auto text-[10px] text-gray-400 self-center">{total} orders</span>
      </div>

      {/* Orders table */}
      <div className="space-y-3">
        {loading ? (
          [...Array(5)].map((_, i) => <div key={i} className="h-16 bg-black/5 animate-pulse" />)
        ) : orders.map(order => {
          const customer = order.profiles
            ? `${order.profiles.first_name || ''} ${order.profiles.last_name || ''}`.trim() || order.profiles.email || 'Guest'
            : 'Guest';
          const isExpanded = expandedId === order.id;

          return (
            <div key={order.id} className="bg-white/50 backdrop-blur-md border border-black/5 animate-in fade-in duration-500">
              <div
                className="p-5 flex flex-wrap items-center gap-4 cursor-pointer hover:bg-black/[0.02] transition-colors"
                onClick={() => setExpandedId(isExpanded ? null : order.id)}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-widest">#{String(order.id).slice(0, 12)}</p>
                  <p className="text-[9px] text-gray-400 mt-1 uppercase tracking-widest">{customer}</p>
                </div>
                <span className="text-sm font-black">${parseFloat(order.total_amount || '0').toLocaleString()}</span>
                <StatusBadge status={order.status} />
                <span className="text-[9px] text-gray-400">{new Date(order.created_at).toLocaleDateString()}</span>

                {/* Status changer */}
                <select
                  value={order.status}
                  onClick={e => e.stopPropagation()}
                  onChange={e => handleStatusChange(order.id, e.target.value)}
                  className="border border-black/10 px-3 py-2 text-[9px] uppercase tracking-widest font-black bg-white outline-none"
                >
                  {statuses.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                </select>

                <ChevronDown size={14} className={`text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
              </div>

              {isExpanded && (
                <div className="border-t border-black/5 p-5 space-y-3 animate-in slide-in-from-top-2 duration-300">
                  <p className="text-[10px] uppercase tracking-[0.4em] font-black text-gray-400 mb-4">Order Items</p>
                  {(order.checkout_items || []).map((item: any) => (
                    <div key={item.id} className="flex items-center gap-4 py-2 border-b border-black/5 last:border-0">
                      <div className="w-8 h-10 bg-gray-100 shrink-0">
                        {item.image_url && <img src={item.image_url} alt="" className="w-full h-full object-cover grayscale" />}
                      </div>
                      <span className="text-[10px] font-bold uppercase tracking-widest flex-1">{item.name}</span>
                      <span className="text-[10px] font-black">${parseFloat(item.price || '0').toLocaleString()}</span>
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
          <div className="py-24 text-center border border-dashed border-black/10">
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
      <div className="border-b border-black pb-10 flex items-end justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-[0.6em] text-gray-400 font-bold mb-4">Neural Feedback</p>
          <h1 className="text-4xl md:text-6xl font-serif-elegant font-bold uppercase tracking-tighter">Haggle Tracker</h1>
        </div>
        <button onClick={load} className="flex items-center gap-2 border border-black px-4 py-3 text-[10px] uppercase tracking-[0.3em] font-black hover:bg-black hover:text-white transition-all">
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
            className={`px-4 py-2 text-[10px] uppercase tracking-widest font-black border transition-all ${statusFilter === val ? 'bg-black text-white border-black' : 'border-black/10 hover:border-black'}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="space-y-4">
        {loading ? (
          [...Array(4)].map((_, i) => <div key={i} className="h-28 bg-black/5 animate-pulse" />)
        ) : logs.map(log => {
          const email = log.metadata?.user_email || 'Anonymous Patron';
          const message = log.metadata?.user_message || 'N/A';
          return (
            <div key={log.id} className="bg-white/40 backdrop-blur-md border border-black/5 p-6 flex flex-col md:flex-row gap-6 animate-in fade-in duration-500">
              <div className="w-10 h-10 bg-black text-white flex items-center justify-center font-serif-elegant text-lg shrink-0">
                {email[0].toUpperCase()}
              </div>
              <div className="flex-1 space-y-3">
                <div className="flex justify-between items-start flex-wrap gap-2">
                  <div>
                    <p className="text-[10px] uppercase tracking-widest font-black">{email}</p>
                    <p className="text-[8px] uppercase tracking-widest text-gray-400 mt-1">{new Date(log.created_at).toLocaleString()}</p>
                  </div>
                  <div className="flex gap-2">
                    <StatusBadge status={log.status} />
                    {log.sentiment && <span className="text-[8px] uppercase tracking-widest font-black bg-black text-white px-3 py-1 italic">{log.sentiment}</span>}
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-3 border-t border-black/5">
                  <div>
                    <p className="text-[9px] uppercase tracking-widest text-gray-400 font-black mb-1">Patron Proposes</p>
                    <p className="text-sm font-light italic">"{message}"</p>
                  </div>
                  <div>
                    <p className="text-[9px] uppercase tracking-widest text-gray-400 font-black mb-1">The Clerk Responds</p>
                    <p className="text-sm font-light italic">"{log.clerk_response}"</p>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        {!loading && logs.length === 0 && (
          <div className="py-24 text-center border border-dashed border-black/10">
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
      <div className="border-b border-black pb-10">
        <p className="text-[10px] uppercase tracking-[0.6em] text-gray-400 font-bold mb-4">Core Protocols</p>
        <h1 className="text-4xl md:text-6xl font-serif-elegant font-bold uppercase tracking-tighter">System Configuration</h1>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
        <div className="bg-white/40 backdrop-blur-xl border border-black/5 p-10 space-y-8">
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-widest">Negotiation Kill Switch</h3>
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
        <div className="bg-black text-white p-10 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center gap-4 opacity-50"><Cpu size={18} /><span className="text-[10px] uppercase tracking-widest font-black">Neural Core Status</span></div>
            <h2 className="text-3xl font-serif-elegant font-bold uppercase">Optimal Resonance</h2>
            <p className="text-[10px] uppercase tracking-widest text-gray-500 leading-relaxed">All synchronization engines operating within parameters.</p>
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
      <div className="border-b border-black pb-10">
        <p className="text-[10px] uppercase tracking-[0.6em] text-gray-400 font-bold mb-4">Vector Engine</p>
        <h1 className="text-4xl md:text-6xl font-serif-elegant font-bold uppercase tracking-tighter">Similarity Sandbox</h1>
      </div>
      <div className="bg-white/40 backdrop-blur-xl border border-black/5 p-12">
        <form onSubmit={handleSearch} className="relative mb-12">
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="INPUT ARCHIVAL INTENT..."
            className="w-full bg-transparent border-b border-black py-6 text-xl uppercase tracking-widest outline-none font-serif-elegant placeholder:text-gray-200"
          />
          <button type="submit" disabled={isSearching} className="absolute right-0 top-1/2 -translate-y-1/2 p-4 hover:opacity-50 transition-opacity disabled:opacity-20">
            {isSearching ? <RefreshCw className="animate-spin" /> : <ArrowRight />}
          </button>
        </form>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {results.map((res, i) => (
            <div key={i} className="bg-white p-6 border border-black/5 flex items-center gap-6 animate-in slide-in-from-bottom-4" style={{ animationDelay: `${i * 100}ms` }}>
              <div className="w-16 h-20 bg-gray-100 shrink-0 overflow-hidden">
                <img src={res.image_url} alt="" className="w-full h-full object-cover grayscale" />
              </div>
              <div className="flex-1">
                <div className="flex justify-between items-start mb-2">
                  <h4 className="text-xs font-bold uppercase tracking-widest">{res.name}</h4>
                  <span className="text-[10px] font-black">{(res.similarity * 100).toFixed(1)}%</span>
                </div>
                <div className="w-full h-1 bg-gray-100">
                  <div className="h-full bg-black transition-all duration-1000" style={{ width: `${res.similarity * 100}%` }} />
                </div>
              </div>
            </div>
          ))}
          {results.length === 0 && !isSearching && (
            <div className="md:col-span-2 py-20 text-center border border-dashed border-black/10">
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
    if (!confirm('Delete this concession code?')) return;
    try {
      await adminApi.coupons.delete(id);
      addToast('Concession removed.', 'success');
      load();
    } catch (e: any) { addToast(e.message, 'error'); }
  };

  return (
    <div className="space-y-12 page-reveal">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-black pb-10">
        <div>
          <p className="text-[10px] uppercase tracking-[0.6em] text-gray-400 font-bold mb-4">Discount Management</p>
          <h1 className="text-4xl md:text-6xl font-serif-elegant font-bold uppercase tracking-tighter">Concessions</h1>
        </div>
        <div className="flex gap-3">
          <button onClick={load} className="flex items-center gap-2 border border-black px-4 py-3 text-[10px] uppercase tracking-[0.3em] font-black hover:bg-black hover:text-white transition-all">
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
          <button onClick={() => setIsModalOpen(true)} className="flex items-center gap-2 bg-black text-white px-6 py-3 text-[10px] uppercase tracking-[0.3em] font-black hover:opacity-80 transition-all">
            <Plus size={12} /> New Concession
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-black/10">
              {['Code', 'Discount', 'Uses', 'Expires', 'Status', 'Actions'].map(h => (
                <th key={h} className="py-5 pr-4 text-[10px] uppercase tracking-[0.3em] font-black text-gray-400">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-black/5">
            {loading ? [...Array(3)].map((_, i) => (
              <tr key={i}><td colSpan={6} className="py-4"><div className="h-8 bg-black/5 animate-pulse" /></td></tr>
            )) : coupons.map(c => (
              <tr key={c.id} className="group hover:bg-black/[0.02] transition-colors">
                <td className="py-4 pr-4">
                  <span className="text-sm font-black tracking-widest font-mono">{c.code}</span>
                </td>
                <td className="py-4 pr-4">
                  <span className="text-2xl font-black">{c.discount_percent}%</span>
                </td>
                <td className="py-4 pr-4 text-[10px] font-bold uppercase tracking-widest">
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
                      className="border border-black/10 hover:bg-black hover:text-white transition-all text-[8px] uppercase tracking-widest font-black px-3 py-1.5"
                    >
                      {c.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                    <button onClick={() => handleDelete(c.id)} className="p-2 border border-red-200 text-red-500 hover:bg-red-500 hover:text-white transition-all">
                      <Trash2 size={12} />
                    </button>
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
          <div className="relative bg-white w-full max-w-lg p-12 border border-black animate-in zoom-in-95 duration-500">
            <button onClick={() => setIsModalOpen(false)} className="absolute top-6 right-6 p-2 hover:bg-black hover:text-white transition-all"><X size={16} /></button>
            <h2 className="text-3xl font-serif-elegant font-bold uppercase tracking-tighter mb-10">New Concession</h2>
            <div className="space-y-6">
              {[
                { label: 'Code', key: 'code', type: 'text', placeholder: 'ARCHIVE20', transform: (v: string) => v.toUpperCase() },
                { label: 'Discount %', key: 'discount_percent', type: 'number', placeholder: '20' },
                { label: 'Max Uses (blank = unlimited)', key: 'max_uses', type: 'number', placeholder: '100' },
              ].map(({ label, key, type, placeholder, transform }) => (
                <div key={key} className="space-y-2">
                  <label className="block text-[10px] uppercase tracking-[0.4em] font-black">{label}</label>
                  <input
                    type={type}
                    placeholder={placeholder}
                    value={(formData as any)[key]}
                    onChange={e => setFormData({ ...formData, [key]: transform ? transform(e.target.value) : e.target.value })}
                    className="w-full border-b border-black py-3 text-xs uppercase tracking-widest outline-none bg-transparent font-mono"
                  />
                </div>
              ))}
              <div className="space-y-2">
                <label className="block text-[10px] uppercase tracking-[0.4em] font-black">Expiry Date (optional)</label>
                <input type="date" value={formData.expires_at} onChange={e => setFormData({ ...formData, expires_at: e.target.value })}
                  className="w-full border-b border-black py-3 text-xs outline-none bg-transparent" />
              </div>
            </div>
            <button onClick={handleCreate} className="w-full bg-black text-white py-5 text-[10px] uppercase tracking-[0.6em] font-black mt-10 active:scale-95 transition-all">
              Archive Concession
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
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-black pb-10">
        <div>
          <p className="text-[10px] uppercase tracking-[0.6em] text-gray-400 font-bold mb-4">Patron Registry</p>
          <h1 className="text-4xl md:text-6xl font-serif-elegant font-bold uppercase tracking-tighter">Patrons</h1>
        </div>
        <div className="flex items-center gap-3 border border-black/10 px-4 py-3 bg-white/50">
          <Search size={14} className="text-gray-400" />
          <input
            type="text"
            placeholder="SEARCH PATRONS..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            className="bg-transparent outline-none text-[10px] uppercase tracking-widest font-black placeholder:text-gray-300 w-48"
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-black/10">
              {['Patron', 'Email', 'Acquisitions', 'Total Spend', 'Joined'].map(h => (
                <th key={h} className="py-5 pr-4 text-[10px] uppercase tracking-[0.3em] font-black text-gray-400">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-black/5">
            {loading ? [...Array(5)].map((_, i) => (
              <tr key={i}><td colSpan={5} className="py-4"><div className="h-12 bg-black/5 animate-pulse" /></td></tr>
            )) : customers.map(c => (
              <tr key={c.id} className="group hover:bg-black/[0.02] transition-colors">
                <td className="py-4 pr-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-black flex items-center justify-center text-white text-[10px] font-black uppercase shrink-0">
                      {(c.first_name?.[0] || c.email?.[0] || '?').toUpperCase()}
                    </div>
                    <span className="text-xs font-bold uppercase tracking-widest">
                      {c.first_name ? `${c.first_name} ${c.last_name || ''}`.trim() : 'Anonymous'}
                    </span>
                  </div>
                </td>
                <td className="py-4 pr-4 text-[10px] text-gray-500 tracking-widest">{c.email || '—'}</td>
                <td className="py-4 pr-4">
                  <span className="text-xl font-black">{c.order_count}</span>
                </td>
                <td className="py-4 pr-4 text-sm font-black">${c.total_spend.toLocaleString()}</td>
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
  const location = useLocation();
  const navigate = useNavigate();
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

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

  const navLinks = [
    { path: '/admin', icon: LayoutDashboard, label: 'Overview', exact: true },
    { path: '/admin/inventory', icon: Package, label: 'Inventory' },
    { path: '/admin/orders', icon: ShoppingBag, label: 'Orders' },
    { path: '/admin/reviews', icon: Star, label: 'Reviews' },
    { path: '/admin/concessions', icon: Tag, label: 'Concessions' },
    { path: '/admin/patrons', icon: Users, label: 'Patrons' },
    { path: '/admin/negotiations', icon: MessageSquare, label: 'Haggles' },
    { path: '/admin/sandbox', icon: Layers, label: 'Sandbox' },
    { path: '/admin/settings', icon: Settings, label: 'Protocols' },
  ];

  const isActive = (path: string, exact?: boolean) =>
    exact ? location.pathname === path : location.pathname.startsWith(path) && path !== '/admin' || location.pathname === path;

  return (
    <div className="min-h-screen bg-[#FDFDFD] flex overflow-hidden">
      <aside className={`fixed inset-y-0 left-0 z-[200] bg-black text-white transition-all duration-700 flex flex-col ${isSidebarOpen ? 'w-72' : 'w-0 overflow-hidden md:w-20'}`}>
        <div className="p-8 flex flex-col h-full justify-between overflow-y-auto">
          <div className="space-y-12">
            <Link to="/" className="font-serif-elegant text-xl font-bold tracking-[0.2em] hover:opacity-50 transition-opacity block">
              {isSidebarOpen ? 'MODERNIST' : 'M'}
            </Link>
            <nav className="space-y-2">
              {navLinks.map(link => (
                <Link
                  key={link.path}
                  to={link.path}
                  className={`flex items-center gap-5 px-3 py-3 transition-all group rounded-sm ${isActive(link.path, link.exact) ? 'text-white bg-white/10' : 'text-gray-500 hover:text-white'}`}
                >
                  <link.icon size={18} strokeWidth={1.5} className="shrink-0" />
                  {isSidebarOpen && <span className="text-[10px] uppercase tracking-[0.3em] font-black">{link.label}</span>}
                </Link>
              ))}
            </nav>
          </div>

          <div className="space-y-4 mt-8">
            <div className="p-3 border border-white/10 flex items-center gap-3">
              <div className="w-7 h-7 bg-white/10 flex items-center justify-center text-xs font-black">
                {(profile.first_name?.[0] || profile.email?.[0] || 'A').toUpperCase()}
              </div>
              {isSidebarOpen && (
                <div className="overflow-hidden">
                  <p className="text-[9px] font-black uppercase tracking-widest truncate">
                    {profile.first_name ? `${profile.first_name} ${profile.last_name || ''}` : profile.email || 'Admin'}
                  </p>
                  <p className="text-[7px] text-gray-500 uppercase tracking-widest">Admin</p>
                </div>
              )}
            </div>
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="w-full border border-white/20 py-2 text-[8px] uppercase tracking-[0.4em] font-black hover:bg-white hover:text-black transition-all"
            >
              {isSidebarOpen ? 'Collapse' : '...'}
            </button>
          </div>
        </div>
      </aside>

      <main className={`flex-1 transition-all duration-700 min-h-screen ${isSidebarOpen ? 'pl-72' : 'pl-20'}`}>
        <header className="h-20 glass border-b border-black/5 flex items-center justify-between px-8 sticky top-0 z-[190]">
          <button className="md:hidden" onClick={() => setIsSidebarOpen(!isSidebarOpen)}><Menu size={20} /></button>
          <div className="flex items-center gap-8 ml-auto">
            <Link to="/" className="flex items-center gap-2 text-[10px] uppercase tracking-widest font-black hover:opacity-50 transition-opacity">
              <span>View Storefront</span>
              <ExternalLink size={12} />
            </Link>
          </div>
        </header>

        <div className="p-10 max-w-[1400px]">
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
        </div>
      </main>
    </div>
  );
};

export default Admin;

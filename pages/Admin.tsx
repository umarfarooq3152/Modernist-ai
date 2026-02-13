
import React, { useState, useEffect } from 'react';
import { Routes, Route, Link, useLocation, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Package, 
  MessageSquare, 
  TrendingUp, 
  Settings, 
  Menu, 
  X, 
  Bell, 
  Search, 
  RefreshCw, 
  Plus, 
  DollarSign, 
  ChevronRight,
  User,
  ExternalLink,
  Target,
  BarChart3,
  Activity,
  ToggleLeft as Toggle,
  Lock,
  Cpu,
  Layers,
  ArrowRight
} from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { ClerkLog, Product, OrderRecord } from '../types';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, PieChart, Pie, Cell } from 'recharts';

// --- Sub-Components ---

const StatCard: React.FC<{ title: string; value: string | number; change?: string; icon: React.ReactNode }> = ({ title, value, change, icon }) => (
  <div className="bg-white/50 backdrop-blur-xl border border-black/5 p-6 space-y-4 animate-in fade-in duration-700">
    <div className="flex justify-between items-start">
      <div className="p-2 bg-black text-white">{icon}</div>
      {change && <span className="text-[10px] font-black text-green-600 uppercase tracking-widest">{change}</span>}
    </div>
    <div>
      <p className="text-[10px] uppercase tracking-[0.4em] text-gray-400 font-bold mb-1">{title}</p>
      <h3 className="text-3xl font-serif-elegant font-bold uppercase">{value}</h3>
    </div>
  </div>
);

const AdminInventory: React.FC = () => {
  const { allProducts, syncERPProducts, createERPProduct, isSyncingERP } = useStore();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newProduct, setNewProduct] = useState<Partial<Product>>({
    name: '', category: 'Basics', price: 0, bottom_price: 0, description: '', tags: []
  });

  return (
    <div className="space-y-12 page-reveal">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-black pb-10">
        <div>
          <p className="text-[10px] uppercase tracking-[0.6em] text-gray-400 font-bold mb-4">ERP Bridge</p>
          <h1 className="text-4xl md:text-6xl font-serif-elegant font-bold uppercase tracking-tighter">Inventory</h1>
        </div>
        <div className="flex gap-4">
          <button 
            onClick={() => syncERPProducts()}
            disabled={isSyncingERP}
            className="flex items-center gap-3 border border-black px-6 py-4 text-[10px] uppercase tracking-[0.4em] font-black hover:bg-black hover:text-white transition-all active:scale-95 disabled:opacity-50"
          >
            <RefreshCw size={14} className={isSyncingERP ? 'animate-spin' : ''} />
            <span>{isSyncingERP ? 'Synchronizing...' : 'Sync Archive Piece'}</span>
          </button>
          <button 
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-3 bg-black text-white px-8 py-4 text-[10px] uppercase tracking-[0.4em] font-black hover:opacity-80 transition-all active:scale-95"
          >
            <Plus size={14} />
            <span>Document Piece</span>
          </button>
        </div>
      </div>

      <div className="overflow-x-auto no-scrollbar">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-black/10">
              <th className="py-6 text-[10px] uppercase tracking-[0.3em] font-black text-gray-400">Archival View</th>
              <th className="py-6 text-[10px] uppercase tracking-[0.3em] font-black text-gray-400">Identity</th>
              <th className="py-6 text-[10px] uppercase tracking-[0.3em] font-black text-gray-400">Valuation</th>
              <th className="py-6 text-[10px] uppercase tracking-[0.3em] font-black text-gray-400">Archival Floor</th>
              <th className="py-6 text-[10px] uppercase tracking-[0.3em] font-black text-gray-400">Category</th>
              <th className="py-6 text-[10px] uppercase tracking-[0.3em] font-black text-gray-400">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/5">
            {allProducts.map((p) => (
              <tr key={p.id} className="group hover:bg-black/[0.02] transition-colors">
                <td className="py-6 pr-6">
                  <div className="w-16 h-20 bg-gray-100 overflow-hidden border border-black/5">
                    <img src={p.image_url} alt="" className="w-full h-full object-cover grayscale transition-all group-hover:grayscale-0" />
                  </div>
                </td>
                <td className="py-6">
                  <p className="text-xs font-bold uppercase tracking-widest">{p.name}</p>
                  <p className="text-[10px] text-gray-400 uppercase tracking-widest mt-1">ID: {p.id}</p>
                </td>
                <td className="py-6 text-sm font-black">${p.price.toLocaleString()}</td>
                <td className="py-6 text-sm font-black text-gray-400">${p.bottom_price.toLocaleString()}</td>
                <td className="py-6 text-[10px] uppercase tracking-widest font-bold">{p.category}</td>
                <td className="py-6">
                  <span className="text-[8px] uppercase tracking-widest font-black bg-black text-white px-3 py-1">Synced</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-8">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={() => setIsModalOpen(false)} />
          <div className="relative bg-white w-full max-w-2xl p-12 border border-black animate-in zoom-in-95 duration-500">
            <h2 className="text-3xl font-serif-elegant font-bold uppercase tracking-tighter mb-10">Document New Piece</h2>
            <div className="grid grid-cols-2 gap-8 mb-10">
              <div className="space-y-4">
                <label className="block text-[10px] uppercase tracking-[0.4em] font-black">Identity</label>
                <input 
                  type="text" 
                  value={newProduct.name} 
                  onChange={e => setNewProduct({...newProduct, name: e.target.value})}
                  className="w-full border-b border-black py-3 text-xs uppercase tracking-widest outline-none bg-transparent" 
                  placeholder="NOMENCLATURE" 
                />
              </div>
              <div className="space-y-4">
                <label className="block text-[10px] uppercase tracking-[0.4em] font-black">Classification</label>
                <select 
                  value={newProduct.category}
                  onChange={e => setNewProduct({...newProduct, category: e.target.value})}
                  className="w-full border-b border-black py-3 text-xs uppercase tracking-widest outline-none bg-transparent"
                >
                  <option>Basics</option>
                  <option>Outerwear</option>
                  <option>Accessories</option>
                  <option>Apparel</option>
                </select>
              </div>
              <div className="space-y-4">
                <label className="block text-[10px] uppercase tracking-[0.4em] font-black">Public Valuation</label>
                <input 
                  type="number" 
                  value={newProduct.price}
                  onChange={e => setNewProduct({...newProduct, price: Number(e.target.value)})}
                  className="w-full border-b border-black py-3 text-xs uppercase tracking-widest outline-none bg-transparent" 
                />
              </div>
              <div className="space-y-4">
                <label className="block text-[10px] uppercase tracking-[0.4em] font-black">Archival Floor</label>
                <input 
                  type="number" 
                  value={newProduct.bottom_price}
                  onChange={e => setNewProduct({...newProduct, bottom_price: Number(e.target.value)})}
                  className="w-full border-b border-black py-3 text-xs uppercase tracking-widest outline-none bg-transparent" 
                />
              </div>
            </div>
            <button 
              onClick={() => { createERPProduct(newProduct); setIsModalOpen(false); }}
              className="w-full bg-black text-white py-6 text-[10px] uppercase tracking-[0.6em] font-black active:scale-95 transition-all"
            >
              Document in ERP
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

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
            onChange={(e) => setQuery(e.target.value)}
            placeholder="INPUT ARCHIVAL INTENT (e.g. 'Warm textures for winter')"
            className="w-full bg-transparent border-b border-black py-6 text-xl uppercase tracking-widest outline-none font-serif-elegant placeholder:text-gray-200"
          />
          <button 
            type="submit"
            disabled={isSearching}
            className="absolute right-0 top-1/2 -translate-y-1/2 p-4 hover:opacity-50 transition-opacity disabled:opacity-20"
          >
            {isSearching ? <RefreshCw className="animate-spin" /> : <ArrowRight />}
          </button>
        </form>

        <div className="space-y-6">
          <p className="text-[10px] uppercase tracking-[0.5em] text-gray-400 font-black">Resonance Matches (Threshold: 0.5)</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {results.map((res, i) => (
              <div key={i} className="bg-white p-6 border border-black/5 flex items-center gap-6 animate-in slide-in-from-bottom-4" style={{animationDelay: `${i * 100}ms`}}>
                <div className="w-16 h-20 bg-gray-100 shrink-0 overflow-hidden">
                   <img src={res.image_url} alt="" className="w-full h-full object-cover grayscale" />
                </div>
                <div className="flex-1">
                   <div className="flex justify-between items-start mb-2">
                     <h4 className="text-xs font-bold uppercase tracking-widest">{res.name}</h4>
                     <span className="text-[10px] font-black text-black">{(res.similarity * 100).toFixed(1)}%</span>
                   </div>
                   <div className="w-full h-1 bg-gray-100">
                     <div className="h-full bg-black transition-all duration-1000" style={{width: `${res.similarity * 100}%`}} />
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
    </div>
  );
};

const AdminNegotiations: React.FC = () => {
  const [logs, setLogs] = useState<ClerkLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLogs = async () => {
      const { data, error } = await supabase
        .from('clerk_logs')
        .select('*')
        .order('created_at', { ascending: false });
      if (data) setLogs(data);
      setLoading(false);
    };
    fetchLogs();

    const channel = supabase.channel('clerk_logs_realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'clerk_logs' }, payload => {
        setLogs(prev => [payload.new as ClerkLog, ...prev]);
      })
      .subscribe();
    
    return () => { supabase.removeChannel(channel); };
  }, []);

  return (
    <div className="space-y-12 page-reveal">
      <div className="border-b border-black pb-10">
        <p className="text-[10px] uppercase tracking-[0.6em] text-gray-400 font-bold mb-4">Neural Feedback</p>
        <h1 className="text-4xl md:text-6xl font-serif-elegant font-bold uppercase tracking-tighter">Haggle Tracker</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
        <StatCard title="Total Negotiations" value={logs.length} icon={<MessageSquare size={16} />} />
        <StatCard title="Success Rate" value="68%" change="+5%" icon={<TrendingUp size={16} />} />
        <StatCard title="Avg Concession" value="12%" change="-2%" icon={<TrendingUp size={16} className="rotate-180" />} />
        <StatCard title="Sentiment Index" value="Elite" icon={<Activity size={16} />} />
      </div>

      <div className="space-y-6">
        <p className="text-[10px] uppercase tracking-[0.5em] text-gray-400 font-black">Real-time Stream</p>
        <div className="space-y-4">
          {logs.map((log) => {
            // Read properties from metadata if not available at top level
            const email = log.user_email || log.metadata?.user_email || 'Anonymous Patron';
            const message = log.user_message || log.metadata?.user_message || 'N/A';
            
            return (
              <div key={log.id} className="bg-white/40 backdrop-blur-md border border-black/5 p-6 flex flex-col md:flex-row gap-8 animate-in slide-in-from-right-4 duration-700">
                <div className="w-12 h-12 bg-black text-white flex items-center justify-center font-serif-elegant text-xl">
                  {email[0].toUpperCase()}
                </div>
                <div className="flex-1 space-y-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-[10px] uppercase tracking-widest font-black text-black">{email}</p>
                      <p className="text-[8px] uppercase tracking-widest text-gray-400 mt-1">{new Date(log.created_at).toLocaleString()}</p>
                    </div>
                    <div className="flex gap-2">
                      <span className={`text-[8px] uppercase tracking-widest font-black px-3 py-1 ${log.negotiation_successful ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {log.negotiation_successful ? 'Success' : 'Rejected'}
                      </span>
                      <span className="text-[8px] uppercase tracking-widest font-black bg-black text-white px-3 py-1 italic">{log.clerk_sentiment}</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-4 border-t border-black/5">
                    <div className="space-y-2">
                      <p className="text-[9px] uppercase tracking-widest text-gray-400 font-black">Patron Proposes</p>
                      <p className="text-sm font-clerk italic">"{message}"</p>
                    </div>
                    <div className="space-y-2">
                      <p className="text-[9px] uppercase tracking-widest text-gray-400 font-black">The Clerk Synchronizes</p>
                      <p className="text-sm font-clerk italic">"{log.clerk_response}"</p>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

const AdminSystemSettings: React.FC = () => {
  const [bargainingEnabled, setBargainingEnabled] = useState(true);
  const { addToast } = useStore();

  const handleToggle = () => {
    setBargainingEnabled(!bargainingEnabled);
    addToast(`Global Bargaining Protocol ${!bargainingEnabled ? 'Actuated' : 'Suspended'}`, !bargainingEnabled ? 'success' : 'info');
  };

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
               <p className="text-[10px] text-gray-400 uppercase tracking-widest">Instantly suspend all bargaining capabilities across the platform.</p>
             </div>
             <button 
                onClick={handleToggle}
                className={`w-16 h-8 rounded-full transition-all flex items-center px-1 ${bargainingEnabled ? 'bg-black justify-end' : 'bg-gray-200 justify-start'}`}
             >
                <div className="w-6 h-6 bg-white rounded-full shadow-md" />
             </button>
          </div>
          
          <div className="pt-8 border-t border-black/5 space-y-6">
            <p className="text-[10px] uppercase tracking-[0.5em] text-gray-400 font-black">Sync Frequency</p>
            <div className="flex items-center gap-4">
              <input type="range" className="flex-1 accent-black" min="1" max="60" defaultValue="15" />
              <span className="text-xs font-black uppercase">15m</span>
            </div>
          </div>
        </div>

        <div className="bg-black text-white p-10 flex flex-col justify-between">
           <div className="space-y-4">
             <div className="flex items-center gap-4 opacity-50">
               <Cpu size={18} />
               <span className="text-[10px] uppercase tracking-widest font-black">Neural Core Status</span>
             </div>
             <h2 className="text-3xl font-serif-elegant font-bold uppercase">Optimal Resonance</h2>
             <p className="text-[10px] uppercase tracking-widest text-gray-500 leading-relaxed">
               All archival synchronization engines are operating within acceptable parameters. No critical protocol failures documented in the last 24h.
             </p>
           </div>
           <button className="w-full border border-white/20 py-4 text-[10px] uppercase tracking-[0.4em] font-black hover:bg-white hover:text-black transition-all">
             Initialize Full Diagnostic
           </button>
        </div>
      </div>
    </div>
  );
};

const AdminDashboard: React.FC = () => {
  const data = [
    { name: 'Mon', revenue: 4000, haggles: 240 },
    { name: 'Tue', revenue: 3000, haggles: 139 },
    { name: 'Wed', revenue: 2000, haggles: 980 },
    { name: 'Thu', revenue: 2780, haggles: 390 },
    { name: 'Fri', revenue: 1890, haggles: 480 },
    { name: 'Sat', revenue: 2390, haggles: 380 },
    { name: 'Sun', revenue: 3490, haggles: 430 },
  ];

  const pieData = [
    { name: 'Outerwear', value: 400 },
    { name: 'Accessories', value: 300 },
    { name: 'Apparel', value: 300 },
    { name: 'Footwear', value: 200 },
  ];

  const COLORS = ['#000000', '#444444', '#888888', '#CCCCCC'];

  return (
    <div className="space-y-12 page-reveal">
      <div className="border-b border-black pb-10">
        <p className="text-[10px] uppercase tracking-[0.6em] text-gray-400 font-bold mb-4">Command Center</p>
        <h1 className="text-4xl md:text-6xl font-serif-elegant font-bold uppercase tracking-tighter">Overview</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <StatCard title="Active Session Revenue" value="$42,390" change="+12.5%" icon={<DollarSign size={16} />} />
        <StatCard title="Clerk Conversions" value="1,240" change="+8.2%" icon={<Target size={16} />} />
        <StatCard title="Retention Strength" value="94.2%" icon={<BarChart3 size={16} />} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
        <div className="lg:col-span-8 bg-white/50 backdrop-blur-xl border border-black/5 p-8">
          <p className="text-[10px] uppercase tracking-[0.4em] font-black text-gray-400 mb-10">Revenue Resonance vs Negotiations</p>
          <div className="h-[400px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data}>
                <defs>
                  <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#000" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#000" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 10, fontWeight: 900, textTransform: 'uppercase'}} />
                <YAxis axisLine={false} tickLine={false} tick={{fontSize: 10}} />
                <Tooltip 
                  contentStyle={{backgroundColor: '#000', color: '#fff', border: 'none', borderRadius: 0, textTransform: 'uppercase', fontSize: 10}}
                  itemStyle={{color: '#fff'}}
                />
                <Area type="monotone" dataKey="revenue" stroke="#000" fillOpacity={1} fill="url(#colorRev)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="lg:col-span-4 bg-white/50 backdrop-blur-xl border border-black/5 p-8 flex flex-col justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-[0.4em] font-black text-gray-400 mb-10">Category Velocity</p>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="space-y-4">
            {pieData.map((item, idx) => (
              <div key={item.name} className="flex justify-between items-center text-[10px] uppercase tracking-widest font-black">
                <span className="flex items-center gap-2">
                  <div className="w-2 h-2" style={{backgroundColor: COLORS[idx]}} />
                  {item.name}
                </span>
                <span>{item.value} Units</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

const Admin: React.FC = () => {
  const { user, loading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  useEffect(() => {
    // In a real environment, we'd check metadata.role === 'admin'
    // For this context, we will assume standard access or mock it
  }, [user, loading, navigate]);

  const navLinks = [
    { path: '/admin', icon: LayoutDashboard, label: 'Overview' },
    { path: '/admin/inventory', icon: Package, label: 'Inventory' },
    { path: '/admin/negotiations', icon: MessageSquare, label: 'Haggles' },
    { path: '/admin/sandbox', icon: Layers, label: 'Sandbox' },
    { path: '/admin/settings', icon: Settings, label: 'Protocols' },
  ];

  return (
    <div className="min-h-screen bg-[#FDFDFD] flex overflow-hidden">
      {/* Admin Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-[200] bg-black text-white transition-all duration-700 flex flex-col ${isSidebarOpen ? 'w-80' : 'w-0 overflow-hidden md:w-24'}`}>
        <div className="p-10 flex flex-col h-full justify-between">
          <div className="space-y-16">
            <Link to="/" className="font-serif-elegant text-2xl font-bold tracking-[0.2em] hover:opacity-50 transition-opacity">
              {isSidebarOpen ? 'MODERNIST' : 'M'}
            </Link>
            <nav className="space-y-4">
              {navLinks.map((link) => (
                <Link
                  key={link.path}
                  to={link.path}
                  className={`flex items-center gap-6 py-4 transition-all group ${location.pathname === link.path ? 'text-white' : 'text-gray-500 hover:text-white'}`}
                >
                  <link.icon size={20} strokeWidth={1.5} className="shrink-0" />
                  {isSidebarOpen && <span className="text-[11px] uppercase tracking-[0.3em] font-black">{link.label}</span>}
                  <ChevronRight size={12} className={`ml-auto opacity-0 group-hover:opacity-100 transition-opacity ${!isSidebarOpen && 'hidden'}`} />
                </Link>
              ))}
            </nav>
          </div>
          <div className="space-y-8">
            <div className="p-4 border border-white/10 flex items-center gap-4">
              <div className="w-8 h-8 bg-white/10 flex items-center justify-center">
                <User size={14} />
              </div>
              {isSidebarOpen && (
                <div className="overflow-hidden">
                  <p className="text-[9px] font-black uppercase tracking-widest truncate">Admin Liaison</p>
                  <p className="text-[7px] text-gray-500 uppercase tracking-widest truncate">Secured session</p>
                </div>
              )}
            </div>
            <button 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="w-full border border-white/20 py-3 text-[8px] uppercase tracking-[0.4em] font-black hover:bg-white hover:text-black transition-all"
            >
              {isSidebarOpen ? 'Collapse Terminal' : '...'}
            </button>
          </div>
        </div>
      </aside>

      {/* Main Admin Content */}
      <main className={`flex-1 transition-all duration-700 min-h-screen ${isSidebarOpen ? 'pl-80' : 'pl-24'}`}>
        <header className="h-24 glass border-b border-black/5 flex items-center justify-between px-10 sticky top-0 z-[190]">
          <div className="flex items-center gap-6">
            <button className="md:hidden" onClick={() => setIsSidebarOpen(!isSidebarOpen)}><Menu size={20} /></button>
            <div className="hidden lg:flex items-center gap-4 border border-black/5 px-4 py-2 bg-white/50 backdrop-blur-sm">
              <Search size={14} className="text-gray-400" />
              <input type="text" placeholder="GLOBAL QUERY..." className="bg-transparent border-none outline-none text-[10px] uppercase tracking-widest font-black w-64" />
            </div>
          </div>
          <div className="flex items-center gap-8">
            <button className="relative">
              <Bell size={20} strokeWidth={1} />
              <span className="absolute -top-1 -right-1 w-2 h-2 bg-black rounded-full" />
            </button>
            <div className="h-8 w-[1px] bg-black/5" />
            <Link to="/" className="flex items-center gap-3 text-[10px] uppercase tracking-widest font-black hover:opacity-50 transition-opacity">
              <span>View Storefront</span>
              <ExternalLink size={12} />
            </Link>
          </div>
        </header>

        <div className="p-10 max-w-[1400px]">
          <Routes>
            <Route path="/" element={<AdminDashboard />} />
            <Route path="/inventory" element={<AdminInventory />} />
            <Route path="/negotiations" element={<AdminNegotiations />} />
            <Route path="/sandbox" element={<AdminSimilaritySandbox />} />
            <Route path="/settings" element={<AdminSystemSettings />} />
          </Routes>
        </div>
      </main>
    </div>
  );
};

export default Admin;

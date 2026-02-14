
import React, { useEffect } from 'react';
import { HashRouter as Router, Routes, Route, useLocation, Link } from 'react-router-dom';
import { StoreProvider, useStore } from './context/StoreContext';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from 'next-themes';
import Navbar from './components/Navbar';
import ProductCard from './components/ProductCard';
import CartSidebar from './components/CartSidebar';
import AIChatAgent from './components/AIChatAgent';
import AuthModal from './components/AuthModal';
import ProductDetail from './pages/ProductDetail';
import Checkout from './pages/Checkout';
import OrderHistory from './pages/OrderHistory';
import Profile from './pages/Profile';
import Admin from './pages/Admin';
import { RefreshCcw, Sparkles, SlidersHorizontal, Info, CheckCircle, AlertCircle, X, ExternalLink, Plus } from 'lucide-react';

// Error Boundary to prevent blank screens
// @ts-ignore — React class component type workaround
class ErrorBoundary extends React.Component {
  constructor(props: any) {
    super(props);
    // @ts-ignore
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, info: any) {
    console.error('[ErrorBoundary] Caught:', error, info?.componentStack);
  }
  render() {
    // @ts-ignore
    if (this.state.hasError) {
      // @ts-ignore
      const err = this.state.error;
      return React.createElement('div', { style: { padding: 40, fontFamily: 'monospace', background: '#111', color: '#f55', minHeight: '100vh' } },
        React.createElement('h1', { style: { fontSize: 24, marginBottom: 16 } }, 'Something crashed'),
        React.createElement('pre', { style: { whiteSpace: 'pre-wrap', color: '#faa', fontSize: 14 } }, err?.message),
        React.createElement('pre', { style: { whiteSpace: 'pre-wrap', color: '#888', fontSize: 12, marginTop: 12 } }, err?.stack),
        React.createElement('button', { 
          onClick: () => window.location.reload(),
          style: { marginTop: 24, padding: '12px 24px', background: '#fff', color: '#000', border: 'none', cursor: 'pointer', fontWeight: 'bold' }
        }, 'Reload App')
      );
    }
    // @ts-ignore
    return this.props.children;
  }
}

const QuickViewModal: React.FC = () => {
  const { quickViewProduct, setQuickViewProduct, addToCart } = useStore();
  
  // Close on ESC
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setQuickViewProduct(null);
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [setQuickViewProduct]);

  if (!quickViewProduct) return null;

  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center p-4 md:p-8 animate-in fade-in duration-500">
      <div 
        className="absolute inset-0 bg-black/40 backdrop-blur-xl" 
        onClick={() => setQuickViewProduct(null)} 
      />
      
      <div className="relative w-full max-w-[1000px] bg-white dark:bg-black border border-black dark:border-white shadow-2xl overflow-hidden flex flex-col md:flex-row animate-in zoom-in-95 duration-500">
        <button 
          onClick={() => setQuickViewProduct(null)}
          className="absolute top-6 right-6 z-10 p-3 hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-all active:scale-90"
        >
          <X size={24} strokeWidth={1} />
        </button>

        <div className="w-full md:w-1/2 aspect-[3/4] md:aspect-auto bg-gray-50 dark:bg-gray-900 overflow-hidden">
          <img 
            src={quickViewProduct.image_url} 
            alt={quickViewProduct.name} 
            className="w-full h-full object-cover transition-transform duration-[2s] hover:scale-110"
          />
        </div>

        <div className="w-full md:w-1/2 p-8 md:p-12 flex flex-col justify-between">
          <div className="space-y-8">
            <div className="space-y-2">
              <span className="text-[10px] uppercase tracking-[0.5em] text-gray-400 dark:text-gray-500 font-black">{quickViewProduct.category}</span>
              <h2 className="font-serif-elegant text-4xl font-bold uppercase tracking-tight leading-tight">{quickViewProduct.name}</h2>
              <p className="text-2xl font-black">${quickViewProduct.price.toLocaleString()}</p>
            </div>

            <div className="border-t border-black/5 dark:border-white/5 pt-8 space-y-4">
              <p className="text-[10px] uppercase tracking-[0.5em] text-gray-400 dark:text-gray-500 font-black">Archival Inspection</p>
              <p className="text-sm leading-relaxed text-gray-600 dark:text-gray-400 font-clerk italic">
                "{quickViewProduct.description} This documented silhouette represents a permanent staple in our curated landscape."
              </p>
            </div>
          </div>

          <div className="space-y-4 mt-12">
            <button 
              onClick={() => {
                addToCart(quickViewProduct);
                setQuickViewProduct(null);
              }}
              className="w-full bg-black dark:bg-white text-white dark:text-black py-6 text-[10px] uppercase tracking-[0.4em] font-black flex items-center justify-center space-x-3 border border-black dark:border-white hover:bg-white hover:text-black dark:hover:bg-black dark:hover:text-white transition-all active:scale-95"
            >
              <Plus size={16} />
              <span>Add to Archive Bag</span>
            </button>
            
            <Link 
              to={`/product/${quickViewProduct.id}`}
              onClick={() => setQuickViewProduct(null)}
              className="w-full border border-black/10 dark:border-white/10 py-6 text-[10px] uppercase tracking-[0.4em] font-black flex items-center justify-center space-x-3 hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-all active:scale-95"
            >
              <ExternalLink size={16} />
              <span>Full Archive Entry</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

const ToastManager: React.FC = () => {
  const { toasts, removeToast } = useStore();
  
  return (
    <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[300] w-[95%] max-w-sm px-4 flex flex-col items-center gap-3 pointer-events-none">
      {toasts.map((toast) => (
        <div 
          key={toast.id} 
          className="toast-animate glass border border-black/10 dark:border-white/10 p-5 w-full shadow-2xl pointer-events-auto flex items-center gap-5 transition-all"
        >
          {toast.type === 'success' && <CheckCircle size={22} className="text-black dark:text-white shrink-0" />}
          {toast.type === 'info' && <Info size={22} className="text-gray-400 dark:text-gray-500 shrink-0" />}
          {toast.type === 'error' && <AlertCircle size={22} className="text-red-500 dark:text-red-400 shrink-0" />}
          
          <span className="text-[11px] uppercase tracking-[0.2em] font-black flex-1 leading-relaxed">
            {toast.message}
          </span>
          
          <button onClick={() => removeToast(toast.id)} className="p-2 hover:bg-black/5 dark:hover:bg-white/5 transition-colors active:scale-90">
            <X size={16} />
          </button>
        </div>
      ))}
    </div>
  );
};

const ProductGrid: React.FC = () => {
  const { products, currentCategory, activeVibe, isCurating, isInitialLoading, sortOrder, setSortOrder, resetArchive } = useStore();
  console.log('[ProductGrid] render: products.length=', products.length, 'isInitialLoading=', isInitialLoading, 'isCurating=', isCurating, 'productIds=', products.map(p => p.id));

  if (isInitialLoading) {
    return (
      <div className="min-h-[80vh] flex flex-col items-center justify-center space-y-8 page-reveal">
        <div className="modern-loader" />
        <p className="text-[10px] uppercase tracking-[0.6em] font-black text-gray-400 dark:text-gray-500 animate-pulse">Syncing Archival Collection...</p>
      </div>
    );
  }

  return (
    <div className="max-w-[1400px] mx-auto px-4 md:px-8 py-8 md:py-20 page-reveal">
      <div className="mb-12 md:mb-20 border-b border-black dark:border-white pb-10 flex flex-col lg:flex-row lg:items-end justify-between gap-10">
        <div className="relative group flex-1">
          <p className="text-[10px] uppercase tracking-[0.6em] text-gray-400 dark:text-gray-500 font-bold mb-6">Archival Collection</p>
          <h1 className="font-serif-elegant text-4xl sm:text-6xl md:text-8xl font-bold tracking-tighter uppercase leading-[0.9] truncate max-w-[90vw]">
            {activeVibe ? activeVibe : (currentCategory === 'All' ? 'Selection' : currentCategory)}
          </h1>
          
          <div className="flex items-center gap-5 mt-10">
            {activeVibe && (
              <button 
                onClick={resetArchive}
                className="flex items-center gap-3 bg-black dark:bg-white text-white dark:text-black px-6 py-3 text-[9px] uppercase tracking-[0.4em] font-black hover:bg-gray-800 dark:hover:bg-gray-200 transition-all active:scale-95 tap-highlight-none"
              >
                <RefreshCcw size={12} />
                <span>Reset Resonance</span>
              </button>
            )}
            {isCurating && (
              <div className="flex items-center gap-3 text-black dark:text-white animate-pulse">
                <div className="w-2 h-2 bg-black dark:bg-white rounded-full"></div>
                <span className="text-[10px] uppercase tracking-[0.5em] font-black">Synchronizing...</span>
              </div>
            )}
          </div>
        </div>
        
        <div className="flex flex-col items-start lg:items-end gap-8 w-full lg:w-auto">
           <div className="flex items-center space-x-8 text-[10px] uppercase tracking-widest font-black border border-black/10 dark:border-white/10 px-6 py-4 w-full sm:w-auto bg-gray-50/50 dark:bg-gray-900/50 backdrop-blur-sm">
              <SlidersHorizontal size={14} />
              <button onClick={() => setSortOrder('price-low')} className={`transition-opacity ${sortOrder === 'price-low' ? 'text-black dark:text-white underline underline-offset-4' : 'text-gray-400 dark:text-gray-500 hover:text-black dark:hover:text-white'}`}>Price: Low</button>
              <button onClick={() => setSortOrder('price-high')} className={`transition-opacity ${sortOrder === 'price-high' ? 'text-black dark:text-white underline underline-offset-4' : 'text-gray-400 dark:text-gray-500 hover:text-black dark:hover:text-white'}`}>Price: High</button>
           </div>
          <p className="hidden lg:block text-[11px] uppercase tracking-[0.4em] font-bold text-gray-400 max-w-xs text-right leading-loose italic">
            {activeVibe 
              ? `Archival synchronization for intent: "${activeVibe}".`
              : "Documented lifestyle staples. Crafted for permanent silhouettes."}
          </p>
        </div>
      </div>

      <div className={`relative transition-all duration-[1.2s] ease-in-out ${isCurating ? 'opacity-30 blur-md scale-[0.98]' : 'opacity-100 blur-0 scale-100'}`}>
        {products.length === 0 ? (
          <div className="py-40 text-center flex flex-col items-center animate-in fade-in zoom-in-95 duration-1000">
            <div className="w-16 h-[1px] bg-black/20 mb-12"></div>
            <p className="text-xs uppercase tracking-[0.5em] text-gray-300 font-bold mb-10 italic">Zero documented archival matches.</p>
            <button onClick={resetArchive} className="border border-black px-12 py-6 text-[10px] font-black uppercase tracking-[0.5em] hover:bg-black hover:text-white transition-all active:scale-95">Reset Selection</button>
          </div>
        ) : (
          <div key={`${products.length}-${products[0]?.id}-${products[products.length-1]?.id}`} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-6 md:gap-x-12 gap-y-16 md:gap-y-24">
            {products.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const Footer: React.FC = () => (
  <footer className="bg-black text-white pt-32 pb-16 mt-32">
    <div className="max-w-[1400px] mx-auto px-6 md:px-8">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-16 pb-24 border-b border-white/10">
        <div className="space-y-8">
          <h2 className="font-serif-elegant text-4xl font-bold tracking-[0.2em] text-white uppercase">MODERNIST</h2>
          <p className="text-[11px] leading-loose text-gray-500 uppercase tracking-[0.3em] font-bold italic">
            Ethically Archival. <br />
            Artisanally Synchronized. <br />
            Timelessly Curated.
          </p>
        </div>
        <div className="space-y-8">
          <h3 className="text-xs uppercase tracking-[0.4em] font-black">Correspondence</h3>
          <ul className="text-[10px] space-y-5 uppercase tracking-[0.2em] text-gray-600 font-black">
            <li className="hover:text-white cursor-pointer transition-colors">Patron Care</li>
            <li className="hover:text-white cursor-pointer transition-colors">Press Archive</li>
            <li className="hover:text-white cursor-pointer transition-colors">Digital Liaison</li>
          </ul>
        </div>
        <div className="space-y-8">
          <h3 className="text-xs uppercase tracking-[0.4em] font-black">The Journal</h3>
          <ul className="text-[10px] space-y-5 uppercase tracking-[0.2em] text-gray-600 font-black">
            <li className="hover:text-white cursor-pointer transition-colors">Synchronicity</li>
            <li className="hover:text-white cursor-pointer transition-colors">Preservation</li>
            <li className="hover:text-white cursor-pointer transition-colors">Ethics Protocol</li>
          </ul>
        </div>
        <div className="space-y-8">
          <h3 className="text-xs uppercase tracking-[0.4em] font-black">Sync List</h3>
          <div className="flex border-b border-white/20 focus-within:border-white transition-colors">
            <input type="email" placeholder="IDENTITY@ARCHIVE.COM" className="bg-transparent border-none outline-none flex-1 text-[10px] py-4 text-white placeholder:text-gray-800 tracking-widest font-black" />
            <button className="text-[10px] font-black uppercase tracking-[0.3em] px-4 active:scale-95">SYNC</button>
          </div>
          <p className="text-[8px] uppercase tracking-widest text-gray-700">Receive archival updates and exclusive synergy concessions.</p>
        </div>
      </div>
      <div className="pt-16 flex flex-col md:flex-row justify-between items-center space-y-8 md:space-y-0">
        <p className="text-[9px] uppercase tracking-[0.5em] text-gray-700 font-black">MODERNIST permanent archive © 2024. All intents reserved.</p>
        <div className="flex space-x-12 text-[9px] uppercase tracking-[0.5em] text-gray-700 font-black">
          <span className="hover:text-white cursor-pointer transition-colors">Instagram</span>
          <span className="hover:text-white cursor-pointer transition-colors">Vimeo Archive</span>
        </div>
      </div>
    </div>
  </footer>
);

const AppContent: React.FC = () => {
  const location = useLocation();
  const isAdminPath = location.pathname.startsWith('/admin');
  
  // Reset scroll and page resonance on path change
  React.useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  return (
    <div className="min-h-screen flex flex-col selection:bg-black selection:text-white overflow-x-hidden">
      {!isAdminPath && <Navbar />}
      <main className="flex-grow">
        <Routes>
          <Route path="/" element={<ProductGrid />} />
          <Route path="/product/:id" element={<ProductDetail />} />
          <Route path="/checkout" element={<Checkout />} />
          <Route path="/orders" element={<OrderHistory />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/admin/*" element={<Admin />} />
        </Routes>
      </main>
      {!isAdminPath && <Footer />}
      {!isAdminPath && <CartSidebar />}
      {!isAdminPath && <QuickViewModal />}
      {!isAdminPath && <AIChatAgent />}
      <AuthModal />
      <ToastManager />
    </div>
  );
}

const App: React.FC = () => {
  return (
    <ErrorBoundary>
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <AuthProvider>
        <StoreProvider>
          <Router>
            <AppContent />
          </Router>
        </StoreProvider>
      </AuthProvider>
    </ThemeProvider>
    </ErrorBoundary>
  );
};

export default App;


import React, { useEffect, useState } from 'react';
import { HashRouter as Router, Routes, Route, useLocation, useSearchParams, Link, Navigate } from 'react-router-dom';
import { StoreProvider, useStore } from './context/StoreContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import Navbar from './components/Navbar';
import ProductCard from './components/ProductCard';
import CartSidebar from './components/CartSidebar';
import AuthModal from './components/AuthModal';
import HeroSection from './components/HeroSection';
import { ProgressiveBlur } from './components/ui/progressive-blur';
import { motion } from 'framer-motion';
import { RefreshCcw, Sparkles, SlidersHorizontal, Info, CheckCircle, AlertCircle, X, ExternalLink, Plus } from 'lucide-react';
import GlobalLoader from './components/GlobalLoader';

const AIChatAgent = React.lazy(() => import('./components/AIChatAgent'));
const ProductDetail = React.lazy(() => import('./pages/ProductDetail'));
const Checkout = React.lazy(() => import('./pages/Checkout'));
const OrderHistory = React.lazy(() => import('./pages/OrderHistory'));
const Profile = React.lazy(() => import('./pages/Profile'));
const Admin = React.lazy(() => import('./pages/Admin'));
const Search = React.lazy(() => import('./pages/Search'));
const Wishlist = React.lazy(() => import('./pages/Wishlist'));
const PasswordReset = React.lazy(() => import('./pages/PasswordReset'));

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
  const { quickViewProduct, setQuickViewProduct, addToCartWithVariant, addToast } = useStore();
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [selectedColor, setSelectedColor] = useState<string | null>(null);

  useEffect(() => {
    setSelectedSize(null);
    setSelectedColor(null);
  }, [quickViewProduct?.id]);

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
              <p className="text-[10px] uppercase tracking-[0.5em] text-gray-400 dark:text-gray-500 font-black">About This Piece</p>
              <p className="text-sm leading-relaxed text-gray-600 dark:text-gray-400 font-clerk italic">
                "{quickViewProduct.description} This documented silhouette represents a permanent staple in our curated landscape."
              </p>
            </div>
          </div>

          {/* Size selector in quick view */}
          {(quickViewProduct.variants?.sizes || []).length > 0 && (
            <div className="space-y-3 border-t border-black/5 dark:border-white/5 pt-6">
              <p className="text-[10px] uppercase tracking-[0.4em] font-black">
                Size {selectedSize && <span className="text-gray-400">— {selectedSize}</span>}
              </p>
              <div className="flex flex-wrap gap-2">
                {(quickViewProduct.variants!.sizes || []).map(size => (
                  <button
                    key={size}
                    onClick={() => setSelectedSize(selectedSize === size ? null : size)}
                    className={`px-3 py-1.5 text-[8px] uppercase tracking-widest font-black border transition-all ${
                      selectedSize === size ? 'bg-black text-white border-black' : 'border-black/20 hover:border-black'
                    }`}
                  >
                    {size}
                  </button>
                ))}
              </div>
            </div>
          )}
          {(quickViewProduct.variants?.colors || []).length > 0 && (
            <div className="space-y-3">
              <p className="text-[10px] uppercase tracking-[0.4em] font-black">
                Colorway {selectedColor && <span className="text-gray-400">— {selectedColor}</span>}
              </p>
              <div className="flex gap-3">
                {(quickViewProduct.variants!.colors || []).map(color => (
                  <button
                    key={color}
                    onClick={() => setSelectedColor(selectedColor === color ? null : color)}
                    title={color}
                    className={`w-5 h-5 rounded-full border-2 transition-all ${selectedColor === color ? 'scale-125 border-black dark:border-white' : 'border-transparent hover:border-black/30'}`}
                    style={{ backgroundColor: color.toLowerCase() }}
                  />
                ))}
              </div>
            </div>
          )}

          <div className="space-y-4 mt-12">
            <button
              onClick={() => {
                const sizes = quickViewProduct.variants?.sizes || [];
                const colors = quickViewProduct.variants?.colors || [];
                if (sizes.length > 0 && !selectedSize) { addToast('Please select a size', 'info'); return; }
                if (colors.length > 0 && !selectedColor) { addToast('Please select a colorway', 'info'); return; }
                addToCartWithVariant(quickViewProduct, selectedSize || undefined, selectedColor || undefined);
                setQuickViewProduct(null);
              }}
              className="w-full bg-black dark:bg-white text-white dark:text-black py-6 text-[10px] uppercase tracking-[0.4em] font-black flex items-center justify-center space-x-3 border border-black dark:border-white hover:bg-white hover:text-black dark:hover:bg-black dark:hover:text-white transition-all active:scale-95"
            >
              <Plus size={16} />
              <span>Add to Bag</span>
            </button>

            <Link
              to={`/product/${quickViewProduct.id}`}
              onClick={() => setQuickViewProduct(null)}
              className="w-full border border-black/10 dark:border-white/10 py-6 text-[10px] uppercase tracking-[0.4em] font-black flex items-center justify-center space-x-3 hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-all active:scale-95"
            >
              <ExternalLink size={16} />
              <span>View Full Details</span>
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
          className={`toast-animate glass p-5 w-full shadow-2xl pointer-events-auto flex items-center gap-5 transition-all ${toast.type === 'success'
            ? 'border-2 border-green-500 bg-green-50/90 dark:bg-green-950/50'
            : toast.type === 'error'
              ? 'border border-red-500/30 dark:border-red-500/30'
              : 'border border-black/10 dark:border-white/10'
            }`}
        >
          {toast.type === 'success' && <CheckCircle size={22} className="text-green-600 dark:text-green-400 shrink-0" />}
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

  if (isInitialLoading) {
    return (
      <div className="min-h-[80vh] flex flex-col items-center justify-center space-y-8 page-reveal">
        <div className="modern-loader" />
        <p className="text-[10px] uppercase tracking-[0.6em] font-black text-gray-400 dark:text-gray-500 animate-pulse">Loading collection...</p>
      </div>
    );
  }

  return (
    <section className="bg-[color:var(--bg-primary)] text-[color:var(--text-primary)]">
      <div id="products-section" className="relative max-w-[1400px] mx-auto px-4 md:px-8 py-8 md:py-20 page-reveal overflow-hidden bg-[color:var(--bg-primary)]">
      <div className="mb-12 md:mb-20 border-b border-black dark:border-white pb-10 flex flex-col lg:flex-row lg:items-end justify-between gap-10">
        <div className="relative group flex-1">
          <p className="text-[10px] uppercase tracking-[0.6em] text-gray-400 dark:text-gray-500 font-bold mb-6">Our Collection</p>
          <h1 className="font-serif text-4xl sm:text-6xl md:text-8xl font-bold tracking-tighter uppercase leading-[0.9] break-words text-black dark:text-white">
            {activeVibe ? activeVibe : (currentCategory === 'All' ? 'Selection' : currentCategory)}
          </h1>

          <div className="flex items-center gap-5 mt-10">
            {activeVibe && (
              <button
                onClick={resetArchive}
                className="flex items-center gap-3 bg-black dark:bg-white text-white dark:text-black px-6 py-3 text-[9px] uppercase tracking-[0.4em] font-black hover:bg-gray-800 dark:hover:bg-gray-200 transition-all active:scale-95 tap-highlight-none"
              >
                <RefreshCcw size={12} />
                <span>Clear Filter</span>
              </button>
            )}
            {isCurating && (
              <div className="flex items-center gap-3 text-black dark:text-white animate-pulse">
                <div className="w-2 h-2 bg-black dark:bg-white rounded-full"></div>
                <span className="text-[10px] uppercase tracking-[0.5em] font-black">Updating...</span>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col items-start lg:items-end gap-8 w-full lg:w-auto">
          <div className="flex items-center space-x-4 md:space-x-8 text-[10px] uppercase tracking-widest font-black border border-black/10 dark:border-white/10 px-4 md:px-6 py-4 w-full sm:w-auto bg-gray-50/50 dark:bg-gray-900/50 backdrop-blur-sm">
            <SlidersHorizontal size={14} />
            <button onClick={() => setSortOrder('price-low')} className={`transition-opacity ${sortOrder === 'price-low' ? 'text-black dark:text-white underline underline-offset-4' : 'text-gray-400 dark:text-gray-500 hover:text-black dark:hover:text-white'}`}>Price: Low</button>
            <button onClick={() => setSortOrder('price-high')} className={`transition-opacity ${sortOrder === 'price-high' ? 'text-black dark:text-white underline underline-offset-4' : 'text-gray-400 dark:text-gray-500 hover:text-black dark:hover:text-white'}`}>Price: High</button>
          </div>
          <p className="hidden lg:block text-[11px] uppercase tracking-[0.4em] font-bold text-gray-400 max-w-xs text-right leading-loose italic">
            {activeVibe
              ? `Showing results for "${activeVibe}"`
              : "Fine jewellery. Crafted to last."}
          </p>
        </div>
      </div>

      <div className={`relative transition-all duration-[1.2s] ease-in-out ${isCurating ? 'opacity-30 blur-md scale-[0.98]' : 'opacity-100 blur-0 scale-100'}`}>
        {products.length === 0 ? (
          <div className="py-40 text-center flex flex-col items-center animate-in fade-in zoom-in-95 duration-1000">
            <div className="w-16 h-[1px] bg-black/20 mb-12"></div>
            <p className="text-xs uppercase tracking-[0.5em] text-gray-300 font-bold mb-10 italic">No products found.</p>
            <button onClick={resetArchive} className="border border-black px-12 py-6 text-[10px] font-black uppercase tracking-[0.5em] hover:bg-black hover:text-white transition-all active:scale-95">Clear Filter</button>
          </div>
        ) : (
          <div key={`${products.length}-${products[0]?.id}-${products[products.length - 1]?.id}`} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-6 md:gap-x-12 gap-y-16 md:gap-y-24">
            {products.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}
      </div>

      {/* Progressive blur at bottom of products section */}
        <ProgressiveBlur height="200px" position="bottom" className="opacity-40" />
      </div>
    </section>
  );
};

const PhilosophySection: React.FC = () => {
  return (
    <section className="bg-white dark:bg-black border-b border-black/5 dark:border-white/5">
      <div className="max-w-[1400px] mx-auto px-6 md:px-16 py-24 md:py-40">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.1fr] gap-20 lg:gap-32 items-start">

          {/* Left: editorial copy */}
          <motion.div
            initial={{ opacity: 0, y: 32 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 1.4, ease: [0.16, 1, 0.3, 1] }}
            viewport={{ once: true }}
            className="space-y-12 lg:sticky lg:top-32"
          >
            <p className="text-[10px] uppercase tracking-[0.8em] text-gray-400 dark:text-gray-600 font-medium">Fine Jewellery</p>
            <h2
              className="text-5xl md:text-6xl lg:text-7xl font-light leading-[0.9] tracking-tight text-black dark:text-white"
              style={{ fontFamily: 'var(--font-primary)' }}
            >
              Rare<br />Stones.
            </h2>
            <p
              className="text-base md:text-lg text-gray-500 dark:text-gray-400 leading-[1.8] max-w-sm font-light"
              style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic' }}
            >
              A curated archive of fine diamonds, precious metals, and certified stones.
              Each piece selected for permanence — not for seasons.
            </p>
            <div className="flex items-center gap-8 pt-2">
              <div className="w-16 h-px bg-black/15 dark:bg-white/15" />
              <span className="text-[10px] uppercase tracking-[0.5em] font-semibold text-black/40 dark:text-white/40 hover:text-black dark:hover:text-white transition-colors cursor-pointer">
                Browse Collection
              </span>
            </div>
          </motion.div>

          {/* Right: attribute grid */}
          <div className="grid grid-cols-2 gap-px bg-black/5 dark:bg-white/[0.06]">
            {[
              { num: '01', label: 'Brilliant', desc: 'Every facet cut to optical perfection.' },
              { num: '02', label: 'Eternal', desc: 'Stones that outlast every season.' },
              { num: '03', label: 'Precise', desc: 'GIA certified. Nothing left to chance.' },
              { num: '04', label: 'Tactile', desc: 'The felt weight of precious metal.' },
            ].map((item, i) => (
              <motion.div
                key={item.label}
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                transition={{ duration: 0.8, delay: i * 0.1 }}
                viewport={{ once: true }}
                className="bg-white dark:bg-black p-8 md:p-12 space-y-4 hover:bg-gray-50/70 dark:hover:bg-white/[0.02] transition-colors group"
              >
                <span className="text-[10px] text-gray-300 dark:text-gray-700 font-medium tracking-widest">{item.num}</span>
                <h3 className="text-sm font-semibold uppercase tracking-[0.35em] text-black dark:text-white group-hover:tracking-[0.45em] transition-all duration-500">{item.label}</h3>
                <p className="text-[11px] text-gray-400 dark:text-gray-500 leading-loose font-light">{item.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

const TICKER_ITEMS = [
  'Fine Jewellery', 'GIA Certified', 'Permanent Archive', 'Precious Metals',
  'Est. 2024', 'Ethically Sourced', 'Artisan Craft', 'Rare Stones', 'Timeless Design',
];

const MarqueeTicker: React.FC = () => (
  <div className="overflow-hidden border-y border-black/5 dark:border-white/5 bg-white dark:bg-black py-4 select-none">
    <div className="flex whitespace-nowrap" style={{ animation: 'marquee 28s linear infinite' }}>
      {[...TICKER_ITEMS, ...TICKER_ITEMS, ...TICKER_ITEMS].map((item, i) => (
        <span key={i} className="inline-flex items-center gap-6 px-6 text-[10px] uppercase tracking-[0.45em] font-medium text-black/30 dark:text-white/25">
          {item}
          <span className="w-1 h-1 bg-black/20 dark:bg-white/20 rounded-full" />
        </span>
      ))}
    </div>
  </div>
);

const HomePage: React.FC = () => {
  return (
    <HeroSection>
      <PhilosophySection />
      <MarqueeTicker />
      <ProductGrid />
    </HeroSection>
  );
};

const Footer: React.FC = () => (
  <footer className="bg-black text-white pt-20 pb-10 md:pt-28 md:pb-16 relative z-10">
    <div className="max-w-[1400px] mx-auto px-6 md:px-8">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 md:gap-12 lg:gap-16 pb-12 md:pb-20 border-b border-white/10">
        <div className="space-y-8">
          <h2 className="font-serif-elegant text-4xl font-bold tracking-[0.2em] text-white uppercase">MODERNIST</h2>
          <p className="text-[11px] leading-loose text-gray-500 uppercase tracking-[0.3em] font-bold italic">
            Ethically Sourced. <br />
            Artisan Made. <br />
            Built to Last.
          </p>
        </div>
        <div className="space-y-8">
          <h3 className="text-xs uppercase tracking-[0.4em] font-black">Correspondence</h3>
          <ul className="text-[10px] space-y-5 uppercase tracking-[0.2em] text-gray-600 font-black">
            <li className="hover:text-white cursor-pointer transition-colors">Customer Service</li>
            <li className="hover:text-white cursor-pointer transition-colors">Press</li>
            <li className="hover:text-white cursor-pointer transition-colors">Contact Us</li>
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
          <h3 className="text-xs uppercase tracking-[0.4em] font-black">Newsletter</h3>
          <div className="flex border-b border-white/20 focus-within:border-white transition-colors">
            <input type="email" placeholder="your@email.com" className="bg-transparent border-none outline-none flex-1 text-[10px] py-4 text-white placeholder:text-gray-600 tracking-widest font-black" />
            <button className="text-[10px] font-black uppercase tracking-[0.3em] px-4 active:scale-95">Join</button>
          </div>
          <p className="text-[8px] uppercase tracking-widest text-gray-700">New arrivals, exclusive offers, and stories from our makers.</p>
        </div>
      </div>
      <div className="pt-16 flex flex-col md:flex-row justify-between items-center space-y-8 md:space-y-0">
        <p className="text-[9px] uppercase tracking-[0.5em] text-gray-700 font-black">MODERNIST permanent archive © 2024. All intents reserved.</p>
        <div className="flex space-x-12 text-[9px] uppercase tracking-[0.5em] text-gray-700 font-black">
          <span className="hover:text-white cursor-pointer transition-colors">Instagram</span>
          <span className="hover:text-white cursor-pointer transition-colors">Videos</span>
        </div>
      </div>
    </div>
  </footer>
);

const AdminGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, profile, loading } = useAuth();
  if (loading) return null;
  if (!user || profile?.role !== 'admin') return <Navigate to="/" replace />;
  return <>{children}</>;
};

const HomeOrAdmin: React.FC = () => {
  const { user, profile, loading } = useAuth();
  const [searchParams] = useSearchParams();
  const isPreview = searchParams.get('preview') === 'customer';
  if (loading) return null;
  // Admins go to /admin unless they explicitly clicked "View as Customer"
  if (user && profile?.role === 'admin' && !isPreview) return <Navigate to="/admin" replace />;
  return <HomePage />;
};

const AppContent: React.FC = () => {
  const location = useLocation();
  const isAdminPath = location.pathname.startsWith('/admin');

  // Reset scroll and page resonance on path change
  React.useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  return (
    <div className="min-h-screen flex flex-col selection:bg-black selection:text-white overflow-x-hidden">
      <GlobalLoader />
      {!isAdminPath && <Navbar />}
      <main className="flex-grow">
        <React.Suspense fallback={null}>
          <Routes>
            <Route path="/" element={<HomeOrAdmin />} />
            <Route path="/product/:id" element={<ProductDetail />} />
            <Route path="/checkout" element={<Checkout />} />
            <Route path="/orders" element={<OrderHistory />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/admin/*" element={<AdminGuard><Admin /></AdminGuard>} />
            <Route path="/search" element={<Search />} />
            <Route path="/wishlist" element={<Wishlist />} />
            <Route path="/password-reset" element={<PasswordReset />} />
          </Routes>
        </React.Suspense>
      </main>
      {!isAdminPath && <Footer />}
      {!isAdminPath && <CartSidebar />}
      {!isAdminPath && <QuickViewModal />}
      {!isAdminPath && <React.Suspense fallback={null}><AIChatAgent /></React.Suspense>}
      <AuthModal />
      <ToastManager />
    </div>
  );
}

const App: React.FC = () => {
  return (
    <ErrorBoundary>
      <ThemeProvider>
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

import React, { useState, useEffect } from 'react';
import { ShoppingBag, Search, Menu, X, User, LogOut, Package, ChevronRight, UserCircle, Heart, LayoutDashboard } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '../context/StoreContext';
import { useAuth } from '../context/AuthContext';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { AnimatedThemeToggler } from './ui/animated-theme-toggler';

const LEFT_CATS = ['Watches', 'Rings', 'Necklaces'];
const RIGHT_CATS = ['Bracelets', 'Earrings', 'Diamonds'];

const Navbar: React.FC = () => {
  const { cart, toggleCart, filterByCategory, currentCategory, searchProducts } = useStore();
  const { user, profile, setAuthModalOpen, logout } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const navigate = useNavigate();
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);

  const cartCount = cart.reduce((acc, item) => acc + item.quantity, 0);
  const allCategories = ['All', 'Watches', 'Rings', 'Necklaces', 'Bracelets', 'Earrings', 'Diamonds'];

  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 60);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = isMobileMenuOpen ? 'hidden' : 'unset';
    return () => { document.body.style.overflow = 'unset'; };
  }, [isMobileMenuOpen]);

  useEffect(() => {
    const delay = setTimeout(() => searchProducts(searchValue), 300);
    return () => clearTimeout(delay);
  }, [searchValue]);

  useEffect(() => { setIsMobileMenuOpen(false); }, [location.pathname]);

  const displayName = user?.user_metadata?.full_name || user?.user_metadata?.display_name || 'Patron';

  const scrollToProducts = (cat: string) => {
    try { filterByCategory(cat); } catch {}
    const el = document.getElementById('products-section');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const navCatClass = (cat: string) =>
    `text-[9px] font-semibold uppercase tracking-[0.22em] transition-all duration-300 relative group cursor-pointer
    ${isScrolled
      ? cat === currentCategory
        ? 'text-black dark:text-white'
        : 'text-black/40 dark:text-white/40 hover:text-black dark:hover:text-white'
      : cat === currentCategory
        ? 'text-white'
        : 'text-white/50 hover:text-white'
    }`;

  return (
    <>
      {/* ── Main bar ─────────────────────────────────────────── */}
      <header
        className={`sticky top-0 z-[100] transition-all duration-500 ${
          isScrolled
            ? 'bg-white/92 dark:bg-[#080808]/92 backdrop-blur-2xl border-b border-black/6 dark:border-white/6 shadow-[0_1px_0_0_rgba(0,0,0,0.04)]'
            : 'bg-transparent border-b border-transparent'
        }`}
      >
        <div className="max-w-[1400px] mx-auto px-5 md:px-10">
          <div className="flex items-center justify-between h-14 md:h-16 gap-6">

            {/* LEFT — categories (desktop) | hamburger (mobile) */}
            <div className="flex items-center gap-5 md:gap-7 flex-1">
              <button
                className="md:hidden p-1 -ml-1 active:scale-90 transition-transform tap-highlight-none"
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                aria-label="Toggle Menu"
              >
                {isMobileMenuOpen
                  ? <X size={20} strokeWidth={1.5} className={isScrolled ? 'text-black dark:text-white' : 'text-white'} />
                  : <Menu size={20} strokeWidth={1.5} className={isScrolled ? 'text-black dark:text-white' : 'text-white'} />
                }
              </button>

              <nav className="hidden md:flex items-center gap-6 lg:gap-8">
                {LEFT_CATS.map(cat => (
                  <button key={cat} onClick={() => scrollToProducts(cat)} className={navCatClass(cat)}>
                    {cat}
                    <span className={`absolute -bottom-0.5 left-0 w-full h-px transition-transform duration-500 origin-left
                      ${isScrolled ? 'bg-black dark:bg-white' : 'bg-white'}
                      ${currentCategory === cat ? 'scale-x-100' : 'scale-x-0 group-hover:scale-x-100'}`}
                    />
                  </button>
                ))}
              </nav>
            </div>

            {/* CENTER — wordmark, only visible when scrolled */}
            <Link
              to="/"
              className={`absolute left-1/2 -translate-x-1/2 font-serif text-base md:text-lg tracking-[0.28em] font-medium transition-all duration-500 whitespace-nowrap hover:opacity-60 ${
                isScrolled ? 'text-black dark:text-white opacity-100' : 'opacity-0 pointer-events-none'
              }`}
            >
              MODERNIST
            </Link>

            {/* RIGHT — categories (desktop) + icons */}
            <div className="flex items-center gap-5 md:gap-6 flex-1 justify-end">
              <nav className="hidden md:flex items-center gap-6 lg:gap-8">
                {RIGHT_CATS.map(cat => (
                  <button key={cat} onClick={() => scrollToProducts(cat)} className={navCatClass(cat)}>
                    {cat}
                    <span className={`absolute -bottom-0.5 left-0 w-full h-px transition-transform duration-500 origin-left
                      ${isScrolled ? 'bg-black dark:bg-white' : 'bg-white'}
                      ${currentCategory === cat ? 'scale-x-100' : 'scale-x-0 group-hover:scale-x-100'}`}
                    />
                  </button>
                ))}
              </nav>

              {/* Search toggle */}
              <button
                onClick={() => setIsSearchOpen(!isSearchOpen)}
                className={`p-1.5 transition-all active:scale-90 tap-highlight-none ${isScrolled ? 'text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white' : 'text-white/70 hover:text-white'}`}
                aria-label="Search"
              >
                <Search size={16} strokeWidth={1.5} />
              </button>

              <AnimatedThemeToggler className={`w-8 h-8 transition-colors ${isScrolled ? 'text-black dark:text-white' : 'text-white'}`} />

              {/* User */}
              {user ? (
                <button
                  onClick={() => setIsProfileOpen(!isProfileOpen)}
                  className="w-7 h-7 flex items-center justify-center border transition-all active:scale-90 tap-highlight-none overflow-hidden
                    border-current"
                  style={{ color: isScrolled ? undefined : 'rgba(255,255,255,0.8)' }}
                >
                  {user.user_metadata?.avatar_url ? (
                    <img src={user.user_metadata.avatar_url} alt={displayName} className="w-full h-full object-cover" />
                  ) : (
                    <User size={11} strokeWidth={1.5} />
                  )}
                </button>
              ) : (
                <button
                  onClick={() => setAuthModalOpen(true)}
                  className={`p-1.5 transition-all active:scale-90 tap-highlight-none ${isScrolled ? 'text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white' : 'text-white/70 hover:text-white'}`}
                >
                  <User size={16} strokeWidth={1.5} />
                </button>
              )}

              <Link
                to="/wishlist"
                className={`p-1.5 transition-all active:scale-90 tap-highlight-none ${isScrolled ? 'text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white' : 'text-white/70 hover:text-white'}`}
              >
                <Heart size={16} strokeWidth={1.5} />
              </Link>

              <button
                onClick={toggleCart}
                className={`relative p-1.5 transition-all active:scale-90 tap-highlight-none ${isScrolled ? 'text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white' : 'text-white/70 hover:text-white'}`}
              >
                <ShoppingBag size={16} strokeWidth={1.5} />
                {cartCount > 0 && (
                  <span className={`absolute -top-0.5 -right-0.5 text-[7px] w-3.5 h-3.5 flex items-center justify-center font-bold
                    ${isScrolled ? 'bg-black dark:bg-white text-white dark:text-black' : 'bg-white text-black'}`}>
                    {cartCount}
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Search bar dropdown */}
        <AnimatePresence>
          {isSearchOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="overflow-hidden border-t border-black/6 dark:border-white/6"
            >
              <div className="max-w-[1400px] mx-auto px-5 md:px-10 py-4 flex items-center gap-4">
                <Search size={14} strokeWidth={1.5} className="text-gray-400 shrink-0" />
                <input
                  autoFocus
                  type="text"
                  placeholder="Search the archive..."
                  value={searchValue}
                  onChange={e => setSearchValue(e.target.value)}
                  className="flex-1 bg-transparent border-none outline-none text-[11px] uppercase tracking-[0.3em] text-black dark:text-white placeholder:text-gray-300 dark:placeholder:text-gray-700"
                />
                <button onClick={() => setIsSearchOpen(false)} className="text-gray-400 hover:text-black dark:hover:text-white transition-colors">
                  <X size={14} strokeWidth={1.5} />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* ── Profile dropdown ─────────────────────────────── */}
      <AnimatePresence>
        {user && isProfileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[140]"
              onClick={() => setIsProfileOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, y: 8, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.97 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="fixed top-[3.8rem] md:top-[4.5rem] right-4 md:right-10 w-72 bg-white dark:bg-[#0a0a0a] border border-black/8 dark:border-white/8 shadow-[0_24px_48px_-8px_rgba(0,0,0,0.18)] dark:shadow-[0_24px_48px_-8px_rgba(0,0,0,0.9)] p-6 z-[150]"
            >
              <div className="mb-5 pb-5 border-b border-black/6 dark:border-white/6 flex items-start justify-between">
                <div>
                  <p className="text-[9px] text-gray-400 font-medium uppercase tracking-[0.3em] mb-1.5">Signed in as</p>
                  <p className="text-sm font-medium text-black dark:text-white truncate max-w-[180px]">{displayName}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5 truncate max-w-[180px]">{user.email}</p>
                </div>
                <div className="w-9 h-9 bg-black dark:bg-white text-white dark:text-black flex items-center justify-center shrink-0">
                  <span className="font-serif text-sm font-medium">{displayName.charAt(0).toUpperCase()}</span>
                </div>
              </div>

              <div className="space-y-0.5">
                {[
                  { to: '/profile', icon: UserCircle, label: 'My Profile' },
                  { to: '/orders', icon: Package, label: 'My Orders' },
                  { to: '/wishlist', icon: Heart, label: 'Wishlist' },
                ].map(({ to, icon: Icon, label }) => (
                  <Link
                    key={to}
                    to={to}
                    onClick={() => setIsProfileOpen(false)}
                    className="group flex items-center justify-between text-[10px] uppercase tracking-[0.22em] font-medium py-3 px-2 hover:bg-black/3 dark:hover:bg-white/3 transition-all text-black dark:text-white"
                  >
                    <span className="flex items-center gap-3">
                      <Icon size={13} strokeWidth={1.5} className="opacity-40 group-hover:opacity-70 transition-opacity" />
                      {label}
                    </span>
                    <ChevronRight size={11} className="opacity-0 -translate-x-1 group-hover:opacity-50 group-hover:translate-x-0 transition-all" />
                  </Link>
                ))}

                {isAdmin && (
                  <>
                    <div className="h-px bg-black/5 dark:bg-white/5 my-1" />
                    <Link
                      to="/admin"
                      onClick={() => setIsProfileOpen(false)}
                      className="group flex items-center justify-between text-[10px] uppercase tracking-[0.22em] font-medium py-3 px-2 hover:bg-black/3 dark:hover:bg-white/3 transition-all text-black dark:text-white"
                    >
                      <span className="flex items-center gap-3">
                        <LayoutDashboard size={13} strokeWidth={1.5} className="opacity-40 group-hover:opacity-70 transition-opacity" />
                        Admin Panel
                      </span>
                      <ChevronRight size={11} className="opacity-0 -translate-x-1 group-hover:opacity-50 group-hover:translate-x-0 transition-all" />
                    </Link>
                  </>
                )}

                <div className="h-px bg-black/5 dark:bg-white/5 my-1" />

                <button
                  onClick={() => { logout(); setIsProfileOpen(false); }}
                  className="group w-full flex items-center gap-3 text-[10px] uppercase tracking-[0.22em] font-medium py-3 px-2 hover:bg-red-50 dark:hover:bg-red-900/10 transition-all text-red-500"
                >
                  <LogOut size={13} strokeWidth={1.5} className="opacity-60 group-hover:opacity-100" />
                  Sign Out
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── Mobile menu ──────────────────────────────────── */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="fixed inset-0 z-[150] bg-white dark:bg-black md:hidden flex flex-col"
          >
            <div className="h-14 shrink-0 flex items-center justify-between px-5 border-b border-black/5 dark:border-white/5">
              <Link to="/" className="font-serif text-sm tracking-[0.28em] text-black dark:text-white">MODERNIST</Link>
              <button onClick={() => setIsMobileMenuOpen(false)} className="p-1 tap-highlight-none">
                <X size={20} strokeWidth={1.5} className="text-black dark:text-white" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto no-scrollbar px-6 pt-10 pb-6 space-y-10">
              <div>
                <p className="text-[9px] uppercase tracking-[0.6em] text-gray-300 dark:text-gray-700 font-medium mb-7">Collection</p>
                <nav className="space-y-1">
                  {allCategories.map((cat, idx) => (
                    <motion.button
                      key={cat}
                      initial={{ opacity: 0, x: -12 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.5, delay: idx * 0.05, ease: [0.16, 1, 0.3, 1] }}
                      onClick={() => { scrollToProducts(cat); setIsMobileMenuOpen(false); }}
                      className={`block w-full text-left py-3 border-b border-black/5 dark:border-white/5 transition-all active:scale-[0.98] tap-highlight-none
                        ${currentCategory === cat
                          ? 'text-black dark:text-white'
                          : 'text-black/30 dark:text-white/30'
                        }`}
                      style={{ fontFamily: 'var(--font-primary)', fontSize: 'clamp(1.6rem, 6vw, 2.2rem)', fontWeight: 300, letterSpacing: '-0.01em' }}
                    >
                      {cat}
                    </motion.button>
                  ))}
                </nav>
              </div>

              <div className="space-y-4">
                <p className="text-[9px] uppercase tracking-[0.6em] text-gray-300 dark:text-gray-700 font-medium">Search</p>
                <div className="flex items-center gap-3 border-b border-black/15 dark:border-white/15 pb-3 focus-within:border-black dark:focus-within:border-white transition-colors">
                  <Search size={14} strokeWidth={1.5} className="text-gray-300 dark:text-gray-700" />
                  <input
                    type="text"
                    placeholder="Search archive..."
                    value={searchValue}
                    onChange={e => setSearchValue(e.target.value)}
                    className="bg-transparent border-none outline-none flex-1 text-sm text-black dark:text-white placeholder:text-gray-200 dark:placeholder:text-gray-800"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {user ? (
                  <button
                    onClick={() => { setIsProfileOpen(true); setIsMobileMenuOpen(false); }}
                    className="bg-black dark:bg-white text-white dark:text-black py-5 text-[9px] font-semibold uppercase tracking-[0.35em] active:scale-95 transition-all"
                  >
                    {displayName.split(' ')[0]}
                  </button>
                ) : (
                  <button
                    onClick={() => { setAuthModalOpen(true); setIsMobileMenuOpen(false); }}
                    className="bg-black dark:bg-white text-white dark:text-black py-5 text-[9px] font-semibold uppercase tracking-[0.35em] active:scale-95 transition-all"
                  >
                    Sign In
                  </button>
                )}
                <button
                  onClick={() => { toggleCart(); setIsMobileMenuOpen(false); }}
                  className="border border-black dark:border-white text-black dark:text-white py-5 text-[9px] font-semibold uppercase tracking-[0.35em] active:scale-95 transition-all flex items-center justify-center gap-2"
                >
                  <ShoppingBag size={13} strokeWidth={1.5} />
                  {cartCount > 0 ? `Bag (${cartCount})` : 'Bag'}
                </button>
              </div>
            </div>

            <div className="px-6 py-5 border-t border-black/5 dark:border-white/5">
              <p className="text-[8px] uppercase tracking-[0.5em] text-gray-300 dark:text-gray-700">MODERNIST Permanent Archive © 2024</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default Navbar;

import React, { useState, useEffect } from 'react';
import { ShoppingBag, Search, Menu, X, User, LogOut, Package, ChevronRight, UserCircle } from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { useAuth } from '../context/AuthContext';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import ThemeToggle from './ThemeToggle';

const Navbar: React.FC = () => {
  const { cart, toggleCart, filterByCategory, currentCategory, searchProducts } = useStore();
  const { user, setAuthModalOpen, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  const cartCount = cart.reduce((acc, item) => acc + item.quantity, 0);
  const categories = ['All', 'Watches', 'Rings', 'Necklaces', 'Bracelets'];

  // International Standard: Body Scroll Lock
  useEffect(() => {
    if (isMobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => { document.body.style.overflow = 'unset'; };
  }, [isMobileMenuOpen]);

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      searchProducts(searchValue);
    }, 300);
    return () => clearTimeout(delayDebounceFn);
  }, [searchValue]);

  // Close mobile menu on route change
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  // Get display name from Supabase metadata
  const displayName = user?.user_metadata?.full_name || user?.user_metadata?.display_name || 'Patron';

  return (
    <>
      <header className="sticky top-0 z-[100] w-full glass border-b border-black transition-all duration-500">
        <div className="max-w-[1400px] mx-auto px-4 md:px-8">
          <div className="flex items-center justify-between h-16 md:h-20">

            {/* Hamburger Trigger - Optimized touch zone */}
            <button
              className="md:hidden p-3 -ml-3 active:scale-90 transition-transform z-[210] relative tap-highlight-none"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              aria-label="Toggle Menu"
            >
              {isMobileMenuOpen ? <X size={24} strokeWidth={1.5} /> : <Menu size={24} strokeWidth={1.5} />}
            </button>

            <div className="flex-1 md:flex-none flex justify-center md:block">
              <Link to="/" className="font-serif-elegant text-xl md:text-2xl font-bold tracking-[0.2em] text-black dark:text-white transition-opacity hover:opacity-70">
                MODERNIST
              </Link>
            </div>

            <nav className="hidden md:flex items-center space-x-8">
              {categories.slice(0, 5).map((cat) => (
                <button
                  key={cat}
                  onClick={() => filterByCategory(cat)}
                  className={`text-[10px] font-bold uppercase tracking-[0.2em] transition-all relative group ${currentCategory === cat ? 'text-black' : 'text-gray-400 hover:text-black'
                    }`}
                >
                  {cat}
                  <span className={`absolute -bottom-1 left-0 w-full h-[1px] bg-black transition-transform duration-500 origin-left ${currentCategory === cat ? 'scale-x-100' : 'scale-x-0 group-hover:scale-x-100'}`} />
                </button>
              ))}
            </nav>

            <div className="flex items-center space-x-2 md:space-x-6">
              <div className={`hidden lg:flex items-center border-b transition-all duration-500 ${isSearchFocused || searchValue ? 'border-black w-64' : 'border-black/10 w-40'}`}>
                <div className="flex items-center w-full px-1">
                  <Search size={14} strokeWidth={1.5} className={isSearchFocused ? 'text-black' : 'text-gray-400'} />
                  <input
                    type="text"
                    placeholder="Archive..."
                    value={searchValue}
                    onFocus={() => setIsSearchFocused(true)}
                    onBlur={() => setIsSearchFocused(false)}
                    onChange={(e) => setSearchValue(e.target.value)}
                    className="bg-transparent border-none outline-none text-[10px] uppercase tracking-widest py-2 px-3 w-full placeholder:text-gray-300"
                  />
                </div>
              </div>

              <ThemeToggle />

              <div className="relative">
                {user ? (
                  <div
                    className="flex items-center space-x-2 cursor-pointer tap-highlight-none"
                    onClick={() => setIsProfileOpen(!isProfileOpen)}
                  >
                    <div className="w-8 h-8 md:w-9 md:h-9 flex items-center justify-center border border-black hover:bg-black hover:text-white transition-all overflow-hidden bg-white/50 active:scale-95">
                      {user.user_metadata?.avatar_url ? (
                        <img src={user.user_metadata.avatar_url} alt={displayName} className="w-full h-full object-cover" />
                      ) : (
                        <User size={12} strokeWidth={1.5} />
                      )}
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setAuthModalOpen(true)}
                    className="p-2 text-[10px] uppercase tracking-widest font-bold hover:opacity-50 transition-all flex items-center space-x-2 active:scale-95 tap-highlight-none"
                  >
                    <User size={18} strokeWidth={1.5} />
                    <span className="hidden sm:inline">Identity</span>
                  </button>
                )}
              </div>

              <button onClick={toggleCart} className="relative p-2 hover:bg-black hover:text-white transition-all duration-500 rounded-full active:scale-90 tap-highlight-none">
                <ShoppingBag size={18} strokeWidth={1.5} />
                {cartCount > 0 && (
                  <span className="absolute top-1 right-1 bg-black text-white text-[8px] w-3.5 h-3.5 flex items-center justify-center rounded-full font-bold border border-white">
                    {cartCount}
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Profile Dropdown */}
        {user && isProfileOpen && (
          <>
            <div className="fixed inset-0 z-[-1]" onClick={() => setIsProfileOpen(false)} />
            <div className="absolute top-full right-4 md:right-8 mt-2 w-64 glass border border-black shadow-2xl p-6 animate-in fade-in slide-in-from-top-4 duration-300">
              <div className="mb-4">
                <p className="text-[10px] font-bold uppercase tracking-widest mb-1 truncate">{displayName}</p>
                <p className="text-[8px] text-gray-400 uppercase tracking-widest mb-0 truncate">{user.email}</p>
              </div>
              <div className="space-y-1 pt-4 border-t border-black/5">
                <Link to="/profile" onClick={() => setIsProfileOpen(false)} className="w-full flex items-center justify-between text-[10px] uppercase tracking-widest font-black py-2.5 hover:opacity-50 transition-opacity">
                  <span className="flex items-center space-x-3"><UserCircle size={14} /> <span>Patron Profile</span></span>
                  <ChevronRight size={12} />
                </Link>
                <Link to="/orders" onClick={() => setIsProfileOpen(false)} className="w-full flex items-center justify-between text-[10px] uppercase tracking-widest font-black py-2.5 hover:opacity-50 transition-opacity">
                  <span className="flex items-center space-x-3"><Package size={14} /> <span>Acquisitions</span></span>
                  <ChevronRight size={12} />
                </Link>
                <button onClick={() => { logout(); setIsProfileOpen(false); }} className="w-full flex items-center space-x-3 text-[10px] uppercase tracking-widest font-black py-2.5 hover:opacity-50 transition-opacity text-left">
                  <LogOut size={14} /> <span>End Session</span>
                </button>
              </div>
            </div>
          </>
        )}
      </header>

      {/* MOBILE MENU - High Stack Glassmorphism Full-Screen Overlay */}
      <div className={`fixed inset-0 z-[150] bg-white/60 backdrop-blur-2xl transition-all duration-700 md:hidden flex flex-col ${isMobileMenuOpen ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-full pointer-events-none'}`}>
        <div className="h-16 shrink-0" /> {/* Spacer for top bar */}

        <div className="flex-1 overflow-y-auto no-scrollbar p-8 pt-12 space-y-12">
          <div className="space-y-6">
            <p className="text-[10px] uppercase tracking-[0.5em] text-gray-400 font-black mb-8">Archive Navigation</p>
            <nav className="flex flex-col space-y-4">
              {categories.map((cat, idx) => (
                <button
                  key={cat}
                  onClick={() => { filterByCategory(cat); setIsMobileMenuOpen(false); }}
                  className="text-4xl font-serif-elegant font-bold uppercase tracking-tight text-left hover:italic transition-all active:scale-95 origin-left tap-highlight-none"
                  style={{ transitionDelay: `${idx * 40}ms` }}
                >
                  {cat}
                </button>
              ))}
            </nav>
          </div>

          <div className="pt-12 border-t border-black/10 space-y-10">
            <div className="space-y-4">
              <p className="text-[10px] uppercase tracking-[0.5em] text-gray-400 font-black">Refine Search</p>
              <div className="flex items-center border-b border-black/20 focus-within:border-black transition-colors pb-4">
                <Search size={20} className="text-gray-400" strokeWidth={1.5} />
                <input
                  type="text"
                  placeholder="ARCHIVE QUERY..."
                  value={searchValue}
                  onChange={(e) => setSearchValue(e.target.value)}
                  className="bg-transparent border-none outline-none flex-1 text-sm px-4 uppercase tracking-widest font-black placeholder:text-gray-300"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => { setAuthModalOpen(true); setIsMobileMenuOpen(false); }}
                className="bg-black text-white py-6 text-[10px] font-black uppercase tracking-[0.4em] active:scale-95 transition-all flex items-center justify-center"
              >
                Identity
              </button>
              <button
                onClick={() => { toggleCart(); setIsMobileMenuOpen(false); }}
                className="border border-black py-6 text-[10px] font-black uppercase tracking-[0.4em] active:scale-95 transition-all flex items-center justify-center"
              >
                Bag ({cartCount})
              </button>
            </div>
          </div>
        </div>

        <div className="p-8 border-t border-black/5 flex justify-center bg-white/30">
          <p className="text-[8px] uppercase tracking-[0.4em] text-gray-400 font-bold">MODERNIST permanent archive © 2024</p>
        </div>
      </div>
    </>
  );
};

export default Navbar;

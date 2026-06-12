import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Heart, Loader2 } from 'lucide-react';
import { wishlistApi } from '../lib/ragApi';
import { useStore } from '../context/StoreContext';
import { useAuth } from '../context/AuthContext';
import WishlistButton from '../components/WishlistButton';
import { Product } from '../types';

const Wishlist: React.FC = () => {
  const { user } = useAuth();
  const { allProducts, addToCart, addToast } = useStore();
  const [wishlistIds, setWishlistIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    wishlistApi.getAll()
      .then(ids => setWishlistIds(ids))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user]);

  const wishlistProducts: Product[] = allProducts.filter(p => wishlistIds.includes(p.id));

  const handleRemove = (productId: string) => {
    setWishlistIds(prev => prev.filter(id => id !== productId));
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center text-center px-6">
        <div className="space-y-8">
          <Heart size={48} strokeWidth={0.5} className="mx-auto text-gray-200" />
          <div className="space-y-3">
            <h2 className="font-serif-elegant text-5xl font-bold uppercase tracking-widest">Wishlist</h2>
            <p className="text-[9px] uppercase tracking-[0.4em] font-black text-gray-400">
              Sign in to save pieces to your archive
            </p>
          </div>
          <Link
            to="/auth"
            className="inline-block text-[9px] uppercase tracking-[0.4em] font-black px-10 py-4 border border-black hover:bg-black hover:text-white transition-all"
          >
            Sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white text-black pt-32 pb-40 px-6 md:px-16 lg:px-24">
      <div className="max-w-7xl mx-auto space-y-16">
        {/* Header */}
        <div className="space-y-4">
          <p className="text-[9px] uppercase tracking-[0.5em] text-gray-300 font-black">
            Your Saved Pieces
          </p>
          <div className="flex items-end justify-between">
            <h1 className="font-serif-elegant text-6xl md:text-8xl font-bold uppercase tracking-widest text-black">
              Wishlist
            </h1>
            {wishlistProducts.length > 0 && (
              <span className="text-[9px] uppercase tracking-[0.4em] font-black text-gray-400">
                {wishlistProducts.length} {wishlistProducts.length === 1 ? 'piece' : 'pieces'}
              </span>
            )}
          </div>
        </div>

        {loading && (
          <div className="flex items-center gap-4 text-gray-400 py-20">
            <Loader2 size={16} className="animate-spin" />
            <span className="text-[9px] uppercase tracking-[0.4em] font-black">Loading archive…</span>
          </div>
        )}

        {!loading && wishlistProducts.length === 0 && (
          <div className="text-center py-40 space-y-8">
            <Heart size={48} strokeWidth={0.5} className="mx-auto text-gray-200" />
            <div className="space-y-3">
              <p className="text-[10px] uppercase tracking-[0.5em] font-black text-gray-300">
                No pieces saved yet
              </p>
              <p className="text-[9px] text-gray-400 max-w-xs mx-auto leading-relaxed">
                Browse the archive and save pieces that speak to you. They'll wait here until you're ready.
              </p>
            </div>
            <Link
              to="/"
              className="inline-block text-[9px] uppercase tracking-[0.4em] font-black px-10 py-4 border border-black hover:bg-black hover:text-white transition-all"
            >
              Explore the archive
            </Link>
          </div>
        )}

        {!loading && wishlistProducts.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-8">
            {wishlistProducts.map(product => (
              <div key={product.id} className="group space-y-4">
                <div className="relative">
                  <Link to={`/product/${product.id}`} className="block">
                    <div className="relative overflow-hidden bg-gray-50 aspect-[3/4]">
                      {product.image_url ? (
                        <img
                          src={product.image_url}
                          alt={product.name}
                          loading="lazy"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-gray-100">
                          <span className="text-[9px] uppercase tracking-widest text-gray-300">No image</span>
                        </div>
                      )}
                    </div>
                  </Link>
                  {/* Wishlist toggle positioned top-right */}
                  <div className="absolute top-3 right-3">
                    <WishlistButton
                      productId={product.id}
                      size={18}
                      className="bg-white/90 backdrop-blur-sm p-2"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Link to={`/product/${product.id}`} className="block hover:underline">
                    <p className="text-[10px] uppercase tracking-[0.25em] font-black text-black leading-tight line-clamp-2">
                      {product.name}
                    </p>
                  </Link>
                  <p className="text-[11px] font-black text-black">${product.price}</p>
                  <p className="text-[8px] uppercase tracking-widest text-gray-400 font-black">{product.category}</p>
                  <button
                    onClick={() => {
                      addToCart(product.id);
                      addToast(`${product.name} added to bag`, 'success');
                    }}
                    className="w-full mt-2 py-2 text-[8px] uppercase tracking-[0.35em] font-black border border-black hover:bg-black hover:text-white transition-all"
                  >
                    Add to bag
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Wishlist;

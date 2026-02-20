
import React, { useState } from 'react';
import { Plus, ArrowRight, Eye, Star } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Product } from '../types';
import { useStore } from '../context/StoreContext';

interface ProductCardProps {
  product: Product;
}

const ProductCard: React.FC<ProductCardProps> = ({ product }) => {
  const { addToCart, setQuickViewProduct } = useStore();
  const [isHovered, setIsHovered] = useState(false);

  // Calculate average rating
  const averageRating = product.reviews && product.reviews.length > 0
    ? product.reviews.reduce((sum, review) => sum + review.rating, 0) / product.reviews.length
    : 0;

  const reviewCount = product.reviews?.length || 0;

  return (
    <div
      className="product-card group flex flex-col space-y-4 animate-in fade-in slide-in-from-bottom-6 duration-700"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Image Container - Sharp, borderless focus */}
      <div className="relative aspect-[3/4] overflow-hidden bg-gray-50 dark:bg-zinc-900 group-active:scale-[0.99] transition-all duration-700 ease-out">
        {/* Rating and price badges */}
        <div className="rating-chip">
          <span className="text-xs font-black">{averageRating.toFixed(1)}</span>
          <span className="text-[10px] opacity-80">{reviewCount}</span>
        </div>
        <div className="price-badge">${product.price.toLocaleString()}</div>
        <Link to={`/product/${product.id}`} className="block w-full h-full">
          <img
            src={product.image_url}
            alt={product.name}
            loading="lazy"
            className="object-cover w-full h-full transition-all duration-[1.5s] ease-out group-hover:scale-105 group-hover:brightness-90"
          />
        </Link>

        {/* Minimal Quick Actions - Appearing on hover with absolute precision */}
        <div className="absolute inset-0 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none">
          <div className="flex flex-col gap-3 pointer-events-auto">
            <button
              onClick={(e) => { e.preventDefault(); addToCart(product); }}
              className="bg-black/90 dark:bg-white/90 text-white dark:text-black px-8 py-3 text-[9px] uppercase tracking-[0.4em] font-black hover:bg-white hover:text-black dark:hover:bg-black dark:hover:text-white transition-all transform translate-y-4 group-hover:translate-y-0 duration-500"
            >
              Add to Archive
            </button>
            <button
              onClick={(e) => { e.preventDefault(); setQuickViewProduct(product); }}
              className="bg-white/10 backdrop-blur-md border border-white/20 text-white px-8 py-3 text-[9px] uppercase tracking-[0.4em] font-black hover:bg-white hover:text-black transition-all transform translate-y-4 group-hover:translate-y-0 duration-500 delay-75"
            >
              Inspect
            </button>
          </div>
        </div>
      </div>

      {/* Modernist Product Info - Focus on Typography */}
      <Link to={`/product/${product.id}`} className="flex flex-col space-y-3 pt-2">
        <div className="flex justify-between items-baseline gap-4">
          <h3 className="product-name text-[11px] md:text-xs font-black uppercase tracking-[0.25em] leading-tight">{product.name}</h3>
          <span className="text-[11px] md:text-sm font-light tracking-tighter text-gray-500 dark:text-gray-400">${product.price.toLocaleString()}</span>
        </div>

        <div className="flex items-center justify-between">
          <p className="text-[9px] md:text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-[0.2em] font-medium truncate max-w-[70%] italic">{product.category} · Permanent</p>
          <div className="flex gap-1.5 h-[1px] w-8 bg-black/10 dark:bg-white/10 self-center"></div>
        </div>
      </Link>
    </div>
  );
};

export default ProductCard;

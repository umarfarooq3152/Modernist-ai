
import React, { useState } from 'react';
import { Plus, ArrowRight, Eye } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Product } from '../types';
import { useStore } from '../context/StoreContext';

interface ProductCardProps {
  product: Product;
}

const ProductCard: React.FC<ProductCardProps> = ({ product }) => {
  const { addToCart, setQuickViewProduct } = useStore();
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div 
      className="group flex flex-col space-y-4 animate-in fade-in slide-in-from-bottom-6 duration-700"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Image Container - Responsive aspect ratio and soft blur hover */}
      <div className="relative aspect-[3/4] overflow-hidden bg-gray-100 border border-black/5 active:scale-[0.98] transition-all duration-500 tap-highlight-none">
        <Link to={`/product/${product.id}`} className="block w-full h-full" aria-label={`View ${product.name}`}>
          <img
            src={product.image_url}
            alt={product.name}
            loading="lazy"
            className="object-cover w-full h-full transition-all duration-[1.2s] ease-out group-hover:scale-105 group-hover:brightness-95 grayscale-[0.1] group-hover:grayscale-0"
          />
        </Link>
        
        {/* Quick Add & Quick View Overlay - Desktop-only hover interaction */}
        <div 
          className={`hidden md:flex absolute inset-0 bg-black/5 backdrop-blur-[2px] items-center justify-center flex-col space-y-3 pointer-events-none transition-all duration-500 ${
            isHovered ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <button 
            onClick={(e) => {
              e.preventDefault();
              addToCart(product);
            }}
            className="pointer-events-auto bg-white text-black w-[200px] py-4 text-[10px] uppercase tracking-[0.3em] font-black flex items-center justify-center space-x-3 border border-black transform translate-y-8 group-hover:translate-y-0 transition-all duration-500 hover:bg-black hover:text-white"
          >
            <Plus size={16} strokeWidth={2} />
            <span>Archive Selection</span>
          </button>
          
          <button 
            onClick={(e) => {
              e.preventDefault();
              setQuickViewProduct(product);
            }}
            className="pointer-events-auto bg-white/90 backdrop-blur-md text-black w-[200px] py-4 text-[10px] uppercase tracking-[0.3em] font-black flex items-center justify-center space-x-3 border border-black/10 transform translate-y-8 group-hover:translate-y-0 transition-all duration-500 delay-75 hover:bg-black hover:text-white"
          >
            <Eye size={16} strokeWidth={2} />
            <span>Inspect Piece</span>
          </button>
        </div>

        {/* Mobile Quick Add - Large touch target, high-contrast feedback */}
        <button 
          onClick={(e) => {
            e.preventDefault();
            addToCart(product);
          }}
          className="md:hidden absolute bottom-4 right-4 bg-white/80 backdrop-blur-md border border-black/10 w-12 h-12 flex items-center justify-center rounded-full active:bg-black active:text-white transition-all shadow-xl tap-highlight-none"
          aria-label="Quick Add"
        >
          <Plus size={22} strokeWidth={1.5} />
        </button>

        {/* Category Branding */}
        <div className="absolute top-4 left-4">
          <span className="bg-white/90 backdrop-blur-sm text-[8px] md:text-[9px] uppercase tracking-[0.3em] font-black px-3 py-1.5 border border-black/5 shadow-sm">
            {product.category}
          </span>
        </div>
      </div>

      {/* Product Information */}
      <Link to={`/product/${product.id}`} className="flex flex-col space-y-2 px-1 group-hover:opacity-80 transition-opacity">
        <div className="flex justify-between items-start gap-4">
          <h3 className="text-xs md:text-sm font-bold uppercase tracking-widest leading-tight line-clamp-2">{product.name}</h3>
          <ArrowRight size={14} className="shrink-0 opacity-0 group-hover:opacity-100 transition-all group-hover:translate-x-1 hidden md:block" />
        </div>
        <p className="text-[10px] md:text-[11px] text-gray-400 uppercase tracking-widest font-medium line-clamp-1">{product.description}</p>
        <div className="flex items-center justify-between pt-1">
          <p className="text-sm md:text-base font-black tracking-tight">${product.price.toLocaleString()}</p>
          <div className="flex gap-2">
            {product.tags.slice(0, 1).map(tag => (
              <span key={tag} className="text-[8px] uppercase tracking-[0.2em] text-gray-300 font-bold border-b border-gray-200 pb-0.5">#{tag}</span>
            ))}
          </div>
        </div>
      </Link>
    </div>
  );
};

export default ProductCard;

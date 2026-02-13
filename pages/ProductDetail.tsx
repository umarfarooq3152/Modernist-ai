
import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, 
  Plus, 
  ShieldCheck, 
  Truck, 
  RefreshCw, 
  ChevronLeft, 
  ChevronRight, 
  Maximize2, 
  Star, 
  Sparkles, 
  Zap, 
  Layers,
  Wand2,
  Camera,
  Info,
  Activity
} from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { useAuth } from '../context/AuthContext';
import { Product } from '../types';
import { supabase } from '../lib/supabase';
import Groq from 'groq-sdk';

// Refined high-performance image component with archival loading state
const ImageWithPlaceholder: React.FC<{ 
  src: string; 
  alt: string; 
  className?: string; 
  style?: React.CSSProperties;
  aspectRatio?: string;
}> = ({ src, alt, className = "", style = {}, aspectRatio = "aspect-[3/4]" }) => {
  const [isLoaded, setIsLoaded] = useState(false);

  return (
    <div className={`relative overflow-hidden bg-gray-50/50 ${aspectRatio} ${className}`}>
      {!isLoaded && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-5 h-5 border-[0.5px] border-black/10 border-t-black/40 rounded-full animate-spin" />
        </div>
      )}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        onLoad={() => setIsLoaded(true)}
        className={`w-full h-full object-cover transition-all duration-1000 ease-out 
          ${isLoaded ? 'opacity-100 blur-0 scale-100' : 'opacity-0 blur-xl scale-110'}`}
        style={style}
      />
    </div>
  );
};

const ProductDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { allProducts, addToCart, addToast } = useStore();
  const { profile } = useAuth();
  
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [activeImageIndex, setActiveImageIndex] = useState<number>(0);
  const [isZooming, setIsZooming] = useState(false);
  const [zoomStyle, setZoomStyle] = useState<React.CSSProperties>({});
  const [clerkVerdict, setClerkVerdict] = useState<string | null>(null);
  const [isGeneratingVerdict, setIsGeneratingVerdict] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const fetchProductDetails = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*, reviews(*)')
        .eq('id', id)
        .single();

      if (error) throw error;
      setProduct(data);
    } catch (err) {
      console.error('Error fetching archival details:', err);
      const localProduct = allProducts.find(p => p.id === id);
      if (localProduct) setProduct(localProduct);
    } finally {
      setLoading(false);
    }
  }, [id, allProducts]);

  useEffect(() => {
    window.scrollTo(0, 0);
    fetchProductDetails();
    setActiveImageIndex(0);
    setClerkVerdict(null);
  }, [fetchProductDetails]);

  // Generate "The Clerk's Verdict" via Groq (free, fast inference)
  useEffect(() => {
    const generateVerdict = async () => {
      if (!product || clerkVerdict || isGeneratingVerdict) return;
      setIsGeneratingVerdict(true);
      try {
        const groq = new Groq({
          apiKey: process.env.GROQ_API_KEY || '',
          dangerouslyAllowBrowser: true,
        });
        const response = await groq.chat.completions.create({
          model: 'llama-3.1-8b-instant',
          messages: [
            {
              role: 'system',
              content: 'You are "The Clerk," an elite fashion concierge at MODERNIST, a luxury minimalist store. You give one-sentence verdicts that are architectural, sophisticated, and slightly witty. Never use more than one sentence.'
            },
            {
              role: 'user',
              content: `Give your one-sentence verdict on: ${product.name} — ${product.description}. Price: $${product.price}. Category: ${product.category}.`
            }
          ],
          temperature: 0.8,
          max_tokens: 100,
        });
        const verdict = response.choices[0]?.message?.content?.trim();
        setClerkVerdict(verdict || "A silhouette of uncompromising integrity.");
      } catch (err) {
        console.error("AI Verdict failed", err);
        // Rich fallback verdicts based on category
        const fallbacks: Record<string, string> = {
          'Outerwear': "The kind of coat that makes strangers reconsider their entire wardrobe.",
          'Basics': "Deceptively simple — the foundation that elevates everything above it.",
          'Accessories': "A finishing stroke that turns an outfit into a statement.",
          'Home': "Form meeting function in a permanent dialogue of refined minimalism.",
          'Apparel': "Tailored with the precision of someone who understands that fit is everything.",
          'Footwear': "Every step becomes intentional when the foundation is this deliberate.",
        };
        setClerkVerdict(fallbacks[product.category] || "An essential pillar of the modern archive.");
      } finally {
        setIsGeneratingVerdict(false);
      }
    };
    if (product) generateVerdict();
  }, [product]);

  const synergyPiece = useMemo(() => {
    if (!product) return null;
    const complements: Record<string, string> = {
      'Outerwear': 'Apparel',
      'Apparel': 'Footwear',
      'Basics': 'Apparel',
      'Accessories': 'Outerwear',
      'Home': 'Accessories',
      'Footwear': 'Accessories'
    };
    const targetCat = complements[product.category] || 'Basics';
    return allProducts.find(p => p.category === targetCat && p.id !== product.id);
  }, [product, allProducts]);

  const galleryImages = useMemo(() => {
    if (!product) return [];
    // Use different crop/style params to create visual variety
    const base = product.image_url;
    return [
      base,
      base.includes('?') ? `${base}&fit=crop&w=800&h=1000` : `${base}?fit=crop&w=800&h=1000`,
      base.includes('?') ? `${base}&fit=crop&w=600&h=900&gravity=center` : `${base}?fit=crop&w=600&h=900&gravity=center`,
    ];
  }, [product]);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const { left, top, width, height } = containerRef.current.getBoundingClientRect();
    const x = ((e.clientX - left) / width) * 100;
    const y = ((e.clientY - top) / height) * 100;
    
    setIsZooming(true);
    setZoomStyle({
      transform: 'scale(2.5)',
      transformOrigin: `${x}% ${y}%`,
      transition: 'transform 0.1s ease-out',
    });
  };

  const handleMouseLeave = () => {
    setIsZooming(false);
    setZoomStyle({
      transform: 'scale(1)',
      transformOrigin: 'center',
      transition: 'transform 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
    });
  };

  const cycleNext = useCallback((e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (galleryImages.length > 0) {
      setActiveImageIndex((prev) => (prev + 1) % galleryImages.length);
    }
  }, [galleryImages.length]);

  const cyclePrev = useCallback((e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (galleryImages.length > 0) {
      setActiveImageIndex((prev) => (prev - 1 + galleryImages.length) % galleryImages.length);
    }
  }, [galleryImages.length]);

  const handleMirrorProjection = () => {
    if (!profile?.avatar_url) {
      addToast("Mirror portal requires a documented frame. Please upload a portrait in your Profile.", "info");
      return;
    }
    // This would trigger the state in AIChatAgent, but for now we provide feedback
    addToast("Initiating silhouette projection in The Clerk terminal...", "success");
    // Force open chat with try-on command
    const event = new CustomEvent('trigger-try-on', { detail: { productId: product?.id } });
    window.dispatchEvent(event);
  };

  if (loading) {
    return (
      <div className="min-h-[80vh] flex flex-col items-center justify-center space-y-8 animate-in fade-in duration-500">
        <div className="modern-loader" />
        <p className="text-[10px] uppercase tracking-[0.6em] font-black text-gray-400 animate-pulse">Syncing Archival Detail...</p>
      </div>
    );
  }

  if (!product) return null;

  return (
    <div className="max-w-[1400px] mx-auto px-4 md:px-8 py-12 animate-in fade-in duration-700">
      <div className="flex justify-between items-center mb-12">
        <button 
          onClick={() => navigate(-1)}
          className="flex items-center space-x-2 text-[10px] uppercase tracking-widest font-black hover:opacity-50 transition-opacity"
        >
          <ArrowLeft size={14} />
          <span>Back to Collection</span>
        </button>
        <div className="flex items-center gap-4 text-[10px] uppercase tracking-[0.3em] text-gray-400 font-bold">
          <span className="flex items-center gap-2"><Activity size={10} /> Resonance Active</span>
          <span className="w-1 h-1 bg-black rounded-full" />
          <span>ID: {product.id}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-16 xl:gap-24">
        {/* Sticky Gallery Section */}
        <div className="lg:col-span-7 space-y-6">
          <div 
            ref={containerRef}
            className="aspect-[3/4] bg-gray-50 overflow-hidden border border-black/5 cursor-crosshair relative group select-none"
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            onClick={cycleNext}
          >
            <ImageWithPlaceholder
              src={galleryImages[activeImageIndex]}
              alt={product.name}
              className="w-full h-full"
              style={zoomStyle}
            />
            
            <div className={`absolute inset-0 flex items-center justify-between px-6 transition-opacity duration-500 pointer-events-none ${isZooming ? 'opacity-0' : 'opacity-0 group-hover:opacity-100'}`}>
              <button onClick={(e) => cyclePrev(e)} className="pointer-events-auto w-14 h-14 bg-white/95 backdrop-blur-md flex items-center justify-center border border-black/10 hover:bg-black hover:text-white transition-all"><ChevronLeft size={24} strokeWidth={1} /></button>
              <button onClick={(e) => cycleNext(e)} className="pointer-events-auto w-14 h-14 bg-white/95 backdrop-blur-md flex items-center justify-center border border-black/10 hover:bg-black hover:text-white transition-all"><ChevronRight size={24} strokeWidth={1} /></button>
            </div>

            <div className="absolute bottom-6 left-6 flex gap-2">
              {galleryImages.map((_, i) => (
                <div key={i} className={`h-1 transition-all duration-500 ${activeImageIndex === i ? 'w-8 bg-black' : 'w-2 bg-black/10'}`} />
              ))}
            </div>
          </div>
          
          <div className="grid grid-cols-3 gap-6">
            {galleryImages.map((img, index) => (
              <button
                key={index}
                onClick={() => setActiveImageIndex(index)}
                className={`aspect-[3/4] overflow-hidden border transition-all duration-700 relative group ${activeImageIndex === index ? 'border-black' : 'border-black/5 opacity-40 hover:opacity-100'}`}
              >
                <img src={img} className="w-full h-full object-cover grayscale transition-all group-hover:grayscale-0" alt="" />
              </button>
            ))}
          </div>
        </div>

        {/* Informational Scroll Section */}
        <div className="lg:col-span-5 flex flex-col space-y-12 lg:sticky lg:top-32 h-fit">
          <div className="space-y-6">
            <div className="flex justify-between items-start">
              <span className="text-[10px] uppercase tracking-[0.5em] text-gray-400 font-black">{product.category}</span>
              {product.tags.includes('essential') && (
                <span className="bg-black text-white text-[8px] uppercase tracking-widest px-2 py-1 font-black italic">Archive Essential</span>
              )}
            </div>
            <h1 className="font-serif-elegant text-5xl md:text-7xl font-bold uppercase tracking-tighter leading-[0.8] text-black">{product.name}</h1>
            <p className="text-3xl font-black text-black tracking-tighter">${product.price.toLocaleString()}</p>
          </div>

          <div className="space-y-8">
            <div className="p-8 bg-gray-50/50 border border-black/5 space-y-4 animate-in fade-in duration-1000">
              <div className="flex items-center gap-3">
                <Sparkles size={14} className="text-black" />
                <h3 className="text-[10px] uppercase tracking-[0.4em] font-black">The Clerk's Verdict</h3>
              </div>
              {isGeneratingVerdict ? (
                <div className="flex items-center gap-3 text-gray-300 animate-pulse">
                   <div className="w-2 h-2 bg-gray-300 rounded-full" />
                   <span className="text-[10px] uppercase tracking-[0.2em] font-black italic">Archiving intent...</span>
                </div>
              ) : (
                <p className="font-clerk italic text-xl leading-relaxed text-gray-700">"{clerkVerdict}"</p>
              )}
            </div>

            <div className="space-y-6">
              <h3 className="text-[10px] uppercase tracking-widest font-black flex items-center gap-3">
                <Info size={12} /> Archival Description
              </h3>
              <p className="text-gray-500 leading-relaxed text-sm md:text-base font-medium">
                {product.description} Crafted with obsessive attention to silhouette, this piece serves as a permanent staple for the refined landscape.
              </p>
            </div>

            <div className="flex flex-wrap gap-2 pt-4">
              {product.tags.map(tag => (
                <span key={tag} className="text-[9px] uppercase tracking-[0.3em] px-4 py-2 bg-white border border-black/5 text-gray-400 font-black hover:text-black hover:border-black transition-all cursor-default">#{tag}</span>
              ))}
            </div>
          </div>

          {synergyPiece && (
            <div className="bg-black text-white p-8 space-y-6 relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-4 opacity-10">
                <Zap size={64} />
              </div>
              <div className="flex items-center justify-between relative z-10">
                <div className="flex items-center space-x-2">
                  <Layers size={14} />
                  <span className="text-[10px] uppercase tracking-[0.4em] font-black">Synergy Concession</span>
                </div>
                <div className="bg-white text-black px-2 py-0.5 text-[8px] uppercase tracking-widest font-black">15% Concession</div>
              </div>
              <div className="flex items-center space-x-6 relative z-10">
                <div className="w-16 h-20 bg-white/10 shrink-0 overflow-hidden border border-white/10">
                  <img src={synergyPiece.image_url} alt="" className="w-full h-full object-cover grayscale opacity-70 group-hover:opacity-100 transition-opacity" />
                </div>
                <div className="flex-1 space-y-1">
                  <h4 className="text-[10px] uppercase tracking-widest font-black text-gray-400">Archival Pairing</h4>
                  <p className="text-xs font-bold uppercase tracking-tight line-clamp-1">{synergyPiece.name}</p>
                  <p className="text-[10px] font-black text-white pt-2">${Math.round(synergyPiece.price * 0.85).toLocaleString()} <span className="text-gray-600 line-through ml-2">${synergyPiece.price}</span></p>
                </div>
              </div>
              <button 
                onClick={() => {
                  addToCart(product);
                  addToCart(synergyPiece);
                }}
                className="w-full bg-white text-black py-4 text-[10px] uppercase tracking-[0.3em] font-black hover:opacity-80 transition-opacity relative z-10"
              >
                Acquire Pair Synergy
              </button>
            </div>
          )}

          <div className="space-y-4 pt-6 border-t border-black/10">
            <div className="grid grid-cols-2 gap-4">
               <button 
                  onClick={() => addToCart(product)}
                  className="bg-black text-white py-6 text-[11px] uppercase tracking-[0.4em] font-black flex items-center justify-center space-x-3 border border-black hover:bg-white hover:text-black transition-all group active:scale-95"
                >
                  <Plus size={18} />
                  <span>Add to Bag</span>
                </button>
                <button 
                  onClick={handleMirrorProjection}
                  className="bg-white text-black py-6 text-[11px] uppercase tracking-[0.4em] font-black flex items-center justify-center space-x-3 border border-black hover:bg-black hover:text-white transition-all active:scale-95"
                >
                  <Wand2 size={18} />
                  <span>Mirror portal</span>
                </button>
            </div>
            
            <div className="flex items-center justify-center space-x-3 text-[9px] text-gray-300 uppercase tracking-widest font-black italic">
              <Camera size={12} />
              <span>Identity-Frame Sync Actuated</span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-8 pt-8 opacity-40 grayscale group hover:grayscale-0 hover:opacity-100 transition-all">
            <div className="flex flex-col items-center text-center space-y-2">
              <ShieldCheck size={24} strokeWidth={1} />
              <span className="text-[8px] uppercase tracking-widest font-black">Permanent Care</span>
            </div>
            <div className="flex flex-col items-center text-center space-y-2">
              <Truck size={24} strokeWidth={1} />
              <span className="text-[8px] uppercase tracking-widest font-black">Global Transit</span>
            </div>
            <div className="flex flex-col items-center text-center space-y-2">
              <RefreshCw size={24} strokeWidth={1} />
              <span className="text-[8px] uppercase tracking-widest font-black">Sync Exchange</span>
            </div>
          </div>
        </div>
      </div>
      
      {/* Testimonials Section */}
      <div className="mt-40 pt-24 border-t border-black">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-16">
          <div className="lg:col-span-4 space-y-8">
            <h2 className="font-serif-elegant text-5xl font-bold uppercase tracking-widest text-black">Identity Resonance</h2>
            <div className="space-y-4">
              <div className="flex items-center space-x-2">
                <div className="flex">{[...Array(5)].map((_, i) => {
                  const avgRating = product.reviews && product.reviews.length > 0
                    ? product.reviews.reduce((s, r) => s + r.rating, 0) / product.reviews.length
                    : 4.5;
                  return (<Star key={i} size={14} fill={i < Math.round(avgRating) ? "black" : "none"} strokeWidth={1} className={i < Math.round(avgRating) ? "text-black" : "text-gray-200"} />);
                })}</div>
                <span className="text-lg font-black tracking-tighter">
                  {product.reviews && product.reviews.length > 0
                    ? (product.reviews.reduce((s, r) => s + r.rating, 0) / product.reviews.length).toFixed(1)
                    : '4.5'} / 5.0
                </span>
              </div>
              <p className="text-[10px] uppercase tracking-widest text-gray-400 font-black leading-loose">
                Documented reviews from verified archival patrons. Every silhouette is held to our permanent standard.
              </p>
            </div>
            <button className="w-full py-5 border border-black text-[10px] uppercase tracking-[0.4em] font-black hover:bg-black hover:text-white transition-all">
              Document your experience
            </button>
          </div>

          <div className="lg:col-span-8 grid grid-cols-1 md:grid-cols-2 gap-10">
            {product.reviews && product.reviews.length > 0 ? (
              product.reviews.map((review) => (
                <div key={review.id} className="bg-gray-50/50 p-10 space-y-8 animate-in slide-in-from-bottom-4 transition-all hover:bg-white hover:shadow-2xl hover:border-black border border-transparent">
                  <div className="flex justify-between items-start">
                    <div className="space-y-4">
                      <div className="flex space-x-1">{[...Array(5)].map((_, i) => (<Star key={i} size={10} fill={i < review.rating ? "black" : "none"} strokeWidth={1} className={i < review.rating ? "text-black" : "text-gray-200"} />))}</div>
                      <h4 className="text-[10px] font-black uppercase tracking-widest">{review.author}</h4>
                    </div>
                    <span className="text-[8px] uppercase tracking-widest text-gray-300 font-black">{review.date}</span>
                  </div>
                  <p className="font-clerk italic text-xl text-gray-700 leading-relaxed">"{review.text}"</p>
                </div>
              ))
            ) : (
              <div className="col-span-2 py-24 text-center border border-dashed border-black/10">
                <p className="text-[10px] uppercase tracking-[0.4em] text-gray-300 font-black">Zero documented testimonials for this silhouette.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProductDetail;

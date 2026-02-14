import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useStore } from '../context/StoreContext';

interface HeroSlide {
  id: number;
  category: string;
  title: string;
  subtitle: string;
  description: string;
  imageUrl: string;
}

const heroSlides: HeroSlide[] = [
  {
    id: 1,
    category: "Watches",
    title: "TIMELESS PRECISION",
    subtitle: "Watches Collection",
    description: "Swiss movements and sapphire crystals. Every second crafted with architectural precision and heritage excellence.",
    imageUrl: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?q=90&w=1920&auto=format&fit=crop"
  },
  {
    id: 2,
    category: "Rings",
    title: "SCULPTURAL ELEGANCE",
    subtitle: "Rings Collection",
    description: "Hand-forged precious metals and ethically sourced stones. Wearable architecture for the discerning hand.",
    imageUrl: "https://images.unsplash.com/photo-1605100804763-247f67b3557e?q=90&w=1920&auto=format&fit=crop"
  },
  {
    id: 3,
    category: "Necklaces",
    title: "REFINED STATEMENTS",
    subtitle: "Necklaces Collection",
    description: "Minimalist chains and pendant artistry. Delicate structures that frame the collarbone with intention.",
    imageUrl: "https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?q=90&w=1920&auto=format&fit=crop"
  },
  {
    id: 4,
    category: "Bracelets",
    title: "WRIST ARCHITECTURE",
    subtitle: "Bracelets Collection",
    description: "Interlocking geometries and precious alloys. Sculptural adornments designed for everyday elevation.",
    imageUrl: "https://images.unsplash.com/photo-1611591437281-460bfbe15705?q=90&w=1920&auto=format&fit=crop"
  }
];

const HeroSlider: React.FC = () => {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isAutoPlaying, setIsAutoPlaying] = useState(true);
  const { setCurrentCategory } = useStore();

  // Auto-play functionality
  useEffect(() => {
    if (!isAutoPlaying) return;
    
    const interval = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % heroSlides.length);
    }, 5000);

    return () => clearInterval(interval);
  }, [isAutoPlaying]);

  const nextSlide = () => {
    setIsAutoPlaying(false);
    setCurrentSlide((prev) => (prev + 1) % heroSlides.length);
  };

  const prevSlide = () => {
    setIsAutoPlaying(false);
    setCurrentSlide((prev) => (prev - 1 + heroSlides.length) % heroSlides.length);
  };

  const goToSlide = (index: number) => {
    setIsAutoPlaying(false);
    setCurrentSlide(index);
  };

  const handleExploreCategory = (category: string) => {
    setCurrentCategory(category);
    // Smooth scroll to products section
    const productsSection = document.getElementById('products-section');
    if (productsSection) {
      productsSection.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const slide = heroSlides[currentSlide];

  return (
    <div className="relative w-full h-[70vh] md:h-[85vh] overflow-hidden bg-black">
      {/* Background Images with Ken Burns effect */}
      <div className="absolute inset-0">
        {heroSlides.map((slideItem, index) => (
          <div
            key={slideItem.id}
            className={`absolute inset-0 transition-opacity duration-1000 ease-in-out ${
              index === currentSlide ? 'opacity-100' : 'opacity-0'
            }`}
          >
            <img
              src={slideItem.imageUrl}
              alt={slideItem.category}
              className={`w-full h-full object-cover ${
                index === currentSlide ? 'animate-ken-burns' : ''
              }`}
            />
            {/* Dark overlay */}
            <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/50 to-transparent" />
          </div>
        ))}
      </div>

      {/* Content */}
      <div className="relative h-full max-w-[1400px] mx-auto px-6 md:px-8 flex items-center">
        <div className="max-w-2xl space-y-8 animate-slide-in-left">
          {/* Category Badge */}
          <div className="inline-block">
            <span className="text-[10px] uppercase tracking-[0.6em] text-white/60 font-black border border-white/20 px-6 py-3 backdrop-blur-sm">
              {slide.subtitle}
            </span>
          </div>

          {/* Main Title */}
          <h1 className="font-serif-elegant text-5xl sm:text-6xl md:text-8xl font-bold tracking-tighter uppercase leading-[0.9] text-white">
            {slide.title}
          </h1>

          {/* Description */}
          <p className="text-sm md:text-base leading-loose text-white/80 max-w-xl font-clerk">
            {slide.description}
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-wrap gap-6 pt-4">
            <button
              onClick={() => handleExploreCategory(slide.category)}
              className="bg-white text-black px-10 py-5 text-[10px] uppercase tracking-[0.4em] font-black hover:bg-black hover:text-white hover:border hover:border-white transition-all duration-300 active:scale-95"
            >
              Explore {slide.category}
            </button>
            <button
              onClick={() => handleExploreCategory('All')}
              className="border border-white/40 text-white px-10 py-5 text-[10px] uppercase tracking-[0.4em] font-black hover:bg-white hover:text-black transition-all duration-300 active:scale-95 backdrop-blur-sm"
            >
              View All
            </button>
          </div>
        </div>
      </div>

      {/* Navigation Arrows */}
      <button
        onClick={prevSlide}
        className="absolute left-4 md:left-8 top-1/2 -translate-y-1/2 p-4 text-white/70 hover:text-white hover:bg-white/10 transition-all active:scale-90 backdrop-blur-sm border border-white/20 z-10"
        aria-label="Previous slide"
      >
        <ChevronLeft size={28} strokeWidth={1} />
      </button>
      <button
        onClick={nextSlide}
        className="absolute right-4 md:right-8 top-1/2 -translate-y-1/2 p-4 text-white/70 hover:text-white hover:bg-white/10 transition-all active:scale-90 backdrop-blur-sm border border-white/20 z-10"
        aria-label="Next slide"
      >
        <ChevronRight size={28} strokeWidth={1} />
      </button>

      {/* Dot Indicators */}
      <div className="absolute bottom-8 md:bottom-12 left-1/2 -translate-x-1/2 flex gap-3 z-10">
        {heroSlides.map((_, index) => (
          <button
            key={index}
            onClick={() => goToSlide(index)}
            className={`transition-all duration-300 ${
              index === currentSlide
                ? 'w-12 bg-white'
                : 'w-3 bg-white/30 hover:bg-white/50'
            } h-1 hover:scale-110`}
            aria-label={`Go to slide ${index + 1}`}
          />
        ))}
      </div>

      {/* Category Quick Links */}
      <div className="absolute bottom-8 md:bottom-12 right-6 md:right-8 flex flex-col gap-3 z-10">
        <span className="text-[8px] uppercase tracking-[0.5em] text-white/40 font-black mb-2">
          Categories
        </span>
        {heroSlides.map((slideItem, index) => (
          <button
            key={slideItem.id}
            onClick={() => goToSlide(index)}
            className={`text-[10px] uppercase tracking-[0.3em] font-black text-left transition-all duration-300 ${
              index === currentSlide
                ? 'text-white translate-x-2'
                : 'text-white/40 hover:text-white/70'
            }`}
          >
            {slideItem.category}
          </button>
        ))}
      </div>
    </div>
  );
};

export default HeroSlider;

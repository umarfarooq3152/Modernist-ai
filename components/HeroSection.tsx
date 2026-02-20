import React, { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { motion } from 'framer-motion';
import Lenis from '@studio-freight/lenis';
import { ChevronDown } from 'lucide-react';

gsap.registerPlugin(ScrollTrigger);

import { SpinningText } from './ui/spinning-text';
import { ProgressiveBlur } from './ui/progressive-blur';
import { MorphingText } from './ui/morphing-text';
import ReviewsSection from './ReviewsSection';

// Make sure your image count matches your public/images folder
const frameCount = 120;
const currentFrame = (index: number) =>
  `/images/ffout${String(index).padStart(3, '0')}.gif`;

interface HeroSectionProps {
  children?: React.ReactNode;
}

export default function HeroSection({ children }: HeroSectionProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const [images, setImages] = useState<HTMLImageElement[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    // 1. Lenis Smooth Scroll Setup
    const lenis = new Lenis({
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
    });

    function raf(time: number) {
      lenis.raf(time);
      requestAnimationFrame(raf);
    }

    requestAnimationFrame(raf);

    // 2. Preload Images
    const loadedImages: HTMLImageElement[] = [];
    let loadedCount = 0;

    for (let i = 1; i <= frameCount; i++) {
      const img = new Image();
      img.src = currentFrame(i);
      img.onload = () => {
        loadedCount++;
        if (loadedCount === frameCount) setLoaded(true);
      };
      img.onerror = () => {
        loadedCount++;
        if (loadedCount === frameCount) setLoaded(true);
      };
      loadedImages.push(img);
    }

    setImages(loadedImages);

    return () => {
      lenis.destroy();
    };
  }, []);

  useEffect(() => {
    if (!loaded || !canvasRef.current || !triggerRef.current || images.length === 0) return;

    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    if (!context) return;

    // 3. Canvas Draw Logic
    const render = (index: number) => {
      if (!images[index] || !images[index].complete || images[index].naturalWidth === 0) return;

      const img = images[index];
      context.clearRect(0, 0, canvas.width, canvas.height);

      // CSS object-fit: cover math for Canvas
      const hRatio = canvas.width / img.width;
      const vRatio = canvas.height / img.height;
      const ratio = Math.max(hRatio, vRatio);
      const centerShift_x = (canvas.width - img.width * ratio) / 2;
      const centerShift_y = (canvas.height - img.height * ratio) / 2;

      context.drawImage(
        img, 0, 0, img.width, img.height,
        centerShift_x, centerShift_y, img.width * ratio, img.height * ratio
      );
    };

    // 4. GSAP Scroll animation
    const playhead = { frame: 0 };

    const handleResize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      render(playhead.frame);
    };

    handleResize();

    const tween = gsap.to(playhead, {
      frame: frameCount - 1,
      snap: 'frame',
      ease: 'none',
      scrollTrigger: {
        trigger: triggerRef.current,
        start: 'top top',
        end: 'bottom bottom',
        scrub: 0.5,
      },
      onUpdate: () => render(playhead.frame),
    });

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (tween.scrollTrigger) tween.scrollTrigger.kill();
      tween.kill();
    };
  }, [loaded, images]);

  useEffect(() => {
    // Simple mousemove-based parallax for hero content
    const el = triggerRef.current;
    if (!el) return;

    const handleMove = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width - 0.5; // -0.5..0.5
      const y = (e.clientY - rect.top) / rect.height - 0.5;
      const depth = 12; // smaller = subtler
      const tx = x * depth;
      const ty = y * depth * -1;
      const content = el.querySelector('.hero-content') as HTMLElement | null;
      if (content) content.style.transform = `translate3d(${tx}px, ${ty}px, 0)`;
    };

    const handleLeave = () => {
      const content = el.querySelector('.hero-content') as HTMLElement | null;
      if (content) content.style.transform = `translate3d(0px, 0px, 0)`;
    };

    el.addEventListener('mousemove', handleMove);
    el.addEventListener('mouseleave', handleLeave);

    return () => {
      el.removeEventListener('mousemove', handleMove);
      el.removeEventListener('mouseleave', handleLeave);
    };
  }, []);

  return (
    <div className="app-container">
      {/* Fixed Canvas Background */}
      <div className="canvas-container">
        <canvas ref={canvasRef} />
        <div className="overlay" />
      </div>

      <div className="content-section">
        {/* Scrollable triggers and Text */}
        <section ref={triggerRef} className="hero relative">
          <div className="hero-content" style={{ gap: '1.25rem' }}>
            {/* central minimal branding text */}
            <motion.h1
              className="font-serif-elegant text-white text-2xl md:text-3xl font-extrabold tracking-wider uppercase opacity-90 px-6 py-3 border border-white/40"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 1.4, delay: 0.5 }}
            >
              MODERNIST COLLECTION
            </motion.h1>
          </div>

          {/* Morphing text now sits in corner */}
          <motion.div
            className="absolute right-4 bottom-4 opacity-80"
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 1.2, delay: 0.3 }}
          >
            <MorphingText
              texts={[
                'Premium',
                'Lifestyle',
                'Archive',
                'Curated',
                'Modernist',
                'Everlasting',
                'Collection',
                'Design',
                'Timeless',
              ]}
              className="text-white text-[1.2rem] md:text-[1.4rem] lg:text-[1.6rem] font-black uppercase tracking-tight" style={{ fontFamily: 'var(--font-primary)' }}
            />
          </motion.div>

          {/* Dynamic Spinning Text Component */}
          {/* spinning text removed from hero overlay to show at page end for clearer minimal layout */}

          {/* Scroll cue */}
          <motion.div
            className="scroll-indicator"
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.4 }}
            transition={{ delay: 1.4, duration: 1 }}
          >
            <motion.div
              animate={{ y: [0, 8, 0] }}
              transition={{ repeat: Infinity, duration: 2.4, ease: 'easeInOut' }}
            >
              <ChevronDown size={16} strokeWidth={1} />
            </motion.div>
          </motion.div>
        </section>

        {/* Rest of site */}
        <div style={{ minHeight: '100vh', background: 'var(--bg-color)', position: 'relative', zIndex: 10 }}>
          <ProgressiveBlur height="400px" position="top" className="opacity-80" />
          {children}
          <ProgressiveBlur height="200px" position="bottom" className="opacity-50" />
        </div>
        {/* Circular spinning text placed at page end for improved visibility */}
        <motion.div
          className="spinning-anchor"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2, duration: 0.9 }}
        >
          <SpinningText
            reverse
            className="spinning-text text-[12px] md:text-sm font-black uppercase tracking-[0.32em]"
            duration={9}
            radius={6}
          >
            PRECISION • CRAFT • TIME • SYNC •
          </SpinningText>
        </motion.div>

        {/* Reviews section at the end of the Hero/content area */}
        <ReviewsSection />
      </div >
    </div >
  );
}

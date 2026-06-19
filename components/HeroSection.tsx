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

// Make sure your image count matches your public folder (root) or configured publicDir
const frameCount = 120;
const currentFrame = (index: number) =>
  `/ffout${String(index).padStart(3, '0')}.gif`;

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
          <div className="hero-content">

            {/* Top eyebrow */}
            <motion.p
              className="hero-eyebrow"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 1.2, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
            >
              Fine Jewellery — Permanent Archive
            </motion.p>

            {/* Massive editorial display title */}
            <motion.h1
              className="hero-display"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 1.6, delay: 0.55, ease: [0.16, 1, 0.3, 1] }}
            >
              Modernist
            </motion.h1>

            {/* Divider */}
            <motion.div
              className="hero-divider"
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: 1.2, delay: 0.9, ease: [0.16, 1, 0.3, 1] }}
            />

            {/* Italic subtext in Cormorant */}
            <motion.p
              className="hero-tagline"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 1.2, delay: 1.1, ease: [0.16, 1, 0.3, 1] }}
            >
              Diamonds, precious metals & certified stones
            </motion.p>

            {/* Bottom wordmark */}
            <motion.p
              className="hero-wordmark"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 1.4, delay: 1.4 }}
            >
              Est. 2024 · Curated Lifestyle
            </motion.p>
          </div>

          {/* Morphing text — bottom-right corner */}
          <motion.div
            className="absolute right-5 bottom-16 md:right-8 md:bottom-20"
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.6 }}
            transition={{ duration: 1.4, delay: 1.6 }}
          >
            <MorphingText
              texts={['Premium', 'Archive', 'Curated', 'Everlasting', 'Timeless', 'Refined']}
              className="text-white text-[0.65rem] md:text-[0.75rem] font-medium uppercase tracking-[0.4em] font-sans"
            />
          </motion.div>

          {/* Scroll cue */}
          <motion.div
            className="scroll-indicator"
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.5 }}
            transition={{ delay: 1.8, duration: 1 }}
          >
            <motion.div
              animate={{ y: [0, 8, 0] }}
              transition={{ repeat: Infinity, duration: 2.4, ease: 'easeInOut' }}
            >
              <ChevronDown size={14} strokeWidth={1} />
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

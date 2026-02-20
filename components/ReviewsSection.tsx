import React from 'react';
import { Star } from 'lucide-react';
import { motion } from 'framer-motion';
import { FlickeringGrid } from './ui/flickering-grid';

const sampleReviews = [
  { id: 1, name: 'A. Beaumont', rating: 5, text: 'Impeccable tailoring — an archival piece I wear daily.' },
  { id: 2, name: 'C. Rivera', rating: 4, text: 'Minimal, intentional, and unexpectedly comfortable.' },
  { id: 3, name: 'S. Park', rating: 5, text: 'Quality that reads decades ahead — timeless.' },
];

export default function ReviewsSection() {
  return (
    <section className="relative reviews-section max-w-[1200px] mx-auto px-6 md:px-8 py-20 overflow-hidden">
      {/* flickering grid background behind content */}
      <FlickeringGrid className="absolute inset-0 z-0" color="rgba(0,0,0)" maxOpacity={0.08} squareSize={6} gridGap={8} />

      <div className="relative z-10">
        <h2 className="text-[10px] uppercase tracking-[0.6em] font-black mb-6 opacity-60">Customer Reviews</h2>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
          {sampleReviews.map((r, idx) => (
            <motion.div
              key={r.id}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: idx * 0.15 }}
              className="review-card p-6 rounded-2xl glass-panel glass-panel-hover border-0"
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-black uppercase tracking-[0.18em]">{r.name}</h3>
                <div className="flex items-center gap-1">
                  {Array.from({ length: r.rating }).map((_, i) => (
                    <Star key={i} size={14} className="text-yellow-400" />
                  ))}
                </div>
              </div>
              <p className="text-sm leading-relaxed opacity-80">{r.text}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

import React from 'react';
import { motion } from 'framer-motion';

const reviews = [
  {
    id: 1,
    name: 'A. Beaumont',
    location: 'London',
    rating: 5,
    text: 'The most precise collection I have encountered. Each stone is selected with an eye that reads centuries ahead — nothing compares.',
  },
  {
    id: 2,
    name: 'C. Rivera',
    location: 'New York',
    rating: 4,
    text: 'Minimal, intentional, and unexpectedly warm. I wear this daily.',
  },
  {
    id: 3,
    name: 'S. Park',
    location: 'Seoul',
    rating: 5,
    text: 'Quality that outlasts every trend. An archival piece in the truest sense.',
  },
  {
    id: 4,
    name: 'M. Fontaine',
    location: 'Paris',
    rating: 5,
    text: 'GIA certified and ethically sourced — the provenance is as beautiful as the stone.',
  },
];

const Stars: React.FC<{ count: number; className?: string }> = ({ count, className = '' }) => (
  <span className={`tracking-wider ${className}`} aria-label={`${count} out of 5 stars`}>
    {'★'.repeat(count)}{'☆'.repeat(5 - count)}
  </span>
);

export default function ReviewsSection() {
  const [featured, ...rest] = reviews;

  return (
    <section className="bg-white dark:bg-black border-t border-black/6 dark:border-white/6">

      {/* Featured pull-quote */}
      <div className="max-w-[1400px] mx-auto px-6 md:px-16 pt-24 md:pt-36 pb-16 md:pb-24">
        <p className="text-[10px] uppercase tracking-[0.7em] text-gray-400 dark:text-gray-600 font-medium mb-16 md:mb-20">
          Customer Reviews
        </p>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
          viewport={{ once: true }}
          className="relative"
        >
          {/* Decorative quotation mark */}
          <span
            aria-hidden="true"
            className="absolute -top-6 -left-2 md:-left-6 font-display text-[8rem] md:text-[11rem] leading-none text-black/5 dark:text-white/5 select-none pointer-events-none"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            &ldquo;
          </span>

          <blockquote className="relative max-w-4xl pl-2">
            <p
              className="text-2xl md:text-4xl lg:text-5xl leading-[1.25] tracking-tight text-black dark:text-white font-light"
              style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic' }}
            >
              &ldquo;{featured.text}&rdquo;
            </p>

            <footer className="mt-10 md:mt-14 flex items-center gap-8">
              <div className="w-12 h-px bg-black/15 dark:bg-white/15" />
              <div className="space-y-1.5">
                <cite className="not-italic text-[11px] uppercase tracking-[0.5em] font-semibold text-black dark:text-white block">
                  {featured.name}
                  <span className="text-gray-400 dark:text-gray-600 ml-2">· {featured.location}</span>
                </cite>
                <Stars count={featured.rating} className="text-black/30 dark:text-white/30 text-[10px]" />
              </div>
            </footer>
          </blockquote>
        </motion.div>
      </div>

      {/* Divider */}
      <div className="max-w-[1400px] mx-auto px-6 md:px-16">
        <div className="h-px bg-black/6 dark:bg-white/6" />
      </div>

      {/* Card grid */}
      <div className="max-w-[1400px] mx-auto px-6 md:px-16 pb-24 md:pb-36">
        <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-black/6 dark:divide-white/6">
          {rest.map((r, i) => (
            <motion.article
              key={r.id}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.9, delay: i * 0.12, ease: [0.16, 1, 0.3, 1] }}
              viewport={{ once: true }}
              className="pt-12 pb-12 md:px-12 first:pl-0 last:pr-0 flex flex-col justify-between gap-10"
            >
              <p
                className="text-lg md:text-xl leading-[1.5] text-black dark:text-white font-light"
                style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic' }}
              >
                &ldquo;{r.text}&rdquo;
              </p>

              <div className="space-y-2">
                <Stars count={r.rating} className="text-black/25 dark:text-white/25 text-[10px]" />
                <p className="text-[11px] uppercase tracking-[0.45em] font-semibold text-black/50 dark:text-white/50">
                  {r.name}
                  <span className="font-normal opacity-60 ml-1">· {r.location}</span>
                </p>
              </div>
            </motion.article>
          ))}
        </div>
      </div>

    </section>
  );
}

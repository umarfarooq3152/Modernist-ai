import React from 'react';
import { motion } from 'framer-motion';
import { useTheme } from '../context/ThemeContext';

interface GlassCardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  hoverScale?: boolean;
}

export const GlassCard: React.FC<GlassCardProps> = ({
  children,
  className = '',
  onClick,
  hoverScale = true,
}) => {
  const { resolvedTheme } = useTheme();

  // Light mode: White semi-transparent background, subtle white border
  // Dark mode: Dark semi-transparent background, subtle gray border
  const glassClasses = `
    relative
    rounded-2xl
    border
    backdrop-blur-glass
    dark:backdrop-blur-glass-dark
    bg-glass-light
    dark:bg-glass-dark
    border-glass-light-border
    dark:border-glass-dark-border
    shadow-glass-light
    dark:shadow-glass-dark
    transition-all
    duration-300
    overflow-hidden
    ${className}
  `;

  return (
    <motion.div
      className={glassClasses}
      onClick={onClick}
      whileHover={hoverScale ? { scale: 1.02 } : undefined}
      whileTap={hoverScale ? { scale: 0.98 } : undefined}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      {/* Gradient overlay for premium feel */}
      <div className="absolute inset-0 bg-gradient-to-br from-white/30 to-transparent dark:from-white/10 dark:to-transparent pointer-events-none" />

      {/* Inner content */}
      <div className="relative z-10">
        {children}
      </div>

      {/* Border shimmer effect on hover */}
      <motion.div
        className="absolute inset-0 rounded-2xl border border-transparent bg-gradient-to-r from-white/30 via-white/10 to-transparent dark:from-white/20 dark:via-transparent dark:to-transparent pointer-events-none"
        initial={{ opacity: 0 }}
        whileHover={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
      />
    </motion.div>
  );
};

/**
 * Usage examples:
 * 
 * // Basic card
 * <GlassCard>
 *   <div className="p-6">
 *     <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Title</h3>
 *     <p className="text-sm text-gray-600 dark:text-gray-300 mt-2">Content here</p>
 *   </div>
 * </GlassCard>
 *
 * // Interactive card
 * <GlassCard onClick={() => console.log('Clicked')} className="cursor-pointer p-4">
 *   <p className="text-white">Click me</p>
 * </GlassCard>
 *
 * // Product card with no hover scale
 * <GlassCard hoverScale={false} className="w-64">
 *   <img src="..." alt="..." className="w-full h-48 object-cover" />
 *   <div className="p-4">
 *     <h4 className="font-semibold text-gray-900 dark:text-white">Product Name</h4>
 *   </div>
 * </GlassCard>
 */

import React from 'react';
import { motion, HTMLMotionProps } from 'framer-motion';

interface GlassContainerProps extends HTMLMotionProps<"div"> {
  children: React.ReactNode;
  className?: string;
  hoverEffect?: boolean;
}

const GlassContainer: React.FC<GlassContainerProps> = ({
  children,
  className = '',
  hoverEffect = false,
  ...props
}) => {
  return (
    <motion.div
      className={`
        glass-panel rounded-none
        ${hoverEffect ? 'glass-panel-hover cursor-pointer' : ''}
        ${className}
      `}
      whileHover={hoverEffect ? { y: -5, scale: 1.01 } : {}}
      transition={{ duration: 0.3 }}
      {...props}
    >
      {children}
    </motion.div>
  );
};

export default GlassContainer;

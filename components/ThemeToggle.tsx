import React from 'react';
import { useTheme } from '../context/ThemeContext';
import { Sun, Moon } from 'lucide-react';
import { motion } from 'framer-motion';

const ThemeToggle: React.FC = () => {
  const { resolvedTheme, setTheme } = useTheme();

  const toggleTheme = () => {
    setTheme(resolvedTheme === 'dark' ? 'light' : 'dark');
  };

  const isDark = resolvedTheme === 'dark';

  return (
    <motion.button
      onClick={toggleTheme}
      className="relative w-9 h-9 rounded-full bg-black/5 dark:bg-white/10 text-gray-800 dark:text-gray-200 hover:bg-black/10 dark:hover:bg-white/20 transition-colors focus:outline-none overflow-hidden"
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      aria-label="Toggle Dark Mode"
    >
      <motion.div
        className="absolute inset-0 flex items-center justify-center p-2"
        initial={false}
        animate={{
          rotate: isDark ? 100 : 0,
          scale: isDark ? 0 : 1,
          opacity: isDark ? 0 : 1
        }}
        transition={{ duration: 0.4, ease: "easeInOut" }}
      >
        <Sun className="w-full h-full" />
      </motion.div>
      
      <motion.div
        className="absolute inset-0 flex items-center justify-center p-2"
        initial={false}
        animate={{
          rotate: isDark ? 0 : -100,
          scale: isDark ? 1 : 0,
          opacity: isDark ? 1 : 0
        }}
        transition={{ duration: 0.4, ease: "easeInOut" }}
      >
        <Moon className="w-full h-full" />
      </motion.div>
    </motion.button>
  );
};

export default ThemeToggle;

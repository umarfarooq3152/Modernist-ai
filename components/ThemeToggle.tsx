import React, { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { motion } from 'framer-motion';
import { Sun, Moon } from 'lucide-react';

const ThemeToggle: React.FC = () => {
  const [mounted, setMounted] = useState(false);
  const { theme, setTheme, resolvedTheme } = useTheme();

  // useEffect only runs on the client, so now we can safely show the UI
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div className="w-9 h-9" />; // Placeholder to prevent layout shift
  }

  const isDark = resolvedTheme === 'dark';

  const toggleTheme = () => {
    setTheme(isDark ? 'light' : 'dark');
  };

  return (
    <motion.button
      onClick={toggleTheme}
      className="relative w-9 h-9 rounded-none bg-black/5 dark:bg-white/10 text-gray-800 dark:text-gray-200 hover:bg-black/10 dark:hover:bg-white/20 transition-colors focus:outline-none overflow-hidden"
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

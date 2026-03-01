import React from 'react';
import { motion } from 'framer-motion';

export default function ThemeToggle({ theme, setTheme }) {
  return (
    <motion.button
      className="fixed top-4 sm:top-6 right-4 sm:right-6 z-30 px-3 sm:px-4 py-2.5 sm:py-3 rounded-lg bg-cool-blue text-white shadow-md hover:bg-cool-accent transition min-h-10 min-w-10 sm:min-h-auto sm:min-w-auto text-lg sm:text-base flex items-center justify-center"
      onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
      aria-label="Toggle theme"
      initial={{ rotate: 0 }}
      animate={{ rotate: theme === 'dark' ? 180 : 0 }}
      transition={{ type: 'spring', stiffness: 200 }}
    >
      {theme === 'light' ? '🌙' : '☀️'}
    </motion.button>
  );
}

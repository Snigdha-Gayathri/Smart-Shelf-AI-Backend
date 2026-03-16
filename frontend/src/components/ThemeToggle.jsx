import React from 'react';
import { motion } from 'framer-motion';

export default function ThemeToggle({ theme, setTheme }) {
  return (
    <motion.button
      className="fixed z-[9990] flex items-center justify-center rounded-full shadow-lg border border-white/20 backdrop-blur-md"
      style={{
        top: '14px',
        right: '18px',
        width: '42px',
        height: '42px',
        fontSize: '20px',
        background: theme === 'dark'
          ? 'rgba(30, 30, 60, 0.75)'
          : 'rgba(255, 255, 255, 0.35)',
        boxShadow: theme === 'dark'
          ? '0 0 12px rgba(180,200,255,0.25)'
          : '0 4px 16px rgba(30,144,255,0.22)',
      }}
      onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
      aria-label={theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
      whileTap={{ scale: 0.88 }}
      initial={{ rotate: 0 }}
      animate={{ rotate: theme === 'dark' ? 180 : 0 }}
      transition={{ type: 'spring', stiffness: 220, damping: 18 }}
    >
      {theme === 'light' ? '☀️' : '🌙'}
    </motion.button>
  );
}

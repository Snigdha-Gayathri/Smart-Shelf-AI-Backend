import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import qlexiImage from '../assets/qlexi-intro-removebg-preview-removebg-preview.png';

export default function QLexiAssistant({ message, section, theme = 'light' }) {
  const isDarkMode = theme === 'dark';
  const bubbleBackground = isDarkMode
    ? 'linear-gradient(135deg, rgba(30, 144, 255, 0.75) 0%, rgba(59, 130, 246, 0.65) 100%)'
    : 'linear-gradient(135deg, rgba(7, 61, 164, 0.96) 0%, rgba(13, 101, 218, 0.94) 55%, rgba(30, 144, 255, 0.90) 100%)';
  const pointerColor = isDarkMode ? 'rgba(30, 144, 255, 0.95)' : 'rgba(9, 74, 189, 0.98)';
  return (
    <div className="flex items-start gap-3 sm:gap-4 mb-6 sm:mb-8">
      {/* Q Lexi Character - Using actual Q Lexi image */}
      <motion.div
        className="flex-shrink-0"
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 20 }}
      >
        <div className="relative w-14 h-14 sm:w-16 sm:h-16 md:w-20 md:h-20">
          {/* Q Lexi Image */}
          <motion.img
            src={qlexiImage}
            alt="Q Lexi - Your quantum reading assistant"
            className="w-full h-full object-contain drop-shadow-lg"
            animate={{
              y: [0, -3, 0],
            }}
            transition={{
              duration: 3,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          />
          
          {/* Subtle glow effect behind Q Lexi */}
          <div 
            className="absolute inset-0 -z-10 blur-md opacity-40 rounded-full"
            style={{
              background: 'radial-gradient(circle, rgba(34, 211, 238, 0.5) 0%, transparent 70%)',
            }}
          />
        </div>
      </motion.div>

      {/* Speech Bubble */}
      <AnimatePresence mode="wait">
        <motion.div
          key={message}
          className="relative flex-1 max-w-sm sm:max-w-md"
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 10 }}
          transition={{ duration: 0.3 }}
        >
          {/* Speech bubble pointer */}
          <div
            className="absolute left-0 top-3 sm:top-4 w-0 h-0 -ml-2"
            style={{
              borderTop: '6px solid transparent',
              borderBottom: '6px solid transparent',
              borderRight: `10px solid ${pointerColor}`,
            }}
          />
          
          {/* Speech bubble content */}
          <div
            className="rounded-xl sm:rounded-2xl px-3 py-2 sm:px-4 sm:py-3 shadow-xl backdrop-blur-xl border border-white/25"
            style={{ background: bubbleBackground }}
          >
            <motion.p
              className="text-white text-xs sm:text-sm md:text-base font-medium leading-relaxed"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.15 }}
            >
              {message}
            </motion.p>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

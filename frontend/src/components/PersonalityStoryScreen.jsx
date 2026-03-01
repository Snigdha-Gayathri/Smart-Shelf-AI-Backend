import React from 'react';
import { motion } from 'framer-motion';
import { generatePersonalityStory } from '../utils/personalityStoryGenerator';
import qlexiImage from '../assets/qlexi-intro-removebg-preview-removebg-preview.png';

export default function PersonalityStoryScreen({ previousReads }) {
  const story = generatePersonalityStory(previousReads);
  const booksCompleted = previousReads?.length || 0;

  return (
    <section className="w-full min-h-screen">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="mb-6 sm:mb-8"
      >
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-blue-900 dark:text-blue-100 mb-2 drop-shadow-[0_0_12px_rgba(30,144,255,0.9)] transition-all duration-500 hover:drop-shadow-[0_0_20px_rgba(30,144,255,1)]">
          ✨ Your Personality Story
        </h1>
        <p className="text-blue-700 dark:text-blue-300 text-sm sm:text-base drop-shadow-[0_0_6px_rgba(30,144,255,0.4)]">
          Written by Q Lexi based on your reading choices • {booksCompleted} book{booksCompleted !== 1 ? 's' : ''} analyzed
        </p>
      </motion.div>

      {/* Two-Column Layout: Q Lexi on Left, Story on Right */}
      <div className="flex flex-col lg:flex-row gap-6 lg:gap-8 items-start">
        
        {/* Left Column: Q Lexi Character - Large & Dominant */}
        <motion.div
          initial={{ opacity: 0, x: -30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="flex-shrink-0 w-full lg:w-auto flex justify-center lg:justify-start lg:sticky lg:top-8"
        >
          <div className="relative">
            {/* Q Lexi Image - Large */}
            <motion.img
              src={qlexiImage}
              alt="Q Lexi - Your reading personality analyst"
              className="w-48 sm:w-56 md:w-64 lg:w-72 xl:w-80 h-auto object-contain drop-shadow-2xl"
              style={{
                minHeight: '300px',
                maxHeight: '70vh',
              }}
              animate={{
                y: [0, -8, 0],
              }}
              transition={{
                duration: 4,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
            />
            
            {/* Glow effect behind Q Lexi */}
            <div 
              className="absolute inset-0 -z-10 blur-3xl opacity-30 rounded-full"
              style={{
                background: 'radial-gradient(circle, rgba(30, 144, 255, 0.6) 0%, rgba(30, 144, 255, 0.25) 50%, transparent 70%)',
                transform: 'scale(1.2)',
              }}
            />

            {/* Speech bubble hint */}
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.8, duration: 0.4 }}
              className="absolute -right-2 top-4 sm:top-8 px-3 py-2 rounded-xl text-xs sm:text-sm font-medium max-w-32 sm:max-w-40"
              style={{
                background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
                color: 'white',
                boxShadow: '0 4px 15px rgba(59, 130, 246, 0.4)',
              }}
            >
              Let me judge you... lovingly 💙
              <div 
                className="absolute -left-2 top-4 w-0 h-0"
                style={{
                  borderTop: '6px solid transparent',
                  borderBottom: '6px solid transparent',
                  borderRight: '8px solid #3b82f6',
                }}
              />
            </motion.div>
          </div>
        </motion.div>

        {/* Right Column: Single Story Box */}
        <motion.div
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="flex-1 w-full"
        >
          {/* CINEMATIC VIDEO STORY BOX */}
          <div
            className="group relative rounded-2xl sm:rounded-3xl overflow-hidden border-2 border-[#1E90FF] shadow-[0_0_25px_#1E90FF] transition-all duration-500 ease-out hover:scale-[1.02] hover:shadow-[0_0_40px_#1E90FF,0_0_70px_rgba(30,144,255,0.7)]"
          >
            {/* Background Video */}
            <video
              autoPlay
              loop
              muted
              playsInline
              className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
            >
              <source src="/assets/QLexi%20video%20for%20Personality%20Story%20Box's%20Background.mp4" type="video/mp4" />
            </video>

            {/* Dark Gradient Overlay (No Blur) */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/40 to-black/60 transition-all duration-500 group-hover:from-black/60 group-hover:via-black/30 group-hover:to-black/50" />

            {/* Content Layer */}
            <div className="relative z-10 p-6 sm:p-8 md:p-10 lg:p-12">
              {/* Story Content - Long form, readable */}
              <div className="space-y-5 sm:space-y-6">
                {story.split('\n\n').map((paragraph, idx) => (
                  <motion.p
                    key={idx}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 + idx * 0.15, duration: 0.4 }}
                    className="text-white/95 text-base sm:text-lg md:text-xl leading-relaxed font-medium drop-shadow-lg transition-all duration-500 group-hover:text-white"
                    style={{ lineHeight: '1.8' }}
                  >
                    {paragraph}
                  </motion.p>
                ))}
              </div>

              {/* Footer inside the box */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1.2 }}
                className="mt-8 pt-6 border-t border-[#1E90FF]/30 flex items-center justify-between"
              >
                <p className="text-sm font-semibold text-white drop-shadow-[0_0_8px_rgba(30,144,255,0.7)]">
                  📚 {booksCompleted} book{booksCompleted !== 1 ? 's' : ''} shaped this story
                </p>
                <p className="text-xs text-[#1E90FF] drop-shadow-[0_0_6px_rgba(30,144,255,0.5)]">
                  Updates with every read
                </p>
              </motion.div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

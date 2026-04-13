import React, { useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { generatePersonalityStory } from '../utils/personalityStoryGenerator';

export default function PersonalityStoryScreen({ previousReads, theme = 'light' }) {
  const story = generatePersonalityStory(previousReads);
  const booksCompleted = previousReads?.length || 0;
  const videoRef = useRef(null);
  const isLight = theme === 'light';

  // Force playback after mount (some browsers block autoplay until interacted)
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.play().catch(() => {
        // Autoplay blocked — silently ignored; video is decorative
      });
    }
  }, []);

  // The video file lives in frontend/public/videos/ → served at /videos/... at runtime
  const VIDEO_SRC = '/videos/qlexi_background.mp4';

  return (
    <section className="personality-section w-full">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="mb-6 sm:mb-8"
      >
        <h1 className={`text-3xl sm:text-4xl md:text-5xl font-bold mb-2 transition-all duration-500 ${isLight ? 'text-black drop-shadow-none' : 'text-blue-900 dark:text-blue-100 drop-shadow-[0_0_12px_rgba(30,144,255,0.9)] hover:drop-shadow-[0_0_20px_rgba(30,144,255,1)]'}`}>
          ✨ Your Personality Story
        </h1>
        <p className={`text-sm sm:text-base ${isLight ? 'text-black drop-shadow-none' : 'text-blue-700 dark:text-blue-300 drop-shadow-[0_0_6px_rgba(30,144,255,0.4)]'}`}>
          Written by Q Lexi based on your reading choices • {booksCompleted} book{booksCompleted !== 1 ? 's' : ''} analyzed
        </p>
      </motion.div>

      <div className="personality-story-layout w-full min-w-0">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="flex-1 min-w-0 w-full"
        >
          {/* CINEMATIC VIDEO STORY BOX */}
          <div
            className="story-box group relative rounded-2xl sm:rounded-3xl overflow-hidden border-2 border-[#1E90FF] shadow-[0_0_25px_#1E90FF] transition-all duration-500 ease-out hover:shadow-[0_0_40px_#1E90FF,0_0_70px_rgba(30,144,255,0.7)]"
          >
            {/* Background Video — no blur, autoplay, muted, loop */}
            <video
              ref={videoRef}
              autoPlay
              loop
              muted
              playsInline
              className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
            >
              <source src={VIDEO_SRC} type="video/mp4" />
            </video>

            {/* Dark Gradient Overlay — no blur, enough contrast for text */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/45 to-black/60 transition-all duration-500 group-hover:from-black/65 group-hover:via-black/35 group-hover:to-black/50" />

            {/* Content Layer */}
            <div className="story-box-content relative z-10 p-6 sm:p-8 md:p-10 lg:p-12">
              {/* Story Content - Long form, readable */}
              <div className="space-y-5 sm:space-y-6">
                {story.split('\n\n').map((paragraph, idx) => (
                  <motion.p
                    key={idx}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 + idx * 0.15, duration: 0.4 }}
                    className={`text-base sm:text-lg md:text-xl leading-relaxed font-semibold drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)] transition-all duration-500 group-hover:brightness-110 ${isLight ? 'personality-story-light-glow' : 'text-white'}`}
                    style={{ lineHeight: '1.8', textShadow: isLight ? '0 0 8px rgba(255,255,255,0.35), 0 2px 12px rgba(0,0,0,0.85)' : '0 2px 12px rgba(0,0,0,0.85)' }}
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
                className="mt-8 pt-6 border-t border-[#1E90FF]/30 flex items-center justify-between gap-3 flex-wrap"
              >
                <p className={`text-sm font-semibold ${isLight ? 'personality-story-light-glow' : 'text-white drop-shadow-[0_0_8px_rgba(30,144,255,0.7)]'}`}>
                  📚 {booksCompleted} book{booksCompleted !== 1 ? 's' : ''} shaped this story
                </p>
                <p className={`text-xs ${isLight ? 'personality-story-light-glow' : 'text-[#1E90FF] drop-shadow-[0_0_6px_rgba(30,144,255,0.5)]'}`}>
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

import React from 'react';
import qlexiImage from '../assets/qlexi-intro-removebg-preview-removebg-preview.png';

export default function HamburgerMenu({ isOpen, setIsOpen, activeSection, setActiveSection, theme = 'light' }) {
  const menuItems = [
    { id: 'introduction', label: 'Introduction', icon: '🌟' },
    { id: 'home', label: 'Recommendations', icon: '🎯' },
    { id: 'reading', label: 'Currently Reading', icon: '📖' },
    { id: 'educational_reads', label: 'Educational Reads', icon: '📚' },
    { id: 'previous', label: 'Previous Reads', icon: '✅' },
    { id: 'your_education', label: 'Your Education', icon: '🎓' },
    { id: 'personality_story', label: 'Your Personality Story', icon: '✨' },
    { id: 'wrapped', label: 'Annual Wrapped', icon: '📊' },
    { id: 'author_dashboard', label: 'Author Insights', icon: '✒' },
    { id: 'settings', label: 'Settings', icon: '⚙️' },
  ];

  const iconColorById = {
    introduction: '#facc15',
    home: '#38bdf8',
    reading: '#60a5fa',
    educational_reads: '#34d399',
    previous: '#22c55e',
    your_education: '#f59e0b',
    personality_story: '#f472b6',
    wrapped: '#a78bfa',
    author_dashboard: '#fb7185',
    settings: '#94a3b8',
  };

  return (
    <>
      {/* Toggle button — always visible at a fixed position */}
      <button
        className="fixed top-4 left-4 z-[60] p-2 rounded-2xl flex items-center justify-center transition-all duration-300 backdrop-blur-md border border-white/20 shadow-lg hover:shadow-xl"
        style={{ background: 'rgba(30, 144, 255, 0.22)' }}
        onClick={() => setIsOpen(prev => !prev)}
        aria-label={isOpen ? 'Close navigation' : 'Open navigation'}
      >
        <div
          className="relative h-9 w-9 rounded-full p-[2px]"
          style={{
            background:
              'linear-gradient(135deg, rgba(103,232,249,0.95), rgba(59,130,246,0.95), rgba(139,92,246,0.95))',
          }}
        >
          <div className="h-full w-full rounded-full bg-slate-900/70 backdrop-blur-md flex items-center justify-center overflow-hidden">
            <img src={qlexiImage} alt="Q Lexi" className="h-7 w-7 object-contain drop-shadow-md" />
          </div>
        </div>
      </button>

      {/* Sidebar — lives in flex flow, sticky keeps it visible on scroll */}
      <aside
        className="sidebar shrink-0 transition-[width] duration-300 ease-in-out overflow-hidden"
        style={{ width: isOpen ? 272 : 0 }}
      >
        <div
          className="sticky top-0 h-screen flex flex-col border-r border-white/15"
          style={{
            width: 272,
            background: 'rgba(15, 23, 42, 0.88)',
            backdropFilter: 'blur(18px)',
          }}
        >
          {/* Header */}
          <div
            className="shrink-0 px-5 pb-3 border-b border-white/10"
            style={{
              paddingTop: 'clamp(4.5rem, 10vh, 5rem)',
              background: 'rgba(30, 144, 255, 0.15)',
            }}
          >
            <h2 className="text-[15px] font-semibold leading-snug text-white/95 break-words">
              Where do you want to go?
            </h2>
          </div>

          {/* Nav items — balanced spacing with no scrolling */}
          <nav className="flex-1 flex flex-col px-3 py-2 overflow-hidden min-h-0">
            <ul
              className="h-full grid gap-1"
              style={{ gridTemplateRows: `repeat(${menuItems.length}, minmax(0, 1fr))` }}
            >
              {menuItems.map((item) => (
                <li key={item.id} className="min-h-0">
                  <button
                    className={`group flex items-center gap-3 w-full rounded-xl transition-all duration-200 text-[13px] font-medium border focus:outline-none focus:ring-2 focus:ring-blue-400/40 ${
                      activeSection === item.id ? 'border-cyan-300/40' : 'border-white/10'
                    }`}
                    style={{
                      minHeight: 'clamp(36px, 4.8vh, 40px)',
                      height: '100%',
                      padding: 'clamp(4px, 0.55vh, 6px) clamp(10px, 1.4vh, 11px)',
                      boxSizing: 'border-box',
                      background:
                        activeSection === item.id
                          ? 'linear-gradient(135deg, rgba(30,144,255,0.38), rgba(139,92,246,0.24))'
                          : 'rgba(255,255,255,0.06)',
                      color:
                        activeSection === item.id
                          ? 'rgba(255,255,255,0.95)'
                          : 'rgba(255,255,255,0.7)',
                      boxShadow:
                        activeSection === item.id
                          ? '0 6px 20px rgba(30,144,255,0.22), inset 0 1px 1px rgba(255,255,255,0.1)'
                          : 'inset 0 1px 1px rgba(255,255,255,0.04)',
                    }}
                    onMouseEnter={(e) => {
                      if (activeSection !== item.id) {
                        e.currentTarget.style.background = 'rgba(255,255,255,0.12)';
                        e.currentTarget.style.color = 'rgba(255,255,255,0.9)';
                        e.currentTarget.style.boxShadow =
                          '0 4px 14px rgba(30,144,255,0.16), inset 0 1px 1px rgba(255,255,255,0.08)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (activeSection !== item.id) {
                        e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
                        e.currentTarget.style.color = 'rgba(255,255,255,0.7)';
                        e.currentTarget.style.boxShadow = 'inset 0 1px 1px rgba(255,255,255,0.04)';
                      }
                    }}
                    onClick={() => {
                      setActiveSection(item.id);
                      if (window.innerWidth < 768) setIsOpen(false);
                    }}
                  >
                    <span
                      className="inline-flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md bg-white/10 text-[12px] group-hover:bg-white/15 transition-colors duration-200"
                      style={{
                        fontFamily: 'Segoe UI Emoji, Apple Color Emoji, Noto Color Emoji, sans-serif',
                        fontWeight: 500,
                        lineHeight: 1,
                        color: theme === 'light' ? iconColorById[item.id] : 'rgba(255,255,255,0.92)',
                        textShadow: theme === 'light' ? '0 0 0 transparent' : '0 0 6px rgba(147, 197, 253, 0.2)',
                        filter: 'none',
                        fontVariantEmoji: 'emoji',
                      }}
                    >
                      {item.icon}
                    </span>
                    <span className="leading-snug text-left">{item.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          </nav>

          {/* Footer accent */}
          <div
            className="h-[3px] shrink-0 border-t border-white/10"
            style={{
              background: 'linear-gradient(90deg, rgba(30,144,255,0.32), rgba(139,92,246,0.22), transparent)',
            }}
          />
        </div>
      </aside>
    </>
  );
}

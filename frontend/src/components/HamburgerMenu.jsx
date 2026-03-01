import React from 'react';
import { FaBars, FaTimes } from 'react-icons/fa';

export default function HamburgerMenu({ isOpen, setIsOpen, activeSection, setActiveSection, inline = false }) {
  const menuItems = [
    { id: 'introduction', label: 'Introduction', icon: '🌟' },
    { id: 'home', label: 'Recommendations', icon: '🎯' },
    { id: 'reading', label: 'Currently Reading', icon: '📖' },
    { id: 'educational_reads', label: 'Educational Reads', icon: '📚' },
    { id: 'previous', label: 'Previous Reads', icon: '✅' },
    { id: 'your_education', label: 'Your Education', icon: '🎓' },
    { id: 'personality_story', label: 'Your Personality Story', icon: '✨' },
    { id: 'wrapped', label: 'Annual Wrapped', icon: '📊' },
    { id: 'settings', label: 'Settings', icon: '⚙️' },
  ];

  // Inline rendering for layout integration (flexbox sibling with main content)
  if (inline) {
    return (
      <div className="flex-shrink-0 flex h-full">
        {/* Toggle Button - Always visible */}
        <div 
          className="flex flex-col h-full backdrop-blur-md border-r border-white/10"
          style={{ background: 'rgba(15, 23, 42, 0.6)' }}
        >
          <button
            className="p-3 sm:p-4 flex items-center justify-center transition-all duration-300 border-b border-white/10 hover:bg-white/10 min-h-12 sm:min-h-14"
            style={{
              background: 'rgba(30, 144, 255, 0.2)',
              color: 'rgba(255, 255, 255, 0.9)',
            }}
            onClick={() => setIsOpen(!isOpen)}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(30, 144, 255, 0.35)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(30, 144, 255, 0.2)';
            }}
            aria-label={isOpen ? 'Close navigation' : 'Open navigation'}
          >
            {isOpen ? <FaTimes size={20} /> : <FaBars size={20} />}
          </button>
          
          {/* Collapsed icons when menu is closed */}
          {!isOpen && (
            <div className="flex-1 overflow-y-auto py-2">
              {menuItems.map((item) => (
                <button
                  key={item.id}
                  className={`w-full p-3 flex items-center justify-center transition-all duration-200 ${
                    activeSection === item.id ? 'bg-blue-500/30' : 'hover:bg-white/10'
                  }`}
                  onClick={() => setActiveSection(item.id)}
                  title={item.label}
                  aria-label={item.label}
                >
                  <span className="text-lg">{item.icon}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Expanded Navigation Panel */}
        <aside
          className={`h-full flex-shrink-0 transition-all duration-300 ease-in-out overflow-hidden backdrop-blur-xl border-r border-white/10 shadow-2xl flex flex-col ${
            isOpen ? 'w-48 sm:w-56' : 'w-0'
          }`}
          style={{
            background: 'rgba(15, 23, 42, 0.8)',
          }}
        >
          {/* Glass Header Section */}
          <div 
            className="pt-4 sm:pt-6 px-4 sm:px-5 flex-shrink-0 border-b border-white/10 backdrop-blur-md"
            style={{
              background: 'rgba(30, 144, 255, 0.15)',
            }}
          >
            <h2 className="text-sm sm:text-base font-bold bg-gradient-to-r from-cyan-300 via-blue-300 to-sky-300 bg-clip-text text-transparent mb-3 sm:mb-4 whitespace-nowrap">
              Navigation
            </h2>
          </div>

          {/* Glass Menu Items Container */}
          <div className="flex-1 overflow-y-auto px-2 sm:px-3 py-3 sm:py-4">
            <ul className="space-y-1.5 sm:space-y-2">
              {menuItems.map((item) => (
                <li key={item.id}>
                  <button
                    className="w-full text-left px-3 py-2 sm:py-2.5 rounded-lg transition-all duration-300 text-xs sm:text-sm font-medium backdrop-blur-md border border-white/10 focus:outline-none focus:ring-2 focus:ring-blue-400/50 whitespace-nowrap"
                    style={{
                      background: activeSection === item.id
                        ? 'rgba(30, 144, 255, 0.4)'
                        : 'rgba(255, 255, 255, 0.08)',
                      color: activeSection === item.id
                        ? 'rgba(255, 255, 255, 0.95)'
                        : 'rgba(255, 255, 255, 0.7)',
                      boxShadow: activeSection === item.id
                        ? '0 4px 16px rgba(30, 144, 255, 0.2), inset 0 1px 1px rgba(255, 255, 255, 0.1)'
                        : 'inset 0 1px 1px rgba(255, 255, 255, 0.05)',
                    }}
                    onMouseEnter={(e) => {
                      if (activeSection !== item.id) {
                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.12)';
                        e.currentTarget.style.color = 'rgba(255, 255, 255, 0.9)';
                        e.currentTarget.style.boxShadow = '0 4px 16px rgba(30, 144, 255, 0.15), inset 0 1px 1px rgba(255, 255, 255, 0.1)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (activeSection !== item.id) {
                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
                        e.currentTarget.style.color = 'rgba(255, 255, 255, 0.7)';
                        e.currentTarget.style.boxShadow = 'inset 0 1px 1px rgba(255, 255, 255, 0.05)';
                      }
                    }}
                    onClick={() => {
                      setActiveSection(item.id);
                    }}
                  >
                    <span className="mr-2">{item.icon}</span>
                    {item.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {/* Glass Footer Accent */}
          <div 
            className="h-1 backdrop-blur-md border-t border-white/10 flex-shrink-0"
            style={{
              background: 'linear-gradient(90deg, rgba(30, 144, 255, 0.3), rgba(139, 92, 246, 0.3), transparent)',
            }}
          />
        </aside>
      </div>
    );
  }

  // Fixed modal rendering for mobile overlay (default behavior)
  return (
    <>
      {/* Glass Morphism Burger Button */}
      <button
        className="fixed top-4 sm:top-6 left-4 sm:left-6 z-50 p-2.5 sm:p-3 rounded-lg min-h-10 min-w-10 sm:min-h-auto sm:min-w-auto flex items-center justify-center transition-all duration-300 backdrop-blur-md border border-white/20 shadow-lg hover:shadow-xl"
        style={{
          background: 'rgba(30, 144, 255, 0.2)',
          color: 'rgba(255, 255, 255, 0.9)',
        }}
        onClick={() => setIsOpen(!isOpen)}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(30, 144, 255, 0.3)';
          e.currentTarget.style.boxShadow = '0 8px 32px rgba(30, 144, 255, 0.3)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'rgba(30, 144, 255, 0.2)';
          e.currentTarget.style.boxShadow = '0 4px 16px rgba(0, 0, 0, 0.1)';
        }}
        aria-label="Menu"
      >
        {isOpen ? <FaTimes size={20} /> : <FaBars size={20} />}
      </button>

      {/* Backdrop Overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 z-40 transition-opacity duration-300"
          style={{ background: 'rgba(0, 0, 0, 0.3)' }}
          onClick={() => setIsOpen(false)} 
        />
      )}

      {/* Glass Morphism Navigation Sidebar */}
      <nav
        className={`fixed top-0 left-0 h-full w-56 sm:w-64 z-40 transform transition-transform duration-300 flex flex-col backdrop-blur-xl border-r border-white/10 shadow-2xl ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        style={{
          background: 'rgba(15, 23, 42, 0.8)',
        }}
      >
        {/* Glass Header Section */}
        <div 
          className="pt-16 sm:pt-20 px-4 sm:px-6 flex-shrink-0 rounded-br-2xl border-b border-white/10 backdrop-blur-md"
          style={{
            background: 'rgba(30, 144, 255, 0.15)',
          }}
        >
          <h2 className="text-base sm:text-xl font-bold bg-gradient-to-r from-cyan-300 via-blue-300 to-sky-300 bg-clip-text text-transparent mb-4 sm:mb-6">
            Navigation
          </h2>
        </div>

        {/* Glass Menu Items Container */}
        <div className="flex-1 overflow-y-auto px-3 sm:px-4 py-4 sm:py-6 pb-6">
          <ul className="space-y-2 sm:space-y-3">
            {menuItems.map((item) => (
              <li key={item.id}>
                <button
                  className={`w-full text-left px-3 sm:px-4 py-2.5 sm:py-3 rounded-lg transition-all duration-300 text-sm sm:text-base font-medium backdrop-blur-md border border-white/10 focus:outline-none focus:ring-2 focus:ring-blue-400/50`}
                  style={{
                    background: activeSection === item.id
                      ? 'rgba(30, 144, 255, 0.4)'
                      : 'rgba(255, 255, 255, 0.08)',
                    color: activeSection === item.id
                      ? 'rgba(255, 255, 255, 0.95)'
                      : 'rgba(255, 255, 255, 0.7)',
                    boxShadow: activeSection === item.id
                      ? '0 4px 16px rgba(30, 144, 255, 0.2), inset 0 1px 1px rgba(255, 255, 255, 0.1)'
                      : 'inset 0 1px 1px rgba(255, 255, 255, 0.05)',
                  }}
                  onMouseEnter={(e) => {
                    if (activeSection !== item.id) {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.12)';
                      e.currentTarget.style.color = 'rgba(255, 255, 255, 0.9)';
                      e.currentTarget.style.boxShadow = '0 4px 16px rgba(30, 144, 255, 0.15), inset 0 1px 1px rgba(255, 255, 255, 0.1)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (activeSection !== item.id) {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
                      e.currentTarget.style.color = 'rgba(255, 255, 255, 0.7)';
                      e.currentTarget.style.boxShadow = 'inset 0 1px 1px rgba(255, 255, 255, 0.05)';
                    }
                  }}
                  onClick={() => {
                    setActiveSection(item.id);
                    setIsOpen(false);
                  }}
                >
                  <span className="mr-2 sm:mr-3">{item.icon}</span>
                  {item.label}
                </button>
              </li>
            ))}
          </ul>
        </div>

        {/* Glass Footer Accent */}
        <div 
          className="h-1 rounded-tr-2xl backdrop-blur-md border-t border-white/10"
          style={{
            background: 'linear-gradient(90deg, rgba(30, 144, 255, 0.3), rgba(30, 144, 255, 0.15), transparent)',
          }}
        />
      </nav>

      {/* Global Styles for Glass Effect */}
      <style jsx global>{`
        @supports (backdrop-filter: blur(10px)) {
          /* Smooth scrolling for glass menu */
          .glass-menu-scroll {
            scroll-behavior: smooth;
          }
        }
      `}</style>
    </>
  );
}

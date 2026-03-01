module.exports = {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Cool color palette
        'cool-bg': '#f0f4f8',
        'cool-dark': '#1e293b',
        'cool-blue': '#3b82f6',
        'cool-slate': '#64748b',
        'cool-accent': '#06b6d4',
        'cool-light': '#e0f2fe',
        'primary': '#1E90FF',
        'primary-dark': '#1873CC',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      spacing: {
        '18': '4.5rem',
        '22': '5.5rem',
      },
    },
  },
  plugins: [],
}

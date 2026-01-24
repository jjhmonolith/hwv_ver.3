import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Status colors for participant badges
        status: {
          registered: '#9CA3AF',      // gray
          'file-submitted': '#F59E0B', // yellow
          'in-progress': '#8B5CF6',   // purple
          paused: '#F97316',          // orange
          completed: '#10B981',       // green
          timeout: '#EF4444',         // red
          abandoned: '#EF4444',       // red
        },
        // Session status colors
        session: {
          draft: '#9CA3AF',           // gray
          active: '#10B981',          // green
          closed: '#6B7280',          // dark gray
        },
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        studio: {
          bg: 'var(--studio-bg)',
          surface: 'var(--studio-surface)',
          card: 'var(--studio-card)',
          elevated: 'var(--studio-elevated)',
          border: 'var(--studio-border)',
          borderSubtle: 'var(--studio-border-subtle)',
          text: 'var(--studio-text)',
          textMuted: 'var(--studio-text-muted)',
          accent: 'var(--studio-accent)',
          accentGlow: 'var(--studio-accent-glow)',
          accentSecondary: 'var(--studio-accent-secondary)',
          vuMeterGreen: '#10b981',
          vuMeterYellow: '#f59e0b',
          vuMeterRed: '#ef4444',
        },
      },
      fontFamily: {
        heading: ['Bebas Neue', 'sans-serif'],
        subheading: ['Montserrat', 'sans-serif'],
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Menlo', 'Monaco', 'Courier New', 'monospace'],
      },
      animation: {
        'pulse-subtle': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'spin-slow': 'spin 12s linear infinite',
      },
      boxShadow: {
        knob: 'inset 0 1px 2px rgba(255, 255, 255, 0.1), 0 4px 10px rgba(0, 0, 0, 0.5)',
        deck: '0 8px 32px 0 rgba(0, 0, 0, 0.37), inset 0 1px 0 rgba(255, 255, 255, 0.08)',
        fader: 'inset 0 2px 4px rgba(0, 0, 0, 0.6), 0 1px 0 rgba(255, 255, 255, 0.05)',
      },
    },
  },
  plugins: [],
};

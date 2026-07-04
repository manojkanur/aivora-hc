import type { Config } from 'tailwindcss'
import typography from '@tailwindcss/typography'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Blue primary system (replaces gold)
        primary: {
          DEFAULT: '#3b82f6',
          light:   '#60a5fa',
          dark:    '#2563eb',
          muted:   'rgba(59,130,246,0.15)',
        },
        // Gold aliases → blue so hardcoded gold- Tailwind classes degrade to blue
        gold: {
          DEFAULT: '#3b82f6',
          light:   '#60a5fa',
          dark:    '#2563eb',
          muted:   'rgba(59,130,246,0.15)',
        },
        surface: {
          primary:   '#131720',
          secondary: '#0c0e14',
          tertiary:  '#1a1e2e',
        },
        text: {
          primary:   '#FFFFFF',
          secondary: '#cbd5e1',
          tertiary:  '#64748b',
          muted:     '#334155',
        },
        border: {
          DEFAULT: '#1e2433',
          light:   '#131720',
          dark:    '#252d3f',
        },
        accent: {
          DEFAULT: '#3b82f6',
          hover:   '#60a5fa',
          light:   'rgba(59,130,246,0.12)',
        },
      },
      fontFamily: {
        sans:    ['Inter', 'system-ui', 'sans-serif'],
        display: ['Outfit', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card:         '0 1px 3px rgba(0,0,0,0.5), 0 1px 2px rgba(0,0,0,0.4)',
        'card-hover': '0 4px 16px rgba(0,0,0,0.6), 0 0 0 1px rgba(59,130,246,0.2)',
        elevated:     '0 8px 32px rgba(0,0,0,0.7)',
        modal:        '0 25px 60px rgba(0,0,0,0.85)',
        gold:         '0 0 20px rgba(59,130,246,0.3)',
        blue:         '0 0 20px rgba(59,130,246,0.3)',
      },
    },
  },
  plugins: [typography],
} satisfies Config

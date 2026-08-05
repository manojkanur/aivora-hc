import type { Config } from 'tailwindcss'
import typography from '@tailwindcss/typography'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // AIVORA brand blue (logo / marketing) + product action accent
        brand: {
          DEFAULT: '#0060FF',   // logo, marketing
          tint:    '#EAF2FE',
          light:   '#B9D3FB',
          mid:     '#5B96F5',
          strong:  '#175FCC',
          deep:    '#0D3C82',
        },
        // Primary = in-product action accent (buttons, links, focus)
        primary: {
          DEFAULT: '#2E7DFA',   // color-accent-action (dark)
          light:   '#5B96F5',
          dark:    '#175FCC',   // color-accent-action (light)
          muted:   'rgba(46,125,250,0.15)',
        },
        // Gold aliases → brand blue so any residual gold- classes degrade cleanly
        gold: {
          DEFAULT: '#2E7DFA',
          light:   '#5B96F5',
          dark:    '#175FCC',
          muted:   'rgba(46,125,250,0.15)',
        },
        surface: {
          primary:   '#1B2431',  // color-bg-panel
          secondary: '#0B1220',  // color-bg-primary
          tertiary:  '#222E3E',
        },
        text: {
          primary:   '#F5F7FA',  // color-text-primary
          secondary: '#8C96A6',  // color-text-secondary
          tertiary:  '#5A6474',
          muted:     '#3A4454',
        },
        border: {
          DEFAULT: '#2A3648',
          light:   '#1B2431',
          dark:    '#3A4454',
        },
        accent: {
          DEFAULT: '#2E7DFA',
          hover:   '#5B96F5',
          light:   'rgba(46,125,250,0.12)',
          ai:      '#17BFA0',   // color-accent-ai
        },
      },
      fontFamily: {
        sans:    ['IBM Plex Sans', 'system-ui', 'sans-serif'],
        display: ['IBM Plex Sans', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card:         '0 1px 3px rgba(0,0,0,0.5), 0 1px 2px rgba(0,0,0,0.4)',
        'card-hover': '0 4px 16px rgba(0,0,0,0.6), 0 0 0 1px rgba(46,125,250,0.2)',
        elevated:     '0 8px 32px rgba(0,0,0,0.7)',
        modal:        '0 25px 60px rgba(0,0,0,0.85)',
        gold:         '0 0 20px rgba(46,125,250,0.3)',
        blue:         '0 0 20px rgba(46,125,250,0.3)',
      },
    },
  },
  plugins: [typography],
} satisfies Config

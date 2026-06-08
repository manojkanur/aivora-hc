import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: {
          primary: '#ffffff',
          secondary: '#fafafa',
          tertiary: '#f5f5f5',
        },
        text: {
          primary: '#0a0a0a',
          secondary: '#525252',
          tertiary: '#737373',
          muted: '#a3a3a3',
        },
        border: {
          DEFAULT: '#e5e5e5',
          light: '#f0f0f0',
          dark: '#d4d4d4',
        },
        accent: {
          DEFAULT: '#18181b',
          hover: '#27272a',
          light: '#f4f4f5',
        }
      },
      fontFamily: {
        sans: ['Space Grotesk', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(0,0,0,0.04), 0 1px 3px rgba(0,0,0,0.06)',
        'card-hover': '0 4px 12px rgba(0,0,0,0.10), 0 2px 4px rgba(0,0,0,0.04)',
        elevated: '0 8px 24px rgba(0,0,0,0.12)',
        modal: '0 25px 50px rgba(0,0,0,0.25)',
      },
    },
  },
  plugins: [],
} satisfies Config

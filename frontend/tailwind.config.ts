import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        ink: {
          900: '#0F1B2D',
          800: '#16263B',
          700: '#20344D',
        },
        mist: {
          100: '#E6EEF7',
          400: '#9FB1C6',
        },
        signal: {
          cyan: '#2DD4E8',
        },
        risk: {
          high: '#F2554B',
          medium: '#F5A524',
          low: '#7FA7D6',
          uncertain: '#8A9BB0',
        },
      },
      fontFamily: {
        sans: [
          'Atkinson Hyperlegible',
          'Noto Sans Kannada',
          'Noto Sans Devanagari',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'sans-serif',
        ],
        condensed: [
          'IBM Plex Sans Condensed',
          '-apple-system',
          'BlinkMacSystemFont',
          'sans-serif',
        ],
      },
      borderRadius: {
        viewport: '20px',
        sheet: '24px',
        item: '12px',
      },
    },
  },
  plugins: [],
};

export default config;

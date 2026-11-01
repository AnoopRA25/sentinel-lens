/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Terminal Ember Core Palette (terminal-ember-design.md)
        ember: {
          bg: '#181818',
          surface: '#252422',
          deep: '#030302',
          border: '#151513',
          accent: '#FF6542',
          accentBorder: '#FF6543',
          cream: '#FBFAF9',
          ink: '#0C0B09',
          muted: '#898580',
          darkSolid: '#353431',
          olive: '#303018',
        },
        // Mapped aliases for system compatibility
        ink: {
          950: '#030302',
          900: '#181818',
          800: '#252422',
          700: '#353431',
          600: '#42413d',
        },
        mist: {
          100: '#FBFAF9',
          200: '#e5e3df',
          300: '#bcbab5',
          400: '#898580',
          500: '#64615d',
        },
        signal: {
          cyan: '#FF6542', // Terminal Ember primary accent
          coral: '#FF6542',
        },
        risk: {
          high: '#FF6542',
          medium: '#F5A524',
          low: '#7FA7D6',
          uncertain: '#898580',
        },
      },
      fontFamily: {
        mono: ['"Geist Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
        display: ['"Inter"', 'system-ui', 'sans-serif'],
        script: ['"Kalam"', 'cursive'],
        sans: ['"Geist Mono"', '"Inter"', 'system-ui', 'sans-serif'],
        condensed: ['"Geist Mono"', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        control: '6px',
        panel: '12px',
        card: '16px',
        pill: '9999px',
      },
      boxShadow: {
        'ember-glow': '0 0 32px -4px rgba(255, 101, 66, 0.25)',
        'ember-panel': '0 4px 20px -2px rgba(3, 3, 2, 0.6), 0 0 0 1px #151513',
        'cream-stack': '0 8px 30px rgba(0, 0, 0, 0.35)',
      },
    },
  },
  plugins: [],
}

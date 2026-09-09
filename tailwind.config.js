/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./frontend/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        // ── Semantic tokens via CSS variables ──
        // Change the variables in index.css :root to retheme
        accent: {
          DEFAULT: 'rgb(var(--accent) / <alpha-value>)',
          dark:    'rgb(var(--accent-dark) / <alpha-value>)',
        },
        'app-bg':  'rgb(var(--bg) / <alpha-value>)',
        surface: {
          DEFAULT: 'rgb(var(--surface) / <alpha-value>)',
          raised:  'rgb(var(--surface-raised) / <alpha-value>)',
        },
        // ── Override blue palette → KomfyEdit cyan scale ──
        // The editor was written against blue-* for every accent (selection
        // rings, playhead, active states). Remapping the scale retints all of
        // it at once instead of touching thousands of call sites.
        blue: {
          50:  '#e6fdfd',
          100: '#c6f9f9',
          200: '#93f1f1',
          300: '#5be7e7',
          400: '#31dede',
          500: '#22DDDD',
          600: '#10bfbf',
          700: '#0e9898',
          800: '#117575',
          900: '#125e5e',
          950: '#043838',
        },
        // ── Override zinc palette → blue-tinted greys ──
        // Neutral zinc reads flat next to the dark chrome, which carries a
        // slight blue cast. Same remap trick as blue-* above.
        zinc: {
          50:  '#f7f7f9',
          100: '#ededf1',
          200: '#dcdce2',
          300: '#c2c2ca',
          400: '#9a9aa4',
          500: '#6e6e78',
          600: '#4a4a52',
          700: '#34343a',
          800: '#26262a',
          900: '#1b1b1e',
          950: '#131315',
        },
        // ── Legacy tokens (kept for compatibility) ──
        background: '#131315',
        foreground: '#ededf1',
        card: '#1b1b1e',
        'card-foreground': '#ededf1',
        border: '#34343a',
        input: '#26262a',
        primary: {
          DEFAULT: 'rgb(var(--accent) / <alpha-value>)',
          foreground: '#ffffff',
        },
        secondary: {
          DEFAULT: '#3f3f46',
          foreground: '#ffffff',
        },
        muted: {
          DEFAULT: '#27272a',
          foreground: '#a1a1aa',
        },
      },
      borderRadius: {
        lg: '0.75rem',
        md: '0.5rem',
        sm: '0.25rem',
      },
    },
  },
  plugins: [],
}

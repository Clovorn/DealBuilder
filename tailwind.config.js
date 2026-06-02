/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        // Roboto everywhere. Pick three weights for type hierarchy.
        sans: ['Roboto', 'system-ui', 'sans-serif'],
        mono: ['"Roboto Mono"', 'ui-monospace', 'monospace'],
      },
      colors: {
        // Navy: Ronnoco accent. 900 is the deepest, 500 a usable mid-tone.
        navy: {
          950: '#050e1f',
          900: '#0a1f3d',  // primary accent, header background
          800: '#0f2a52',
          700: '#163566',
          600: '#1f4480',
          500: '#2b5499',
          400: '#4974b8',
          300: '#7b9bd0',
          200: '#b1c4e2',
          100: '#dde5f1',
          50:  '#f0f4fa',
        },
        // Neutrals for the data canvas: cool gray-blue, calm but not sterile.
        page: {
          50:  '#f4f6fa',   // main content background
          100: '#eaeef5',
          200: '#dbe2ec',
          300: '#c0cbd9',
        },
        // Text colors specifically for use ON the dark navy surfaces.
        // "Secondary text color = white" means these are the white-on-dark family.
        chalk: {
          50:  '#ffffff',     // primary text on navy
          100: '#f5f7fb',     // near-white
          200: '#e2e7ef',     // muted white
          300: '#b9c3d2',     // secondary muted (labels on dark surfaces)
          400: '#8a96a8',     // tertiary muted
        },
        // Dark text colors for use ON the light page background.
        slate: {
          900: '#0a1525',
          800: '#1c2a3f',
          700: '#334155',
          600: '#475569',
          500: '#64748b',
          400: '#94a3b8',
          300: '#cbd5e1',
        },
        // Accent / state colors that pair with navy
        accent: {
          // Warm amber for highlights — pops against navy without competing
          500: '#f59e0b',
          600: '#d97706',
        },
        ok:    '#16a34a',
        warn:  '#d97706',
        bad:   '#dc2626',
      },
      boxShadow: {
        // Soft shadows for cards on the page background
        card: '0 1px 2px rgba(10, 31, 61, 0.04), 0 4px 12px -2px rgba(10, 31, 61, 0.06)',
        elevated: '0 2px 4px rgba(10, 31, 61, 0.08), 0 16px 32px -8px rgba(10, 31, 61, 0.18)',
        // Inset for the top nav
        navbar: 'inset 0 -1px 0 rgba(255, 255, 255, 0.06)',
      },
    },
  },
  plugins: [],
};

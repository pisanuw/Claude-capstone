/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: '#F4F1EA',
        panel: '#FBFAF6',
        ink: '#181410',
        muted: '#5C554B',
        line: '#E2DCCF',
        accent: '#125C4D',
        'accent-soft': '#2C7A68',
        severity: {
          critical: '#9A1B12',
          serious: '#A85510',
          moderate: '#7A5A0A',
          minor: '#3F6212',
        },
      },
      fontFamily: {
        display: ['Fraunces', 'Georgia', 'serif'],
        body: ['"Public Sans"', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 0 #E2DCCF, 0 2px 8px rgba(24, 20, 16, 0.04)',
        lift: '0 4px 24px rgba(24, 20, 16, 0.10)',
      },
    },
  },
  plugins: [],
};

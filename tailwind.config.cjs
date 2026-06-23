/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: 'var(--color-brand)',
        'brand-dark': 'var(--color-brand-dark)',
        accent: 'var(--color-accent)',
        canvas: 'var(--color-bg)',
        surface: 'var(--color-card)',
        ink: 'var(--color-text)',
        muted: 'var(--color-muted)',
        line: 'var(--color-line)'
      },
      fontFamily: {
        sans: ['"Instrument Sans"', 'system-ui', 'sans-serif'],
        display: ['"Sora"', 'system-ui', 'sans-serif']
      },
      boxShadow: {
        soft: 'var(--shadow-card)',
        glow: 'var(--shadow-glow)'
      },
      borderRadius: {
        xl: '24px',
        '2xl': '32px'
      }
    }
  },
  plugins: []
};

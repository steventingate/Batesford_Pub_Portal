/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: 'var(--color-primary)',
        'brand-dark': 'var(--color-primary-dark)',
        accent: 'var(--color-accent)',
        canvas: 'var(--color-bg)',
        surface: 'var(--color-card)',
        ink: 'var(--color-text)',
        muted: 'var(--color-muted)'
      },
      fontFamily: {
        sans: ['"Source Sans 3"', 'system-ui', 'sans-serif'],
        display: ['"Fraunces"', 'serif']
      },
      boxShadow: {
        soft: 'var(--shadow-card)'
      },
      borderRadius: {
        xl: '18px'
      }
    }
  },
  plugins: []
};

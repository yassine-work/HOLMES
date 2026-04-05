/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        navy: {
          950: '#05080f',
          900: '#0a0f1e',
          800: '#0f172a',
          700: '#1e2d4a',
        },
        electric: {
          400: '#22d3ee',
          500: '#06b6d4',
          600: '#0891b2',
        },
      },
    },
  },
  plugins: [],
}

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        mint: {
          50: '#ecfbfa',
          100: '#d0f5f2',
          500: '#2ac1bc',
          600: '#20aaa5',
          700: '#167f7c'
        },
        ink: '#242629',
        canvas: '#f6f7f8'
      },
      boxShadow: {
        panel: '0 1px 2px rgba(20, 28, 34, 0.05), 0 8px 24px rgba(20, 28, 34, 0.04)'
      }
    }
  },
  plugins: []
};

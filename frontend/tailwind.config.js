/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/**/*.{js,jsx,ts,tsx}',
    './public/index.html',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Cairo', 'system-ui', 'sans-serif'],
        cairo: ['Cairo', 'sans-serif'],
      },
      colors: {
        // Teal Medica design system
        'tm-primary':    '#0D3B3E',
        'tm-action':     '#00897B',
        'tm-accent':     '#4DB6AC',
        'tm-surface':    '#E0F2F1',
        'tm-background': '#F5FAFA',
      },
      boxShadow: {
        'tm-soft': '0 4px 20px rgba(13, 59, 62, 0.08)',
        'tm-card': '0 10px 40px rgba(13, 59, 62, 0.12)',
      },
    },
  },
  plugins: [],
};

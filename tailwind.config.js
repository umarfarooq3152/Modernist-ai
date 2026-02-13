/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './index.tsx',
    './App.tsx',
    './pages/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
    './app/**/*.{js,ts,jsx,tsx}',
    './lib/**/*.{js,ts,jsx,tsx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Dark Mode Specs
        'oled-black': '#000000',
        'dark-surface': '#0A0A0A',
        'dark-text-head': '#FFFFFF',
        'dark-text-body': '#A1A1AA',
        
        // Light Mode Specs
        'pure-white': '#FFFFFF',
        'light-surface': '#F9FAFB',
        'light-text-head': '#000000',
        'light-text-body': '#4B5563',
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        serif: ['"Bodoni Moda"', '"Playfair Display"', 'serif'],
      },
      transitionDuration: {
        'theme': '500ms',
      },
    },
  },
  plugins: [],
};

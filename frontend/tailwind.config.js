/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Outfit', 'sans-serif'],
        serif: ['Playfair Display', 'serif'],
      },
      colors: {
        cream: {
          50: '#FEFDFB',
          100: '#FBF8F3',
          200: '#F5EFEA',
        },
        fig: {
          DEFAULT: '#2E1220',
          50: '#F7EEF2',
          100: '#E8D3DB',
          700: '#3D1A2D',
          800: '#2E1220',
          900: '#1F0C16',
        },
        terracotta: {
          DEFAULT: '#C96C52',
          50: '#FDF2EF',
          100: '#FADED6',
          200: '#F2BBA8',
          300: '#E5977A',
          400: '#D4815F',
          500: '#C96C52',
          600: '#B75C43',
          700: '#9A4C38',
        },
        sage: {
          DEFAULT: '#5B7C62',
          50: '#EEF4EF',
          100: '#D0E2D3',
          200: '#A6C5AB',
          400: '#6D9175',
          500: '#5B7C62',
          600: '#4E6B54',
          700: '#3F5845',
        },
        slate: {
          750: '#222630',
          850: '#1A1D24',
          950: '#12141A',
        },
      },
    },
  },
  plugins: [],
}

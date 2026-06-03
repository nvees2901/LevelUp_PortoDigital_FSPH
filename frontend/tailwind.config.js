/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#eef4fb',
          100: '#d8e5f4',
          200: '#b3c8e9',
          300: '#85a6d8',
          400: '#5380c1',
          500: '#3160a3',
          600: '#1f4684',
          primary: '#0a2f64',
          hover: '#134084',
          800: '#0a2850',
          900: '#081d3a',
        },
        gov: {
          green: '#1f8a4c',
          yellow: '#f6c700',
          blue: '#1f5fc0',
        },
      },
      fontFamily: {
        ui: ["'Segoe UI'", 'system-ui', '-apple-system', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(10,47,100,0.04), 0 1px 3px rgba(10,47,100,0.06)',
        'card-md': '0 4px 16px -2px rgba(10,47,100,0.10), 0 2px 6px -2px rgba(10,47,100,0.06)',
        'card-lg': '0 12px 32px -8px rgba(10,47,100,0.18)',
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'scale-in': {
          '0%': { opacity: '0', transform: 'scale(0.97)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.25s ease-out',
        'scale-in': 'scale-in 0.18s ease-out',
      },
    },
  },
  plugins: [],
}

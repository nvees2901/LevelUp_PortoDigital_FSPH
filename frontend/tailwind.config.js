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
          primary: '#0a2f64',
          hover: '#134084',
        },
      },
      fontFamily: {
        ui: ["'Segoe UI'", 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

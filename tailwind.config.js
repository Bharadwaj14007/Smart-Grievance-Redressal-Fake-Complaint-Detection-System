/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      boxShadow: {
        soft: '0 12px 30px rgba(15, 23, 42, 0.08)',
      },
      colors: {
        navy: '#163A5F',
        blueAccent: '#2563EB',
        surface: '#FFFFFF',
        slatebg: '#F8FAFC',
      },
    },
  },
  plugins: [],
}

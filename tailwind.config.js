/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: '#2563EB',
        success: '#10B981',
        warning: '#FBBF24',
        error: '#EF4444',
        dark: '#1F2937',
        light: '#F3F4F6',
        orange: '#F97316',
      }
    },
  },
  plugins: [],
}

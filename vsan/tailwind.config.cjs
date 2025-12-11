/** @type {import('tailwindcss').Config} */
module.exports = {
  // Necesita escanear todos los archivos en src para encontrar clases de Tailwind
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}", 
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}

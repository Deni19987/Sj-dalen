/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        graphite: {
          50: "#F4F6F9",
          100: "#E8ECF2",
          200: "#CFD7E2",
          300: "#A9B6C7",
          400: "#7C8CA0",
          500: "#56687F",
          600: "#3E4F63",
          700: "#2C3B4D",
          800: "#1E2A3A",
          900: "#14202E",
        },
        blue: {
          50: "#EBF1FA",
          100: "#D6E3F4",
          200: "#A6C3E9",
          300: "#6F9FD8",
          400: "#3F7CC5",
          500: "#2563A6",
          600: "#1B4E87",
          700: "#163F6C",
          800: "#123253",
          900: "#0F2843",
        },
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["Archivo", "Arial Black", "system-ui", "sans-serif"],
      },
      boxShadow: {
        soft: "0 2px 10px -2px rgba(22, 24, 27, .1), 0 1px 2px -1px rgba(22, 24, 27, .06)",
        card: "0 4px 20px -4px rgba(22, 24, 27, .14), 0 2px 6px -2px rgba(22, 24, 27, .08)",
        lifted: "0 20px 40px -12px rgba(22, 24, 27, .28)",
      },
    },
  },
  plugins: [],
};

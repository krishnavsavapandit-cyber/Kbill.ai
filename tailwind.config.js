/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          950: "#070B14",
          900: "#0B1120",
          850: "#0F172A",
          800: "#1E293B",
          700: "#334155",
        },
        brand: {
          blue: "#2563EB",
          indigo: "#4F46E5",
          violet: "#7C3AED",
          purple: "#9333EA",
          emerald: "#10B981",
          amber: "#F59E0B",
          rose: "#EF4444",
        },
      },
      fontFamily: {
        sans: ["Inter", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "Roboto", "sans-serif"],
      },
    },
  },
  plugins: [],
};

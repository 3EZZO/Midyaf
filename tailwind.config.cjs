/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./client/index.html", "./client/src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        midyaf: {
          purple: "#2D0A5F",
          "purple-light": "#4A1A8A",
          "purple-dark": "#1A0638",
          gold: "#C9A84C",
          "gold-light": "#E5D4A0",
          "gold-dark": "#A68A3A",
          ink: "#1D1630",
          pearl: "#F7F5F0",
          ivory: "#FDFCF9",
          sand: "#E8DFCF",
          smoke: "#E8E4DD"
        }
      },
      fontFamily: {
        arabic: ["Tajawal", "Inter", "sans-serif"],
        english: ["Inter", "Tajawal", "sans-serif"],
        display: ["Noto Naskh Arabic", "Tajawal", "serif"]
      },
      boxShadow: {
        luxury: "0 18px 60px rgba(45, 10, 95, 0.12)",
        "luxury-lg": "0 24px 80px rgba(45, 10, 95, 0.16)",
        glow: "0 0 20px rgba(201, 168, 76, 0.25)",
        "glow-purple": "0 0 20px rgba(45, 10, 95, 0.30)",
        "card-sm": "0 2px 8px rgba(29, 22, 48, 0.05)",
        card: "0 4px 20px rgba(29, 22, 48, 0.06)",
        "card-hover": "0 12px 40px rgba(29, 22, 48, 0.12)"
      },
      animation: {
        "fade-in-up": "fadeInUp 0.5s cubic-bezier(0.22, 1, 0.36, 1) both",
        "fade-in-down": "fadeInDown 0.4s cubic-bezier(0.22, 1, 0.36, 1) both",
        "fade-in": "fadeIn 0.4s cubic-bezier(0.22, 1, 0.36, 1) both",
        "scale-in": "scaleIn 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) both",
        shimmer: "shimmer 2s infinite",
        float: "float 4s ease-in-out infinite",
        "pulse-glow": "pulseGlow 2.5s ease-in-out infinite",
        "gradient-shift": "gradientShift 6s ease infinite",
        "slide-in-left": "slideInLeft 0.4s cubic-bezier(0.22, 1, 0.36, 1) both",
        "slide-in-right": "slideInRight 0.4s cubic-bezier(0.22, 1, 0.36, 1) both",
        "spin-slow": "spinSlow 12s linear infinite"
      },
      transitionTimingFunction: {
        premium: "cubic-bezier(0.22, 1, 0.36, 1)",
        spring: "cubic-bezier(0.34, 1.56, 0.64, 1)"
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))"
      }
    }
  },
  plugins: []
};

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./client/index.html", "./client/src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        midyaf: {
          purple: "#090C15",
          "purple-light": "#121626",
          "purple-dark": "#05070D",
          gold: "#D4AF37",
          "gold-light": "#F2D575",
          "gold-dark": "#A88820",
          ink: "#090C15",
          pearl: "#F8FAFC",
          ivory: "#FFFFFF",
          sand: "#F1F5F9",
          smoke: "#94A3B8"
        }
      },
      fontFamily: {
        arabic: ["IBM Plex Sans Arabic", "Tajawal", "Inter", "sans-serif"],
        english: ["Inter", "sans-serif"],
        display: ["IBM Plex Sans Arabic", "Inter", "sans-serif"]
      },
      boxShadow: {
        sm: "0 1px 2px 0 rgba(0, 0, 0, 0.05)",
        card: "0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1)",
        "card-hover": "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)",
        dropdown: "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1)",
        luxury: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
        "luxury-lg": "0 10px 15px -3px rgba(0, 0, 0, 0.1)",
        glow: "0 1px 2px 0 rgba(0, 0, 0, 0.05)",
        "glow-purple": "0 1px 2px 0 rgba(0, 0, 0, 0.05)",
      },
      animation: {
        "fade-in": "fadeIn 0.2s ease-out both",
        "scale-in": "scaleIn 0.2s ease-out both",
        shimmer: "shimmer 2s infinite"
      },
      transitionTimingFunction: {
        default: "ease-out"
      }
    }
  },
  plugins: []
};
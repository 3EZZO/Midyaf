/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./client/index.html", "./client/src/**/*.{ts,tsx}"],
  // The app is dark-only; `dark:` variants are keyed to the attribute the
  // shell sets on <html>, never to the OS preference.
  darkMode: ["selector", '[data-theme="dark"]'],
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
      // Design rule: maximum radius is rounded-lg (8px). Larger sizes are
      // locked to the same value so legacy call sites cannot exceed it.
      borderRadius: {
        xl: "0.5rem",
        "2xl": "0.5rem",
        "3xl": "0.5rem"
      },
      fontFamily: {
        arabic: ["IBM Plex Sans Arabic", "Inter Variable", "sans-serif"],
        english: ["Inter Variable", "IBM Plex Sans Arabic", "sans-serif"],
        display: ["IBM Plex Sans Arabic", "Inter Variable", "sans-serif"]
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

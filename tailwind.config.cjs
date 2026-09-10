/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./client/index.html", "./client/src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        midyaf: {
          // Repurposing purple to our dark neutral/primary to avoid 400+ file rewrites
          purple: "#111827", 
          "purple-light": "#374151",
          "purple-dark": "#030712",
          // Repurposing gold to our signature accent (muted, professional)
          gold: "#9A8C78",
          "gold-light": "#C3B9A8",
          "gold-dark": "#726553",
          ink: "#111827",
          pearl: "#F9FAFB",
          ivory: "#FFFFFF",
          sand: "#F3F4F6",
          smoke: "#E5E7EB"
        }
      },
      fontFamily: {
        arabic: ["Tajawal", "Noto Kufi Arabic", "Inter", "sans-serif"],
        english: ["Inter", "sans-serif"],
        display: ["Tajawal", "Inter", "sans-serif"]
      },
      boxShadow: {
        // Flat elevation system replacing neon glows
        sm: "0 1px 2px 0 rgba(0, 0, 0, 0.05)",
        card: "0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1)",
        "card-hover": "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)",
        dropdown: "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1)",
        // Map old shadows to flat shadows to avoid breaking classes
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

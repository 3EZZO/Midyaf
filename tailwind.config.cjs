/** @type {import('tailwindcss').Config} */

// Colours are declared once as RGB triplets in client/src/styles/index.css
// (:root) and mapped here so Tailwind opacity modifiers keep working.
const rgb = (variable) => `rgb(var(${variable}) / <alpha-value>)`;

module.exports = {
  content: ["./client/index.html", "./client/src/**/*.{ts,tsx}"],
  // The app is dark-only; `dark:` variants are keyed to the attribute the
  // shell sets on <html>, never to the OS preference.
  darkMode: ["selector", '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        surface: {
          0: rgb("--surface-0"),
          1: rgb("--surface-1"),
          2: rgb("--surface-2"),
          3: rgb("--surface-3"),
          4: rgb("--surface-4")
        },
        gold: {
          100: rgb("--gold-100"),
          300: rgb("--gold-300"),
          500: rgb("--gold-500"),
          700: rgb("--gold-700"),
          900: rgb("--gold-900"),
          DEFAULT: rgb("--gold-500")
        },
        ink: {
          DEFAULT: rgb("--ink"),
          muted: rgb("--ink-muted"),
          faint: rgb("--ink-faint")
        },
        ok: rgb("--status-ok"),
        warn: rgb("--status-warn"),
        danger: rgb("--status-danger"),
        info: rgb("--status-info"),
        neutral: rgb("--status-neutral"),
        // Legacy names still used across the codebase; mapped onto the same tokens.
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
      borderColor: {
        hairline: "rgba(255, 255, 255, 0.06)"
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
      // Projector display sizes. text-xs (12px) is the floor for body copy.
      fontSize: {
        "display-sm": ["2rem", { lineHeight: "1.1", letterSpacing: "-0.01em", fontWeight: "700" }],
        "display-md": ["2.75rem", { lineHeight: "1.05", letterSpacing: "-0.015em", fontWeight: "700" }],
        "display-lg": ["4rem", { lineHeight: "1", letterSpacing: "-0.02em", fontWeight: "700" }],
        "display-xl": ["5.5rem", { lineHeight: "0.95", letterSpacing: "-0.025em", fontWeight: "700" }]
      },
      letterSpacing: {
        label: "0.18em"
      },
      zIndex: {
        rail: "30",
        header: "35",
        dock: "40",
        sheet: "50",
        dialog: "60",
        palette: "65",
        toast: "70",
        warroom: "80",
        "map-full": "90"
      },
      transitionDuration: {
        fast: "120ms",
        base: "200ms",
        slow: "400ms",
        cinematic: "900ms"
      },
      transitionTimingFunction: {
        default: "cubic-bezier(0.22, 1, 0.36, 1)",
        out: "cubic-bezier(0.22, 1, 0.36, 1)"
      },
      boxShadow: {
        sm: "0 1px 2px 0 rgba(0, 0, 0, 0.4)",
        card: "0 1px 2px 0 rgba(0, 0, 0, 0.4)",
        "card-hover": "0 1px 2px 0 rgba(0, 0, 0, 0.4)",
        dropdown: "0 12px 32px rgba(0, 0, 0, 0.55)",
        luxury: "0 1px 2px 0 rgba(0, 0, 0, 0.4)",
        "luxury-lg": "0 1px 2px 0 rgba(0, 0, 0, 0.4)",
        glow: "0 1px 2px 0 rgba(0, 0, 0, 0.4)",
        "glow-purple": "0 1px 2px 0 rgba(0, 0, 0, 0.4)",
        focus: "0 0 0 2px rgb(var(--gold-500) / 0.6)"
      },
      animation: {
        "fade-in": "fadeIn 0.2s ease-out both",
        "scale-in": "scaleIn 0.2s ease-out both",
        shimmer: "shimmer 2s infinite"
      }
    }
  },
  plugins: []
};

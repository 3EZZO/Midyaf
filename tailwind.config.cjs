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
          purple: "#0D0E12",
          "purple-light": "#15171E",
          "purple-dark": "#070709",
          gold: "#C9A44C",
          "gold-light": "#E6CC85",
          "gold-dark": "#9E7B2F",
          ink: "#0D0E12",
          pearl: "#F6F4EE",
          ivory: "#FFFFFF",
          sand: "#F1F5F9",
          smoke: "#B6BCCB"
        }
      },
      borderColor: {
        hairline: "rgba(246, 244, 238, 0.10)",
        "hairline-strong": "rgba(246, 244, 238, 0.16)"
      },
      // Qasr Obsidian shape scale: 6px inputs and badges, 10px cards and
      // buttons, 14px dialogs and passes. Nothing rounder than 14px.
      borderRadius: {
        md: "6px",
        lg: "10px",
        xl: "14px",
        "2xl": "14px",
        "3xl": "14px"
      },
      fontFamily: {
        arabic: ["IBM Plex Sans Arabic", "Plus Jakarta Sans Variable", "sans-serif"],
        english: ["Plus Jakarta Sans Variable", "IBM Plex Sans Arabic", "sans-serif"],
        display: ["Noto Kufi Arabic", "Plus Jakarta Sans Variable", "IBM Plex Sans Arabic", "sans-serif"],
        mono: ["IBM Plex Mono", "ui-monospace", "SFMono-Regular", "monospace"]
      },
      // Projector display sizes. text-xs (12px) is the floor for body copy.
      fontSize: {
        "display-sm": ["2rem", { lineHeight: "1.1", letterSpacing: "-0.01em", fontWeight: "700" }],
        "display-md": ["2.75rem", { lineHeight: "1.05", letterSpacing: "-0.015em", fontWeight: "700" }],
        "display-lg": ["4rem", { lineHeight: "1", letterSpacing: "-0.02em", fontWeight: "700" }],
        "display-xl": ["5.5rem", { lineHeight: "0.95", letterSpacing: "-0.025em", fontWeight: "700" }]
      },
      // Latin labels only; RTL resets every tracking class (see index.css).
      letterSpacing: {
        label: "0.12em"
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
        fast: "180ms",
        base: "240ms",
        slow: "360ms",
        cinematic: "750ms"
      },
      transitionTimingFunction: {
        default: "cubic-bezier(0.16, 1, 0.3, 1)",
        out: "cubic-bezier(0.16, 1, 0.3, 1)"
      },
      boxShadow: {
        // Every card carries a 6% top highlight over a soft contact shadow.
        sm: "inset 0 1px 0 rgba(246, 244, 238, 0.06), 0 1px 2px 0 rgba(0, 0, 0, 0.5)",
        card: "inset 0 1px 0 rgba(246, 244, 238, 0.06), 0 1px 2px 0 rgba(0, 0, 0, 0.5), 0 12px 28px -12px rgba(0, 0, 0, 0.6)",
        "card-hover": "inset 0 1px 0 rgba(246, 244, 238, 0.06), 0 1px 2px 0 rgba(0, 0, 0, 0.5), 0 12px 28px -12px rgba(0, 0, 0, 0.6)",
        dropdown: "inset 0 1px 0 rgba(246, 244, 238, 0.06), 0 18px 40px rgba(0, 0, 0, 0.6)",
        // The one focal element per screen: a soft brass aura.
        luxury: "inset 0 1px 0 rgba(246, 244, 238, 0.06), 0 0 60px rgba(201, 164, 76, 0.10), 0 24px 48px -16px rgba(0, 0, 0, 0.6)",
        "luxury-lg": "inset 0 1px 0 rgba(246, 244, 238, 0.06), 0 0 80px rgba(201, 164, 76, 0.14), 0 30px 60px -20px rgba(0, 0, 0, 0.65)",
        glow: "0 0 0 1px rgba(201, 164, 76, 0.35), 0 0 40px rgba(201, 164, 76, 0.14)",
        "glow-purple": "0 0 0 1px rgba(201, 164, 76, 0.35), 0 0 40px rgba(201, 164, 76, 0.14)",
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

// Phase 0 codemod: make client/src/styles/index.css dark-only Obsidian.
//  - drop the Google Fonts @import (fonts are self-hosted via @fontsource in main.tsx)
//  - collapse the light/dark token split into a single dark :root
//  - retire the old purple/gold hex values in favour of the Obsidian palette
//  - remove the global `.grid { 1fr !important }` mobile override
//  - remove the blanket 300ms transition on every interactive element
//
// Run with: node scripts/codemods/phase0-css-tokens.mjs
// Idempotent: re-running is a no-op once applied.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const file = path.resolve(__dirname, "../../client/src/styles/index.css");
// Normalise to LF so the patterns below match regardless of checkout settings.
const original = fs.readFileSync(file, "utf8");
let css = original.replace(/\r\n/g, "\n");

function replaceOnce(from, to, label) {
  if (typeof from === "string" ? !css.includes(from) : !from.test(css)) {
    console.log(`skip (already applied): ${label}`);
    return;
  }
  css = css.replace(from, to);
  console.log(`applied: ${label}`);
}

// 1. Google Fonts import → gone (self-hosted).
replaceOnce(
  /^@import url\("https:\/\/fonts\.googleapis\.com[^\n]*\n\n?/m,
  "",
  "remove Google Fonts @import"
);

// 2. Single dark token set. Replace the whole :root block.
replaceOnce(
  /:root \{[\s\S]*?\n\}\n/,
  `:root {
  /* ── Obsidian surfaces ── */
  --m-purple: #090C15;
  --m-purple-light: #121626;
  --m-purple-dark: #05070D;
  --m-purple-glow: rgba(212, 175, 55, 0.08);
  --m-gold: #D4AF37;
  --m-gold-light: #F2D575;
  --m-gold-dark: #A88820;
  --m-gold-glow: rgba(212, 175, 55, 0.18);

  /* Legacy surface names, now mapped onto the dark palette.
     pearl = page, ivory = card, smoke = hairline/raised, ink = text. */
  --m-pearl: #090C15;
  --m-ivory: #121626;
  --m-smoke: #1A1F33;
  --m-ink: #F8FAFC;
  --m-sand: #232A45;

  /* ── Semantic ── */
  --m-emerald: #34D399;
  --m-emerald-soft: rgba(52, 211, 153, 0.12);
  --m-ruby: #FB7185;
  --m-ruby-soft: rgba(251, 113, 133, 0.12);
  --m-sapphire: #38BDF8;
  --m-amber: #FBBF24;

  /* ── Surfaces ── */
  --m-glass-bg: rgba(18, 22, 38, 0.92);
  --m-glass-border: rgba(255, 255, 255, 0.06);
  --m-glass-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.4);
  --m-card-bg: #121626;
  --m-card-hover-bg: #1A1F33;
  --m-card-border: rgba(255, 255, 255, 0.06);
  --m-card-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.4);
  --m-card-hover-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.4);

  /* ── Gradients (flat aliases kept for legacy call sites) ── */
  --m-gradient-purple: var(--m-purple);
  --m-gradient-gold: var(--m-gold);
  --m-gradient-hero: var(--m-purple-dark);
  --m-gradient-accent: linear-gradient(180deg, rgba(212, 175, 55, 0.15) 0%, transparent 100%);
  --m-gradient-border: linear-gradient(180deg, #D4AF37, #121626);

  /* ── Typography ── */
  --m-font-arabic: 'IBM Plex Sans Arabic', 'Inter Variable', sans-serif;
  --m-font-latin: 'Inter Variable', 'IBM Plex Sans Arabic', sans-serif;
  --m-font-display: var(--m-font-arabic);
  --m-font-body-ar: var(--m-font-arabic);
  --m-font-body-en: var(--m-font-latin);

  /* ── Timing ── */
  --m-ease-out: cubic-bezier(0.22, 1, 0.36, 1);
  --m-ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
  --m-duration-fast: 120ms;
  --m-duration: 200ms;
  --m-duration-slow: 400ms;
  --m-duration-cinematic: 900ms;

  /* ── Elevation ── */
  --m-shadow-1: 0 1px 2px rgba(0, 0, 0, 0.4);
  --m-shadow-2: 0 2px 6px rgba(0, 0, 0, 0.45);
  --m-shadow-3: 0 6px 16px rgba(0, 0, 0, 0.5);
  --m-shadow-4: 0 12px 32px rgba(0, 0, 0, 0.55);
  --m-shadow-5: 0 20px 48px rgba(0, 0, 0, 0.6);
  --m-shadow-luxury: 0 12px 40px rgba(0, 0, 0, 0.5);
}
`,
  "rewrite :root tokens"
);

// 3. The dark override block is now redundant — the values live in :root.
replaceOnce(
  /\[data-theme="dark"\] \{[\s\S]*?\n\}\n\n\[data-theme="dark"\] body \{[\s\S]*?\n\}\n/,
  `/* Dark-only: the values above are the only theme. */
`,
  "remove [data-theme=dark] token override"
);

// 4. Base typography: body sets the font by direction.
replaceOnce(
  /body \{\n  margin: 0;\n  min-width: 320px;\n  background:\n    var\(--m-pearl\);\n/,
  `body {
  margin: 0;
  min-width: 320px;
  background: var(--m-pearl);
  color: var(--m-ink);
  font-family: var(--m-font-latin);
`,
  "body font + color"
);
replaceOnce(
  /(  -moz-osx-font-smoothing: grayscale;\n\}\n)/,
  `$1
html[dir="rtl"] body {
  font-family: var(--m-font-arabic);
}

/* Projector density: Ctrl+Shift+P scales every rem-based size. */
html[data-density="projector"] {
  font-size: 18px;
}

/* Numbers always align in tables and KPI tiles. */
.font-tnum,
table,
[data-numeric] {
  font-variant-numeric: tabular-nums;
}
`,
  "rtl font + projector density"
);

// 5. Drop the blanket 300ms transition on all interactive elements.
replaceOnce(
  /\/\* ── Premium Transitions on All Interactive Elements ── \*\/\nbutton,\na,\ninput,\nselect,\ntextarea \{\n  -webkit-tap-highlight-color: transparent;\n  transition:[\s\S]*?\n\}\n/,
  `button,
a,
input,
select,
textarea {
  -webkit-tap-highlight-color: transparent;
}
`,
  "remove global transition"
);

// 6. Remove the mobile `.grid` override; keep the safe-area header rule.
replaceOnce(
  /  \/\* Force multi-column grids in dashboards to collapse cleanly on mobile \*\/\n  \.grid \{\n    grid-template-columns: 1fr !important;\n    gap: 1rem !important;\n  \}\n  \n/,
  "",
  "remove .grid mobile override"
);

// 7. Old palette → Obsidian.
const hexSwaps = [
  [/rgba\(201, ?168, ?76,/g, "rgba(212, 175, 55,"], // old gold → gold-500
  [/#C9A84C/gi, "#D4AF37"],
  [/rgba\(45, ?10, ?95,/g, "rgba(9, 12, 21,"], // old deep purple → surface-1
  [/#2D0A5F/gi, "#121626"],
  [/rgba\(74, ?26, ?138,/g, "rgba(255, 255, 255,"], // old violet borders → hairline
  [/#4A1A8A/gi, "#1A1F33"],
  [/rgba\(29, ?22, ?48,/g, "rgba(0, 0, 0,"], // old shadow tint
  [/#1A1726/gi, "#1A1F33"],
  [/#131020/gi, "#121626"],
  [/#0D0B14/gi, "#090C15"],
  [/#F0EDE6/gi, "#F8FAFC"],
  [/#2A2438/gi, "#232A45"],
  [/#9B95A8/gi, "#94A3B8"]
];
for (const [re, to] of hexSwaps) {
  const n = (css.match(re) || []).length;
  if (n) {
    css = css.replace(re, to);
    console.log(`applied: ${re} ×${n}`);
  }
}

if (css === original.replace(/\r\n/g, "\n")) {
  console.log("no changes");
} else {
  fs.writeFileSync(file, css, "utf8");
  console.log("written", file);
}

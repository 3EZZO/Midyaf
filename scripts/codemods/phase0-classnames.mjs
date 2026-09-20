// Phase 0 codemod for client/src/**/*.tsx — mechanical class fixes only.
//  - text-midyaf-purple → text-midyaf-pearl (the palette change made "purple"
//    near-black, so this text was invisible on dark surfaces)
//  - shadow-xs / shadow-2xs (Tailwind v4 names) → shadow-sm
//  - border-white/5/NN (invalid double opacity) → border-white/5
//  - duplicated "dark:text-white dark:text-white" → single
//  - old gold/purple hex literals → Obsidian palette
//
// Files are read and written with Node fs in UTF-8 so Arabic strings are
// never touched by the shell. Run: node scripts/codemods/phase0-classnames.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../../client/src");

const swaps = [
  [/\btext-midyaf-purple\b(?!-)/g, "text-midyaf-pearl"],
  [/\bshadow-2xs\b/g, "shadow-sm"],
  [/\bshadow-xs\b/g, "shadow-sm"],
  [/\bborder-white\/5\/\d+\b/g, "border-white/5"],
  [/\bshadow-none\/\d+\b/g, "shadow-none"],
  [/\bdark:text-white dark:text-white\b/g, "dark:text-white"],
  [/#C9A84C/gi, "#D4AF37"],
  [/rgba\(201, ?168, ?76,/g, "rgba(212, 175, 55,"],
  [/#2D0A5F/gi, "#121626"],
  [/#4A1A8A/gi, "#1A1F33"],
  [/#131020/gi, "#121626"],
  [/#0D0B14/gi, "#090C15"],
  [/#1A1726/gi, "#1A1F33"]
];

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(tsx|ts)$/.test(entry.name)) out.push(full);
  }
  return out;
}

let filesChanged = 0;
const totals = new Map();
for (const file of walk(root)) {
  const before = fs.readFileSync(file, "utf8");
  let after = before;
  for (const [re, to] of swaps) {
    const n = (after.match(re) || []).length;
    if (n) {
      after = after.replace(re, to);
      totals.set(re.source, (totals.get(re.source) || 0) + n);
    }
  }
  if (after !== before) {
    fs.writeFileSync(file, after, "utf8");
    filesChanged++;
    console.log("updated", path.relative(root, file));
  }
}
console.log(`\n${filesChanged} files changed`);
for (const [k, v] of totals) console.log(`  ${v.toString().padStart(4)}  ${k}`);

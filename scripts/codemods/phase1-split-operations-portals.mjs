// Phase 1 codemod: mechanically split client/src/pages/OperationsPortals.tsx
// (6.6k lines) into client/src/pages/ops/*.tsx. Pure cut/paste of line
// ranges — no logic changes. Imports are re-derived per file by identifier
// usage; symbols referenced across files get `export` added.
//
// Run once: node scripts/codemods/phase1-split-operations-portals.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pagesDir = path.resolve(__dirname, "../../client/src/pages");
const src = path.join(pagesDir, "OperationsPortals.tsx");
const outDir = path.join(pagesDir, "ops");

const raw = fs.readFileSync(src, "utf8");
const lines = raw.replace(/\r\n/g, "\n").split("\n");
const eol = raw.includes("\r\n") ? "\r\n" : "\n";

// 1-based inclusive line ranges, verified against the grep map of the file.
const IMPORT_END = 103;
const chunks = {
  shared: {
    ranges: [
      [105, 375],
      [4004, 4066],
      [5939, 6639]
    ],
    doc: "Constants, helpers, form fields and small presentational pieces shared by the ops portals."
  },
  ActivityIntakePage: { ranges: [[376, 1527]], doc: "Event intake workflow (hotels, rentals, suppliers, AI plan)." },
  GuestJourneyApp: { ranges: [[1528, 1811]], doc: "Guest-facing journey portal." },
  CaptainsApp: { ranges: [[1812, 2067]], doc: "Captain (driver) field app." },
  RiderSections: { ranges: [[2068, 2515]], doc: "Hospitality rider and airport express sections (Coordinator + Logistics)." },
  CoordinatorsApp: { ranges: [[2516, 2782]], doc: "Field coordinator portal." },
  LogisticsDashboard: { ranges: [[2783, 3780]], doc: "Logistics command dashboard." },
  TaskAssignmentBoard: { ranges: [[3781, 4003]], doc: "Kanban task assignment board." },
  OperationsSetup: { ranges: [[4067, 4741]], doc: "Operations setup forms (drivers, users, suppliers, tasks, guests)." },
  CompanyDashboard: { ranges: [[4742, 5241]], doc: "Organizing company dashboard." },
  QuotesAndContracts: { ranges: [[5242, 5874]], doc: "Vendor quotes and contract workflow." },
  PlanPhases: { ranges: [[5875, 5938]], doc: "AI plan phase timeline." }
};

// ── parse the import block into specifiers ─────────────────────────────
const importBlock = lines.slice(0, IMPORT_END).join("\n");
const importRe = /import\s+(type\s+)?\{([^}]*)\}\s+from\s+"([^"]+)";/g;
const specifiers = []; // {name, module, typeOnly}
for (const m of importBlock.matchAll(importRe)) {
  const blockType = Boolean(m[1]);
  for (const part of m[2].split(",")) {
    const s = part.trim();
    if (!s) continue;
    const t = /^type\s+/.test(s);
    const name = s.replace(/^type\s+/, "").trim();
    specifiers.push({ name, module: m[3], typeOnly: blockType || t });
  }
}

// ── top-level declarations → owning chunk ──────────────────────────────
const declRe = /^(export )?(function|const|type|interface|let)\s+([A-Za-z0-9_]+)/;
const declOwner = new Map(); // name → chunk key
const declLine = new Map(); // name → 0-based line index
for (const [key, chunk] of Object.entries(chunks)) {
  for (const [a, b] of chunk.ranges) {
    for (let i = a - 1; i <= b - 1; i++) {
      const m = lines[i].match(declRe);
      if (m) {
        declOwner.set(m[3], key);
        declLine.set(m[3], i);
      }
    }
  }
}

// ── sanity: ranges must tile 105..6639 exactly once ─────────────────────
const covered = new Array(lines.length).fill(false);
for (const chunk of Object.values(chunks)) {
  for (const [a, b] of chunk.ranges) {
    for (let i = a - 1; i <= b - 1; i++) {
      if (covered[i]) throw new Error(`line ${i + 1} covered twice`);
      covered[i] = true;
    }
  }
}
for (let i = IMPORT_END + 1; i < lines.length; i++) {
  if (!covered[i] && lines[i].trim() !== "") throw new Error(`line ${i + 1} not covered: ${lines[i]}`);
}

// Identifier reference that is not a property access (`foo.name`) but does
// allow spreads (`...name`).
const used = (name, body) =>
  new RegExp(`(^|[^A-Za-z0-9_$.]|\\.\\.\\.)${name}(?![A-Za-z0-9_$])`).test(body);

const rewriteModule = (mod) => {
  if (mod.startsWith("../")) return "../" + mod; // pages/ → pages/ops/
  if (mod.startsWith("./")) return "." + mod; // ./types → ../types
  return mod;
};

const needsExport = new Map(); // chunk → Set(name)

// First pass: figure out cross-chunk references.
const bodies = {};
for (const [key, chunk] of Object.entries(chunks)) {
  bodies[key] = chunk.ranges.map(([a, b]) => lines.slice(a - 1, b).join("\n")).join("\n\n");
}
for (const [key, body] of Object.entries(bodies)) {
  for (const [name, owner] of declOwner) {
    if (owner !== key && used(name, body)) {
      if (!needsExport.has(owner)) needsExport.set(owner, new Set());
      needsExport.get(owner).add(name);
    }
  }
}

// Second pass: emit files.
fs.mkdirSync(outDir, { recursive: true });
for (const [key, chunk] of Object.entries(chunks)) {
  let body = bodies[key];

  // Add `export` to declarations other chunks need.
  const exportsNeeded = needsExport.get(key) ?? new Set();
  body = body
    .split("\n")
    .map((line) => {
      const m = line.match(declRe);
      if (m && !m[1] && exportsNeeded.has(m[3])) return "export " + line;
      return line;
    })
    .join("\n");

  // External imports, grouped by module, in original order.
  const groups = new Map();
  for (const s of specifiers) {
    if (!used(s.name, body)) continue;
    const mod = rewriteModule(s.module);
    if (!groups.has(mod)) groups.set(mod, { values: [], types: [] });
    (s.typeOnly ? groups.get(mod).types : groups.get(mod).values).push(s.name);
  }
  const importLines = [];
  for (const [mod, g] of groups) {
    if (g.values.length) importLines.push(`import { ${g.values.join(", ")} } from "${mod}";`);
    if (g.types.length) importLines.push(`import type { ${g.types.join(", ")} } from "${mod}";`);
  }

  // Cross-chunk imports.
  const cross = new Map();
  for (const [name, owner] of declOwner) {
    if (owner !== key && used(name, body)) {
      if (!cross.has(owner)) cross.set(owner, []);
      cross.get(owner).push(name);
    }
  }
  for (const [owner, names] of cross) {
    importLines.push(`import { ${names.sort().join(", ")} } from "./${owner}";`);
  }

  const header = `// ${chunk.doc}\n// Extracted verbatim from OperationsPortals.tsx (Phase 1 split).\n`;
  const out = header + importLines.join("\n") + "\n\n" + body.trimEnd() + "\n";
  fs.writeFileSync(path.join(outDir, `${key}.tsx`), out.replace(/\n/g, eol), "utf8");
  console.log(`wrote ops/${key}.tsx (${body.split("\n").length} lines, ${importLines.length} imports)`);
}

// Barrel for the page components App.tsx consumes.
const barrel = [
  'export { ActivityIntakePage } from "./ActivityIntakePage";',
  'export { GuestJourneyApp } from "./GuestJourneyApp";',
  'export { CaptainsApp } from "./CaptainsApp";',
  'export { CoordinatorsApp } from "./CoordinatorsApp";',
  'export { LogisticsDashboard } from "./LogisticsDashboard";',
  'export { CompanyDashboard } from "./CompanyDashboard";',
  ""
].join(eol);
fs.writeFileSync(path.join(outDir, "index.ts"), barrel, "utf8");

fs.unlinkSync(src);
console.log("removed OperationsPortals.tsx");

// Repoint consumers.
for (const file of [path.resolve(pagesDir, "../App.tsx")]) {
  const s = fs.readFileSync(file, "utf8");
  const t = s.replace('from "./pages/OperationsPortals"', 'from "./pages/ops"');
  if (s !== t) {
    fs.writeFileSync(file, t, "utf8");
    console.log("repointed", path.basename(file));
  }
}

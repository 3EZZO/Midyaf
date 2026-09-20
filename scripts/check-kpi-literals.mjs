// Guard: dashboards must not hard-code KPI numbers. Runs as part of
// `npm run check`. Flags, in client/src:
//   1. Arabic-Indic digits anywhere in TSX (numerals must be Western)
//   2. KpiTile/MetricCard `value={<number literal>}` outside the design preview
//   3. `|| <3+ digit number>` fallbacks used to fake a metric
//   4. `<p ...>` / `<span ...>` whose only content is a big number literal in dashboard files
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../client/src");

const DASHBOARD_FILES = /(Dashboard|MetricModal|CommandBridge|warroom)/;
const ALLOW = /DesignSystemPreview\.tsx$|\.test\.tsx?$/;

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (/\.tsx$/.test(e.name)) out.push(full);
  }
  return out;
}

const problems = [];
for (const file of walk(root)) {
  if (ALLOW.test(file)) continue;
  const rel = path.relative(root, file);
  const src = fs.readFileSync(file, "utf8");
  const lines = src.split(/\r?\n/);
  lines.forEach((line, i) => {
    const at = `${rel}:${i + 1}`;
    if (/[٠-٩]/.test(line)) problems.push(`${at}  Arabic-Indic digit — numerals must be Western: ${line.trim().slice(0, 80)}`);
    if (/<(KpiTile|MetricCard|MiniStat)\b[^>]*\bvalue=\{\s*-?\d[\d_.,]*\s*\}/.test(line)) problems.push(`${at}  literal KPI value: ${line.trim().slice(0, 80)}`);
    if (DASHBOARD_FILES.test(rel)) {
      if (/\|\|\s*\d{3,}\b/.test(line)) problems.push(`${at}  numeric fallback masquerading as data: ${line.trim().slice(0, 80)}`);
      if (/<(p|span|dd)\b[^>]*>\s*[\d,]{3,}(\.\d+)?%?\s*<\/(p|span|dd)>/.test(line)) problems.push(`${at}  hard-coded stat: ${line.trim().slice(0, 80)}`);
    }
  });
}

if (problems.length) {
  console.error(`\nKPI literal check failed (${problems.length}):\n`);
  for (const p of problems) console.error("  " + p);
  console.error("\nEvery dashboard number must come from client/src/lib/metrics.ts selectors.\n");
  process.exit(1);
}
console.log("kpi-literals: ok");

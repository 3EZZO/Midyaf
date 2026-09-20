// Phase 5: move the demo datasets + driver routes + ticker copy out of
// useLiveDemoSimulation.ts (verbatim, utf8) into lib/demo/data.ts, then
// retarget the importers. The modulo-tick hook itself is deleted — the
// director (lib/demo/director.ts) replaces it.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../../client/src");
const srcPath = path.join(root, "lib/useLiveDemoSimulation.ts");
const src = fs.readFileSync(srcPath, "utf8");
const lines = src.split("\n");

const startIdx = lines.findIndex((l) => l.startsWith("export interface DemoHotspot"));
const hookIdx = lines.findIndex((l) => l.startsWith("export function useLiveDemoSimulation("));
if (startIdx < 0 || hookIdx < 0) throw new Error("anchors not found");

// Body = datasets + helpers + routes + ticker (everything before the hook).
let body = lines.slice(startIdx, hookIdx).join("\n").trimEnd();
body = body
  .replace("interface Waypoint {", "export interface Waypoint {")
  .replace(
    "const DRIVER_ROUTES: Record<string, Waypoint[]> = {",
    "export const DEMO_DRIVER_ROUTES: Record<DemoDriverKey, Waypoint[]> = {"
  );

const header = `import type { VendorQuote, CategoryPriceRange, SupplierCategory } from "@shared/domain";
import { OFFICIAL_SUPPLIER_CATEGORIES } from "@shared/constants";
export { OFFICIAL_SUPPLIER_CATEGORIES };

/**
 * Demo datasets. Data, not code: the director script (scripts/sovereignArrival.ts)
 * references these by key, and rehearsals tune timings here without touching
 * the player. The five convoy routes and the ticker copy moved here verbatim
 * from the retired useLiveDemoSimulation hook.
 */

/** Name-matched demo captains (seeded users). The director resolves each key to a Driver at play time. */
export const DEMO_DRIVER_KEYS = ["sultan", "fahad", "rakan", "tariq", "nasser"] as const;
export type DemoDriverKey = (typeof DEMO_DRIVER_KEYS)[number];

`;

fs.mkdirSync(path.join(root, "lib/demo"), { recursive: true });
fs.writeFileSync(path.join(root, "lib/demo/data.ts"), header + body + "\n", "utf8");
fs.unlinkSync(srcPath);

const importers = [
  "components/SupplierContractWorkflow.tsx",
  "lib/metrics.ts",
  "pages/ops/ActivityIntakePage.tsx",
  "pages/ops/LogisticsDashboard.tsx",
  "pages/ops/QuotesAndContracts.tsx"
];
for (const rel of importers) {
  const file = path.join(root, rel);
  const text = fs.readFileSync(file, "utf8");
  const next = text
    .replace(/"\.\.\/lib\/useLiveDemoSimulation"/g, '"../lib/demo/data"')
    .replace(/"\.\.\/\.\.\/lib\/useLiveDemoSimulation"/g, '"../../lib/demo/data"')
    .replace(/"\.\/useLiveDemoSimulation"/g, '"./demo/data"');
  if (next === text) throw new Error(`no import rewritten in ${rel}`);
  fs.writeFileSync(file, next, "utf8");
}
console.log("phase5-demo-data: ok");

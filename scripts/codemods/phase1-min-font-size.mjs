// Phase 1 codemod: nothing under 12px. text-[8px..11px] → text-xs across
// client/src. Node fs, UTF-8, CRLF-preserving (files contain Arabic).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../../client/src");

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (/\.(tsx|ts|css)$/.test(e.name)) out.push(full);
  }
  return out;
}

const re = /\btext-\[(?:8|9|10|11)px\]/g;
let total = 0;
for (const file of walk(root)) {
  const before = fs.readFileSync(file, "utf8");
  const n = (before.match(re) || []).length;
  if (!n) continue;
  fs.writeFileSync(file, before.replace(re, "text-xs"), "utf8");
  total += n;
  console.log(`${String(n).padStart(4)}  ${path.relative(root, file)}`);
}
console.log(`\n${total} replacements`);

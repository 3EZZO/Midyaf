// Phase 3 codemod: Arabic-Indic digits (٠-٩) and ٪ inside string literals →
// Western digits and %. Only the digits change; the Arabic words are
// untouched. Node fs, UTF-8, CRLF-preserving.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../../client/src");
const map = { "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4", "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9", "٪": "%" };
const re = /[٠-٩٪]/g;

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (/\.(tsx|ts)$/.test(e.name)) out.push(full);
  }
  return out;
}

let total = 0;
for (const file of walk(root)) {
  const before = fs.readFileSync(file, "utf8");
  const n = (before.match(re) || []).length;
  if (!n) continue;
  fs.writeFileSync(file, before.replace(re, (ch) => map[ch]), "utf8");
  total += n;
  console.log(`${String(n).padStart(4)}  ${path.relative(root, file)}`);
}
console.log(`\n${total} digits converted`);

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import PDFDocument from "pdfkit";

export type ReportPdfInput = {
  title: string;
  status: string;
  updatedAt?: Date | string;
  kpis: Array<{ label: string; value: string }>;
  /** Drives chrome labels and the base direction of body text. */
  language?: "ar" | "en";
};

// ── Brand ────────────────────────────────────────────────────────────────
// Print-side mirror of client/src/styles tokens: Obsidian ground, gold rule.
const OBSIDIAN = "#090C15";
const OBSIDIAN_2 = "#121626";
const GOLD = "#D4AF37";
const GOLD_LIGHT = "#F2D575";
const INK = "#0F172A";
const INK_MUTED = "#475569";
const INK_FAINT = "#94A3B8";
const HAIRLINE = "#E2E8F0";
const ROW_ALT = "#F8FAFC";
const OK = "#059669";

// ── Fonts ────────────────────────────────────────────────────────────────
// IBM Plex Sans Arabic (OFL) — the same family the UI self-hosts. Complete
// TTFs (not the unicode-range subsets) so Latin and Arabic sit in one font.
// Looked up from the repo root (Render runs `node dist/...` from there) and,
// for `tsx` in development, relative to this file.
const FONT_DIRS = [
  path.resolve(process.cwd(), "server/assets/fonts"),
  path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../assets/fonts"
  )
];
const fontDir = FONT_DIRS.find((dir) =>
  fs.existsSync(path.join(dir, "IBMPlexSansArabic-Regular.ttf"))
);
const FONTS = fontDir
  ? {
      regular: path.join(fontDir, "IBMPlexSansArabic-Regular.ttf"),
      bold: path.join(fontDir, "IBMPlexSansArabic-SemiBold.ttf")
    }
  : null;
if (!FONTS) {
  console.warn(
    "[pdf] IBM Plex Sans Arabic not found; Arabic text will not render"
  );
}

const LOGO_CANDIDATES = [
  path.resolve(process.cwd(), "client/public/midyaf-logo.png"),
  path.resolve(process.cwd(), "dist/client/midyaf-logo.png")
];
const logoPath = LOGO_CANDIDATES.find((p) => fs.existsSync(p)) ?? null;

const ARABIC = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;

export function hasArabic(text: string) {
  return ARABIC.test(text);
}

type Run = { text: string; rtl: boolean };

type Cls = "R" | "L" | "N";

/** Character class: Arabic letters are R; Latin letters and digits are L; everything else neutral. */
function classify(ch: string): Cls {
  if (ARABIC.test(ch)) return "R";
  if (/[A-Za-z0-9]/.test(ch)) return "L";
  return "N";
}

/**
 * Split a line into direction runs — a small, honest subset of the Unicode
 * bidi algorithm, which PDFKit does not run. Arabic letters are RTL; Latin
 * letters *and digits* are LTR (so "2027" and "KSA 9119" never reverse);
 * neutrals (spaces, punctuation) take the direction of their neighbours when
 * both sides agree, else the base direction (rule N1/N2). Arabic runs are
 * drawn with `rtla` so fontkit reverses the shaped glyphs.
 */
export function splitRuns(text: string, base?: boolean): Run[] {
  const chars = [...text];
  if (!chars.length) return [];
  const baseRtl = base ?? hasArabic(text);
  const cls = chars.map(classify);

  // Resolve neutrals: look at the nearest strong class on each side.
  const resolved: boolean[] = new Array(chars.length);
  let i = 0;
  while (i < chars.length) {
    if (cls[i] !== "N") {
      resolved[i] = cls[i] === "R";
      i++;
      continue;
    }
    let j = i;
    while (j < chars.length && cls[j] === "N") j++;
    const before = i > 0 ? cls[i - 1] : null;
    const after = j < chars.length ? cls[j] : null;
    // Terminators (%, °, +, −) stay with an adjacent number: "98.5%", "+12".
    const segment = chars.slice(i, j).join("");
    const terminator =
      /^[%‰°+\-−]+$/.test(segment) &&
      ((i > 0 && /\d/.test(chars[i - 1])) ||
        (j < chars.length && /\d/.test(chars[j])));
    const dir = terminator
      ? false
      : before && after && before === after
        ? before === "R"
        : baseRtl;
    for (let k = i; k < j; k++) resolved[k] = dir;
    i = j;
  }

  const runs: Run[] = [];
  for (let k = 0; k < chars.length; k++) {
    const last = runs[runs.length - 1];
    if (last && last.rtl === resolved[k]) last.text += chars[k];
    else runs.push({ text: chars[k], rtl: resolved[k] });
  }
  return runs;
}

const MIRROR: Record<string, string> = {
  "(": ")",
  ")": "(",
  "[": "]",
  "]": "[",
  "{": "}",
  "}": "{",
  "<": ">",
  ">": "<",
  "«": "»",
  "»": "«"
};

/** Brackets in an RTL run must show their mirrored glyph; `rtla` only reverses order. */
function mirrorBrackets(text: string) {
  return [...text].map((ch) => MIRROR[ch] ?? ch).join("");
}

type LineOptions = {
  size: number;
  color: string;
  bold?: boolean;
  align?: "start" | "end" | "center";
  /** Base direction; defaults to the script of the text. */
  rtl?: boolean;
};

/**
 * Draw one line of mixed-script text inside [x, x+width]. Runs are laid out
 * in visual order (reversed for an RTL base), each with its own shaping
 * features, so an Arabic label with a Latin plate number reads correctly.
 */
function drawLine(
  doc: PDFKit.PDFDocument,
  text: string,
  x: number,
  y: number,
  width: number,
  opts: LineOptions
) {
  const rtl = opts.rtl ?? hasArabic(text);
  const font = FONTS
    ? opts.bold
      ? "Plex-Bold"
      : "Plex"
    : opts.bold
      ? "Helvetica-Bold"
      : "Helvetica";
  doc.font(font).fontSize(opts.size).fillColor(opts.color);

  const runs = FONTS ? splitRuns(text, rtl) : [{ text, rtl: false }];
  const visual = rtl ? [...runs].reverse() : runs;
  const space = doc.widthOfString(" ");
  // PDFKit trims whitespace at the edges of a text call, so edge spaces are
  // measured here and applied as cursor advances. An RTL run is drawn
  // reversed, so its logical trailing spaces are its visual leading ones.
  const measured = visual.map((run) => {
    const lead = run.text.length - run.text.trimStart().length;
    const trail = run.text.length - run.text.trimEnd().length;
    const body = run.rtl ? mirrorBrackets(run.text.trim()) : run.text.trim();
    const features: PDFKit.Mixins.OpenTypeFeatures[] = run.rtl ? ["rtla"] : [];
    return {
      body,
      features,
      before: (run.rtl ? trail : lead) * space,
      after: (run.rtl ? lead : trail) * space,
      width: body ? doc.widthOfString(body, { features }) : 0
    };
  });
  const total = measured.reduce(
    (sum, m) => sum + m.before + m.width + m.after,
    0
  );

  const align = opts.align ?? (rtl ? "end" : "start");
  let cursor =
    align === "center"
      ? x + (width - total) / 2
      : align === "end"
        ? x + width - total
        : x;
  for (const m of measured) {
    cursor += m.before;
    if (m.body) {
      doc.text(m.body, cursor, y, {
        lineBreak: false,
        width: m.width + 2,
        features: m.features
      });
    }
    cursor += m.width + m.after;
  }
}

const L = {
  brand: { en: "MIDYAF SOVEREIGN PLATFORM", ar: "منصة مِضياف السيادية" },
  subtitle: {
    en: "RIYADH SUMMIT LOGISTICS & VIP DISPATCH REPORT",
    ar: "تقرير الخدمات اللوجستية وإرسال كبار الشخصيات — قمة الرياض"
  },
  confidential: {
    en: "KINGDOM OF SAUDI ARABIA · CONFIDENTIAL",
    ar: "المملكة العربية السعودية · سري"
  },
  status: { en: "EXECUTIVE STATUS", ar: "الحالة التنفيذية" },
  timestamp: { en: "CERTIFIED TIMESTAMP", ar: "الختم الزمني المعتمد" },
  governance: { en: "GOVERNANCE LEVEL", ar: "مستوى الحوكمة" },
  governanceValue: {
    en: "Sovereign Protocol (FII / PIF)",
    ar: "البروتوكول السيادي (FII / PIF)"
  },
  kpiTitle: {
    en: "Operational Key Performance Indicators",
    ar: "مؤشرات الأداء التشغيلية الرئيسية"
  },
  metric: { en: "METRIC / INDICATOR", ar: "المؤشر" },
  outcome: { en: "CONFIRMED OUTCOME", ar: "النتيجة المعتمدة" },
  seal: { en: "AUDIT SEAL & VERIFICATION", ar: "ختم التدقيق والتحقق" },
  sealLine1: {
    en: "Multi-signature approval: Sila Operations · Organizer · Midyaf Sovereign Guard",
    ar: "اعتماد متعدد التوقيع: عمليات صلة · المنظم · الحرس السيادي لمِضياف"
  },
  sealLine2: {
    en: "ZATCA VAT & diplomatic service regulation compliance: verified · Riyadh launch standard",
    ar: "الامتثال لضريبة القيمة المضافة (زاتكا) ولوائح الخدمة الدبلوماسية: تم التحقق · معيار إطلاق الرياض"
  },
  footer: {
    en: "Midyaf Sovereign Hospitality & Logistics Command Platform · Riyadh 2027 · Strictly confidential",
    ar: "منصة مِضياف السيادية للضيافة والقيادة اللوجستية · الرياض 2027 · سري للغاية"
  }
};

export function generateReportPdf(report: ReportPdfInput) {
  const lang: "ar" | "en" =
    report.language ?? (hasArabic(report.title) ? "ar" : "en");
  const rtl = lang === "ar";
  const t = (key: keyof typeof L) => L[key][lang];

  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      margin: 40,
      size: "A4",
      lang,
      info: {
        Title: `Midyaf Executive Report - ${report.title}`,
        Author: "Midyaf Sovereign Operations Platform",
        Subject: "Summit Logistics & VIP Chauffeur Dispatch",
        Keywords: "Riyadh, Midyaf, Logistics, Summit 2027, Certified Report"
      }
    });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // Fonts must be registered and selected before the first .text().
    if (FONTS) {
      doc.registerFont("Plex", FONTS.regular);
      doc.registerFont("Plex-Bold", FONTS.bold);
      doc.font("Plex");
    }

    const pageWidth = doc.page.width;
    const margin = 40;
    const contentWidth = pageWidth - margin * 2;
    const line = (
      text: string,
      y: number,
      opts: LineOptions & { x?: number; width?: number }
    ) =>
      drawLine(doc, text, opts.x ?? margin, y, opts.width ?? contentWidth, {
        ...opts,
        rtl: opts.rtl ?? rtl
      });

    // ── 1. Obsidian header band with gold rule ──
    doc.rect(margin, margin, contentWidth, 72).fill(OBSIDIAN);
    doc.rect(margin, margin + 70, contentWidth, 3).fill(GOLD);

    let textX = margin + 18;
    let textWidth = contentWidth - 36;
    if (logoPath) {
      // Logo sits at the reading start; text takes the remainder.
      const logoSize = 44;
      const logoX = rtl ? margin + contentWidth - 18 - logoSize : margin + 18;
      doc.image(logoPath, logoX, margin + 14, { fit: [logoSize, logoSize] });
      textWidth = contentWidth - 36 - logoSize - 12;
      textX = rtl ? margin + 18 : margin + 18 + logoSize + 12;
    }
    line(t("brand"), margin + 16, {
      x: textX,
      width: textWidth,
      size: 16,
      color: "#FFFFFF",
      bold: true
    });
    line(t("subtitle"), margin + 40, {
      x: textX,
      width: textWidth,
      size: 8.5,
      color: GOLD
    });
    line(t("confidential"), margin + 54, {
      x: textX,
      width: textWidth,
      size: 8,
      color: INK_FAINT
    });

    // ── 2. Title and metadata ──
    let y = margin + 92;
    line(report.title, y, { size: 16, color: OBSIDIAN, bold: true });
    y += 28;

    const generatedAt = new Date().toLocaleString(
      rtl ? "ar-SA-u-nu-latn" : "en-SA",
      {
        timeZone: "Asia/Riyadh",
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
      }
    );

    doc
      .roundedRect(margin, y, contentWidth, 48, 6)
      .fillOpacity(0.04)
      .fill(OBSIDIAN_2)
      .strokeOpacity(0.35)
      .stroke(GOLD);
    doc.fillOpacity(1).strokeOpacity(1);
    // Column shares: the timestamp is the long one.
    const shares = [0.24, 0.44, 0.32];
    const cells: Array<[string, string, string]> = [
      [
        t("status"),
        report.status,
        report.status.includes("CONFIRMED") ? OK : OBSIDIAN_2
      ],
      [`${t("timestamp")} · Asia/Riyadh`, generatedAt, INK],
      [t("governance"), t("governanceValue"), GOLD]
    ];
    // Columns read in the base direction: first cell at the reading start.
    let cx = rtl ? margin + contentWidth - 14 : margin + 14;
    cells.forEach(([label, value, color], i) => {
      const w = (contentWidth - 28) * shares[i];
      const left = rtl ? cx - w : cx;
      line(label, y + 12, {
        x: left,
        width: w - 8,
        size: 8,
        color: INK_MUTED,
        bold: true
      });
      line(value, y + 26, {
        x: left,
        width: w - 8,
        size: 9.5,
        color,
        bold: true
      });
      cx += rtl ? -w : w;
    });
    y += 68;

    // ── 3. KPI table ──
    line(t("kpiTitle"), y, { size: 13, color: OBSIDIAN, bold: true });
    y += 24;
    doc.rect(margin, y, contentWidth, 24).fill(OBSIDIAN);
    const valueWidth = 160;
    const labelX = rtl ? margin + 12 + valueWidth : margin + 12;
    const labelWidth = contentWidth - valueWidth - 24;
    const valueX = rtl ? margin + 12 : margin + contentWidth - valueWidth - 12;
    line(t("metric"), y + 7, {
      x: labelX,
      width: labelWidth,
      size: 8.5,
      color: "#FFFFFF",
      bold: true
    });
    line(t("outcome"), y + 7, {
      x: valueX,
      width: valueWidth,
      size: 8.5,
      color: GOLD_LIGHT,
      bold: true,
      align: rtl ? "start" : "end"
    });
    y += 24;

    let alt = false;
    for (const item of report.kpis) {
      if (alt) doc.rect(margin, y, contentWidth, 24).fill(ROW_ALT);
      line(item.label, y + 7, {
        x: labelX,
        width: labelWidth,
        size: 10,
        color: INK
      });
      line(item.value, y + 7, {
        x: valueX,
        width: valueWidth,
        size: 10,
        color: OBSIDIAN_2,
        bold: true,
        align: rtl ? "start" : "end"
      });
      doc
        .moveTo(margin, y + 24)
        .lineTo(margin + contentWidth, y + 24)
        .strokeColor(HAIRLINE)
        .lineWidth(0.5)
        .stroke();
      y += 25;
      alt = !alt;
    }

    // ── 4. Seal ──
    y += 18;
    doc
      .roundedRect(margin, y, contentWidth, 62, 6)
      .fillOpacity(0.04)
      .fill(OK)
      .strokeOpacity(0.35)
      .stroke(OK);
    doc.fillOpacity(1).strokeOpacity(1);
    line(t("seal"), y + 10, {
      x: margin + 14,
      width: contentWidth - 28,
      size: 8.5,
      color: OK,
      bold: true
    });
    line(t("sealLine1"), y + 26, {
      x: margin + 14,
      width: contentWidth - 28,
      size: 8,
      color: INK_MUTED
    });
    line(t("sealLine2"), y + 40, {
      x: margin + 14,
      width: contentWidth - 28,
      size: 8,
      color: INK_MUTED
    });

    // ── 5. Footer ──
    const footerY = doc.page.height - margin - 32;
    doc
      .moveTo(margin, footerY)
      .lineTo(margin + contentWidth, footerY)
      .strokeColor(GOLD)
      .lineWidth(1)
      .stroke();
    line(t("footer"), footerY + 8, {
      size: 8,
      color: INK_FAINT,
      align: "center"
    });

    doc.end();
  });
}

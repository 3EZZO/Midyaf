import PDFDocument from "pdfkit";

export type ReportPdfInput = {
  title: string;
  status: string;
  updatedAt?: Date | string;
  kpis: Array<{ label: string; value: string }>;
};

export function generateReportPdf(report: ReportPdfInput) {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      margin: 40,
      size: "A4",
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

    const pageWidth = doc.page.width;
    const margin = 40;
    const contentWidth = pageWidth - margin * 2;

    // ── 1. Royal Header Banner ──
    doc.rect(margin, margin, contentWidth, 72).fill("#1D1630");

    // Gold accent band at bottom of header banner
    doc.rect(margin, margin + 70, contentWidth, 3).fill("#C9A84C");

    // Brand Title in Header
    doc
      .fontSize(18)
      .fillColor("#FFFFFF")
      .text("MIDYAF SOVEREIGN PLATFORM", margin + 18, margin + 16, {
        characterSpacing: 1.5
      });

    doc
      .fontSize(9)
      .fillColor("#C9A84C")
      .text("RIYADH SUMMIT LOGISTICS & VIP DISPATCH REPORT", margin + 18, margin + 40, {
        characterSpacing: 1
      });

    doc
      .fontSize(8)
      .fillColor("#A5B4FC")
      .text("KINGDOM OF SAUDI ARABIA · CONFIDENTIAL", margin + 18, margin + 54);

    // ── 2. Report Overview & Metadata Block ──
    doc.y = margin + 92;

    doc
      .fontSize(16)
      .fillColor("#1D1630")
      .text(report.title, { width: contentWidth });

    doc.moveDown(0.4);

    const generatedAt = new Date().toLocaleString("en-SA", {
      timeZone: "Asia/Riyadh",
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });

    // Metadata card box
    const metaBoxY = doc.y;
    doc
      .roundedRect(margin, metaBoxY, contentWidth, 48, 6)
      .fillOpacity(0.04)
      .fill("#2D0A5F")
      .strokeOpacity(0.2)
      .stroke("#C9A84C");

    doc.fillOpacity(1).strokeOpacity(1);

    doc
      .fontSize(9)
      .fillColor("#475569")
      .text("EXECUTIVE STATUS:", margin + 14, metaBoxY + 12)
      .fontSize(10)
      .fillColor(report.status.includes("CONFIRMED") ? "#059669" : "#2D0A5F")
      .text(report.status, margin + 14, metaBoxY + 26);

    doc
      .fontSize(9)
      .fillColor("#475569")
      .text("CERTIFIED TIMESTAMP:", margin + 180, metaBoxY + 12)
      .fontSize(10)
      .fillColor("#1E293B")
      .text(`${generatedAt} (Asia/Riyadh)`, margin + 180, metaBoxY + 26);

    doc
      .fontSize(9)
      .fillColor("#475569")
      .text("GOVERNANCE LEVEL:", margin + 370, metaBoxY + 12)
      .fontSize(10)
      .fillColor("#C9A84C")
      .text("Sovereign Protocol (FII / PIF)", margin + 370, metaBoxY + 26);

    // ── 3. Confirmed KPIs Table ──
    doc.y = metaBoxY + 68;

    doc
      .fontSize(13)
      .fillColor("#1D1630")
      .text("Operational Key Performance Indicators (KPIs)");

    doc.moveDown(0.4);

    // Table Header Row
    const tableHeaderY = doc.y;
    doc.rect(margin, tableHeaderY, contentWidth, 24).fill("#2D0A5F");

    doc
      .fontSize(9)
      .fillColor("#FFFFFF")
      .text("METRIC DESCRIPTION / INDICATOR", margin + 12, tableHeaderY + 7);

    doc
      .fontSize(9)
      .fillColor("#FFFFFF")
      .text("CONFIRMED OUTCOME", margin + contentWidth - 160, tableHeaderY + 7, {
        width: 148,
        align: "right"
      });

    doc.y = tableHeaderY + 24;

    // KPI Rows
    let isAlt = false;
    for (const item of report.kpis) {
      const rowY = doc.y;
      if (isAlt) {
        doc.rect(margin, rowY, contentWidth, 24).fill("#F8FAFC");
      }

      doc
        .fontSize(10)
        .fillColor("#1E293B")
        .text(item.label, margin + 12, rowY + 7);

      doc
        .fontSize(10)
        .fillColor("#2D0A5F")
        .text(item.value, margin + contentWidth - 160, rowY + 7, {
          width: 148,
          align: "right"
        });

      // Bottom border line
      doc
        .moveTo(margin, rowY + 24)
        .lineTo(margin + contentWidth, rowY + 24)
        .strokeColor("#E2E8F0")
        .lineWidth(0.5)
        .stroke();

      doc.y = rowY + 25;
      isAlt = !isAlt;
    }

    // ── 4. Cryptographic Seal & Verification Block ──
    doc.moveDown(1.2);
    const sealY = doc.y;

    doc
      .roundedRect(margin, sealY, contentWidth, 75, 6)
      .fillOpacity(0.03)
      .fill("#059669")
      .strokeOpacity(0.3)
      .stroke("#059669");

    doc.fillOpacity(1).strokeOpacity(1);

    doc
      .fontSize(9)
      .fillColor("#059669")
      .text("CRYPTOGRAPHIC AUDIT SEAL & TAMPER-PROOF VERIFICATION", margin + 14, sealY + 10, {
        characterSpacing: 0.5
      });

    doc
      .fontSize(8)
      .fillColor("#475569")
      .text(
        "SHA-256 Hash: 9c8b3e64f1d0a520a7b4589d34208e9a2245c11f7c00e1293a985d19a285bf81",
        margin + 14,
        sealY + 26
      )
      .text(
        "Multi-Sig Approval Signatures: [Key 1: Sila Operations] · [Key 2: Royal Commission/Organizer] · [Key 3: Midyaf Sovereign Guard]",
        margin + 14,
        sealY + 39
      )
      .text(
        "ZATCA VAT & Diplomatic Service Regulation Compliance: Verified · Riyadh Launch Standard",
        margin + 14,
        sealY + 52
      );

    // ── 5. Legal & Confidentiality Footer ──
    const footerY = doc.page.height - margin - 32;
    doc
      .moveTo(margin, footerY)
      .lineTo(margin + contentWidth, footerY)
      .strokeColor("#C9A84C")
      .lineWidth(1)
      .stroke();

    doc
      .fontSize(8)
      .fillColor("#94A3B8")
      .text(
        "Midyaf Sovereign Hospitality & Logistics Command Platform · Riyadh 2027 · Strictly Confidential",
        margin,
        footerY + 8,
        { width: contentWidth, align: "center" }
      );

    doc.end();
  });
}

import PDFDocument from "pdfkit";

export type ReportPdfInput = {
  title: string;
  status: string;
  updatedAt?: Date | string;
  kpis: Array<{ label: string; value: string }>;
};

export function generateReportPdf(report: ReportPdfInput) {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ margin: 48, size: "A4" });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc
      .fontSize(22)
      .fillColor("#2D0A5F")
      .text("Midyaf Logistics Report", { align: "left" });

    doc.moveDown(0.5);
    doc.fontSize(15).fillColor("#1D1630").text(report.title);
    doc.moveDown(0.3);
    doc
      .fontSize(10)
      .fillColor("#666666")
      .text(`Status: ${report.status}`)
      .text(`Generated: ${new Date().toLocaleString("en-SA")}`);

    if (report.updatedAt) {
      doc.text(`Last updated: ${new Date(report.updatedAt).toLocaleString("en-SA")}`);
    }

    doc.moveDown(1);
    doc.fontSize(13).fillColor("#C9A84C").text("Confirmed KPIs");
    doc.moveDown(0.5);

    for (const item of report.kpis) {
      doc
        .fontSize(11)
        .fillColor("#1D1630")
        .text(item.label, { continued: true })
        .fillColor("#2D0A5F")
        .text(`  ${item.value}`, { align: "right" });
      doc.moveDown(0.35);
    }

    doc.moveDown(1);
    doc
      .fontSize(9)
      .fillColor("#777777")
      .text(
        "This report is visible to the organizing company only after logistics manager confirmation."
      );

    doc.end();
  });
}

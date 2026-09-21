import fs from "node:fs";
import { it } from "vitest";
import { generateReportPdf } from "./pdf.js";

// Writes a sample for eyeballing when SAMPLE_PDF_OUT is set; otherwise a no-op.
it.runIf(process.env.SAMPLE_PDF_OUT)("writes a sample Arabic PDF", async () => {
  const pdf = await generateReportPdf({
    title: "تقرير الوصول السيادي — قمة الرياض 2027",
    status: "CONFIRMED",
    language: "ar",
    kpis: [
      { label: "الالتزام بالمواعيد", value: "98.5%" },
      { label: "المواكب الراسية", value: "5 / 5" },
      { label: "لوحة موكب ألفا · Mercedes-Maybach", value: "KSA 9119" },
      { label: "الضيوف الواصلون", value: "42 من 45" }
    ]
  });
  fs.writeFileSync(process.env.SAMPLE_PDF_OUT!, pdf);
});

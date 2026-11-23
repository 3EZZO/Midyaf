import { Keyboard } from "lucide-react";
import { Dialog } from "../components/ui/Dialog";
import { Kbd } from "../components/ui/Kbd";

type ShortcutRow = {
  keys: string[];
  labelEn: string;
  labelAr: string;
};

const NAVIGATION_SHORTCUTS: ShortcutRow[] = [
  { keys: ["?"], labelEn: "Open or close this shortcuts guide", labelAr: "فتح أو إغلاق دليل الاختصارات" },
  { keys: ["1", "–", "9"], labelEn: "Switch Investor Demo persona", labelAr: "التبديل بين أدوار العرض" },
  { keys: ["P"], labelEn: "Toggle Projector presentation scale", labelAr: "تبديل وضع العرض للبروجكتر" },
  { keys: ["L"], labelEn: "Toggle English / Arabic (LTR / RTL)", labelAr: "التبديل بين العربية والإنجليزية" },
  { keys: ["W"], labelEn: "Open or close Operations War Room", labelAr: "فتح أو إغلاق غرفة العمليات" },
  { keys: ["Ctrl", "K"], labelEn: "Quick Jump command palette", labelAr: "لوحة البحث والتنقل السريع" }
];

const COMMAND_SHORTCUTS: ShortcutRow[] = [
  { keys: ["Ctrl", "Shift", "D"], labelEn: "Toggle live fleet simulation mode", labelAr: "تفعيل أو إيقاف محاكاة الأسطول" },
  { keys: ["Ctrl", "Space"], labelEn: "Open War Room when simulation is active", labelAr: "فتح غرفة العمليات أثناء المحاكاة" },
  { keys: ["Ctrl", "Shift", "P"], labelEn: "Toggle Projector mode (global)", labelAr: "تبديل وضع العرض (عام)" },
  { keys: ["Space"], labelEn: "War Room: Play / Pause rehearsal", labelAr: "غرفة العمليات: تشغيل / إيقاف مؤقت" },
  { keys: ["←", "→"], labelEn: "War Room: Previous / Next act", labelAr: "غرفة العمليات: المشهد السابق / التالي" },
  { keys: ["M", "/", "R"], labelEn: "War Room: Mute audio / Restart", labelAr: "غرفة العمليات: كتم الصوت / إعادة التشغيل" }
];

export function PresenterShortcutsModal({
  open,
  onOpenChange,
  isArabic
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isArabic: boolean;
}) {
  const renderRows = (rows: ShortcutRow[]) => (
    <ul className="divide-y divide-hairline rounded-lg border border-hairline bg-surface-1">
      {rows.map((row) => (
        <li
          key={row.labelEn}
          className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs"
        >
          <span className="text-ink">{isArabic ? row.labelAr : row.labelEn}</span>
          <span className="inline-flex items-center gap-1" dir="ltr">
            {row.keys.map((key, idx) =>
              key === "–" || key === "/" ? (
                <span key={`${key}-${idx}`} className="text-ink-faint">
                  {key}
                </span>
              ) : (
                <Kbd key={`${key}-${idx}`}>{key}</Kbd>
              )
            )}
          </span>
        </li>
      ))}
    </ul>
  );

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="md"
      closeLabel={isArabic ? "إغلاق" : "Close"}
      title={
        <span className="inline-flex items-center gap-2">
          <Keyboard className="size-4 text-gold-500" aria-hidden />
          {isArabic ? "اختصارات مقدم العرض" : "Presenter keyboard shortcuts"}
        </span>
      }
      description={
        isArabic
          ? "تُعطَّل اختصارات الحرف الواحد تلقائياً أثناء الكتابة داخل الحقول أو النوافذ المنبثقة."
          : "Single-key shortcuts automatically pause while typing in forms or dialogs."
      }
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2" dir={isArabic ? "rtl" : "ltr"} data-presenter-shortcuts>
        <div className="min-w-0 space-y-2">
          <h3 className="text-xs font-bold uppercase tracking-label text-gold-300">
            {isArabic ? "اختصارات العرض السريع" : "Live walkthrough"}
          </h3>
          {renderRows(NAVIGATION_SHORTCUTS)}
        </div>
        <div className="min-w-0 space-y-2">
          <h3 className="text-xs font-bold uppercase tracking-label text-gold-300">
            {isArabic ? "التحكم وغرفة العمليات" : "Command & War Room"}
          </h3>
          {renderRows(COMMAND_SHORTCUTS)}
        </div>
      </div>
    </Dialog>
  );
}

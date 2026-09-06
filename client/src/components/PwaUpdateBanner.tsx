import { useEffect, useState } from "react";
import { Sparkles, RefreshCw, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { registerSW } from "virtual:pwa-register";
import { isArabicLanguage } from "../lib/localize";
import { tacticalAudio } from "../lib/tacticalAudio";

export function PwaUpdateBanner() {
  const { i18n } = useTranslation();
  const isArabic = isArabicLanguage(i18n.language);
  const [needRefresh, setNeedRefresh] = useState(false);
  const [updateFunction, setUpdateFunction] = useState<(() => Promise<void>) | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    try {
      const updateSW = registerSW({
        onNeedRefresh() {
          setNeedRefresh(true);
          tacticalAudio.playChime();
        },
        onOfflineReady() {
          // PWA ready offline
        }
      });
      setUpdateFunction(() => updateSW);
    } catch {
      // Ignored in non-SW environments
    }
  }, []);

  if (!needRefresh) return null;

  return (
    <aside
      aria-label="PWA Update Available"
      className="fixed bottom-5 end-5 z-[999999] flex max-w-md items-center gap-3 rounded-2xl bg-gradient-to-r from-midyaf-purple/95 via-slate-950/95 to-midyaf-purple-dark/95 p-3.5 text-white shadow-2xl backdrop-blur-xl border border-midyaf-gold/60 ring-2 ring-midyaf-gold/30 animate-fadeInUp"
    >
      <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-midyaf-gold/20 text-midyaf-gold ring-1 ring-midyaf-gold/40">
        <Sparkles size={17} className="animate-spin" style={{ animationDuration: "6s" }} />
      </div>

      <div className="flex-1 text-xs">
        <p className="font-black text-midyaf-gold">
          {isArabic ? "تحديث تشغيلي فوري متاح" : "New Operational Build Ready"}
        </p>
        <p className="text-[11px] text-slate-300 mt-0.5">
          {isArabic
            ? "تم نشر إصدار محدث على الخادم. انقر للتحديث الفوري بدون كاش قديم."
            : "Latest server release deployed. Refresh now to apply the latest build."}
        </p>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        <button
          type="button"
          onClick={() => {
            tacticalAudio.playChime();
            if (updateFunction) {
              void updateFunction().then(() => window.location.reload());
            } else {
              window.location.reload();
            }
          }}
          className="flex items-center gap-1 rounded-xl bg-gradient-to-r from-midyaf-gold to-amber-500 px-3 py-2 text-xs font-black text-slate-950 shadow-md hover:brightness-110 active:scale-95 transition cursor-pointer"
        >
          <RefreshCw size={12} />
          <span>{isArabic ? "تحديث الآن" : "Update Now"}</span>
        </button>
        <button
          type="button"
          onClick={() => setNeedRefresh(false)}
          className="grid size-7 place-items-center rounded-full bg-white/10 text-slate-400 hover:text-white transition cursor-pointer"
        >
          <X size={13} />
        </button>
      </div>
    </aside>
  );
}

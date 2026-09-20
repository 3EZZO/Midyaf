import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { registerSW } from "virtual:pwa-register";
import { isArabicLanguage } from "../lib/localize";
import { useToast } from "./ui/Toast";

/**
 * Registers the service worker (registerType "prompt") and surfaces a new
 * build as a persistent toast with an "Update now" action.
 */
export function PwaUpdateBanner() {
  const { i18n } = useTranslation();
  const toast = useToast();

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    let updateSW: ((reload?: boolean) => Promise<void>) | undefined;
    try {
      updateSW = registerSW({
        onNeedRefresh() {
          const isArabic = isArabicLanguage(i18n.language);
          toast.show({
            type: "info",
            duration: 0,
            title: isArabic ? "تحديث تشغيلي فوري متاح" : "New Operational Build Ready",
            message: isArabic
              ? "تم نشر إصدار محدث على الخادم. انقر للتحديث الفوري بدون كاش قديم."
              : "Latest server release deployed. Refresh now to apply the latest build.",
            action: {
              label: isArabic ? "تحديث الآن" : "Update Now",
              onClick: () => {
                if (updateSW) void updateSW(true);
                else window.location.reload();
              }
            }
          });
        }
      });
    } catch {
      // Ignored in non-SW environments
    }
    // The registration is one-shot; language at the time of the prompt is read live.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

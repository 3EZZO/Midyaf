import { useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { registerSW } from "virtual:pwa-register";
import { isArabicLanguage } from "../lib/localize";
import { useToast } from "./ui/Toast";

export const PWA_UPDATE_TOAST_ID = "pwa-update-ready";

export function pwaUpdateToastCopy(isArabic: boolean) {
  return {
    title: isArabic ? "تحديث تشغيلي فوري متاح" : "New Operational Build Ready",
    message: isArabic
      ? "تم نشر إصدار محدث على الخادم. انقر للتحديث الفوري بدون كاش قديم."
      : "Latest server release deployed. Refresh now to apply the latest build.",
    actionLabel: isArabic ? "تحديث الآن" : "Update Now"
  };
}

/**
 * Registers the service worker (registerType "prompt") and surfaces a new
 * build as a persistent toast with an "Update now" action. Survives and
 * re-localizes cleanly when the user toggles EN/AR.
 */
export function PwaUpdateBanner() {
  const { i18n } = useTranslation();
  const toast = useToast();
  const updateSwRef = useRef<((reload?: boolean) => Promise<void>) | undefined>(undefined);
  const needRefreshRef = useRef(false);

  const showPrompt = useCallback(
    (lang: string) => {
      const copy = pwaUpdateToastCopy(isArabicLanguage(lang));
      toast.show({
        id: PWA_UPDATE_TOAST_ID,
        type: "info",
        duration: 0,
        persistent: true,
        title: copy.title,
        message: copy.message,
        action: {
          label: copy.actionLabel,
          onClick: () => {
            needRefreshRef.current = false;
            if (updateSwRef.current) void updateSwRef.current(true);
            else window.location.reload();
          }
        }
      });
    },
    [toast]
  );

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    try {
      updateSwRef.current = registerSW({
        onNeedRefresh() {
          needRefreshRef.current = true;
          showPrompt(i18n.language);
        }
      });
    } catch {
      // Ignored in non-SW environments
    }
    // The registration is one-shot; language changes are handled by the listener below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onLangChanged = (nextLang: string) => {
      if (needRefreshRef.current) {
        showPrompt(nextLang);
      }
    };
    i18n.on("languageChanged", onLangChanged);
    return () => {
      i18n.off("languageChanged", onLangChanged);
    };
  }, [i18n, showPrompt]);

  return null;
}

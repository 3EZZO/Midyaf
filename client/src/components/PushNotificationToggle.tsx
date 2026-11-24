import { useEffect, useState } from "react";
import { Bell, BellOff } from "lucide-react";
import type { Session } from "@shared/domain";
import {
  fetchPushConfig,
  getActiveBrowserPushSubscription,
  isBrowserPushSupported,
  subscribeToWebPush,
  unsubscribeFromWebPush
} from "../lib/webPush";
import { isJwtExpired } from "../lib/demoGuideHint";
import { IconButton } from "./ui/Button";
import { Tooltip } from "./ui/Tooltip";
import { useToast } from "./ui/Toast";

/**
 * PLAN_READY_1 Sprint 3: Compact TopBar toggle for Native Web Push (VAPID)
 * lock-screen alerts. Stays completely hidden when VAPID keys are not set on
 * the server or the browser lacks Web Push support.
 */
export function PushNotificationToggle({
  session,
  isArabic,
  initialEnabled
}: {
  session: Session;
  isArabic: boolean;
  /** Optional test override; defaults to live GET /api/notifications/push/config. */
  initialEnabled?: boolean;
}) {
  const toast = useToast();
  const [publicKey, setPublicKey] = useState<string | null>(initialEnabled ? "test-key" : null);
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (initialEnabled !== undefined) return;
    if (!isBrowserPushSupported()) return;
    // An expired token would only 401; the boot refresh installs a new one,
    // which re-runs this effect.
    if (isJwtExpired(session.accessToken)) return;
    let active = true;
    void fetchPushConfig(session.accessToken)
      .then(async (cfg) => {
        if (!active || !cfg.enabled || !cfg.publicKey) return;
        setPublicKey(cfg.publicKey);
        const existing = await getActiveBrowserPushSubscription().catch(() => null);
        if (active) setSubscribed(Boolean(existing));
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [session.accessToken, initialEnabled]);

  if (!publicKey) return null;

  const label = subscribed
    ? isArabic
      ? "إيقاف إشعارات الجهاز"
      : "Disable lock-screen alerts"
    : isArabic
      ? "تفعيل إشعارات الجهاز"
      : "Enable lock-screen alerts";

  async function handleToggle() {
    if (!publicKey) return;
    setBusy(true);
    try {
      if (subscribed) {
        await unsubscribeFromWebPush(session.accessToken);
        setSubscribed(false);
        toast.info(
          isArabic ? "تم إيقاف الإشعارات" : "Alerts paused",
          isArabic
            ? "لن تصلك تنبيهات شاشة القفل على هذا الجهاز."
            : "Lock-screen alerts are paused on this device."
        );
      } else {
        await subscribeToWebPush(session.accessToken, publicKey);
        setSubscribed(true);
        toast.success(
          isArabic ? "تم تفعيل الإشعارات" : "Lock-screen alerts enabled",
          isArabic
            ? "ستصلك تنبيهات الرحلات والاعتمادات فورياً."
            : "You will receive trip, gate, and approval alerts on this device."
        );
      }
    } catch (err) {
      toast.alert(
        isArabic ? "تعذر تحديث الإشعارات" : "Could not update alerts",
        err instanceof Error
          ? err.message
          : isArabic
            ? "تأكد من السماح بالإشعارات في إعدادات المتصفح."
            : "Please allow notifications in your browser or Home Screen PWA settings."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Tooltip content={label}>
      <IconButton
        label={label}
        aria-pressed={subscribed}
        disabled={busy}
        data-web-push-toggle
        variant={subscribed ? "gold" : "ghost"}
        onClick={() => void handleToggle()}
      >
        {subscribed ? (
          <Bell className="size-4" aria-hidden />
        ) : (
          <BellOff className="size-4" aria-hidden />
        )}
      </IconButton>
    </Tooltip>
  );
}

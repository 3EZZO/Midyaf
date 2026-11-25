import { useEffect, useRef, useState } from "react";
import { Bell, BellOff } from "lucide-react";
import type { Session } from "@shared/domain";
import {
  consumePushPausedOnLogout,
  fetchPushConfig,
  getActiveBrowserPushSubscription,
  isBrowserPushSupported,
  subscribeToWebPush,
  unsubscribeFromWebPush,
  type PushConfigResponse
} from "../lib/webPush";
import { isJwtExpired } from "../lib/demoGuideHint";
import { IconButton } from "./ui/Button";
import { Tooltip } from "./ui/Tooltip";
import { useToast } from "./ui/Toast";

export type PushToggleSyncState = {
  userId: string;
  publicKey: string | null;
  subscribed: boolean;
};

/**
 * Pure state transition for PushNotificationToggle across user switches,
 * mid-session token rotations (~13.5m), and transient fetch failures.
 *
 * - Resets `subscribed` to `false` ONLY when `userId` changes (never on a
 *   same-user `accessToken` rotation).
 * - Preserves the last known `publicKey` and `subscribed` state if
 *   `fetchPushConfig` fails on weak field signal.
 */
export async function syncPushToggleState(
  prev: PushToggleSyncState,
  nextUserId: string,
  deps: {
    fetchConfig: () => Promise<PushConfigResponse>;
    getSubscription: () => Promise<PushSubscription | null>;
    consumePausedFlag: () => boolean;
  }
): Promise<{ next: PushToggleSyncState; updated: boolean; showPausedReminder: boolean }> {
  const userChanged = prev.userId !== nextUserId;
  const base: PushToggleSyncState = userChanged
    ? { userId: nextUserId, publicKey: prev.publicKey, subscribed: false }
    : prev;

  let cfg: PushConfigResponse;
  try {
    cfg = await deps.fetchConfig();
  } catch {
    return { next: base, updated: false, showPausedReminder: false };
  }

  if (!cfg.enabled || !cfg.publicKey) {
    return { next: base, updated: false, showPausedReminder: false };
  }

  const existing = await deps.getSubscription().catch(() => null);
  const subscribed = Boolean(existing);
  const showPausedReminder = !subscribed && deps.consumePausedFlag();
  return {
    next: { userId: nextUserId, publicKey: cfg.publicKey, subscribed },
    updated: true,
    showPausedReminder
  };
}

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
  const stateRef = useRef<PushToggleSyncState>({
    userId: session.user.id,
    publicKey: initialEnabled ? "test-key" : null,
    subscribed: false
  });
  stateRef.current = { userId: stateRef.current.userId, publicKey, subscribed };

  useEffect(() => {
    if (initialEnabled !== undefined) return;
    if (!isBrowserPushSupported()) return;
    // An expired token would only 401; the boot refresh installs a new one,
    // which re-runs this effect.
    if (isJwtExpired(session.accessToken)) return;
    let active = true;
    const prev = stateRef.current;
    if (prev.userId !== session.user.id) {
      stateRef.current = { ...prev, userId: session.user.id, subscribed: false };
      setSubscribed(false);
    }
    void syncPushToggleState(prev, session.user.id, {
      fetchConfig: () => fetchPushConfig(session.accessToken),
      getSubscription: () => getActiveBrowserPushSubscription(),
      consumePausedFlag: () => consumePushPausedOnLogout()
    }).then(({ next, updated, showPausedReminder }) => {
      if (!active || !updated) return;
      stateRef.current = next;
      setPublicKey(next.publicKey);
      setSubscribed(next.subscribed);
      if (showPausedReminder) {
        toast.info(
          isArabic ? "تنبيهات الجهاز متوقفة بعد تسجيل الخروج" : "Lock-screen alerts are off",
          isArabic
            ? "اضغط أيقونة الجرس في الشريط العلوي لإعادة تفعيل التنبيهات على هذا الجهاز."
            : "Alerts were paused on sign-out for privacy. Tap the bell icon to re-enable them."
        );
      }
    });
    return () => {
      active = false;
    };
  }, [session.accessToken, session.user.id, initialEnabled]);

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
        data-push-state={subscribed ? "on" : "off"}
        variant={subscribed ? "gold" : "ghost"}
        className="relative"
        onClick={() => void handleToggle()}
      >
        {subscribed ? (
          <Bell className="size-4" aria-hidden />
        ) : (
          <>
            <BellOff className="size-4" aria-hidden />
            <span
              aria-hidden
              className="absolute end-1.5 top-1.5 size-2 rounded-full bg-warn ring-2 ring-surface-1"
            />
          </>
        )}
      </IconButton>
    </Tooltip>
  );
}

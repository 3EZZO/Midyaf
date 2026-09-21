// Captain (driver) field app (phone-first).
import { useEffect, useMemo, useState } from "react";
import {
  Car,
  Clock,
  ListChecks,
  LocateFixed,
  LocateOff,
  MapPin,
  Navigation,
  Zap
} from "lucide-react";
import type { FileAsset, Task, TaskStatus } from "@shared/domain";
import { RiyadhMap } from "../../components/map";
import {
  Badge,
  Button,
  Card,
  Field,
  Input,
  KpiTile,
  QrCode,
  Section,
  Sheet,
  StatusPill,
  Switch,
  useToast
} from "../../components/ui";
import { apiFetch } from "../../lib/api";
import { cn } from "../../lib/cn";
import { useLiveLocation } from "../../lib/useLiveLocation";
import { useSocketContext } from "../../lib/useSocket";
import type { PortalProps } from "../types";
import {
  DeliveryLog,
  PortalHero,
  assetFileName,
  latestFileAsset,
  nextTaskStatuses,
  statusActionLabel,
  useOpsText
} from "./shared";

const GPS_PREF_KEY = "midyaf.captain.gps";

function readGpsPref(): boolean | null {
  try {
    const raw = window.localStorage.getItem(GPS_PREF_KEY);
    return raw === null ? null : raw === "on";
  } catch {
    return null;
  }
}

export function CaptainsApp({
  data,
  session,
  isDemoMode,
  shareDriverLocation,
  updateTaskStatus
}: PortalProps) {
  const ui = useOpsText();
  const toast = useToast();
  const { socket } = useSocketContext();
  const event = data.events[0];
  // The signed-in captain on a real phone; the first captain on a demo login.
  const captain =
    data.drivers.find((d) => d.userId === session?.user.id) ?? data.drivers[0];
  const tasks = event.tasks.filter((task) => task.driverId === captain.id);
  const captainPhotoAsset = latestFileAsset(
    data.fileAssets,
    "DRIVER_PHOTO",
    (asset) => asset.driverId === captain.id
  );

  // ── Real GPS ──────────────────────────────────────────────────────────
  // On shift → phone telemetry goes to the server, which runs the geofence
  // engine on it. Off by default while a directed demo owns the convoys.
  const onShift = captain.status !== "OFFLINE" && captain.active !== false;
  const [gpsPref, setGpsPref] = useState<boolean | null>(() => readGpsPref());
  const gpsWanted = gpsPref ?? !isDemoMode;
  const gpsEnabled = onShift && gpsWanted;
  const location = useLiveLocation({
    enabled: gpsEnabled,
    userId: session?.user.id,
    role: "DRIVER",
    driverId: captain.id,
    eventId: event.id,
    socket
  });
  const setGps = (on: boolean) => {
    setGpsPref(on);
    try {
      window.localStorage.setItem(GPS_PREF_KEY, on ? "on" : "off");
    } catch {
      // Preference is a convenience; losing it is harmless.
    }
  };

  const gpsState: "off" | "live" | "waiting" | "denied" = !gpsEnabled
    ? "off"
    : location.error
      ? "denied"
      : location.lat != null
        ? "live"
        : "waiting";
  const gpsMeta = {
    off: { tone: "neutral" as const, en: "Location off", ar: "الموقع متوقف" },
    waiting: {
      tone: "warn" as const,
      en: "Acquiring fix…",
      ar: "جارٍ تحديد الموقع…"
    },
    live: { tone: "ok" as const, en: "Location live", ar: "الموقع مباشر" },
    denied: {
      tone: "danger" as const,
      en: "Location denied",
      ar: "تم رفض الموقع"
    }
  }[gpsState];

  useEffect(() => {
    if (gpsState === "denied") {
      toast.warning(
        ui.p("Location permission denied", "تم رفض إذن الموقع"),
        ui.p(
          "Use “I'm at the gate” to report your position manually.",
          "استخدم «أنا عند البوابة» للإبلاغ عن موقعك يدوياً."
        )
      );
    }
    // Only when the state flips to denied.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gpsState]);

  const [manifestOpen, setManifestOpen] = useState(false);
  const [busyTask, setBusyTask] = useState<string | null>(null);
  const [walkin, setWalkin] = useState({
    name: "",
    destination: "Mandarin Oriental Al Faisaliah"
  });
  const [walkinBusy, setWalkinBusy] = useState(false);

  const openTasks = useMemo(
    () =>
      tasks.filter((t) => t.status !== "COMPLETED" && t.status !== "CANCELLED"),
    [tasks]
  );

  async function advance(task: Task, status: TaskStatus) {
    setBusyTask(task.id);
    try {
      await updateTaskStatus(task.id, status);
    } finally {
      setBusyTask(null);
    }
  }

  async function registerWalkin() {
    if (!walkin.name.trim() || !session) return;
    setWalkinBusy(true);
    try {
      await apiFetch("/operations/express-arrival", session.accessToken, {
        method: "POST",
        body: JSON.stringify({
          guestName: walkin.name.trim(),
          destination:
            walkin.destination.trim() || "Mandarin Oriental Al Faisaliah",
          driverId: captain.id,
          eventId: event.id,
          isVIP: true
        })
      });
      toast.success(
        ui.p("VIP walk-in registered", "تم تسجيل الضيف"),
        ui.p(
          "Trip assigned to your active queue.",
          "تمت إضافة الرحلة إلى قائمة مهامك."
        )
      );
      setWalkin((w) => ({ ...w, name: "" }));
    } catch {
      toast.alert(ui.p("Failed to register walk-in", "تعذر تسجيل الضيف"));
    } finally {
      setWalkinBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <PortalHero
        badge={ui.l("Captains App")}
        title={ui.l(captain.user.name)}
        body={ui.l(
          "Shifts, tasks, car information, visit count, active status, overtime availability, and task feedback."
        )}
        action={
          <Button
            variant="outline"
            size="lg"
            className="h-11"
            leadingIcon={<ListChecks className="size-4" />}
            onClick={() => setManifestOpen(true)}
          >
            {ui.p("Manifest", "البيان")}
          </Button>
        }
      />

      {/* Location strip: state pill, live toggle, manual fallback. 44px targets. */}
      <Card
        padding="sm"
        tone={
          gpsState === "live" ? "ok" : gpsState === "denied" ? "danger" : "none"
        }
      >
        <div className="flex flex-wrap items-center gap-3">
          <span
            className={cn(
              "grid size-10 shrink-0 place-items-center rounded-lg",
              gpsState === "live"
                ? "bg-ok/10 text-ok"
                : "bg-surface-3 text-ink-muted"
            )}
          >
            {gpsState === "live" ? (
              <LocateFixed className="size-4" />
            ) : (
              <LocateOff className="size-4" />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={gpsMeta.tone} dot={gpsState === "live"}>
                {ui.isArabic ? gpsMeta.ar : gpsMeta.en}
              </Badge>
              {gpsState === "live" && location.speed != null ? (
                <span className="font-tnum text-xs text-ink-muted" dir="ltr">
                  {Math.round(location.speed * 3.6)} {ui.p("km/h", "كم/س")}
                  {location.accuracy
                    ? ` · ±${Math.round(location.accuracy)} m`
                    : ""}
                </span>
              ) : null}
            </div>
            <p className="mt-0.5 text-xs text-ink-muted">
              {onShift
                ? ui.p(
                    "Your phone's position feeds the geofence rings and the War Room.",
                    "موقع هاتفك يغذّي حلقات النطاق الجغرافي وغرفة العمليات."
                  )
                : ui.p(
                    "You are off shift; tracking is paused.",
                    "أنت خارج المناوبة؛ التتبع متوقف."
                  )}
            </p>
          </div>
          <Switch
            checked={gpsWanted}
            onCheckedChange={setGps}
            disabled={!onShift}
            label={ui.p("Share live", "مشاركة مباشرة")}
            className="h-11"
          />
          <Button
            variant="gold"
            size="lg"
            className="h-11"
            leadingIcon={<Navigation className="size-4" />}
            onClick={() => void shareDriverLocation(captain.id)}
          >
            {ui.p("I'm at the gate", "أنا عند البوابة")}
          </Button>
        </div>
      </Card>

      <div className="grid gap-3 grid-cols-2 xl:grid-cols-4">
        <KpiTile
          label={ui.l("Shift")}
          value={`${ui.time(captain.shiftStart ?? event.date)}–${ui.time(captain.shiftEnd ?? event.date)}`}
          format="raw"
          detail={
            captain.overtimeAvailable
              ? ui.l("Overtime available")
              : ui.l("No overtime")
          }
          icon={<Clock className="size-4" />}
        />
        <KpiTile
          label={ui.l("Visits")}
          value={captain.visitsCompleted ?? 0}
          format="number"
          detail={ui.l("Today")}
          icon={<MapPin className="size-4" />}
        />
        <KpiTile
          label={ui.p("Open tasks", "مهام مفتوحة")}
          value={openTasks.length}
          format="number"
          detail={`${tasks.length} ${ui.p("assigned", "مسندة")}`}
          icon={<ListChecks className="size-4" />}
        />
        <KpiTile
          label={ui.l("Car")}
          value={captain.licenseNo}
          format="raw"
          detail={ui.l(captain.zone)}
          icon={<Car className="size-4" />}
        />
      </div>

      <Section
        title={ui.p("Airport walk-in express pickup", "ركوب مباشر من المطار")}
        description={ui.p(
          "Register an unannounced VIP arriving at the gate without a reservation.",
          "تسجيل ضيف VIP وصل إلى البوابة دون حجز مسبق."
        )}
      >
        <form
          className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            void registerWalkin();
          }}
        >
          <Field label={ui.p("VIP guest name", "اسم الضيف")} required>
            <Input
              value={walkin.name}
              onChange={(e) =>
                setWalkin((w) => ({ ...w, name: e.target.value }))
              }
              placeholder={ui.p("e.g. Delegation aide", "مثال: مرافق الوفد")}
              className="h-11"
              required
            />
          </Field>
          <Field label={ui.p("Destination venue", "الوجهة")} required>
            <Input
              value={walkin.destination}
              onChange={(e) =>
                setWalkin((w) => ({ ...w, destination: e.target.value }))
              }
              className="h-11"
              required
            />
          </Field>
          <Button
            type="submit"
            variant="gold"
            size="lg"
            className="h-11"
            loading={walkinBusy}
            leadingIcon={<Zap className="size-4" />}
          >
            {ui.p("Start VIP trip", "بدء رحلة VIP")}
          </Button>
        </form>
      </Section>

      <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <Section title={ui.l("Task routes and feedback")}>
          <div className="space-y-3">
            {tasks.length === 0 ? (
              <p className="text-sm text-ink-muted">
                {ui.p("No tasks assigned yet.", "لا توجد مهام مسندة بعد.")}
              </p>
            ) : null}
            {tasks.map((task) => (
              <CaptainTaskCard
                key={task.id}
                task={task}
                guestPhoto={latestFileAsset(
                  data.fileAssets,
                  "GUEST_PHOTO",
                  (asset) => asset.guestId === task.guestId
                )}
                busy={busyTask === task.id}
                translate={ui.l}
                formatTime={ui.time}
                onAdvance={(status) => void advance(task, status)}
              />
            ))}
          </div>
        </Section>

        <div className="space-y-4">
          <Section title={ui.l("Captain media")}>
            <div className="flex items-center gap-3">
              <img
                src={captainPhotoAsset?.url ?? "/midyaf-logo.jpeg"}
                alt={ui.l(captain.user.name)}
                className="size-16 rounded-lg object-cover"
              />
              <div className="min-w-0">
                <p className="truncate font-semibold text-ink">
                  {ui.l(captain.user.name)}
                </p>
                <p className="mt-1 text-xs text-ink-muted">
                  {captainPhotoAsset
                    ? assetFileName(captainPhotoAsset)
                    : ui.l("No uploaded driver photo yet")}
                </p>
              </div>
            </div>
          </Section>

          <DeliveryLog
            title={ui.l("Delivery notifications")}
            notifications={data.notifications
              .filter((notification) => notification.userId === captain.userId)
              .slice(0, 4)}
            users={data.users}
          />

          <RiyadhMap
            event={event}
            drivers={[captain]}
            tasks={tasks}
            height="h-[320px]"
          />
        </div>
      </div>

      <Sheet
        open={manifestOpen}
        onOpenChange={setManifestOpen}
        title={ui.p("Captain manifest", "بيان الكابتن")}
        description={ui.p(
          "Present this code at the curbside desk; it lists every guest on your run.",
          "اعرض هذا الرمز عند مكتب الرصيف؛ يتضمن كل ضيف على رحلتك."
        )}
        closeLabel={ui.p("Close", "إغلاق")}
      >
        <div className="flex flex-col items-center gap-4">
          <QrCode
            value={`midyaf:captain:${captain.id}:${event.id}`}
            size={180}
            label={ui.l(captain.user.name)}
          />
          <ul className="w-full divide-y divide-hairline rounded-lg border border-hairline">
            {tasks.map((task) => (
              <li key={task.id} className="flex items-center gap-3 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink">
                    {task.guest ? ui.l(task.guest.user.name) : ui.l(task.type)}
                  </p>
                  <p className="truncate text-xs text-ink-muted">
                    {ui.l(task.pickupLocation)} → {ui.l(task.dropoffLocation)} ·{" "}
                    {ui.time(task.scheduledAt)}
                  </p>
                </div>
                <StatusPill status={task.status} size="sm" />
              </li>
            ))}
            {tasks.length === 0 ? (
              <li className="px-3 py-4 text-center text-sm text-ink-muted">
                {ui.p("No guests on this run.", "لا يوجد ضيوف على هذه الرحلة.")}
              </li>
            ) : null}
          </ul>
        </div>
      </Sheet>
    </div>
  );
}

function CaptainTaskCard({
  task,
  guestPhoto,
  busy,
  translate,
  formatTime,
  onAdvance
}: {
  task: Task;
  guestPhoto?: FileAsset;
  busy: boolean;
  translate: (value: string | number | null | undefined) => string;
  formatTime: (value: string) => string;
  onAdvance: (status: TaskStatus) => void;
}) {
  // The forward step is the big button; delays/cancels stay secondary.
  const next = nextTaskStatuses(task.status);
  const primary = next.find((s) => s !== "DELAYED" && s !== "CANCELLED");
  const secondary = next.filter((s) => s !== primary);
  return (
    <Card
      padding="sm"
      tone={
        task.status === "DELAYED"
          ? "danger"
          : task.status === "EN_ROUTE"
            ? "ok"
            : "none"
      }
    >
      <div className="flex gap-3">
        <img
          src={guestPhoto?.url ?? "/midyaf-logo.jpeg"}
          alt={translate(task.guest?.user.name ?? "Guest")}
          className="size-14 shrink-0 rounded-lg object-cover"
        />
        <div className="min-w-0 flex-1">
          <StatusPill
            status={task.status}
            size="sm"
            live={task.status === "EN_ROUTE"}
          />
          <h3 className="mt-2 text-sm font-bold text-ink">
            {translate(task.pickupLocation)} → {translate(task.dropoffLocation)}
          </h3>
          <p className="mt-0.5 text-xs text-ink-muted">
            {task.guest ? `${translate(task.guest.user.name)} · ` : ""}
            {translate("Deadline")}{" "}
            {formatTime(task.deadlineAt ?? task.scheduledAt)}
          </p>
        </div>
      </div>
      {next.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {primary ? (
            <Button
              variant="gold"
              size="lg"
              className="h-11 flex-1"
              loading={busy}
              onClick={() => onAdvance(primary)}
            >
              {translate(statusActionLabel(primary))}
            </Button>
          ) : null}
          {secondary.map((s) => (
            <Button
              key={s}
              variant={s === "CANCELLED" ? "danger" : "primary"}
              size="lg"
              className="h-11"
              disabled={busy}
              onClick={() => onAdvance(s)}
            >
              {translate(statusActionLabel(s))}
            </Button>
          ))}
        </div>
      ) : null}
    </Card>
  );
}

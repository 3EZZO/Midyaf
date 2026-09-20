// Captain (driver) field app.
// Extracted verbatim from OperationsPortals.tsx (Phase 1 split).
import { Car, Clock, MapPin, Zap } from "lucide-react";
import { Badge } from "../../components/Badge";
import { MetricCard } from "../../components/MetricCard";
import { RiyadhMap } from "../../components/map";
import { Section } from "../../components/Section";
import type { PortalProps } from "../types";
import type { FileAsset, Task } from "@shared/domain";
import { DeliveryLog, PortalHero, assetFileName, latestFileAsset, useOpsText } from "./shared";

import { useToast } from "../../components/ui/Toast";
export function CaptainsApp({
  data,
  shareDriverLocation,
  updateTaskStatus
}: PortalProps) {
  const ui = useOpsText();
  const toast = useToast();
  const event = data.events[0];
  const captain = data.drivers[0];
  const tasks = event.tasks.filter((task) => task.driverId === captain.id);
  const captainPhotoAsset = latestFileAsset(
    data.fileAssets,
    "DRIVER_PHOTO",
    (asset) => asset.driverId === captain.id
  );

  return (
    <div className="space-y-4">
      <PortalHero
        badge={ui.l("Captains App")}
        title={ui.l(captain.user.name)}
        body={ui.l(
          "Shifts, tasks, car information, visit count, active status, overtime availability, and task feedback."
        )}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <MetricCard
          label={ui.l("Shift")}
          value={`${ui.time(captain.shiftStart ?? event.date)}-${ui.time(
            captain.shiftEnd ?? event.date
          )}`}
          detail={
            captain.overtimeAvailable
              ? ui.l("Overtime available")
              : ui.l("No overtime")
          }
          icon={<Clock size={17} />}
        />
        <MetricCard
          label={ui.l("Visits")}
          value={captain.visitsCompleted ?? 0}
          detail={ui.l("Today")}
          icon={<MapPin size={17} />}
        />
        <MetricCard
          label={ui.l("Car")}
          value={ui.p("GMC Yukon", "جي إم سي يوكن")}
          detail={`${captain.licenseNo} · ${ui.l(captain.zone)}`}
          icon={<Car size={17} />}
        />
      </div>

      <section className="rounded-xl bg-gradient-to-br from-slate-900 via-slate-900/95 to-slate-800 p-5 text-white border border-amber-400/30 shadow-[0_4px_20px_rgba(212, 175, 55,0.15)]">
        <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-3 mb-3">
          <div className="flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-lg bg-amber-400/20 text-amber-300 font-bold border border-amber-400/30">
              <Zap size={16} />
            </span>
            <div>
              <h3 className="text-sm font-bold text-white">
                Airport Walk-in Express Pickup (ركوب مباشر من المطار)
              </h3>
              <p className="text-xs text-slate-300">
                Register unannounced VIP arriving at gate without prior reservation
              </p>
            </div>
          </div>
        </div>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const nameInput = form.elements.namedItem("walkinName") as HTMLInputElement;
            const destInput = form.elements.namedItem("walkinDest") as HTMLInputElement;
            if (!nameInput.value.trim() || !event || !captain) return;
            try {
              const stored = window.localStorage.getItem("midyaf.session");
              const token = stored ? JSON.parse(stored).accessToken : "";
              const res = await fetch("/api/operations/express-arrival", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                  guestName: nameInput.value.trim(),
                  destination: destInput.value.trim() || "Mandarin Oriental Al Faisaliah",
                  driverId: captain.id,
                  eventId: event.id,
                  isVIP: true
                })
              });
              if (res.ok) {
                toast.success(ui.p("VIP walk-in registered", "تم تسجيل الضيف"), ui.p("Trip assigned to your active queue.", "تمت إضافة الرحلة إلى قائمة مهامك."));
                nameInput.value = "";
              } else {
                toast.alert(ui.p("Failed to register walk-in", "تعذر تسجيل الضيف"));
              }
            } catch (err) {
              toast.alert(ui.p("Error registering walk-in", "حدث خطأ أثناء تسجيل الضيف"));
            }
          }}
          className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] items-end"
        >
          <div>
            <label className="block text-xs font-semibold text-amber-300/80 mb-1">
              VIP Guest Name (اسم الضيف) *
            </label>
            <input
              name="walkinName"
              type="text"
              required
              placeholder="e.g. Mr. French Delegation Aide"
              className="w-full px-3 py-2 rounded-lg bg-slate-950/80 border border-amber-500/30 text-white text-xs placeholder-slate-500 focus:outline-none focus:border-amber-400"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-amber-300/80 mb-1">
              Destination Venue (الوجهة) *
            </label>
            <input
              name="walkinDest"
              type="text"
              required
              defaultValue="Mandarin Oriental Al Faisaliah"
              className="w-full px-3 py-2 rounded-lg bg-slate-950/80 border border-amber-500/30 text-white text-xs placeholder-slate-500 focus:outline-none focus:border-amber-400"
            />
          </div>
          <button
            type="submit"
            className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 font-bold text-slate-950 text-xs shadow-md transition-all h-[34px]"
          >
            <Zap size={14} className="fill-current" />
            <span>{ui.p("Start VIP Trip", "بدء رحلة VIP")}</span>
          </button>
        </form>
      </section>

      <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <Section
          title={ui.l("Task routes and feedback")}
          action={
            <button
              onClick={() => void shareDriverLocation(captain.id)}
              className="btn-gold rounded-xl px-3 py-2 text-xs font-bold text-white"
            >
              {ui.l("Share location")}
            </button>
          }
        >
          <div className="space-y-3">
            {tasks.map((task) => (
              <CaptainTaskCard
                key={task.id}
                task={task}
                guestPhoto={latestFileAsset(
                  data.fileAssets,
                  "GUEST_PHOTO",
                  (asset) => asset.guestId === task.guestId
                )}
                translate={ui.l}
                formatTime={ui.time}
                onComplete={() => void updateTaskStatus(task.id, "COMPLETED")}
              />
            ))}
          </div>
        </Section>

        <div className="space-y-4">
          <Section title={ui.l("Captain media")}>
            <div className="flex items-center gap-3 rounded-lg bg-slate-50 p-4">
              <img
                src={captainPhotoAsset?.url ?? "/midyaf-logo.jpeg"}
                alt={ui.l(captain.user.name)}
                className="size-16 rounded-lg object-cover"
              />
              <div>
                <p className="font-semibold text-slate-900 dark:text-white">
                  {ui.l(captain.user.name)}
                </p>
                <p className="mt-1 text-xs text-slate-500">
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

          <RiyadhMap event={event} drivers={data.drivers} tasks={tasks} />
        </div>
      </div>
    </div>
  );
}

function CaptainTaskCard({
  task,
  guestPhoto,
  translate,
  formatTime,
  onComplete
}: {
  task: PortalProps["data"]["events"][number]["tasks"][number];
  guestPhoto?: FileAsset;
  translate: (value: string | number | null | undefined) => string;
  formatTime: (value: string) => string;
  onComplete: () => void;
}) {
  return (
    <div className="rounded-lg border border-white/5 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 gap-3">
          <img
            src={guestPhoto?.url ?? "/midyaf-logo.jpeg"}
            alt={translate(task.guest?.user.name ?? "Guest")}
            className="size-14 rounded-lg object-cover"
          />
          <div>
            <Badge tone={task.status === "DELAYED" ? "red" : "purple"}>
              {translate(task.status)}
            </Badge>
            <h3 className="mt-3 font-bold text-slate-900 dark:text-white">
              {translate(task.pickupLocation)} {translate("to")}{" "}
              {translate(task.dropoffLocation)}
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              {translate("Deadline")}{" "}
              {formatTime(task.deadlineAt ?? task.scheduledAt)}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {guestPhoto
                ? translate("Guest photo ready")
                : translate("Guest photo not uploaded yet")}
            </p>
          </div>
        </div>
        <button
          onClick={onComplete}
          className="rounded-lg bg-midyaf-purple px-3 py-2 text-xs font-bold text-white"
        >
          {translate("Complete")}
        </button>
      </div>
    </div>
  );
}

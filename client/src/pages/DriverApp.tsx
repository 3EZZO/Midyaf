import { useMemo, useState } from "react";
import { Banknote, CheckCircle2, Clock, Map, Navigation, Zap, ShieldAlert, ShieldCheck, Radar, Target, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "../components/Badge";
import { MetricCard } from "../components/MetricCard";
import { Section } from "../components/Section";
import { RiyadhMap } from "../components/RiyadhMap";
import { money, shortTime } from "../lib/format";
import { useLiveLocation } from "../lib/useLiveLocation";
import { isArabicLanguage, localizeStatus, localizeText } from "../lib/localize";
import { tacticalAudio } from "../lib/tacticalAudio";
import type { PortalProps } from "./types";

export function DriverApp({
  data,
  updateTaskStatus,
  shareDriverLocation
}: PortalProps) {
  const { t, i18n } = useTranslation();
  const isArabic = isArabicLanguage(i18n.language);
  const event = data.events[0];
  const driver = data.drivers[0];
  const tasks = useMemo(
    () =>
      event.tasks.filter(
        (task) => task.driverId === driver.id || task.status === "PENDING"
      ),
    [driver.id, event.tasks]
  );

  const [gpsEnabled, setGpsEnabled] = useState(true);
  const [geofenceStage, setGeofenceStage] = useState<"OUTSIDE" | "OUTER_APPROACH" | "STAGING_HOLD" | "CURBSIDE_GATE" | "DOCKED_BAY">("CURBSIDE_GATE");
  const [geofenceAlert, setGeofenceAlert] = useState<string | null>(null);
  const [isTriggeringHandshake, setIsTriggeringHandshake] = useState(false);

  const locationState = useLiveLocation({
    enabled: gpsEnabled,
    userId: driver?.user?.id,
    role: "DRIVER",
    driverId: driver?.id,
    eventId: event?.id
  });

  const triggerCurbsideHandshake = async () => {
    setIsTriggeringHandshake(true);
    tacticalAudio.playChime();
    try {
      const stored = window.localStorage.getItem("midyaf.session");
      const token = stored ? JSON.parse(stored).accessToken : "";
      const res = await fetch("/api/operations/geofences/simulate-handshake", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          driverId: driver?.id ?? "driver-sultan",
          driverName: driver?.user?.name ?? "Capt. Sultan Al-Otaibi",
          geofenceCode: "KKIA_ROYAL_T5"
        })
      });
      if (res.ok) {
        tacticalAudio.playTacticalPing();
        setGeofenceStage("DOCKED_BAY");
        setGeofenceAlert(
          isArabic
            ? "تم التحقق من السياج الجغرافي: أنت الآن على رصيف كبار الشخصيات (الصالة الملكية بمطار الملك خالد) — تم إشعار الضيف والمراسم تلقائياً!"
            : "Geofence Verified: You are at KKIA Royal Terminal Curbside (Bay #1) — VIP Guest & Protocol Escort automatically notified!"
        );
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsTriggeringHandshake(false);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
      <div className="space-y-4">
        <div className={`flex items-center justify-between rounded-xl px-4 py-3 text-white shadow-md transition-all ${
          locationState.tracking ? "bg-gradient-to-r from-emerald-600 to-teal-700" : "bg-gradient-to-r from-slate-700 to-slate-800"
        }`}>
          <div className="flex items-center gap-2.5">
            <span className={`size-3 rounded-full ${locationState.tracking ? "bg-emerald-300 animate-ping" : "bg-slate-400"}`} />
            <div>
              <p className="text-xs font-bold tracking-wide uppercase">
                {locationState.tracking
                  ? (isArabic ? "التتبع التلقائي المباشر (GPS) نشط" : "Live GPS Auto-Tracking Active")
                  : (isArabic ? "تتبع الموقع (GPS) غير متصل" : "GPS Tracking Offline")}
              </p>
              <p className="text-[11px] text-white/80">
                {locationState.tracking
                  ? `Lat: ${locationState.lat?.toFixed(4)} · Lng: ${locationState.lng?.toFixed(4)} · Acc: ±${Math.round(locationState.accuracy ?? 0)}m`
                  : locationState.error ?? (isArabic ? "انقر للتبديل وتفعيل بث الموقع المباشر" : "Click toggle to enable real-time location streaming")}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setGpsEnabled(!gpsEnabled)}
              className="rounded-lg bg-white/20 px-3 py-1.5 text-xs font-bold hover:bg-white/30 transition-colors"
            >
              {gpsEnabled ? (isArabic ? "إيقاف" : "Turn Off") : (isArabic ? "تشغيل" : "Turn On")}
            </button>
          </div>
        </div>

        {/* Sovereign Concentric Geofence Curbside Staging Card */}
        <section className="rounded-xl bg-gradient-to-br from-slate-900 via-slate-900/95 to-slate-800 p-4 text-white border border-emerald-500/30 shadow-[0_4px_20px_rgba(16,185,129,0.15)]">
          <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-3 mb-3">
            <div className="flex items-center gap-2.5">
              <span className="flex size-8 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/40">
                <Radar size={16} className="animate-pulse" />
              </span>
              <div>
                <h3 className="text-xs font-black uppercase tracking-wider text-midyaf-gold flex items-center gap-2">
                  <span>{isArabic ? "السياج الجغرافي الذكي لمطار الملك خالد" : "KKIA Smart Curbside Geofence"}</span>
                  <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[9px] text-emerald-300 font-mono">
                    {geofenceStage === "DOCKED_BAY"
                      ? (isArabic ? "مُرسَى بالرصيف" : "Docked")
                      : (isArabic ? "نطاق الرصيف ٢٥٠م" : "Curbside 250m")}
                  </span>
                </h3>
                <p className="text-[11px] text-slate-300">
                  {isArabic
                    ? "رصد تلقائي لوصول الموكب إلى الصالة الملكية بدون تدخل يدوي"
                    : "Autonomous VIP arrival detection & zero-touch curbside handshake"}
                </p>
              </div>
            </div>

            <button
              type="button"
              disabled={isTriggeringHandshake}
              onClick={triggerCurbsideHandshake}
              className="rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 px-3 py-1.5 text-xs font-black transition active:scale-95 disabled:opacity-50 flex items-center gap-1.5 cursor-pointer shadow-md"
            >
              <Target size={13} />
              <span>
                {isTriggeringHandshake
                  ? (isArabic ? "جارٍ الربط..." : "Handshaking...")
                  : (isArabic ? "تأكيد مصافحة الرصيف" : "Trigger Handshake")}
              </span>
            </button>
          </div>

          {/* Concentric 4-Stage Progress Pills */}
          <div className="grid grid-cols-4 gap-1.5 text-[10px] font-mono text-center">
            <div className={`p-1 rounded border transition-colors ${
              ["OUTER_APPROACH", "STAGING_HOLD", "CURBSIDE_GATE", "DOCKED_BAY"].includes(geofenceStage)
                ? "bg-sky-500/20 border-sky-400 text-sky-200 font-bold"
                : "bg-white/5 border-white/5 text-slate-500"
            }`}>
              {isArabic ? "اقتراب ٥ كم" : "Appr. 5km"}
            </div>
            <div className={`p-1 rounded border transition-colors ${
              ["STAGING_HOLD", "CURBSIDE_GATE", "DOCKED_BAY"].includes(geofenceStage)
                ? "bg-amber-500/20 border-amber-400 text-amber-200 font-bold"
                : "bg-white/5 border-white/5 text-slate-500"
            }`}>
              {isArabic ? "اصطفاف ١.٥ كم" : "Stage 1.5km"}
            </div>
            <div className={`p-1 rounded border transition-colors ${
              ["CURBSIDE_GATE", "DOCKED_BAY"].includes(geofenceStage)
                ? "bg-emerald-500/20 border-emerald-400 text-emerald-200 font-bold"
                : "bg-white/5 border-white/5 text-slate-500"
            }`}>
              {isArabic ? "رصيف ٣٠٠ م" : "Curb 300m"}
            </div>
            <div className={`p-1 rounded border transition-colors ${
              geofenceStage === "DOCKED_BAY"
                ? "bg-midyaf-gold/30 border-midyaf-gold text-amber-200 font-bold animate-pulse"
                : "bg-white/5 border-white/5 text-slate-500"
            }`}>
              {isArabic ? "إرساء ٥٠ م" : "Dock 50m"}
            </div>
          </div>

          {geofenceAlert && (
            <div className="mt-2.5 rounded-lg bg-emerald-500/15 border border-emerald-500/40 p-2 text-[11px] text-emerald-200 flex items-center gap-2 animate-fadeIn">
              <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />
              <span>{geofenceAlert}</span>
            </div>
          )}
        </section>

        <section className="rounded-lg bg-midyaf-purple p-5 text-white shadow-luxury">
          <Badge tone="gold">{t("driver.title")}</Badge>
          <h1 className="mt-4 text-2xl font-bold">{driver.user.name}</h1>
          <p className="mt-2 text-sm text-white/70">
            {localizeText(driver.zone, isArabic)} · {driver.licenseNo}
          </p>
        </section>

        <div className="grid gap-4 sm:grid-cols-3">
          <MetricCard
            label={t("driver.shift")}
            value={`${shortTime(driver.shiftStart ?? event.date, i18n.language)}-${shortTime(
              driver.shiftEnd ?? event.date,
              i18n.language
            )}`}
            detail={localizeStatus(driver.status, isArabic)}
            icon={<Clock size={17} />}
          />
          <MetricCard
            label={t("driver.earnings")}
            value={money(driver.earnings ?? 0)}
            detail={isArabic ? "اليوم" : "Today"}
            icon={<Banknote size={17} />}
          />
          <MetricCard
            label={t("common.status")}
            value={tasks.length}
            detail={isArabic ? "المهام المسندة" : "Open assignments"}
            icon={<CheckCircle2 size={17} />}
          />
        </div>

        <section className="rounded-xl bg-gradient-to-br from-slate-900 via-slate-900/95 to-slate-800 p-5 text-white border border-amber-400/30 shadow-[0_4px_20px_rgba(201,168,76,0.15)]">
          <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-3 mb-3">
            <div className="flex items-center gap-2.5">
              <span className="flex size-8 items-center justify-center rounded-lg bg-amber-400/20 text-amber-300 font-bold border border-amber-400/30">
                <Zap size={16} />
              </span>
              <div>
                <h3 className="text-sm font-bold text-white">
                  Airport Walk-in Express Pickup (ركوب مباشر من المطار)
                </h3>
                <p className="text-[11px] text-slate-300">
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
              if (!nameInput.value.trim() || !event || !driver) return;
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
                    driverId: driver.id,
                    eventId: event.id,
                    isVIP: true
                  })
                });
                if (res.ok) {
                  alert("VIP Walk-in Registered! Trip assigned to your active queue.");
                  nameInput.value = "";
                } else {
                  alert("Failed to register walk-in");
                }
              } catch (err) {
                alert("Error registering walk-in");
              }
            }}
            className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] items-end"
          >
            <div>
              <label className="block text-[11px] font-semibold text-amber-300/80 mb-1">
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
              <label className="block text-[11px] font-semibold text-amber-300/80 mb-1">
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
              <span>{isArabic ? "بدء رحلة VIP" : "Start VIP Trip"}</span>
            </button>
          </form>
        </section>

        <Section
          title={t("common.transport")}
          action={
            <button
              onClick={() => void shareDriverLocation(driver.id)}
              className="rounded-lg bg-midyaf-purple px-3 py-2 text-xs font-bold text-white"
            >
              {t("common.shareLocation")}
            </button>
          }
        >
          <div className="space-y-3">
            {tasks.map((task) => (
              <article
                key={task.id}
                className="rounded-lg border border-slate-200 bg-white p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <Badge tone={task.status === "DELAYED" ? "red" : "purple"}>
                      {localizeStatus(task.status, isArabic)}
                    </Badge>
                    <h3 className="mt-3 font-bold text-midyaf-ink">
                      {localizeText(task.type, isArabic)}
                    </h3>
                    <p className="text-sm text-slate-500">
                      {shortTime(task.scheduledAt, i18n.language)}
                    </p>
                  </div>
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&origin=${driver.currentLat},${driver.currentLng}&destination=${task.dropoffLat},${task.dropoffLng}`}
                    target="_blank"
                    rel="noreferrer"
                    className="grid size-11 place-items-center rounded-lg bg-midyaf-gold text-white"
                    aria-label={t("driver.nav")}
                  >
                    <Navigation size={19} />
                  </a>
                </div>
                <div className="mt-4 grid gap-3 text-sm md:grid-cols-2">
                  <p className="rounded-lg bg-slate-50 p-3">
                    <span className="block text-xs text-slate-500">{isArabic ? "نقطة الركوب" : "Pickup"}</span>
                    {task.pickupLocation}
                  </p>
                  <p className="rounded-lg bg-slate-50 p-3">
                    <span className="block text-xs text-slate-500">{isArabic ? "نقطة الوصول" : "Dropoff"}</span>
                    {task.dropoffLocation}
                  </p>
                </div>
                {(() => {
                  const rider = data.hospitalityRiders?.find((r) => r.guestId === task.guestId);
                  if (!rider) return null;
                  return (
                    <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50/90 p-3 text-xs text-amber-900 shadow-sm dark:bg-amber-950/40 dark:text-amber-200">
                      <div className="flex items-center justify-between font-bold text-amber-800 dark:text-amber-300 mb-1.5">
                        <span className="flex items-center gap-1.5">
                          <ShieldAlert size={14} className="text-amber-600 dark:text-amber-400 shrink-0" />
                          <span>{isArabic ? "اشتراطات الضيافة لكبار الشخصيات (المركبة والبروتوكول)" : "VIP Hospitality Rider (Vehicle & Protocol)"}</span>
                        </span>
                        <span className="rounded bg-amber-200 px-1.5 py-0.5 text-[10px] uppercase text-amber-900">{isArabic ? "أولوية قصوى" : "VIP Priority"}</span>
                      </div>
                      <ul className="list-disc start-4 space-y-1 text-[11px]">
                        {rider.vehicleRider?.map((item: string, idx: number) => (
                          <li key={idx} className="font-medium">{localizeText(item, isArabic)}</li>
                        ))}
                        {rider.securityNotes?.map((item: string, idx: number) => (
                          <li key={`sec-${idx}`} className="font-semibold text-red-700 dark:text-red-400 flex items-center gap-1.5">
                            <ShieldCheck size={12} className="inline text-red-500 shrink-0" />
                            <span>{localizeText(item, isArabic)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })()}
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    onClick={() => void updateTaskStatus(task.id, "PICKED_UP")}
                    className="rounded-lg border border-midyaf-purple px-3 py-2 text-xs font-bold text-midyaf-purple"
                  >
                    {t("driver.pickup")}
                  </button>
                  <button
                    onClick={() => void updateTaskStatus(task.id, "COMPLETED")}
                    className="rounded-lg bg-midyaf-purple px-3 py-2 text-xs font-bold text-white"
                  >
                    {t("driver.dropoff")}
                  </button>
                </div>
              </article>
            ))}
          </div>
        </Section>
      </div>

      <div className="space-y-4">
        <RiyadhMap event={event} drivers={data.drivers} tasks={tasks} />
        <Section title={isArabic ? "منظومة الملاحة والتوجيه" : "Navigation stack"}>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              [
                isArabic ? "ملاحة خرائط Google" : "Google Maps navigation",
                isArabic ? "روابط توجيه مباشرة جاهزة لكل مهمة." : "Driver deep links are ready per task."
              ],
              [
                isArabic ? "بث مباشر عبر Socket.IO" : "Socket.IO live sharing",
                isArabic ? "تحديثات الموقع المباشر تتدفق للمنظمين." : "Location updates stream to organizers."
              ],
              [
                isArabic ? "تنبيه التأخير الذكي" : "Delay alert",
                isArabic ? "توقف التحديث لمدة 5 دقائق يطلق تنبيهاً فورياً." : "No update for 5 minutes triggers alert:delay."
              ],
              [
                isArabic ? "توزيع المناطق في الرياض" : "Zone logic",
                isArabic ? "يتم البحث في نفس نطاق الرياض أولاً قبل التوسع." : "Same Riyadh zone is searched before expansion."
              ]
            ].map(([title, detail]) => (
              <div key={title} className="rounded-lg bg-slate-50 p-3">
                <Map className="mb-2 text-midyaf-purple" size={18} />
                <p className="font-semibold text-midyaf-ink">{title}</p>
                <p className="text-xs text-slate-500">{detail}</p>
              </div>
            ))}
          </div>
        </Section>
      </div>
    </div>
  );
}

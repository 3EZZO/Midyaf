// Hospitality rider and airport express sections (Coordinator + Logistics).
// Extracted verbatim from OperationsPortals.tsx (Phase 1 split).
import { useState } from "react";
import { Car, CheckCircle2, Crown, ShieldCheck, Zap, Utensils, Building, Monitor, Hotel } from "lucide-react";
import { Badge } from "../../components/Badge";
import { Section } from "../../components/Section";
import { apiFetch } from "../../lib/api";
import { localizeStatus } from "../../lib/localize";
import type { PortalProps } from "../types";
import type { Task } from "@shared/domain";
import { useOpsText } from "./shared";

export function HospitalityRidersSection({
  data,
  session,
  refreshData
}: {
  data: PortalProps["data"];
  session?: PortalProps["session"];
  refreshData?: () => Promise<void>;
}) {
  const ui = useOpsText();
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  async function toggleFulfilled(riderId: string, currentStatus: boolean) {
    if (!session?.accessToken) return;
    setUpdatingId(riderId);
    try {
      await fetch(`/api/riders/${riderId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.accessToken}`
        },
        body: JSON.stringify({ fulfilled: !currentStatus })
      });
      if (refreshData) await refreshData();
    } finally {
      setUpdatingId(null);
    }
  }

  const riders = data.hospitalityRiders ?? [];
  if (riders.length === 0) {
    return (
      <Section title="VIP Hospitality Riders & Protocols">
        <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">
          No VIP hospitality riders are currently registered for this event.
        </p>
      </Section>
    );
  }

  return (
    <div id="hospitality-riders" className="scroll-mt-6 transition-all duration-500 rounded-lg">
      <Section title="VIP Hospitality Riders & Protocols">
        <div className="grid gap-4 md:grid-cols-2">
        {riders.map((rider) => {
          const guest = data.events[0]?.guests.find((g) => g.id === rider.guestId);
          return (
            <div key={rider.id} className="rounded-xl border border-amber-200 bg-gradient-to-br from-white to-amber-50/40 p-5 shadow-card transition-all hover:shadow-sm dark:border-amber-900/50 dark:bg-dark-card">
              <div className="flex items-start justify-between gap-3 border-b border-amber-100 pb-3 dark:border-amber-900/30">
                <div>
                  <Badge tone="gold">{ui.p("VIP Platinum Protocol", "بروتوكول VIP البلاتيني")}</Badge>
                  <h3 className="mt-2 text-lg font-bold text-slate-900 dark:text-white dark:text-dark-primary">
                    {guest?.user.name ?? (ui.isArabic ? "ضيف VIP" : "VIP Guest")}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-dark-secondary">
                    {ui.p("Tier: ", "الفئة: ")}{guest?.tier ?? "Platinum"} · {localizeStatus(guest?.rsvpStatus ?? "CONFIRMED", ui.isArabic)}
                  </p>
                </div>
                <button
                  onClick={() => void toggleFulfilled(rider.id, rider.fulfilled)}
                  disabled={updatingId === rider.id}
                  className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition-all ${
                    rider.fulfilled
                      ? "bg-emerald-600 text-white shadow-sm hover:bg-emerald-700"
                      : "bg-amber-500 text-white shadow-sm hover:bg-amber-600"
                  }`}
                >
                  {updatingId === rider.id ? (
                    ui.p("Updating...", "جاري التحديث...")
                  ) : rider.fulfilled ? (
                    <span className="flex items-center gap-1">
                      <CheckCircle2 size={13} />
                      <span>{ui.p("Fulfilled", "تمت التلبية")} {rider.fulfilledBy ? (ui.isArabic ? `بواسطة ${rider.fulfilledBy}` : `by ${rider.fulfilledBy}`) : ""}</span>
                    </span>
                  ) : (
                    ui.p("Mark as Fulfilled", "تحديد كمكتمل ومُلبى")
                  )}
                </button>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2 text-xs">
                <div className="rounded-lg bg-white/80 p-3 shadow-sm border border-white/5 dark:bg-dark-surface dark:border-dark">
                  <p className="font-bold text-emerald-800 dark:text-emerald-400 mb-1 flex items-center gap-1.5">
                    <Utensils size={14} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span>{ui.p("Dietary Needs", "اشتراطات التغذية")}</span>
                  </p>
                  <ul className="list-disc start-4 space-y-1 text-slate-600 dark:text-slate-300">
                    {rider.dietaryNeeds?.map((item: string, i: number) => (
                      <li key={i}>{ui.l(item)}</li>
                    ))}
                  </ul>
                </div>

                <div className="rounded-lg bg-white/80 p-3 shadow-sm border border-white/5 dark:bg-dark-surface dark:border-dark">
                  <p className="font-bold text-purple-800 dark:text-purple-400 mb-1 flex items-center gap-1.5">
                    <Building size={14} className="text-purple-600 dark:text-purple-400 shrink-0" />
                    <span>{ui.p("Room Preferences", "تفضيلات الجناح")}</span>
                  </p>
                  <ul className="list-disc start-4 space-y-1 text-slate-600 dark:text-slate-300">
                    {rider.roomPreferences?.map((item: string, i: number) => (
                      <li key={i}>{ui.l(item)}</li>
                    ))}
                  </ul>
                </div>

                <div className="rounded-lg bg-white/80 p-3 shadow-sm border border-white/5 dark:bg-dark-surface dark:border-dark">
                  <p className="font-bold text-amber-800 dark:text-amber-400 mb-1 flex items-center gap-1.5">
                    <Car size={14} className="text-amber-600 dark:text-amber-400 shrink-0" />
                    <span>{ui.p("Vehicle & Transit", "المركبة والتنقل")}</span>
                  </p>
                  <ul className="list-disc start-4 space-y-1 text-slate-600 dark:text-slate-300">
                    {rider.vehicleRider?.map((item: string, i: number) => (
                      <li key={i}>{ui.l(item)}</li>
                    ))}
                  </ul>
                </div>

                <div className="rounded-lg bg-red-50/80 p-3 shadow-sm border border-red-100 dark:bg-red-950/20 dark:border-red-900/30">
                  <p className="font-bold text-red-800 dark:text-red-400 mb-1 flex items-center gap-1.5">
                    <ShieldCheck size={14} className="text-red-600 dark:text-red-400 shrink-0" />
                    <span>{ui.p("Security & Protocol", "الأمن والبروتوكول")}</span>
                  </p>
                  <ul className="list-disc start-4 space-y-1 text-red-700 dark:text-red-300">
                    {rider.securityNotes?.map((item: string, i: number) => (
                      <li key={i}>{ui.l(item)}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Section>
    </div>
  );
}

export function AirportExpressSection({
  data,
  session,
  refreshData
}: Pick<PortalProps, "data" | "session" | "refreshData">) {
  const ui = useOpsText();
  const event = data.events[0];
  const [isOpen, setIsOpen] = useState(false);
  const [isKioskMode, setIsKioskMode] = useState(false);
  const [guestName, setGuestName] = useState("");
  const [title, setTitle] = useState("");
  const [destination, setDestination] = useState("Mandarin Oriental Al Faisaliah");
  const [driverId, setDriverId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<{
    qrCode: string;
    guestName: string;
    driverName: string;
    driverPhone: string;
  } | null>(null);

  const availableDrivers = data.drivers.filter((d) => d.status === "AVAILABLE");

  async function handleExpressSubmit(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!guestName.trim() || !event || !session?.accessToken) return;

    setIsSubmitting(true);
    try {
      const res = await apiFetch<{
        ok: boolean;
        qrCode: string;
        guest: any;
        task: any;
      }>("/operations/express-arrival", session.accessToken, {
        method: "POST",
        body: JSON.stringify({
          guestName: guestName.trim(),
          title: title.trim() || undefined,
          destination: destination.trim(),
          driverId: driverId || undefined,
          eventId: event.id,
          isVIP: true
        })
      });

      const assignedDriver = data.drivers.find((d) => d.id === (res.task?.driverId || driverId));
      setResult({
        qrCode: res.qrCode,
        guestName: title ? `${title} - ${guestName}` : guestName,
        driverName: assignedDriver?.user.name || "Auto-assigned Nearest VIP Captain",
        driverPhone: assignedDriver?.user.phone || "+966 50 000 0000"
      });
      setGuestName("");
      setTitle("");
      refreshData();
    } catch (err: any) {
      alert(err.message || "Failed to register walk-in guest");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isKioskMode) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-950 p-6 text-white animate-fadeIn kiosk-bg">
        <button
          onClick={() => setIsKioskMode(false)}
          className="absolute top-6 right-6 rounded-full bg-white/10 px-4 py-2 text-sm font-bold text-white/80 backdrop-blur-md hover:bg-white/20 transition-all"
        >
          {ui.p("Exit Kiosk Mode", "خروج من وضع الكشك")}
        </button>
        <div className="max-w-xl w-full text-center space-y-6 bg-slate-900/80 p-8 rounded-xl border border-amber-500/30 shadow-[0_0_50px_rgba(212, 175, 55,0.15)] backdrop-blur-2xl">
          <div className="inline-flex p-4 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 mb-2">
            <Crown size={48} className="animate-pulse" />
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight bg-gradient-to-r from-amber-200 via-amber-400 to-amber-100 bg-clip-text text-transparent">
            مِضْيَافٌ | MIDYAF ROYAL RECEPTION
          </h1>
          <p className="text-slate-300 text-base sm:text-lg">
            {ui.p(
              "Welcome to the Sovereign Summit. Please enter your name or delegation title for instant Chauffeur & Escort dispatch.",
              "مرحباً بكم في القمة السيادية. يرجى إدخال الاسم أو الوفد لتجهيز سيارة الضيافة الفورية."
            )}
          </p>

          {result ? (
            <div className="p-6 rounded-lg bg-amber-500/10 border border-amber-500/40 text-left sm:text-center space-y-4 animate-scaleUp">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-bold border border-emerald-500/30">
                <Zap size={13} />
                <span>{ui.p("Chauffeur Dispatched Instantly", "تم توجيه السائق فورا")}</span>
              </div>
              <h3 className="text-xl font-bold text-amber-300">{result.guestName}</h3>
              <div className="p-4 rounded-xl bg-white/5 border border-white/10 flex flex-col items-center justify-center">
                <span className="text-xs text-slate-400 mb-1">{ui.p("Digital VIP Access QR", "رمز الدخول الملكي")}</span>
                <span className="font-mono text-xl sm:text-2xl font-black tracking-wider text-amber-400 bg-black/40 px-4 py-2 rounded-lg border border-amber-500/30">
                  {result.qrCode}
                </span>
              </div>
              <p className="text-sm text-slate-300 flex items-center justify-center gap-1.5">
                <Car size={15} className="text-midyaf-gold shrink-0" />
                <span>{ui.p("Assigned Captain:", "السائق المخصص:")} <strong className="text-white">{result.driverName}</strong> ({result.driverPhone})</span>
              </p>
              <button
                onClick={() => setResult(null)}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 font-bold text-slate-950 hover:brightness-110 transition-all shadow-lg shadow-amber-500/20"
              >
                {ui.p("Register Another VIP Arrival", "تسجيل وصول جديد")}
              </button>
            </div>
          ) : (
            <form onSubmit={handleExpressSubmit} className="space-y-4 text-left">
              <div>
                <label className="block text-xs font-bold text-amber-300/80 mb-1">
                  {ui.p("Guest Name / Delegation Title", "اسم الضيف / الوفد الملكي")} *
                </label>
                <input
                  type="text"
                  required
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  placeholder={ui.p("e.g. H.E. French Delegation Aide", "مثال: مساعد معالي الوزير")}
                  className="w-full px-4 py-3 border-r border-white/5 last:border-r-0 rounded-xl bg-slate-950/80 border border-amber-500/30 text-white placeholder-slate-500 focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400 transition-all"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-amber-300/80 mb-1">
                  {ui.p("Destination Venue / Hotel", "وجهة الضيافة / الفندق")} *
                </label>
                <input
                  type="text"
                  required
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                  className="w-full px-4 py-3 border-r border-white/5 last:border-r-0 rounded-xl bg-slate-950/80 border border-amber-500/30 text-white placeholder-slate-500 focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400 transition-all"
                />
              </div>
              <button
                type="submit"
                disabled={isSubmitting || !guestName.trim()}
                className="w-full py-4 rounded-xl bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600 font-black text-slate-950 text-lg hover:brightness-110 active:scale-95 transition-all shadow-xl shadow-amber-500/25 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <Car size={20} />
                <span>{isSubmitting ? ui.p("Dispatching...", "جارٍ التوجيه...") : ui.p("Request Royal Shuttle & Escort", "طلب سيارة ضيافة ومرافقة فورية")}</span>
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }

  return (
    <Section title="">
      <div id="airport-express" className="relative scroll-mt-6 transition-all duration-500 overflow-hidden rounded-lg bg-gradient-to-br from-slate-900 via-slate-900/95 to-slate-800 p-6 text-white border border-amber-400/30 shadow-[0_10px_30px_rgba(0,0,0,0.3)]">
        <div className="absolute top-0 right-0 -mt-10 -mr-10 h-40 w-40 rounded-full bg-amber-500/10 blur-3xl pointer-events-none" />
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-white/10 pb-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-amber-400/10 border border-amber-400/30 text-amber-400">
              <Crown size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-400/20 text-amber-300 border border-amber-400/30">
                  <Zap size={11} />
                  <span>{ui.p("INSTANT DISPATCH", "توجيه فوري")}</span>
                </span>
                <h3 className="text-lg font-bold text-white">
                  {ui.p("Airport Walk-in Express Intake", "تسجيل وصول المطار الفوري والتوجيه السريع")}
                </h3>
              </div>
              <p className="text-xs text-slate-300">
                {ui.p(
                  "Register unannounced VIP delegations arriving at KKIA or Royal Terminals in 3 seconds without prior credentials.",
                  "تسجيل وفود الشخصيات الهامة غير المجدولة القادمين في مطار الملك خالد أو الصالات الملكية بثوانٍ ومطابقة السائق فورا."
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={() => setIsKioskMode(true)}
              className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-bold text-white border border-white/15 transition-all"
            >
              <Monitor size={13} />
              <span>{ui.p("Kiosk Mode", "وضع شاشة الترحيب")}</span>
            </button>
            <button
              onClick={() => {
                setIsOpen(!isOpen);
                setResult(null);
              }}
              className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-xs font-black text-slate-950 shadow-md shadow-amber-500/20 transition-all"
            >
              {isOpen ? ui.p("Close Form", "إغلاق النموذج") : ui.p("New Walk-in VIP", "تسجيل وصول فوري")}
            </button>
          </div>
        </div>

        {isOpen && (
          <div className="mt-4 pt-2 animate-fadeIn">
            {result ? (
              <div className="p-5 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-amber-300 flex items-center gap-1.5">
                    <CheckCircle2 size={15} className="text-emerald-400" />
                    <span>{ui.p("VIP Walk-in Registered & Dispatched!", "تم تسجيل الضيف الملكي وتوجيه السائق بنجاح!")}</span>
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    {ui.p("Task Created", "تم إنشاء المهمة")}
                  </span>
                </div>
                <div className="grid sm:grid-cols-2 gap-3 text-sm">
                  <div className="p-3 rounded-lg bg-black/30 border border-white/5">
                    <span className="text-xs text-slate-400 block">{ui.p("Guest / Title", "الضيف / المنصب")}</span>
                    <strong className="text-white">{result.guestName}</strong>
                  </div>
                  <div className="p-3 rounded-lg bg-black/30 border border-white/5">
                    <span className="text-xs text-slate-400 block">{ui.p("Digital Access QR", "رمز الدخول الفوري")}</span>
                    <strong className="text-amber-400 font-mono tracking-wider">{result.qrCode}</strong>
                  </div>
                  <div className="p-3 rounded-lg bg-black/30 border border-white/5 sm:col-span-2">
                    <span className="text-xs text-slate-400 block">{ui.p("Assigned Chauffeur & Escort", "السائق الفوري المخصص")}</span>
                    <strong className="text-white">{result.driverName}</strong> <span className="text-slate-400">({result.driverPhone})</span>
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    onClick={() => setResult(null)}
                    className="px-4 py-2 rounded-lg bg-amber-400 font-bold text-slate-950 text-xs hover:bg-amber-300 transition-all"
                  >
                    + {ui.p("Register Another Walk-in", "تسجيل ضيف فوري آخر")}
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleExpressSubmit} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 items-end">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    {ui.p("Guest Name", "اسم الضيف")} *
                  </label>
                  <input
                    type="text"
                    required
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    placeholder={ui.p("e.g. H.E. Minister Aide", "مثال: مساعد معالي الوزير")}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950/60 border border-white/15 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-amber-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    {ui.p("Title / Delegation", "المنصب / الوفد")}
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder={ui.p("e.g. French VIP Delegation", "مثال: وفد وزارة الخارجية")}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950/60 border border-white/15 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-amber-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    {ui.p("Destination Venue", "وجهة التوصيل")} *
                  </label>
                  <input
                    type="text"
                    required
                    value={destination}
                    onChange={(e) => setDestination(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950/60 border border-white/15 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-amber-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    {ui.p("Assign Captain", "تخصيص الكابتن")}
                  </label>
                  <select
                    value={driverId}
                    onChange={(e) => setDriverId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950/60 border border-white/15 text-white text-sm focus:outline-none focus:border-amber-400"
                  >
                    <option value="">{ui.p("Auto-Assign Nearest Captain", "تخصيص تلقائي لأقرب كابتن")}</option>
                    {availableDrivers.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.user.name} ({d.zone})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-2 lg:col-span-4 flex justify-end pt-2">
                  <button
                    type="submit"
                    disabled={isSubmitting || !guestName.trim()}
                    className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600 hover:brightness-110 font-bold text-slate-950 text-sm shadow-lg shadow-amber-500/20 disabled:opacity-50 transition-all"
                  >
                    {isSubmitting ? ui.p("Registering & Dispatching...", "جارٍ التسجيل والتوجيه...") : ui.p("Submit & Dispatch Captain", "تسجيل وتوجيه السائق فورا")}
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
      </div>
    </Section>
  );
}

import { useState, useEffect, useMemo } from "react";
import {
  Shield,
  Plane,
  Car,
  Wind,
  Thermometer,
  Volume2,
  VolumeX,
  X,
  Compass,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  Radio,
  ExternalLink,
  Layers,
  Cpu,
  Clock,
  Eye,
  Crown
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Driver, Event, Task } from "@shared/domain";
import { isArabicLanguage, localizeText } from "../lib/localize";
import { tacticalAudio } from "../lib/tacticalAudio";
import { RiyadhMap } from "./RiyadhMap";

interface SovereignCommandBridgeProps {
  isOpen: boolean;
  onClose: () => void;
  event?: Event;
  drivers: Driver[];
  tasks: Task[];
}

interface FlightData {
  flightNo: string;
  airline: string;
  aircraft: string;
  origin: string;
  status: string;
  eta: string;
  gate: string;
  vipOnBoard: string;
}

interface ConvoyData {
  id: string;
  name: string;
  vip: string;
  vehicle: string;
  driver: string;
  speed: number;
  route: string;
  escort: string;
  status: string;
}

export function SovereignCommandBridge({
  isOpen,
  onClose,
  event,
  drivers,
  tasks
}: SovereignCommandBridgeProps) {
  const { t, i18n } = useTranslation();
  const isArabic = isArabicLanguage(i18n.language);
  const l = (val: string | number | null | undefined) => localizeText(val, isArabic);

  // Sound state
  const [isMuted, setIsMuted] = useState(tacticalAudio.isMuted());

  // Clock
  const [currentTime, setCurrentTime] = useState(new Date());

  // Active contingency scenario
  const [activeScenario, setActiveScenario] = useState<string | null>(null);
  const [scenarioLog, setScenarioLog] = useState<string[]>([]);

  // Selected VIP for holographic dossier
  const [selectedVip, setSelectedVip] = useState<{
    name: string;
    title: string;
    org: string;
    clearance: string;
    chauffeur: string;
    vehicle: string;
    plate: string;
    location: string;
    rider: string[];
  } | null>(null);

  // Selected Driver for telemetry
  const [selectedDriver, setSelectedDriver] = useState<Driver | null>(null);

  // Real-time clock ticker
  useEffect(() => {
    if (!isOpen) return;
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, [isOpen]);

  // Keyboard shortcut: Escape to close
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        tacticalAudio.playTacticalPing();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Toggle Audio
  const toggleSound = () => {
    const next = tacticalAudio.toggleMute();
    setIsMuted(next);
  };

  // Mock Inbound Flights Data
  const flights: FlightData[] = useMemo(
    () => [
      {
        flightNo: "SV-1",
        airline: "Saudia Royal Flight",
        aircraft: "Airbus A340 VIP",
        origin: "Jeddah (JED)",
        status: isArabic ? "المسار النهائي للهبوط" : "Final Approach",
        eta: "4m",
        gate: isArabic ? "الصالة الملكية" : "Royal Terminal",
        vipOnBoard: "H.E. Yasir Al-Rumayyan"
      },
      {
        flightNo: "RX-101",
        airline: "Riyadh Air",
        aircraft: "Boeing 787-9",
        origin: "New York (JFK)",
        status: isArabic ? "هبطت بسلام · استلام الحقائب" : "Landed · Chauffeur Ready",
        eta: "0m",
        gate: "KKIA T2 (Gate 204)",
        vipOnBoard: "Jamie Dimon & Larry Fink"
      },
      {
        flightNo: "VP-BGS",
        airline: "Private Gulfstream",
        aircraft: "Gulfstream G650ER",
        origin: "London (FAB)",
        status: isArabic ? "متمركز بالمهبط الخاص 4" : "VIP Apron 4 Positioned",
        eta: "Ready",
        gate: isArabic ? "مهبط الطيران الخاص" : "Private Jet Apron",
        vipOnBoard: "Ray Dalio"
      },
      {
        flightNo: "EK-2022",
        airline: "Emirates VIP",
        aircraft: "Airbus A380",
        origin: "Dubai (DXB)",
        status: isArabic ? "في المجال الجوي للرياض" : "Inbound Airspace",
        eta: "14m",
        gate: "KKIA T2",
        vipOnBoard: "Noura Al Harbi & Delegation"
      }
    ],
    [isArabic]
  );

  // Active Convoys Data
  const convoys: ConvoyData[] = useMemo(
    () => [
      {
        id: "alpha",
        name: isArabic ? "موكب ألفا الدبلوماسي" : "Motorcade Alpha",
        vip: "H.E. Yasir Al-Rumayyan",
        vehicle: "Mercedes-Maybach S680",
        driver: "Capt. Sultan Al-Otaibi",
        speed: 118,
        route: "Airport Rd -> Ritz-Carlton",
        escort: isArabic ? "دورية بروتوكول ملكي 01" : "Diplomatic Escort 01",
        status: isArabic ? "مسار أخضر سالك" : "Secure Green Corridor"
      },
      {
        id: "bravo",
        name: isArabic ? "موكب برافو التنفيذي" : "Motorcade Bravo",
        vip: "Jamie Dimon",
        vehicle: "BMW 7-Series VIP",
        driver: "Capt. Fahad Al-Qahtani",
        speed: 84,
        route: "King Fahd Rd -> Kingdom Centre",
        escort: isArabic ? "مرافقة VIP خاصة" : "VIP Private Escort",
        status: isArabic ? "تحت الحماية والمراقبة" : "Escort Active"
      },
      {
        id: "charlie",
        name: isArabic ? "موكب تشارلي السيادي" : "Motorcade Charlie",
        vip: "Larry Fink",
        vehicle: "Mercedes-Maybach S680",
        driver: "Capt. Rakan Al-Dossary",
        speed: 96,
        route: "KKIA T2 -> KAFD Plenary",
        escort: isArabic ? "مرافقة دبلوماسية سريعة" : "Fast-Track Escort",
        status: isArabic ? "مسار ميسر" : "Optimal Route"
      },
      {
        id: "delta",
        name: isArabic ? "موكب دلتا الاقتصادي" : "Motorcade Delta",
        vip: "Ray Dalio",
        vehicle: "Lexus LS 500 Executive",
        driver: "Capt. Tariq Al-Ghamdi",
        speed: 72,
        route: "Northern Ring -> KAFD Loop",
        escort: isArabic ? "حماية مركز مالي" : "Financial District Escort",
        status: isArabic ? "وصول خلال 6 دقائق" : "Arriving in 6 mins"
      }
    ],
    [isArabic]
  );

  // Contingency Triggers
  const handleTriggerScenario = (type: "sandstorm" | "code_alpha" | "surge" | "vault_audit") => {
    tacticalAudio.playChime();
    const timestamp = currentTime.toLocaleTimeString(isArabic ? "ar-SA" : "en-SA");

    if (type === "sandstorm") {
      setActiveScenario("sandstorm");
      setScenarioLog((prev) => [
        isArabic
          ? `[تنبيه طقس / إعادة توجيه] ${timestamp} · تم رصد عاصفة ترابية خفيفة: قام الذكاء السيادي بإعادة توجيه موكب ألفا وبرافو عبر طريق الأمير محمد بن سلمان مع إضافة 12 دقيقة حاجز أمان.`
          : `[WEATHER / REROUTE] ${timestamp} · Sandstorm detected: AI dynamically rerouted Motorcade Alpha & Bravo via Prince Mohammed bin Salman Expressway (+12m safety buffer).`,
        ...prev.slice(0, 5)
      ]);
    } else if (type === "code_alpha") {
      setActiveScenario("code_alpha");
      setScenarioLog((prev) => [
        isArabic
          ? `[كود ألفا] ${timestamp} · تفعيل كود ألفا: فتح الممر الدبلوماسي الأخضر فائق الأولوية بالتنسيق مع دوريات أمن وحماية المواكب الملكية.`
          : `[CODE ALPHA] ${timestamp} · Protocol Code Alpha Active: 100% Diplomatic Green Wave corridor synchronized with Royal Security Police.`,
        ...prev.slice(0, 5)
      ]);
    } else if (type === "surge") {
      setActiveScenario("surge");
      setScenarioLog((prev) => [
        isArabic
          ? `[توجيه فوري VIP] ${timestamp} · تدفق وصول VIP: تم توجيه 5 سيارات مرسيدس مايباخ احتياطية فوراً إلى صالة الطيران الخاص بمطار الملك خالد.`
          : `[VIP DISPATCH] ${timestamp} · VIP Arrival Wave: 5 standby Mercedes-Maybach S680s immediately redeployed to KKIA Royal Pavilion.`,
        ...prev.slice(0, 5)
      ]);
    } else if (type === "vault_audit") {
      setActiveScenario("vault_audit");
      setScenarioLog((prev) => [
        isArabic
          ? `[تدقيق التشفير الثلاثي] ${timestamp} · تم فحص البصمة التشفيرية SHA-256 لكافة العقود الأربعة (2.17 مليون ر.س) - مطابقة تامة 100% وخالية من أي تلاعب.`
          : `[TRIPLE-KEY AUDIT] ${timestamp} · SHA-256 digital seals verified across all 4 contracts (SAR 2.17M) — 100% integrity certified.`,
        ...prev.slice(0, 5)
      ]);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col command-deck-bg text-slate-100 overflow-hidden select-none animate-fadeIn">
      {/* ── Top Sovereign Command Header ── */}
      <header className="flex flex-wrap items-center justify-between border-b border-midyaf-gold/30 bg-slate-950/90 px-6 py-3.5 backdrop-blur-xl">
        <div className="flex items-center gap-4">
          <div className="relative flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-midyaf-purple to-slate-900 ring-2 ring-midyaf-gold/60 shadow-[0_0_20px_rgba(201,168,76,0.4)]">
            <Shield className="size-6 text-midyaf-gold animate-pulse" />
          </div>

          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-base font-black tracking-tight text-white flex items-center gap-2">
                <span>{l("Sovereign Command Bridge")}</span>
                <span className="rounded-md bg-midyaf-gold/20 px-2 py-0.5 text-[10px] font-black uppercase text-midyaf-gold ring-1 ring-midyaf-gold/50">
                  {isArabic ? "قمة الرياض 2027" : "FII 2027"}
                </span>
              </h2>
            </div>
            <p className="text-xs text-slate-400">
              {l("Riyadh Summit 2027 · Sovereign Operations Bridge")} · {event?.name ?? "Future Investment Initiative"}
            </p>
          </div>
        </div>

        {/* Center Live Atomic Clock & Defcon Status */}
        <div className="hidden lg:flex items-center gap-6">
          <div className="flex items-center gap-2 rounded-xl bg-emerald-500/10 px-3 py-1.5 ring-1 ring-emerald-400/30">
            <span className="relative flex size-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex size-2.5 rounded-full bg-emerald-500" />
            </span>
            <span className="text-xs font-black text-emerald-300">
              {l("DEFCON 1 · GREEN PROTOCOL")}
            </span>
          </div>

          <div className="flex items-center gap-3 font-mono text-xs text-slate-300 bg-white/5 px-3 py-1.5 rounded-xl border border-white/10">
            <Clock size={13} className="text-midyaf-gold" />
            <span>AST: {currentTime.toLocaleTimeString("en-GB")}</span>
            <span className="text-slate-500">|</span>
            <span className="text-slate-400">UTC: {currentTime.toISOString().slice(11, 19)}</span>
          </div>

          {/* Riyadh Weather Widget */}
          <div className="flex items-center gap-2 rounded-xl bg-white/5 px-3 py-1.5 text-xs text-slate-300 border border-white/10">
            <Thermometer size={13} className="text-amber-400" />
            <span>28°C</span>
            <Wind size={13} className="text-cyan-400 ms-1" />
            <span>{isArabic ? "١٢ كم/س" : "12 km/h"}</span>
            <span className="text-emerald-400 font-bold ms-1">{isArabic ? "جودة الهواء ٣٢" : "AQI 32"}</span>
          </div>

          {/* Spatial Buffer Ingestion Telemetry */}
          <div className="hidden xl:flex items-center gap-1.5 rounded-xl bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-300 border border-emerald-500/30">
            <Radio size={13} className="text-emerald-400 animate-pulse" />
            <span className="font-mono font-bold text-[11px]">{isArabic ? "مخزن الإحداثيات: نشط (٠ تأخير)" : "Spatial Buffer: Active (0ms Lag)"}</span>
            <span className="text-[10px] px-1 rounded bg-emerald-500/20 text-emerald-300 font-mono">1.5 Hz</span>
          </div>
        </div>

        {/* Right Action Tools */}
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={toggleSound}
            className="flex items-center gap-1.5 rounded-xl bg-white/10 px-3 py-1.5 text-xs font-bold text-slate-200 transition hover:bg-white/20 active:scale-95"
            title={isMuted ? l("Muted") : l("Sound Active")}
          >
            {isMuted ? <VolumeX size={15} className="text-red-400" /> : <Volume2 size={15} className="text-emerald-400" />}
            <span className="hidden sm:inline">{isMuted ? l("Muted") : l("Tactical Audio")}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              tacticalAudio.playTacticalPing();
              onClose();
            }}
            className="flex items-center gap-1.5 rounded-xl bg-red-500/20 px-3 py-1.5 text-xs font-bold text-red-300 ring-1 ring-red-400/40 transition hover:bg-red-500/30 active:scale-95"
          >
            <X size={15} />
            <span className="hidden sm:inline">{l("Close Command Bridge")}</span>
          </button>
        </div>
      </header>

      {/* ── Main Command Bridge 3-Column Layout ── */}
      <div className="grid flex-1 grid-cols-1 lg:grid-cols-12 gap-3 p-3.5 overflow-hidden">
        {/* ══ Column 1: Airspace Radar & Convoy Formations (3 cols) ══ */}
        <div className="lg:col-span-3 flex flex-col gap-3 overflow-y-auto pr-1">
          {/* KKIA Inbound Airspace Widget */}
          <div className="rounded-2xl glass-tactical p-4 border border-midyaf-gold/20 shadow-xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-2.5 mb-3">
              <div className="flex items-center gap-2">
                <Plane className="size-4 text-cyan-400 animate-pulse" />
                <h3 className="text-xs font-black uppercase tracking-wider text-midyaf-gold">
                  {l("Airspace & Flight Radar")}
                </h3>
              </div>
              <span className="text-[10px] font-mono text-cyan-300 bg-cyan-950/60 px-2 py-0.5 rounded-md border border-cyan-500/30">
                KKIA T2
              </span>
            </div>

            <div className="space-y-2.5">
              {flights.map((flight) => (
                <div
                  key={flight.flightNo}
                  className="rounded-xl bg-white/5 p-2.5 text-xs border border-white/5 hover:border-midyaf-gold/40 transition-colors"
                >
                  <div className="flex items-center justify-between font-bold">
                    <span className="text-cyan-300 font-mono">{flight.flightNo}</span>
                    <span className="text-emerald-400 font-black text-[11px] bg-emerald-500/10 px-1.5 py-0.5 rounded">
                      {isArabic ? "الوصول" : "ETA"} {flight.eta}
                    </span>
                  </div>
                  <p className="text-[11px] font-medium text-slate-300 mt-0.5 truncate">{flight.airline}</p>
                  <div className="flex items-center justify-between text-[10px] text-slate-400 mt-1">
                    <span>{flight.origin} → {flight.gate}</span>
                  </div>
                  <div className="mt-1.5 flex items-center justify-between border-t border-white/5 pt-1 text-[10px]">
                    <span className="text-midyaf-gold font-semibold truncate flex items-center gap-1.5">
                      <Crown size={12} className="text-midyaf-gold shrink-0" />
                      <span>{flight.vipOnBoard}</span>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Active Convoy Formations */}
          <div className="rounded-2xl glass-tactical p-4 border border-midyaf-gold/20 shadow-xl flex-1">
            <div className="flex items-center justify-between border-b border-white/10 pb-2.5 mb-3">
              <div className="flex items-center gap-2">
                <Car className="size-4 text-emerald-400 animate-pulse" />
                <h3 className="text-xs font-black uppercase tracking-wider text-midyaf-gold">
                  {l("Convoy Formations")}
                </h3>
              </div>
              <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded-md border border-emerald-500/30">
                {convoys.length} {isArabic ? "مواكب حماية" : "Escorts"}
              </span>
            </div>

            <div className="space-y-2.5">
              {convoys.map((convoy) => (
                <div
                  key={convoy.id}
                  onClick={() => {
                    tacticalAudio.playBiometricAuth();
                    setSelectedVip({
                      name: convoy.vip,
                      title: convoy.id === "alpha" 
                        ? (isArabic ? "معالي محافظ صندوق الاستثمارات العامة" : "Governor of Public Investment Fund")
                        : (isArabic ? "وفد قمة كبار الشخصيات" : "VIP Summit Delegate"),
                      org: isArabic ? "صندوق الاستثمارات العامة / القيادة العالمية" : "PIF / Global Leadership",
                      clearance: isArabic ? "بروتوكول ملكي مستوى 1 - تصريح سيادي فائق" : "Royal Protocol Level 1 - Sovereign Clearance",
                      chauffeur: convoy.driver,
                      vehicle: convoy.vehicle,
                      plate: isArabic ? "٢٠٢٧ ك س أ" : "2027 KSA",
                      location: convoy.route,
                      rider: isArabic ? [
                        "قهوة سعودية مختصة فاخرة",
                        "سكري القصيم عضوي مُمتاز",
                        "تكييف المقصورة مضبوط بدقة على 20.0°C",
                        "مرافقة أمنية ودورية بروتوكول دبلوماسي"
                      ] : [
                        "Saudi Artisanal Reserve Qahwa",
                        "Organic Al-Qassim Sukari Dates",
                        "Cabin Climate Fixed at 20.0°C",
                        "Diplomatic Motorcycle Police Escort"
                      ]
                    });
                  }}
                  className="rounded-xl bg-white/5 p-2.5 text-xs border border-white/5 hover:border-emerald-400/50 hover:bg-white/10 transition cursor-pointer"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white">{convoy.name}</span>
                    <span className="font-mono font-black text-emerald-400 text-[11px] bg-emerald-500/10 px-1.5 py-0.5 rounded">
                      {convoy.speed} km/h
                    </span>
                  </div>
                  <p className="text-[11px] text-midyaf-gold font-semibold mt-0.5 flex items-center gap-1.5">
                    <Crown size={12} className="text-midyaf-gold shrink-0" />
                    <span>{convoy.vip}</span>
                  </p>
                  <p className="text-[10px] text-slate-400">{convoy.vehicle} · {convoy.driver}</p>
                  <div className="mt-1.5 flex items-center justify-between text-[10px] text-slate-400 border-t border-white/5 pt-1">
                    <span className="truncate">{convoy.route}</span>
                    <span className="text-cyan-300 font-semibold">{convoy.status}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ══ Column 2: Center Tactical Map Deck (6 cols) ══ */}
        <div className="lg:col-span-6 flex flex-col gap-3">
          {/* Tactical Map Container */}
          <div className="flex-1 rounded-2xl glass-tactical overflow-hidden border border-midyaf-gold/30 shadow-2xl relative flex flex-col">
            <RiyadhMap
              event={event}
              drivers={drivers}
              tasks={tasks}
              height="h-full min-h-[500px]"
              defaultMode="dark"
              onSelectDriver={(driver) => {
                setSelectedDriver(driver);
              }}
              className="flex-1"
            />
          </div>

          {/* Fleet Cabin Environmental Biometrics Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="rounded-xl glass-tactical p-3 border border-white/10">
              <p className="text-[10px] text-slate-400 uppercase font-bold">{l("Cabin Climate")}</p>
              <p className="text-sm font-black text-white mt-0.5">20.2°C</p>
              <span className="text-[10px] text-emerald-400 font-semibold">● {l("Optimal")}</span>
            </div>
            <div className="rounded-xl glass-tactical p-3 border border-white/10">
              <p className="text-[10px] text-slate-400 uppercase font-bold">{isArabic ? "تشبع الأكسجين O₂" : "O₂ Saturation"}</p>
              <p className="text-sm font-black text-white mt-0.5">99.4%</p>
              <span className="text-[10px] text-emerald-400 font-semibold">● {isArabic ? "مستوى طبي نقي" : "Medical Grade"}</span>
            </div>
            <div className="rounded-xl glass-tactical p-3 border border-white/10">
              <p className="text-[10px] text-slate-400 uppercase font-bold">{isArabic ? "زجاج الخصوصية العازل" : "Privacy Glass"}</p>
              <p className="text-sm font-black text-white mt-0.5">100%</p>
              <span className="text-[10px] text-midyaf-gold font-semibold">● {isArabic ? "تعتيم قطبي نشط" : "Polarized Active"}</span>
            </div>
            <div className="rounded-xl glass-tactical p-3 border border-white/10">
              <p className="text-[10px] text-slate-400 uppercase font-bold">{isArabic ? "ضغط الإطارات" : "Tire Pressure"}</p>
              <p className="text-sm font-black text-white mt-0.5">36 PSI</p>
              <span className="text-[10px] text-cyan-400 font-semibold">● {isArabic ? "كافة سيارات المايباخ الـ 5" : "All 5 Maybachs"}</span>
            </div>
          </div>
        </div>

        {/* ══ Column 3: AI Sovereign Contingency Engine & Log (3 cols) ══ */}
        <div className="lg:col-span-3 flex flex-col gap-3 overflow-y-auto pl-1">
          {/* AI Sovereign Contingency Matrix */}
          <div className="rounded-2xl glass-tactical p-4 border border-midyaf-gold/30 shadow-xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-2.5 mb-3">
              <div className="flex items-center gap-2">
                <Cpu className="size-4 text-midyaf-gold animate-spin" style={{ animationDuration: "12s" }} />
                <h3 className="text-xs font-black uppercase tracking-wider text-midyaf-gold">
                  {l("AI Sovereign Contingency Engine")}
                </h3>
              </div>
              <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded-md border border-emerald-500/30">
                {isArabic ? "كفاءة اسمية 99.8%" : "Nominal 99.8%"}
              </span>
            </div>

            <p className="text-[11px] text-slate-300 mb-3">
              {isArabic
                ? "محاكي سيناريوهات الطوارئ السيادية اللحظية — انقر لتنفيذ إعادة التوجيه الفوري:"
                : "Real-time Sovereign Contingency Simulator — Click to test dynamic autonomous re-routing:"}
            </p>

            <div className="space-y-2">
              <button
                type="button"
                onClick={() => handleTriggerScenario("sandstorm")}
                className="w-full flex items-center justify-between rounded-xl bg-amber-500/10 p-2.5 text-left text-xs font-bold text-amber-300 ring-1 ring-amber-400/30 transition hover:bg-amber-500/20 active:scale-98"
              >
                <span className="flex items-center gap-2">
                  <Wind size={15} />
                  <span>{l("Simulate Sandstorm at Airport Expressway")}</span>
                </span>
                <Sparkles size={13} className="text-amber-400" />
              </button>

              <button
                type="button"
                onClick={() => handleTriggerScenario("code_alpha")}
                className="w-full flex items-center justify-between rounded-xl bg-emerald-500/10 p-2.5 text-left text-xs font-bold text-emerald-300 ring-1 ring-emerald-400/30 transition hover:bg-emerald-500/20 active:scale-98"
              >
                <span className="flex items-center gap-2">
                  <Shield size={15} />
                  <span>{l("Simulate Royal Protocol Code Alpha")}</span>
                </span>
                <Sparkles size={13} className="text-emerald-400" />
              </button>

              <button
                type="button"
                onClick={() => handleTriggerScenario("surge")}
                className="w-full flex items-center justify-between rounded-xl bg-cyan-500/10 p-2.5 text-left text-xs font-bold text-cyan-300 ring-1 ring-cyan-400/30 transition hover:bg-cyan-500/20 active:scale-98"
              >
                <span className="flex items-center gap-2">
                  <Plane size={15} />
                  <span>{l("Simulate VIP Arrival Surge")}</span>
                </span>
                <Sparkles size={13} className="text-cyan-400" />
              </button>

              <button
                type="button"
                onClick={() => handleTriggerScenario("vault_audit")}
                className="w-full flex items-center justify-between rounded-xl bg-purple-500/10 p-2.5 text-left text-xs font-bold text-purple-300 ring-1 ring-purple-400/30 transition hover:bg-purple-500/20 active:scale-98"
              >
                <span className="flex items-center gap-2">
                  <CheckCircle2 size={15} />
                  <span>{l("Triple-Key Cryptographic Audit")}</span>
                </span>
                <Sparkles size={13} className="text-purple-400" />
              </button>
            </div>
          </div>

          {/* Tactical Chrono Stream / Audit Log */}
          <div className="rounded-2xl glass-tactical p-4 border border-midyaf-gold/20 shadow-xl flex-1 flex flex-col">
            <div className="flex items-center justify-between border-b border-white/10 pb-2.5 mb-2.5">
              <div className="flex items-center gap-2">
                <Radio className="size-4 text-emerald-400 animate-pulse" />
                <h3 className="text-xs font-black uppercase tracking-wider text-midyaf-gold">
                  {l("Encrypted Mission Log")}
                </h3>
              </div>
              <span className="text-[10px] text-slate-400">{isArabic ? "مزامنة مباشرة" : "Live Sync"}</span>
            </div>

            <div className="space-y-2 overflow-y-auto flex-1 font-mono text-[11px] text-slate-300">
              {scenarioLog.length > 0 ? (
                scenarioLog.map((entry, idx) => (
                  <div key={idx} className="rounded-lg bg-white/5 p-2 border-s-2 border-midyaf-gold">
                    {entry}
                  </div>
                ))
              ) : (
                <div className="p-3 text-center text-slate-500 text-xs font-sans">
                  {isArabic
                    ? "كافة مسارات المواكب الدبلوماسية تعمل وفق الخطة المعتمدة دون أي عوائق."
                    : "All diplomatic motorcades running on approved schedule with zero anomalies."}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Modal: VIP Encrypted Biometric Identity Card ── */}
      {selectedVip && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4 backdrop-blur-md animate-fadeIn">
          <div className="relative w-full max-w-md rounded-3xl hologram-card p-6 text-white shadow-2xl border border-midyaf-gold/50">
            {/* Close Button */}
            <button
              type="button"
              onClick={() => {
                tacticalAudio.playTacticalPing();
                setSelectedVip(null);
              }}
              className="absolute top-4 end-4 size-8 rounded-full bg-white/10 text-slate-300 hover:bg-white/20 flex items-center justify-center"
            >
              <X size={16} />
            </button>

            {/* Sovereign Crest Header */}
            <div className="text-center pb-4 border-b border-midyaf-gold/30">
              <div className="mx-auto size-10 rounded-xl bg-midyaf-gold/20 ring-1 ring-midyaf-gold/40 flex items-center justify-center text-midyaf-gold mb-2">
                <Crown size={20} />
              </div>
              <p className="text-[10px] font-black uppercase tracking-widest text-midyaf-gold">
                {l("Encrypted VIP Security Dossier")}
              </p>
              <h3 className="text-lg font-black text-white mt-1">{selectedVip.name}</h3>
              <p className="text-xs text-slate-300">{selectedVip.title}</p>
            </div>

            {/* Dossier Body */}
            <div className="py-4 space-y-3 text-xs">
              <div className="rounded-xl bg-white/5 p-2.5 border border-white/10">
                <span className="text-[10px] uppercase text-slate-400 font-bold block">{l("Clearance Level")}</span>
                <span className="text-midyaf-gold font-bold text-xs">{l(selectedVip.clearance)}</span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl bg-white/5 p-2.5 border border-white/10">
                  <span className="text-[10px] uppercase text-slate-400 font-bold block">{l("Assigned Vehicle")}</span>
                  <span className="text-white font-bold">{selectedVip.vehicle}</span>
                </div>
                <div className="rounded-xl bg-white/5 p-2.5 border border-white/10">
                  <span className="text-[10px] uppercase text-slate-400 font-bold block">{l("Chauffeur Direct Link")}</span>
                  <span className="text-emerald-400 font-bold">{selectedVip.chauffeur}</span>
                </div>
              </div>

              <div className="rounded-xl bg-white/5 p-2.5 border border-white/10">
                <span className="text-[10px] uppercase text-slate-400 font-bold block mb-1">
                  {l("Dietary & Hospitality Rider")}
                </span>
                <ul className="list-disc list-inside space-y-0.5 text-slate-300 text-[11px]">
                  {selectedVip.rider.map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Action Bar */}
            <div className="pt-2 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  tacticalAudio.playChime();
                  setSelectedVip(null);
                }}
                className="w-full rounded-xl bg-gradient-to-r from-midyaf-gold to-amber-600 py-2.5 text-xs font-black text-slate-950 shadow-lg hover:brightness-110 active:scale-98 transition"
              >
                {l("Dispatch Chauffeur Escort")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

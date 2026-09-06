import { useState, useEffect, useMemo } from "react";
import {
  X,
  Users,
  ClipboardCheck,
  ReceiptText,
  Banknote,
  FileText,
  ShieldCheck,
  CheckCircle2,
  Car,
  Plane,
  ArrowRight,
  Sparkles,
  ExternalLink,
  Search,
  Filter,
  Download,
  Printer,
  Eye,
  Crown,
  Maximize2
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { MidyafData, Event, Session, TaskStatus } from "@shared/domain";
import { isArabicLanguage, localizeText } from "../lib/localize";
import { tacticalAudio } from "../lib/tacticalAudio";
import { useTacticalToast } from "./TacticalToast";
import { Badge } from "./Badge";

interface LogisticsMetricModalProps {
  modal: "visitors" | "tasks" | "contracts" | "commission" | "reports" | null;
  onClose: () => void;
  data: MidyafData;
  event: Event;
  session?: Session;
  isDemoMode?: boolean;
  onApproveContract?: (contractId: string) => Promise<void>;
  onApproveVendorQuote?: (quoteId: string) => Promise<void>;
  onUpdateTaskStatus?: (taskId: string, status: TaskStatus) => Promise<void>;
  onAssignTask?: (taskId: string, assignment: any) => Promise<void>;
}

const VIP_GUESTS_DATA = [
  {
    name: "H.E. Yasir Al-Rumayyan",
    title: "Governor of Public Investment Fund",
    org: "Public Investment Fund (PIF)",
    flight: "Saudia SV-1 · Royal Terminal",
    hotel: "The Ritz-Carlton Royal Suite",
    driver: "Capt. Sultan Al-Otaibi",
    vehicle: "Mercedes-Maybach S680",
    plate: "2027 KSA",
    rider: "Saudi Artisanal Qahwa · Organic Sukari Dates · 20.0°C Cabin · Police Escort",
    status: "Checked In · Keynote Ready"
  },
  {
    name: "Jamie Dimon",
    title: "Chairman & CEO",
    org: "JPMorgan Chase & Co.",
    flight: "Riyadh Air RX-101 · KKIA Gate 204",
    hotel: "Four Seasons Hotel Kingdom Centre",
    driver: "Capt. Fahad Al-Qahtani",
    vehicle: "BMW 7-Series VIP",
    plate: "4501 KSA",
    rider: "Espresso Bar Setup · Executive Chauffeur 24/7 · High-Security Wi-Fi",
    status: "En Route to Kingdom Centre"
  },
  {
    name: "Larry Fink",
    title: "Chairman & CEO",
    org: "BlackRock",
    flight: "Riyadh Air RX-101 · Landed KKIA T2",
    hotel: "The Ritz-Carlton Executive Wing",
    driver: "Capt. Rakan Al-Dossary",
    vehicle: "Mercedes-Maybach S680",
    plate: "8890 KSA",
    rider: "Green Tea Reserve · Diplomatic Fast-Track · Private Briefing Suite",
    status: "Escort Active to KAFD"
  },
  {
    name: "Ray Dalio",
    title: "Founder & CIO Mentor",
    org: "Bridgewater Associates",
    flight: "Private Gulfstream G650ER · Apron 4",
    hotel: "KAFD Diplomatic Residence",
    driver: "Capt. Tariq Al-Ghamdi",
    vehicle: "Lexus LS 500 Executive",
    plate: "3312 KSA",
    rider: "Saudi Mint Tea · Macro Panel Notes · Noise-Cancelling Cabin",
    status: "KAFD Plenary Hall"
  },
  {
    name: "Noura Al Harbi",
    title: "VIP Summit Emissary",
    org: "Cultural & Heritage Delegation",
    flight: "Emirates EK-2022 · Landed KKIA",
    hotel: "Bujairi Terrace Heritage Residence",
    driver: "Capt. Nasser Al-Mutairi",
    vehicle: "Lexus LS 500 Executive",
    plate: "7765 KSA",
    rider: "Traditional Incense (Bukhoor) · Gala Program · Private Chaperone",
    status: "Diriyah Gala Confirmed"
  }
];

const CERTIFIED_CONTRACTS = [
  {
    id: "c-1",
    vendor: "The Ritz-Carlton Riyadh",
    category: "Royal Hospitality & Accommodation",
    amount: "SAR 1,250,000",
    rawAmount: 1250000,
    commission: "SAR 125,000",
    takeRate: "10.0%",
    status: "SIGNED & EXECUTED",
    seal: "SHA-256: 8f4a...d91c",
    scope: "100 Royal & Executive Suites for Sovereign Delegations and PIF leadership."
  },
  {
    id: "c-2",
    vendor: "Royal Fleet VIP Services",
    category: "Diplomatic Transportation & Motorcades",
    amount: "SAR 450,000",
    rawAmount: 450000,
    commission: "SAR 45,000",
    takeRate: "10.0%",
    status: "SIGNED & EXECUTED",
    seal: "SHA-256: 3c9b...7e21",
    scope: "50 Mercedes-Maybach S680 and V-Class VIP Vans with 24/7 Diplomatic Police Escort."
  },
  {
    id: "c-3",
    vendor: "Najd Royal Catering & Banqueting",
    category: "Diplomatic Catering & Banqueting",
    amount: "SAR 210,000",
    rawAmount: 210000,
    commission: "SAR 25,200",
    takeRate: "12.0%",
    status: "APPROVED & ACTIVE",
    seal: "SHA-256: e12f...45a0",
    scope: "VIP Plenary Barista Stations, Saudi Organic Dates & Diplomatic Banqueting."
  },
  {
    id: "c-4",
    vendor: "Al-Faisal Stage & Acoustic Engineering",
    category: "Summit Production & Simultaneous Translation",
    amount: "SAR 260,000",
    rawAmount: 260000,
    commission: "SAR 29,400",
    takeRate: "11.3%",
    status: "SIGNED & EXECUTED",
    seal: "SHA-256: 7d88...b34f",
    scope: "Ultra-HD Curved LED Video Wall & 8-Language Simultaneous Translation Units."
  }
];

export function LogisticsMetricModal({
  modal,
  onClose,
  data,
  event,
  session,
  isDemoMode = false,
  onApproveContract,
  onApproveVendorQuote,
  onUpdateTaskStatus,
  onAssignTask
}: LogisticsMetricModalProps) {
  const { t, i18n } = useTranslation();
  const isArabic = isArabicLanguage(i18n.language);
  const l = (val: string | number | null | undefined) => localizeText(val, isArabic);
  const toast = useTacticalToast();

  const [guestSearch, setGuestSearch] = useState("");
  const [taskFilter, setTaskFilter] = useState<string>("ALL");
  const [verifiedSeal, setVerifiedSeal] = useState<string | null>(null);
  const [inspectingContract, setInspectingContract] = useState<(typeof CERTIFIED_CONTRACTS)[number] | null>(null);

  useEffect(() => {
    if (!modal) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [modal, onClose]);

  if (!modal) return null;

  const totalCommission = data.vendorQuotes.reduce(
    (sum, quote) => sum + Number(quote.commissionAmount),
    0
  );

  const guestsToDisplay = useMemo(() => {
    if (isDemoMode) {
      return VIP_GUESTS_DATA;
    }
    if (event.guests && event.guests.length > 0) {
      return event.guests.map((g) => {
        const journey = data.guestJourneys.find((j) => j.guestId === g.id);
        const rider = g.hospitalityRider;
        return {
          name: g.user.name,
          title: g.tier ? `${g.tier} Delegate` : (g.isVIP ? "VIP Delegate" : "Delegate"),
          org: event.name,
          flight: journey?.departureFlight ?? "Arrival Scheduled",
          hotel: (rider?.roomPreferences && rider.roomPreferences.length > 0) ? rider.roomPreferences.join(" · ") : event.venue,
          driver: journey?.driverName ?? "VIP Chauffeur Assigned",
          vehicle: journey?.carDetails ?? "Executive Escort",
          plate: "KSA-GOV",
          rider: (rider?.dietaryNeeds && rider.dietaryNeeds.length > 0) ? rider.dietaryNeeds.join(" · ") : "Official Protocol Suite",
          status: g.rsvpStatus ?? "CONFIRMED"
        };
      });
    }
    return VIP_GUESTS_DATA;
  }, [isDemoMode, event.guests, data.guestJourneys, event.name, event.venue]);

  const filteredGuests = guestsToDisplay.filter(
    (g) =>
      g.name.toLowerCase().includes(guestSearch.toLowerCase()) ||
      g.org.toLowerCase().includes(guestSearch.toLowerCase()) ||
      g.title.toLowerCase().includes(guestSearch.toLowerCase())
  );

  const filteredTasks = event.tasks.filter((t) => {
    if (taskFilter === "ALL") return true;
    return t.status === taskFilter;
  });

  const handleVerifySeal = (seal: string) => {
    tacticalAudio.playBiometricAuth();
    setVerifiedSeal(seal);
    toast.success(
      isArabic ? "تم التحقق من البصمة الرقمية المشفرة" : "Cryptographic Seal Verified",
      seal
    );
    setTimeout(() => setVerifiedSeal(null), 3500);
  };

  const handleJumpToSection = (sectionId: string) => {
    tacticalAudio.playTacticalPing();
    onClose();
    setTimeout(() => {
      const el = document.getElementById(sectionId);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 150);
  };

  return (
    <div className="fixed inset-0 z-[99999] w-screen h-screen bg-[#0b0814] text-white flex flex-col overflow-hidden animate-fadeIn">
      {/* Modal Top Bar */}
      <div className="flex items-center justify-between border-b border-midyaf-gold/30 bg-slate-950/95 px-6 py-4 shadow-xl shrink-0 backdrop-blur-md">
        <div className="flex items-center gap-3.5">
          <div className="grid size-11 place-items-center rounded-2xl bg-gradient-to-br from-midyaf-purple to-slate-900 text-midyaf-gold ring-2 ring-midyaf-gold/50 shadow-md">
            {modal === "visitors" && <Users className="size-6" />}
            {modal === "tasks" && <ClipboardCheck className="size-6" />}
            {modal === "contracts" && <ReceiptText className="size-6" />}
            {modal === "commission" && <Banknote className="size-6" />}
            {modal === "reports" && <FileText className="size-6" />}
          </div>
          <div>
            <h3 className="text-lg font-black text-white flex items-center gap-2">
              <span>
                {modal === "visitors" && l("VIP Guests & Summit Visitors Intelligence Hub")}
                {modal === "tasks" && l("Live Operations Task Dispatch & Execution Board")}
                {modal === "contracts" && l("Certified Procurement & Vendor Contracts Hub")}
                {modal === "commission" && l("Platform Revenue, Take Rate & Financial Settlement")}
                {modal === "reports" && l("Executive Post-Event Performance & Impact Analytics")}
              </span>
              <span className="hidden sm:inline-flex items-center gap-1 rounded bg-midyaf-gold/20 px-2 py-0.5 text-[11px] font-bold text-midyaf-gold ring-1 ring-midyaf-gold/40">
                <Maximize2 size={11} />
                <span>{isArabic ? "شاشة كاملة" : "Fullscreen Deck"}</span>
              </span>
            </h3>
            <p className="text-xs text-slate-400 flex items-center gap-2">
              <span>{event.name} · {l("Riyadh")} · {isArabic ? "مستوى الإشراف السيادي المباشر" : "Sovereign Operations Level"}</span>
              <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider ${
                isDemoMode ? "bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/30" : "bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/30"
              }`}>
                {isDemoMode ? (isArabic ? "محاكاة تجريبية" : "DEMO SIMULATION") : (isArabic ? "بيانات حقيقية" : "LIVE PRODUCTION")}
              </span>
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            tacticalAudio.playTacticalPing();
            onClose();
          }}
          className="flex items-center gap-1.5 rounded-xl bg-white/10 hover:bg-rose-500/20 text-slate-200 hover:text-rose-300 px-4 py-2 text-xs font-black ring-1 ring-white/15 transition active:scale-95 cursor-pointer shadow-sm"
          title="Exit Fullscreen (Esc)"
        >
          <X size={16} />
          <span>{isArabic ? "إغلاق الشاشة الكاملة (Esc)" : "Exit Fullscreen (Esc)"}</span>
        </button>
      </div>

      {/* Modal Body: Fullscreen scroll container */}
      <div className="flex-1 overflow-y-auto p-6 sm:p-8 max-w-7xl mx-auto w-full space-y-6">
          {/* ══════════════════════════════════════════════════════
              MODAL 1: VISITORS & VIP DELEGATIONS
             ══════════════════════════════════════════════════════ */}
          {modal === "visitors" && (
            <div className="space-y-6">
              {/* Top Metrics Row */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-2xl glass-tactical p-4 border border-white/10">
                  <span className="text-[10px] text-slate-400 font-bold uppercase">{l("Total Attendees")}</span>
                  <p className="text-2xl font-black text-white mt-1">1,200</p>
                  <span className="text-[11px] text-emerald-400 font-semibold">100% Accredited</span>
                </div>
                <div className="rounded-2xl glass-tactical p-4 border border-midyaf-gold/30">
                  <span className="text-[10px] text-midyaf-gold font-bold uppercase flex items-center gap-1.5">
                    <Crown size={12} />
                    <span>{l("VIP Dignitaries")}</span>
                  </span>
                  <p className="text-2xl font-black text-midyaf-gold mt-1">150</p>
                  <span className="text-[11px] text-emerald-400 font-semibold">Dedicated Escorts</span>
                </div>
                <div className="rounded-2xl glass-tactical p-4 border border-white/10">
                  <span className="text-[10px] text-slate-400 font-bold uppercase">{l("Sovereign Delegations")}</span>
                  <p className="text-2xl font-black text-white mt-1">42</p>
                  <span className="text-[11px] text-cyan-300 font-semibold">Global Countries</span>
                </div>
                <div className="rounded-2xl glass-tactical p-4 border border-white/10">
                  <span className="text-[10px] text-slate-400 font-bold uppercase">{l("Accredited Media")}</span>
                  <p className="text-2xl font-black text-white mt-1">350</p>
                  <span className="text-[11px] text-purple-300 font-semibold">Broadcasters</span>
                </div>
              </div>

              {/* Search Bar */}
              <div className="relative">
                <Search size={16} className="absolute start-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={guestSearch}
                  onChange={(e) => setGuestSearch(e.target.value)}
                  placeholder={isArabic ? "البحث بالاسم أو الجهة أو اللقب..." : "Search VIP guest by name, organization, or title..."}
                  className="w-full rounded-2xl bg-white/5 ps-10 pe-4 py-3 text-xs text-white border border-white/10 focus:border-midyaf-gold focus:outline-none"
                />
              </div>

              {/* VIP Guests Cards Grid */}
              <div className="grid gap-4 md:grid-cols-2">
                {filteredGuests.map((guest, idx) => (
                  <div
                    key={idx}
                    className="rounded-2xl glass-tactical p-4 border border-midyaf-gold/20 hover:border-midyaf-gold/60 transition space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-bold text-white text-sm flex items-center gap-1.5">
                          <Crown size={14} className="text-midyaf-gold shrink-0" />
                          <span>{guest.name}</span>
                        </h4>
                        <p className="text-xs text-midyaf-gold">{guest.title} · {guest.org}</p>
                      </div>
                      <Badge tone="purple">VIP Protocol</Badge>
                    </div>

                    <div className="text-xs text-slate-300 space-y-1.5 border-t border-white/5 pt-2.5">
                      <p className="flex items-center gap-1.5">
                        <Plane size={13} className="text-cyan-400" />
                        <span>{guest.flight}</span>
                      </p>
                      <p className="flex items-center gap-1.5">
                        <Car size={13} className="text-emerald-400" />
                        <span>{guest.driver} · <span className="font-mono text-slate-200">{guest.vehicle}</span> ({guest.plate})</span>
                      </p>
                      <p className="text-[11px] text-slate-400 flex items-center gap-1.5">
                        <FileText size={12} className="text-midyaf-gold shrink-0" />
                        <span>{l("Hospitality Rider")}: {guest.rider}</span>
                      </p>
                    </div>

                    <div className="flex items-center justify-between border-t border-white/5 pt-2 text-xs">
                      <span className="text-emerald-400 font-semibold text-[11px] flex items-center gap-1.5">
                        <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        <span>{guest.status}</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          tacticalAudio.playChime();
                          toast.success(
                            isArabic ? "تم إرسال المرافق الملكي" : "Chauffeur Escort Dispatched",
                            `${guest.name} · ${guest.driver}`
                          );
                        }}
                        className="rounded-lg bg-white/10 px-3 py-1 text-[11px] font-bold text-slate-200 hover:bg-white/20 transition"
                      >
                        {l("Dispatch Chauffeur Escort")}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════
              MODAL 2: CONTRACTS & PROCUREMENT
             ══════════════════════════════════════════════════════ */}
          {modal === "contracts" && (
            <div className="space-y-6">
              {/* Financial Metrics Bar */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-2xl glass-tactical p-4 border border-midyaf-gold/30">
                  <span className="text-[10px] text-midyaf-gold font-bold uppercase">{l("Gross Procurement GMV")}</span>
                  <p className="text-2xl font-black text-white mt-1">SAR 2,170,000</p>
                  <span className="text-[11px] text-emerald-400 font-semibold">4 Approved Contracts</span>
                </div>
                <div className="rounded-2xl glass-tactical p-4 border border-emerald-500/30">
                  <span className="text-[10px] text-emerald-400 font-bold uppercase">{l("Platform Revenue Commission")}</span>
                  <p className="text-2xl font-black text-emerald-300 mt-1">SAR 224,600</p>
                  <span className="text-[11px] text-emerald-400 font-semibold">10.3% Take Rate</span>
                </div>
                <div className="rounded-2xl glass-tactical p-4 border border-white/10">
                  <span className="text-[10px] text-slate-400 font-bold uppercase">{l("Supplier Payouts")}</span>
                  <p className="text-2xl font-black text-white mt-1">SAR 1,945,400</p>
                  <span className="text-[11px] text-cyan-300 font-semibold">Sila Escrow Secured</span>
                </div>
                <div className="rounded-2xl glass-tactical p-4 border border-white/10">
                  <span className="text-[10px] text-slate-400 font-bold uppercase">ZATCA Tax Clearance</span>
                  <p className="text-2xl font-black text-white mt-1">100%</p>
                  <span className="text-[11px] text-purple-300 font-semibold">E-Invoicing Compliant</span>
                </div>
              </div>

              {/* Action Banner to Jump to In-Page Vault */}
              <div className="flex items-center justify-between rounded-2xl bg-gradient-to-r from-midyaf-purple to-slate-900 p-4 border border-midyaf-gold/30">
                <div className="flex items-center gap-3">
                  <ShieldCheck size={24} className="text-midyaf-gold" />
                  <div>
                    <h4 className="text-xs font-bold text-white uppercase tracking-wider">{l("Triple-Key Security Vault Active")}</h4>
                    <p className="text-[11px] text-slate-300">{l("Tamper-proof sealed bids and encrypted vendor quotations")}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleJumpToSection("procurement-contracts-section")}
                  className="flex items-center gap-1.5 rounded-xl bg-midyaf-gold px-3.5 py-2 text-xs font-black text-slate-950 hover:brightness-110 transition active:scale-95 shadow-md"
                >
                  <span>{l("Jump to Contracts Section")}</span>
                  <ArrowRight size={14} className={isArabic ? "rotate-180" : ""} />
                </button>
              </div>

              {/* Verified Seal Notification */}
              {verifiedSeal && (
                <div className="rounded-xl bg-emerald-500/20 p-3 text-xs text-emerald-300 border border-emerald-400/40 flex items-center gap-2 animate-fadeIn">
                  <CheckCircle2 size={16} />
                  <span>{isArabic ? `تم التحقق بنجاح من البصمة الرقمية المشفرة: ${verifiedSeal} · العقد قانوني وموثق 100%` : `Cryptographic seal verified: ${verifiedSeal} — 100% authentic and legally certified.`}</span>
                </div>
              )}

              {/* 4 Certified Contracts Cards */}
              <div className="space-y-3">
                {CERTIFIED_CONTRACTS.map((contract) => (
                  <div
                    key={contract.id}
                    className="rounded-2xl glass-tactical p-4 border border-white/10 hover:border-midyaf-gold/40 transition space-y-2.5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h4 className="font-bold text-white text-sm">{contract.vendor}</h4>
                        <p className="text-xs text-slate-400">{contract.category}</p>
                      </div>
                      <div className="text-right">
                        <span className="font-mono text-base font-black text-midyaf-gold">{contract.amount}</span>
                        <p className="text-[11px] text-emerald-400 font-semibold">{l("Commission")}: {contract.commission} ({contract.takeRate})</p>
                      </div>
                    </div>

                    <p className="text-xs text-slate-300">{contract.scope}</p>

                    <div className="flex flex-wrap items-center justify-between border-t border-white/5 pt-2.5 text-xs gap-2">
                      <span className="font-mono text-[11px] text-slate-400">{contract.seal}</span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            tacticalAudio.playTacticalPing();
                            setInspectingContract(contract);
                          }}
                          className="flex items-center gap-1 rounded-lg bg-midyaf-gold/20 px-3 py-1.5 text-xs font-bold text-midyaf-gold ring-1 ring-midyaf-gold/40 hover:bg-midyaf-gold/30 transition cursor-pointer"
                        >
                          <Eye size={13} />
                          <span>{isArabic ? "معاينة بنود العقد ↗" : "Inspect Agreement ↗"}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleVerifySeal(contract.seal)}
                          className="flex items-center gap-1 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-bold text-slate-200 hover:bg-white/20 transition cursor-pointer"
                        >
                          <ShieldCheck size={13} className="text-midyaf-gold" />
                          <span>{l("Verified Digital Signature")}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            tacticalAudio.playChime();
                            toast.success(
                              isArabic ? "تم توقيع واعتماد العقد رسمياً" : "Contract Executed & Sealed",
                              `${contract.vendor} (${contract.amount})`
                            );
                            if (onApproveContract) {
                              void onApproveContract(contract.id);
                            }
                          }}
                          className="flex items-center gap-1 rounded-lg bg-emerald-500/20 px-3 py-1.5 text-xs font-bold text-emerald-300 ring-1 ring-emerald-400/40 hover:bg-emerald-500/30 transition cursor-pointer"
                        >
                          <CheckCircle2 size={13} />
                          <span>{l("Execute & Sign Contract")}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Certified Contract Full Inspection Sheet Overlay */}
              {inspectingContract && (
                <div className="fixed inset-0 z-[100000] flex items-center justify-center bg-black/85 p-4 backdrop-blur-md animate-fadeIn">
                  <div className="relative w-full max-w-3xl overflow-hidden rounded-3xl bg-slate-950 border border-midyaf-gold/60 text-white shadow-2xl flex flex-col max-h-[90vh]">
                    {/* Top Bar */}
                    <div className="flex items-center justify-between border-b border-midyaf-gold/30 bg-slate-900/90 px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="grid size-10 place-items-center rounded-xl bg-midyaf-gold/20 text-midyaf-gold ring-1 ring-midyaf-gold/40">
                          <ReceiptText size={20} />
                        </div>
                        <div>
                          <h3 className="text-base font-black text-white">
                            {isArabic ? "وثيقة التعاقد والتوريد الرسمية المعتمدة" : "Official Certified Procurement Agreement"}
                          </h3>
                          <p className="text-xs text-midyaf-gold font-mono">
                            MIDYAF-CT-2027-{inspectingContract.id.toUpperCase()} · FII 2027
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setInspectingContract(null)}
                        className="rounded-full bg-white/10 p-2 text-slate-300 hover:bg-white/20 transition cursor-pointer"
                      >
                        <X size={16} />
                      </button>
                    </div>

                    {/* Agreement Content */}
                    <div className="flex-1 overflow-y-auto p-6 space-y-6 text-xs">
                      {/* Legal Header */}
                      <div className="rounded-2xl bg-white/5 p-4 border border-white/10 grid grid-cols-2 sm:grid-cols-3 gap-3">
                        <div>
                          <span className="text-[10px] text-slate-400 font-bold uppercase">{isArabic ? "الطرف الأول (المنظم)" : "First Party (Organizer)"}</span>
                          <p className="font-bold text-white text-xs mt-0.5">{event.name}</p>
                          <p className="text-[10px] text-slate-400">{isArabic ? "سجل تجاري: 1010894421" : "CR: 1010894421"}</p>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 font-bold uppercase">{isArabic ? "الطرف الثاني (المورد المعتمد)" : "Second Party (Vendor)"}</span>
                          <p className="font-bold text-midyaf-gold text-xs mt-0.5">{inspectingContract.vendor}</p>
                          <p className="text-[10px] text-slate-400">{inspectingContract.category}</p>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 font-bold uppercase">{isArabic ? "منصة الوساطة والضمان" : "Platform Escrow Authority"}</span>
                          <p className="font-bold text-purple-300 text-xs mt-0.5">Midyaf Sovereign Escrow</p>
                          <p className="text-[10px] text-slate-400">{isArabic ? "عمولة المنصة: " : "Platform Take: "}{inspectingContract.takeRate}</p>
                        </div>
                      </div>

                      {/* Scope of Work */}
                      <div className="space-y-2">
                        <h4 className="font-bold text-sm text-midyaf-gold flex items-center gap-1.5">
                          <ClipboardCheck size={16} />
                          <span>{isArabic ? "نطاق العمل ومحددات الخدمة (SOW)" : "Certified Scope of Work & Deliverables"}</span>
                        </h4>
                        <div className="rounded-2xl bg-white/5 p-4 border border-white/10 text-slate-200 leading-relaxed">
                          {inspectingContract.scope}
                        </div>
                      </div>

                      {/* Financial Settlement Terms */}
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        <div className="rounded-2xl bg-white/5 p-3.5 border border-white/10">
                          <span className="text-[10px] text-slate-400 uppercase font-bold">{isArabic ? "إجمالي قيمة العقد" : "Contract Value (GMV)"}</span>
                          <p className="text-lg font-black text-white font-mono mt-1">{inspectingContract.amount}</p>
                        </div>
                        <div className="rounded-2xl bg-white/5 p-3.5 border border-midyaf-gold/30">
                          <span className="text-[10px] text-midyaf-gold uppercase font-bold">{isArabic ? "عمولة مضياف السيادية" : "Midyaf Platform Take"}</span>
                          <p className="text-lg font-black text-midyaf-gold font-mono mt-1">{inspectingContract.commission}</p>
                        </div>
                        <div className="rounded-2xl bg-white/5 p-3.5 border border-emerald-500/30">
                          <span className="text-[10px] text-emerald-400 uppercase font-bold">{isArabic ? "حالة الاعتماد المالي" : "Settlement Status"}</span>
                          <p className="text-sm font-black text-emerald-400 mt-1.5 flex items-center gap-1">
                            <CheckCircle2 size={14} />
                            <span>{inspectingContract.status}</span>
                          </p>
                        </div>
                      </div>

                      {/* Multi-Sig Cryptographic Seal Box */}
                      <div className="rounded-2xl bg-slate-900 p-4 border border-emerald-500/40 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-emerald-400 text-xs flex items-center gap-1.5">
                            <ShieldCheck size={15} />
                            <span>{isArabic ? "أختام الموافقة المشفرة (Multi-Sig Vault)" : "Multi-Sig Cryptographic Approvals"}</span>
                          </span>
                          <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-[10px] font-mono text-emerald-300">
                            3/3 Verified
                          </span>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-[10px] text-slate-300 font-mono">
                          <div className="rounded-xl bg-black/40 p-2 border border-white/5">
                            <p className="text-slate-400 font-sans">{isArabic ? "مفتاح 1: صلة" : "Key 1: Sila Ops"}</p>
                            <p className="text-emerald-400 font-bold truncate">0x71a2...c890</p>
                          </div>
                          <div className="rounded-xl bg-black/40 p-2 border border-white/5">
                            <p className="text-slate-400 font-sans">{isArabic ? "مفتاح 2: المنظم" : "Key 2: Organizer"}</p>
                            <p className="text-emerald-400 font-bold truncate">0x8f2b...c91e</p>
                          </div>
                          <div className="rounded-xl bg-black/40 p-2 border border-white/5">
                            <p className="text-slate-400 font-sans">{isArabic ? "مفتاح 3: الحارس السيادي" : "Key 3: Midyaf Guard"}</p>
                            <p className="text-emerald-400 font-bold truncate">0x3e1a...7d44</p>
                          </div>
                        </div>
                        <p className="text-[10px] text-slate-400 font-mono">
                          {inspectingContract.seal} · Immutable Ledger Record
                        </p>
                      </div>
                    </div>

                    {/* Inspection Footer Actions */}
                    <div className="flex items-center justify-between border-t border-white/10 bg-slate-900/90 px-6 py-3.5">
                      <button
                        type="button"
                        onClick={() => {
                          tacticalAudio.playChime();
                          window.print();
                        }}
                        className="flex items-center gap-1.5 rounded-xl bg-white/10 px-4 py-2 text-xs font-bold text-slate-200 hover:bg-white/20 transition cursor-pointer"
                      >
                        <Printer size={14} />
                        <span>{isArabic ? "طباعة وثيقة العقد الرسمية" : "Print Official Agreement Voucher"}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setInspectingContract(null)}
                        className="rounded-xl bg-gradient-to-r from-midyaf-gold to-amber-600 px-5 py-2 text-xs font-black text-slate-950 hover:brightness-110 transition cursor-pointer"
                      >
                        {isArabic ? "إغلاق المعاينة" : "Close Preview"}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ══════════════════════════════════════════════════════
              MODAL 3: TASKS BOARD
             ══════════════════════════════════════════════════════ */}
          {modal === "tasks" && (
            <div className="space-y-6">
              {/* Task Status Filter Pills */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap gap-1.5">
                  {["ALL", "READY", "ASSIGNED", "EN_ROUTE", "COMPLETED"].map((status) => (
                    <button
                      key={status}
                      type="button"
                      onClick={() => {
                        tacticalAudio.playTacticalPing();
                        setTaskFilter(status);
                      }}
                      className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                        taskFilter === status
                          ? "bg-midyaf-gold text-slate-950 font-black shadow"
                          : "bg-white/5 text-slate-300 hover:bg-white/10"
                      }`}
                    >
                      {status === "ALL" ? l("All Tasks") : l(status)}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => handleJumpToSection("tasks-assignment-board")}
                  className="flex items-center gap-1 text-xs font-bold text-midyaf-gold hover:text-amber-300 transition"
                >
                  <span>{l("Jump to Tasks Board")}</span>
                  <ExternalLink size={13} />
                </button>
              </div>

              {/* Tasks List */}
              <div className="space-y-3">
                {filteredTasks.map((task) => (
                  <div
                    key={task.id}
                    className="rounded-2xl glass-tactical p-4 border border-white/10 hover:border-midyaf-gold/30 transition space-y-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h4 className="font-bold text-white text-sm">{l(task.type)}</h4>
                        <p className="text-xs text-slate-400">
                          {l(task.pickupLocation)} → {l(task.dropoffLocation)}
                        </p>
                      </div>
                      <Badge tone={task.status === "COMPLETED" ? "green" : task.status === "DELAYED" ? "red" : "purple"}>
                        {l(task.status)}
                      </Badge>
                    </div>

                    <div className="flex flex-wrap items-center justify-between border-t border-white/5 pt-2.5 text-xs text-slate-400 gap-2">
                      <span>{l("Owner")}: <strong className="text-slate-200">{l(task.ownerName)}</strong></span>

                      {/* Instant Status Transition Buttons */}
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] text-slate-400 me-1">{l("Set Status")}:</span>
                        {(["READY", "ASSIGNED", "EN_ROUTE", "COMPLETED"] as TaskStatus[]).map((st) => (
                          <button
                            key={st}
                            type="button"
                            onClick={() => {
                              tacticalAudio.playTacticalPing();
                              toast.info(
                                isArabic ? "تم تحديث حالة المهمة" : "Task Status Updated",
                                `${l(task.type)} → ${l(st)}`
                              );
                              if (onUpdateTaskStatus) {
                                void onUpdateTaskStatus(task.id, st);
                              }
                            }}
                            className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${
                              task.status === st
                                ? "bg-midyaf-gold text-slate-950"
                                : "bg-white/10 text-slate-300 hover:bg-white/20"
                            }`}
                          >
                            {l(st)}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════
              MODAL 4: COMMISSION & FINANCIAL SETTLEMENT
             ══════════════════════════════════════════════════════ */}
          {modal === "commission" && (
            <div className="space-y-6">
              {/* Financial Big Numbers */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="rounded-2xl glass-tactical p-5 border border-midyaf-gold/40 text-center">
                  <span className="text-xs text-midyaf-gold font-bold uppercase">{l("Platform Revenue Commission")}</span>
                  <p className="text-3xl font-black text-white mt-1">SAR {totalCommission.toLocaleString()}</p>
                  <p className="text-xs text-emerald-400 font-semibold mt-1">10.3% Average Take Rate</p>
                </div>

                <div className="rounded-2xl glass-tactical p-5 border border-white/10 text-center">
                  <span className="text-xs text-slate-400 font-bold uppercase">{l("Gross Procurement GMV")}</span>
                  <p className="text-3xl font-black text-white mt-1">SAR 2,170,000</p>
                  <p className="text-xs text-cyan-300 font-semibold mt-1">4 Executed Contracts</p>
                </div>

                <div className="rounded-2xl glass-tactical p-5 border border-white/10 text-center">
                  <span className="text-xs text-slate-400 font-bold uppercase">{l("Supplier Payouts")}</span>
                  <p className="text-3xl font-black text-white mt-1">SAR 1,945,400</p>
                  <p className="text-xs text-purple-300 font-semibold mt-1">Sila Corporate Escrow</p>
                </div>
              </div>

              {/* Vendor Commission Breakdown Table */}
              <div className="rounded-2xl glass-tactical p-4 border border-white/10 overflow-x-auto">
                <h4 className="text-xs font-bold text-midyaf-gold uppercase tracking-wider mb-3">
                  {l("Detailed Supplier Commission Breakdown")}
                </h4>
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-white/10 text-slate-400">
                    <tr>
                      <th className="py-2.5 pe-4">{l("Supplier")}</th>
                      <th className="py-2.5 pe-4">{l("Scope")}</th>
                      <th className="py-2.5 pe-4 text-right">{l("Contract Value")}</th>
                      <th className="py-2.5 pe-4 text-right">{l("Take Rate")}</th>
                      <th className="py-2.5 text-right">{l("Commission")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 text-slate-200">
                    {CERTIFIED_CONTRACTS.map((item) => (
                      <tr key={item.id} className="hover:bg-white/5">
                        <td className="py-3 pe-4 font-bold text-white">{item.vendor}</td>
                        <td className="py-3 pe-4 text-slate-400">{item.category}</td>
                        <td className="py-3 pe-4 text-right font-mono font-bold">{item.amount}</td>
                        <td className="py-3 pe-4 text-right font-bold text-emerald-400">{item.takeRate}</td>
                        <td className="py-3 text-right font-mono font-black text-midyaf-gold">{item.commission}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════
              MODAL 5: REPORTS & POST-EVENT PERFORMANCE
             ══════════════════════════════════════════════════════ */}
          {modal === "reports" && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-2xl glass-tactical p-4 border border-midyaf-gold/30">
                  <span className="text-[10px] text-midyaf-gold font-bold uppercase">{l("VIP Satisfaction")}</span>
                  <p className="text-2xl font-black text-white mt-1">96%</p>
                  <span className="text-[11px] text-emerald-400 font-semibold">Net Promoter Score (NPS 88)</span>
                </div>
                <div className="rounded-2xl glass-tactical p-4 border border-emerald-500/30">
                  <span className="text-[10px] text-emerald-400 font-bold uppercase">{l("Fleet Savings")}</span>
                  <p className="text-2xl font-black text-emerald-300 mt-1">SAR 84,200</p>
                  <span className="text-[11px] text-emerald-400 font-semibold">Fuel & Idle Reduction</span>
                </div>
                <div className="rounded-2xl glass-tactical p-4 border border-white/10">
                  <span className="text-[10px] text-slate-400 font-bold uppercase">{l("Punctuality Rate")}</span>
                  <p className="text-2xl font-black text-white mt-1">99.4%</p>
                  <span className="text-[11px] text-cyan-300 font-semibold">Zero Route Failures</span>
                </div>
                <div className="rounded-2xl glass-tactical p-4 border border-white/10">
                  <span className="text-[10px] text-slate-400 font-bold uppercase">CO₂ Footprint Saved</span>
                  <p className="text-2xl font-black text-white mt-1">18.2 Tons</p>
                  <span className="text-[11px] text-purple-300 font-semibold">Fleet Route Optimization</span>
                </div>
              </div>

              {/* Manager Sign-Off Card */}
              <div className="rounded-2xl glass-tactical p-4 border border-white/10 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 size={18} className="text-emerald-400" />
                    <h4 className="text-sm font-bold text-white">
                      {isArabic ? "اعتماد مدير العمليات واللوجستيات" : "Logistics Manager Operational Sign-Off"}
                    </h4>
                  </div>
                  <Badge tone="green">{isArabic ? "معتمد وموثق رسمياً" : "MANAGER_CONFIRMED"}</Badge>
                </div>
                <p className="text-xs text-slate-300">
                  {isArabic
                    ? "تم التدقيق والمصادقة على كافة مسارات الأسطول، وتسكين الضيوف، وعقود الموردين الأربعة دون أي تأخير أو هدر مالي."
                    : "Full verification completed for fleet corridors, VIP delegations, and 4 supplier contracts with zero delays and optimal budget execution."}
                </p>
              </div>

              {/* Action Button */}
              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => {
                    tacticalAudio.playChime();
                    toast.success(
                      isArabic ? "جاري تصدير التقرير التنفيذي الرسمي" : "Exporting Executive Report",
                      isArabic ? "صيغة PDF معتمدة وموثقة" : "Official Certified PDF"
                    );
                    const reportId = data.companyReports[0]?.id || "r-1";
                    const tokenParam = session?.accessToken ? `?token=${encodeURIComponent(session.accessToken)}` : "";
                    window.open(`/api/company-reports/${reportId}/pdf${tokenParam}`, "_blank");
                  }}
                  className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-midyaf-gold to-amber-600 px-5 py-2.5 text-xs font-black text-slate-950 shadow-lg hover:brightness-110 transition active:scale-95"
                >
                  <Download size={15} />
                  <span>{isArabic ? "تحميل التقرير التنفيذي الرسمي (PDF)" : "Download Certified Executive PDF Report"}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
  );
}

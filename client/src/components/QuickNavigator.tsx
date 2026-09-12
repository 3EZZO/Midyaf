import { useEffect, useMemo, useRef, useState } from "react";
import {
  Search,
  Command,
  ArrowRight,
  Sparkles,
  ClipboardList,
  LayoutDashboard,
  Building2,
  Crown,
  Car,
  Users,
  Hotel,
  Truck,
  FileSpreadsheet,
  Coins,
  Cpu,
  FileSignature,
  Compass,
  CheckSquare,
  Bot,
  Radar,
  BarChart3,
  Settings2,
  FileDown,
  Share2,
  Moon,
  Sun,
  Languages,
  Shield,
  Briefcase,
  X
} from "lucide-react";
import type { PortalKey } from "@shared/domain";
import { smoothScrollToSection } from "../lib/navigation";
import { tacticalAudio } from "../lib/tacticalAudio";

export interface NavItem {
  id: string;
  titleEn: string;
  titleAr: string;
  category: "portal" | "section" | "action";
  portalTarget?: PortalKey;
  sectionId?: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  shortcut?: string;
  actionType?: "export-pdf" | "share-plan" | "toggle-dark" | "switch-lang" | "war-room";
  keywordsEn: string[];
  keywordsAr: string[];
}

interface QuickNavigatorProps {
  isOpen: boolean;
  onClose: () => void;
  isArabic: boolean;
  activePortal: PortalKey;
  allowedPortals: PortalKey[];
  onSelectPortal: (portal: PortalKey) => void;
  onToggleDarkMode: () => void;
  onToggleLanguage: () => void;
  isDemoMode?: boolean;
  onOpenWarRoom?: () => void;
  onExportPdf?: () => void;
  onSharePlan?: () => void;
}

export function QuickNavigator({
  isOpen,
  onClose,
  isArabic,
  activePortal,
  allowedPortals,
  onSelectPortal,
  onToggleDarkMode,
  onToggleLanguage,
  isDemoMode,
  onOpenWarRoom,
  onExportPdf,
  onSharePlan
}: QuickNavigatorProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedCategory, setSelectedCategory] = useState<"all" | "portal" | "section" | "action">("all");
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const allItems: NavItem[] = useMemo(() => [
    // ── PORTALS ──
    {
      id: "portal-admin",
      titleEn: "Midyaf Sovereign Admin Dashboard (Owners Only)",
      titleAr: "لوحة الملاك والإدارة التنفيذية لمضياف",
      category: "portal",
      portalTarget: "admin",
      icon: Crown,
      keywordsEn: ["admin", "owner", "financial", "commissions", "complaints", "submitters", "contracts"],
      keywordsAr: ["ملاك", "إدارة", "مالية", "عمولات", "شكاوى", "عقود", "مضياف"]
    },
    {
      id: "portal-operations",
      titleEn: "Operations Command Dashboard (Pure Ops)",
      titleAr: "لوحة العمليات والتحكم الميداني",
      category: "portal",
      portalTarget: "sila_operations",
      icon: LayoutDashboard,
      keywordsEn: ["operations", "field", "dispatch", "radar", "captains", "fleet"],
      keywordsAr: ["عمليات", "ميدان", "كباتن", "أسطول", "تحكم"]
    },
    {
      id: "portal-client",
      titleEn: "Client Executive Dashboard",
      titleAr: "لوحة العميل المستفيد المخصصة",
      category: "portal",
      portalTarget: "client",
      icon: Briefcase,
      keywordsEn: ["client", "sponsor", "reports", "schedule", "chat", "ministry"],
      keywordsAr: ["عميل", "وزارة", "سياحة", "تقارير", "جدول", "تواصل"]
    },
    {
      id: "portal-logistics-mgr",
      titleEn: "Sila Operations Command",
      titleAr: "لوحة عمليات صلة (لوجستيات وفعاليات)",
      category: "portal",
      portalTarget: "sila_operations",
      icon: Briefcase,
      keywordsEn: ["operations", "sila", "logistics", "events"],
      keywordsAr: ["عمليات", "صلة", "لوجستيات", "فعاليات"]
    },
    {
      id: "portal-intake",
      titleEn: "Activity Intake & Data Entry",
      titleAr: "إدخال الفعالية والبيانات اللوجستية",
      category: "portal",
      portalTarget: "intake",
      icon: ClipboardList,
      keywordsEn: ["intake", "data", "event", "plan", "activity", "csv", "entry"],
      keywordsAr: ["إدخال", "فعالية", "بيانات", "خطة", "استيراد"]
    },
    {
      id: "portal-company",
      titleEn: "Organizing Company Dashboard",
      titleAr: "لوحة الشركة المنظمة",
      category: "portal",
      portalTarget: "company",
      icon: Building2,
      keywordsEn: ["company", "organizer", "reports", "quotations"],
      keywordsAr: ["شركة", "منظمة", "تقارير", "عروض"]
    },
    {
      id: "portal-guest",
      titleEn: "Guest Hospitality Journey App",
      titleAr: "تطبيق الضيف والرحلة الشاملة",
      category: "portal",
      portalTarget: "guest",
      icon: Crown,
      keywordsEn: ["guest", "journey", "vip", "visa", "ticket", "flight"],
      keywordsAr: ["ضيف", "رحلة", "فيزا", "تذكرة", "طيران", "استقبال"]
    },
    {
      id: "portal-captain",
      titleEn: "Captains & Fleet Mobility App",
      titleAr: "تطبيق الكباتن وحركة الأسطول",
      category: "portal",
      portalTarget: "captain",
      icon: Car,
      keywordsEn: ["captain", "driver", "fleet", "vehicle", "car", "ride"],
      keywordsAr: ["كابتن", "سائق", "أسطول", "سيارة", "مركبة"]
    },
    {
      id: "portal-coordinator",
      titleEn: "Field Coordinators App",
      titleAr: "تطبيق المنسقين والميدان",
      category: "portal",
      portalTarget: "coordinator",
      icon: Users,
      keywordsEn: ["coordinator", "field", "support", "ground", "requests"],
      keywordsAr: ["منسق", "ميدان", "دعم", "طلبات"]
    },

    // ── INTAKE IN-PAGE SECTIONS ──
    {
      id: "sec-intake-core",
      titleEn: "Event Core Info & Venues",
      titleAr: "المعلومات الأساسية والمواقع",
      category: "section",
      portalTarget: "intake",
      sectionId: "section-intake-core",
      icon: ClipboardList,
      keywordsEn: ["venues", "visitors", "name", "place", "location"],
      keywordsAr: ["موقع", "اسم", "حضور", "زوار", "أماكن"]
    },
    {
      id: "sec-intake-hotels",
      titleEn: "Hotel & Accommodation Details",
      titleAr: "تفاصيل الفنادق والإقامة والأجنحة",
      category: "section",
      portalTarget: "intake",
      sectionId: "section-intake-hotels",
      icon: Hotel,
      keywordsEn: ["hotel", "rooms", "accommodation", "booking", "suites"],
      keywordsAr: ["فندق", "غرف", "إقامة", "أجنحة", "حجز"]
    },
    {
      id: "sec-intake-rentals",
      titleEn: "Car & Bus Rental Companies",
      titleAr: "شركات تأجير السيارات والحافلات",
      category: "section",
      portalTarget: "intake",
      sectionId: "section-intake-rentals",
      icon: Car,
      keywordsEn: ["rental", "car rental", "buses", "coaches", "maybach", "fleet"],
      keywordsAr: ["تأجير", "سيارات", "حافلات", "أسطول", "مايباخ"]
    },
    {
      id: "sec-intake-suppliers",
      titleEn: "Certified Suppliers & Payment Terms",
      titleAr: "المزودون والموردون المعتمدون وشروط الدفع",
      category: "section",
      portalTarget: "intake",
      sectionId: "section-intake-suppliers",
      icon: Briefcase,
      keywordsEn: ["supplier", "provider", "vendors", "payment terms", "downpayment", "installments"],
      keywordsAr: ["مزود", "مورد", "موردين", "شروط الدفع", "أقساط", "دفعة مقدمة"]
    },
    {
      id: "sec-intake-resources",
      titleEn: "Resource Quotas (Golf Carts, Heavy Trucks, Man Power)",
      titleAr: "عربات الجولف، الشاحنات، والمعدات والقوى البشرية",
      category: "section",
      portalTarget: "intake",
      sectionId: "section-intake-resources",
      icon: Truck,
      keywordsEn: ["golf carts", "trucks", "heavy equipment", "man power", "cranes", "buses"],
      keywordsAr: ["جولف", "شاحنات", "رافعات", "معدات", "قوى بشرية", "عمال", "حافلات"]
    },
    {
      id: "sec-intake-csv",
      titleEn: "Guest Details CSV Upload & Bulk Import",
      titleAr: "استيراد ورفع قائمة الضيوف (ملف CSV)",
      category: "section",
      portalTarget: "intake",
      sectionId: "section-intake-csv",
      icon: FileSpreadsheet,
      keywordsEn: ["csv", "upload", "import", "guests", "spreadsheet"],
      keywordsAr: ["ملف", "رفع", "استيراد", "ضيوف", "اكسل"]
    },
    {
      id: "sec-price-ranges",
      titleEn: "Supplier Price Ranges & Market Standards",
      titleAr: "نطاقات أسعار الموردين والحدود السوقية",
      category: "section",
      portalTarget: "intake",
      sectionId: "section-price-ranges",
      icon: Coins,
      keywordsEn: ["prices", "ranges", "market", "rates", "quotes", "estimates"],
      keywordsAr: ["أسعار", "نطاق", "تكلفة", "عروض", "حدود"]
    },
    {
      id: "sec-ai-plan",
      titleEn: "AI Logistics Plan Output & Allocation",
      titleAr: "مخرجات وتوزيعات الخطة الذكية (AI Plan)",
      category: "section",
      portalTarget: "intake",
      sectionId: "section-ai-plan",
      icon: Cpu,
      keywordsEn: ["ai", "plan", "allocation", "gpt", "quotas", "approve"],
      keywordsAr: ["خطة", "ذكاء", "اصطناعي", "توزيع", "اعتماد"]
    },
    {
      id: "sec-supplier-contracts",
      titleEn: "8-Category Supplier Contract Workflow",
      titleAr: "مسار عقود الموردين الـ 8 وتفاوض العروض",
      category: "section",
      portalTarget: "intake",
      sectionId: "section-supplier-contracts",
      icon: FileSignature,
      keywordsEn: ["contracts", "suppliers", "negotiation", "bids", "categories"],
      keywordsAr: ["عقود", "موردين", "تفاوض", "اتفاقيات"]
    },

    // ── DASHBOARD IN-PAGE SECTIONS ──
    {
      id: "sec-tactical-map",
      titleEn: "Live Map & Fleet Tracking",
      titleAr: "الخريطة وتتبع الأسطول المباشر",
      category: "section",
      portalTarget: "sila_operations",
      sectionId: "section-tactical-map",
      icon: Compass,
      keywordsEn: ["map", "tactical", "gps", "fleet", "tracking", "live"],
      keywordsAr: ["خريطة", "تتبع", "موقع", "مباشر", "أسطول"]
    },
    {
      id: "sec-task-board",
      titleEn: "Live Dispatch Task Board",
      titleAr: "لوحة المهام والترحيل الميداني الفوري",
      category: "section",
      portalTarget: "sila_operations",
      sectionId: "section-task-board",
      icon: CheckSquare,
      keywordsEn: ["tasks", "dispatch", "board", "status", "pending", "completed"],
      keywordsAr: ["مهام", "ترحيل", "متابعة", "إنجاز"]
    },
    {
      id: "sec-smart-assistant",
      titleEn: "Smart Operations AI Assistant",
      titleAr: "المساعد الذكي لإدارة العمليات",
      category: "section",
      portalTarget: "sila_operations",
      sectionId: "section-smart-assistant",
      icon: Bot,
      keywordsEn: ["assistant", "chat", "ai", "smart", "insights"],
      keywordsAr: ["مساعد", "محادثة", "ذكاء", "استفسار"]
    },
    {
      id: "sec-hotspots-radar",
      titleEn: "Live Summit Hotspots & Telemetry Radar",
      titleAr: "رادار النقاط الحية ومؤشرات الازدحام",
      category: "section",
      portalTarget: "sila_operations",
      sectionId: "section-hotspots-radar",
      icon: Radar,
      keywordsEn: ["radar", "hotspots", "telemetry", "congestion"],
      keywordsAr: ["رادار", "نقاط", "ازدحام", "تنبؤ"]
    },
    {
      id: "sec-metrics",
      titleEn: "Operations Key Performance Indicators",
      titleAr: "المؤشرات الإحصائية العامة للفعالية",
      category: "section",
      portalTarget: "sila_operations",
      sectionId: "section-metrics",
      icon: BarChart3,
      keywordsEn: ["metrics", "kpi", "stats", "visitors", "contracts", "commission"],
      keywordsAr: ["مؤشرات", "أرقام", "إحصائيات", "عمولة", "زوار"]
    },
    {
      id: "sec-operations-setup",
      titleEn: "Operations Setup & Provisioning",
      titleAr: "إعداد العمليات وإضافة الكباتن والضيوف",
      category: "section",
      portalTarget: "sila_operations",
      sectionId: "section-operations-setup",
      icon: Settings2,
      keywordsEn: ["setup", "create", "driver", "supplier", "user", "provisioning"],
      keywordsAr: ["إعداد", "إضافة", "سائق", "مورد", "مستخدم"]
    },

    // ── QUICK ACTIONS & UTILITIES ──
    {
      id: "act-export-pdf",
      titleEn: "Export Logistics Plan (PDF)",
      titleAr: "تصدير الخطة اللوجستية (PDF)",
      category: "action",
      actionType: "export-pdf",
      icon: FileDown,
      shortcut: "PDF",
      keywordsEn: ["export", "pdf", "download", "document", "print"],
      keywordsAr: ["تصدير", "بي دي اف", "طباعة", "تحميل", "ملف"]
    },
    {
      id: "act-share-plan",
      titleEn: "Share Plan Link",
      titleAr: "نسخ ومشاركة رابط الخطة",
      category: "action",
      actionType: "share-plan",
      icon: Share2,
      shortcut: "Link",
      keywordsEn: ["share", "link", "copy", "url"],
      keywordsAr: ["مشاركة", "رابط", "نسخ"]
    },
    {
      id: "act-toggle-dark",
      titleEn: "Toggle Dark / Light Mode",
      titleAr: "تبديل المظهر الليلي / النهاري",
      category: "action",
      actionType: "toggle-dark",
      icon: Moon,
      shortcut: "Theme",
      keywordsEn: ["theme", "dark", "light", "mode", "color"],
      keywordsAr: ["مظهر", "ليلي", "نهاري", "لون", "سمة"]
    },
    {
      id: "act-switch-lang",
      titleEn: "Switch Language (العربية / English)",
      titleAr: "تغيير لغة الواجهة (English / العربية)",
      category: "action",
      actionType: "switch-lang",
      icon: Languages,
      shortcut: "Lang",
      keywordsEn: ["language", "arabic", "english", "translate"],
      keywordsAr: ["لغة", "عربي", "انجليزي", "ترجمة"]
    },
    ...(isDemoMode ? [{
      id: "act-war-room",
      titleEn: "Sovereign Command Bridge (War Room)",
      titleAr: "غرفة العمليات والقيادة السيادية",
      category: "action" as const,
      actionType: "war-room" as const,
      icon: Shield,
      shortcut: "Ctrl+Space",
      keywordsEn: ["war room", "command", "bridge", "telemetry", "sovereign"],
      keywordsAr: ["غرفة", "عمليات", "قيادة", "سيادية"]
    }] : [])
  ], [isDemoMode]);

  // Filter items by allowed portals and search query
  const filteredItems = useMemo(() => {
    const q = query.toLowerCase().trim();

    return allItems.filter((item) => {
      // Category tab filter
      if (selectedCategory !== "all" && item.category !== selectedCategory) {
        return false;
      }

      // Check role portal permissions
      if (item.portalTarget && !allowedPortals.includes(item.portalTarget)) {
        return false;
      }

      if (!q) return true;

      const titleMatch = item.titleEn.toLowerCase().includes(q) || item.titleAr.toLowerCase().includes(q);
      const keywordMatch =
        item.keywordsEn.some((k) => k.toLowerCase().includes(q)) ||
        item.keywordsAr.some((k) => k.toLowerCase().includes(q));

      return titleMatch || keywordMatch;
    });
  }, [allItems, allowedPortals, query, selectedCategory]);

  // Handle execution of selected item
  function executeItem(item: NavItem) {
    
    onClose();

    if (item.category === "portal" && item.portalTarget) {
      onSelectPortal(item.portalTarget);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    if (item.category === "section" && item.sectionId) {
      if (item.portalTarget && item.portalTarget !== activePortal) {
        onSelectPortal(item.portalTarget);
        smoothScrollToSection(item.sectionId, 150);
      } else {
        smoothScrollToSection(item.sectionId, 30);
      }
      return;
    }

    if (item.category === "action") {
      switch (item.actionType) {
        case "export-pdf":
          onExportPdf?.();
          break;
        case "share-plan":
          onSharePlan?.();
          break;
        case "toggle-dark":
          onToggleDarkMode();
          break;
        case "switch-lang":
          onToggleLanguage();
          break;
        case "war-room":
          onOpenWarRoom?.();
          break;
      }
    }
  }

  // Handle keyboard navigation inside the command palette
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % Math.max(1, filteredItems.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + filteredItems.length) % Math.max(1, filteredItems.length));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const current = filteredItems[selectedIndex];
      if (current) {
        executeItem(current);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  }

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-16 sm:pt-24 bg-black/65 backdrop-blur-md animate-fadeIn"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-full max-w-2xl rounded-2xl bg-white dark:bg-slate-900 border border-midyaf-gold/30 shadow-2xl overflow-hidden flex flex-col max-h-[80vh] animate-scaleIn ring-1 ring-midyaf-purple/20"
        onKeyDown={handleKeyDown}
      >
        {/* Top Search Input Bar */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/80">
          <Search size={19} className="text-midyaf-gold shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder={
              isArabic
                ? "ابحث عن أي بوابة، قسم، إعداد، أو إجراء سريع (مثال: عقود، CSV، خريطة، PDF)..."
                : "Search portals, in-page sections, tools, or actions (e.g. CSV, Map, Contracts, PDF)..."
            }
            className="w-full bg-transparent text-sm text-midyaf-ink dark:text-white placeholder-slate-400 focus:outline-hidden font-medium"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              <X size={15} />
            </button>
          )}
          <span className="hidden sm:inline-flex items-center gap-1 rounded-md bg-slate-200 dark:bg-slate-800 px-1.5 py-0.5 text-[10px] font-mono text-slate-500 dark:text-slate-400">
            ESC
          </span>
        </div>

        {/* Filter Category Chips */}
        <div className="flex items-center gap-1.5 px-4 py-2 border-b border-slate-100 dark:border-slate-800/60 bg-white/50 dark:bg-slate-900/40 text-xs overflow-x-auto">
          {[
            { id: "all", labelEn: "All", labelAr: "الكل" },
            { id: "portal", labelEn: "Portals", labelAr: "بوابات العمل" },
            { id: "section", labelEn: "In-Page Sections", labelAr: "أقسام العمليات" },
            { id: "action", labelEn: "Actions & Tools", labelAr: "إجراءات وأدوات" }
          ].map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => {
                setSelectedCategory(cat.id as any);
                setSelectedIndex(0);
              }}
              className={`rounded-lg px-2.5 py-1 font-bold text-xs transition-all ${
                selectedCategory === cat.id
                  ? "bg-midyaf-purple text-white shadow-xs"
                  : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              }`}
            >
              {isArabic ? cat.labelAr : cat.labelEn}
            </button>
          ))}
        </div>

        {/* Filtered Item List */}
        <div ref={listRef} className="flex-1 overflow-y-auto p-2 space-y-1">
          {filteredItems.length === 0 ? (
            <div className="py-12 text-center text-slate-400">
              <Compass size={28} className="mx-auto mb-2 opacity-40 text-midyaf-gold" />
              <p className="text-xs font-bold">
                {isArabic ? "لم يتم العثور على نتائج مطابقة" : "No matching destinations found"}
              </p>
            </div>
          ) : (
            filteredItems.map((item, index) => {
              const Icon = item.icon;
              const isSelected = index === selectedIndex;

              return (
                <div
                  key={item.id}
                  onClick={() => executeItem(item)}
                  onMouseEnter={() => setSelectedIndex(index)}
                  className={`flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl cursor-pointer transition-all ${
                    isSelected
                      ? "bg-gradient-to-r from-midyaf-purple/15 via-midyaf-purple/10 to-transparent text-midyaf-purple dark:text-white ring-1 ring-midyaf-gold/40"
                      : "text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`grid size-8 place-items-center rounded-lg transition-transform ${
                        isSelected
                          ? "bg-gradient-to-br from-midyaf-purple to-midyaf-purple-dark text-midyaf-gold scale-110 shadow-xs ring-1 ring-midyaf-gold/30"
                          : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400"
                      }`}
                    >
                      <Icon size={16} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-black truncate">
                        {isArabic ? item.titleAr : item.titleEn}
                      </p>
                      <p className="text-[10px] text-slate-400 truncate">
                        {item.category === "portal"
                          ? (isArabic ? "بوابة عمل رئيسية" : "Main Workspace Portal")
                          : item.category === "section"
                          ? (isArabic ? "انتقال سريع لقسم بالصفحة" : "Direct Jump to Section")
                          : (isArabic ? "إجراء / أداة سريعة" : "Quick Action / Tool")}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {item.shortcut && (
                      <span className="rounded-md bg-midyaf-gold/10 border border-midyaf-gold/30 px-2 py-0.5 text-[10px] font-mono text-midyaf-gold font-bold">
                        {item.shortcut}
                      </span>
                    )}
                    {isSelected && (
                      <ArrowRight size={14} className={isArabic ? "rotate-180 text-midyaf-gold" : "text-midyaf-gold"} />
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer Shortcut Bar */}
        <div className="flex items-center justify-between px-4 py-2.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/80 text-[11px] text-slate-400">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="rounded bg-slate-200 dark:bg-slate-800 px-1.5 py-0.5 font-mono text-[10px]">↑↓</kbd>
              <span>{isArabic ? "للتنقل" : "Navigate"}</span>
            </span>
            <span className="flex items-center gap-1">
              <kbd className="rounded bg-slate-200 dark:bg-slate-800 px-1.5 py-0.5 font-mono text-[10px]">Enter</kbd>
              <span>{isArabic ? "للاختيار" : "Select"}</span>
            </span>
            <span className="flex items-center gap-1">
              <kbd className="rounded bg-slate-200 dark:bg-slate-800 px-1.5 py-0.5 font-mono text-[10px]">Esc</kbd>
              <span>{isArabic ? "للإغلاق" : "Close"}</span>
            </span>
          </div>

          <div className="flex items-center gap-1.5 text-midyaf-gold font-bold">
            <Sparkles size={12} />
            <span>{isArabic ? "نظام مضياف الذكي" : "Midyaf Fast Nav"}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

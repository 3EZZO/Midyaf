// Command palette entries (portals, in-page sections, actions). Bilingual
// copy lives here as data; QuickNavigator renders it. Extracted verbatim
// from the previous QuickNavigator implementation.
import {
  BarChart3,
  Bot,
  Briefcase,
  Building2,
  Car,
  CheckSquare,
  ClipboardList,
  Coins,
  Compass,
  Cpu,
  Crown,
  FileDown,
  FileSignature,
  FileSpreadsheet,
  Hotel,
  Languages,
  LayoutDashboard,
  Radar,
  Settings2,
  Share2,
  Shield,
  Truck,
  Users,
  type LucideIcon
} from "lucide-react";
import type { PortalKey } from "@shared/domain";

export type CommandCategory = "portal" | "section" | "action";
export type CommandAction = "export-pdf" | "share-plan" | "switch-lang" | "war-room";

export interface CommandItem {
  id: string;
  titleEn: string;
  titleAr: string;
  category: CommandCategory;
  portalTarget?: PortalKey;
  sectionId?: string;
  icon: LucideIcon;
  shortcut?: string;
  actionType?: CommandAction;
  keywordsEn: string[];
  keywordsAr: string[];
  /** Only listed while demo mode is active. */
  demoOnly?: boolean;
}

export const COMMAND_ITEMS: CommandItem[] = [
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
  {
    demoOnly: true,
    id: "act-war-room",
    titleEn: "Sovereign Command Bridge (War Room)",
    titleAr: "غرفة العمليات والقيادة السيادية",
    category: "action",
    actionType: "war-room",
    icon: Shield,
    shortcut: "Ctrl+Space",
    keywordsEn: ["war room", "command", "bridge", "telemetry", "sovereign"],
    keywordsAr: ["غرفة", "عمليات", "قيادة", "سيادية"]
  }
];

import {
  Briefcase,
  Building2,
  Car,
  ClipboardList,
  Crown,
  Radio,
  Ticket,
  Users,
  type LucideIcon
} from "lucide-react";
import type { PortalKey } from "@shared/domain";

/** One icon per portal — no collisions, so the rail is scannable at a glance. */
export const portalIcons: Record<PortalKey, LucideIcon> = {
  admin: Crown,
  company: Building2,
  client: Briefcase,
  sila_operations: Radio,
  intake: ClipboardList,
  guest: Ticket,
  captain: Car,
  coordinator: Users
};

/** Short category shown under each portal label. */
export const portalCategory: Record<PortalKey, { en: string; ar: string }> = {
  admin: { en: "Owners", ar: "الملاك" },
  sila_operations: { en: "Operations", ar: "العمليات" },
  company: { en: "Organizer", ar: "المنظمة" },
  client: { en: "Client", ar: "العميل" },
  intake: { en: "Planning", ar: "التخطيط" },
  guest: { en: "Ground", ar: "الميدان" },
  captain: { en: "Ground", ar: "الميدان" },
  coordinator: { en: "Ground", ar: "الميدان" }
};

export const portalMeta: Record<PortalKey, { titleEn: string; titleAr: string; descEn: string; descAr: string }> = {
  admin: {
    titleEn: "Midyaf Sovereign Admin Dashboard",
    titleAr: "لوحة الملاك والإدارة التنفيذية لمضياف",
    descEn: "Owners-only executive governance: submitter audit, plans approval, complaints registry & contracts",
    descAr: "خاصة بالملاك: سجل الجهات المدخلة، اعتماد الخطط، سجل الشكاوى، مؤشرات الفعاليات وخزنة العقود"
  },
  company: {
    titleEn: "Organizing Company Dashboard",
    titleAr: "لوحة الشركة المنظمة (صلة)",
    descEn: "Executive event overview, report approvals, and on-demand client dashboard generator",
    descAr: "المتابعة التنفيذية لشركة صلة، اعتماد التقارير، وتوليد لوحة العميل عند الطلب مع مصفوفة الصلاحيات"
  },
  client: {
    titleEn: "Client Executive Dashboard",
    titleAr: "لوحة العميل المستفيد المخصصة",
    descEn: "Exclusive client portal: reports, schedule amendments, direct logistics communication & performance KPIs",
    descAr: "بوابة العميل المستفيد: استعراض التقارير، تعديلات الجداول، التواصل المباشر مع مدير العمليات ومؤشرات الأداء"
  },
  sila_operations: {
    titleEn: "Sila Operations Command",
    titleAr: "لوحة عمليات صلة (لوجستيات وفعاليات)",
    descEn: "Unified operations command: view reports, activities, contracts & relay tasks",
    descAr: "قيادة العمليات الموحدة: متابعة التقارير، الأنشطة، العقود، وتفويض المهام"
  },
  intake: {
    titleEn: "Activity Intake & Logistics Setup",
    titleAr: "إدخال الفعالية والتجهيز اللوجستي",
    descEn: "Event core data, guest CSV import, hotel rooms, pricing bands & supplier contracts",
    descAr: "البيانات الأساسية، استيراد الضيوف، حجز الفنادق، نطاقات الأسعار وعقود الموردين"
  },
  guest: {
    titleEn: "Guest Hospitality Journey App",
    titleAr: "تطبيق الضيف والرحلة الشاملة",
    descEn: "VIP boarding pass, flight schedules, chauffeur tracking, accommodation & personal requests",
    descAr: "بطاقة الصعود الرقمية، مواعيد الرحلات، تتبع السائق، تفاصيل الإقامة والطلبات الخاصة"
  },
  captain: {
    titleEn: "Captains & Fleet Mobility App",
    titleAr: "تطبيق الكباتن وحركة الأسطول",
    descEn: "Executive chauffeur dispatch, VIP terminal transfers, shuttle routes & live GPS updates",
    descAr: "توزيع المشاوير، نقل كبار الشخصيات من المطار، مسارات التردد وتحديث الموقع المباشر"
  },
  coordinator: {
    titleEn: "Field Coordinators App",
    titleAr: "تطبيق المنسقين والميدان",
    descEn: "Zone supervision, guest ground protocol, incident escalation & dispatch tasks",
    descAr: "إدارة مناطق الفعالية، بروتوكول استقبال الضيوف، إرسال البلاغات وتنسيق الحركة"
  }
};

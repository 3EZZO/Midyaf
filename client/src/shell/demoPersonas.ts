import { Briefcase, Building2, Car, Crown, ShieldCheck, Star, Users, type LucideIcon } from "lucide-react";

/**
 * Demo persona shortcuts for the login screen. Only listed when demo personas
 * are enabled (?demo=1 or VITE_DEMO_PERSONAS=true). T-02: a persona carries no
 * password and grants no access; choosing one fills the email field only, and
 * the user still types the account's password and submits normally.
 * Labels are the original bilingual copy from the fast-access grid.
 */
export type DemoPersona = {
  id: string;
  email: string;
  icon: LucideIcon;
  titleEn: string;
  titleAr: string;
  subtitleEn: string;
  subtitleAr: string;
};

export const DEMO_PERSONAS: DemoPersona[] = [
  {
    id: "admin",
    email: "admin@midyaf.local",
    icon: Crown,
    titleEn: "Midyaf Owner (Admin)",
    titleAr: "مالك مضياف (الإدارة المالية)",
    subtitleEn: "Executive governance",
    subtitleAr: "الحوكمة التنفيذية"
  },
  {
    id: "company",
    email: "company@midyaf.local",
    icon: Building2,
    titleEn: "Sila Organizer",
    titleAr: "شركة صلة (المنظم)",
    subtitleEn: "Client Portal Gen",
    subtitleAr: "توليد لوحة العميل"
  },
  {
    id: "logistics",
    email: "organizer@midyaf.local",
    icon: Briefcase,
    titleEn: "Logistics Manager",
    titleAr: "مدير اللوجستيات",
    subtitleEn: "Ops & Task Relay",
    subtitleAr: "تقارير وتوجيه المهام"
  },
  {
    id: "event",
    email: "event.lead@sila.com",
    icon: Users,
    titleEn: "Event / Activity Mgr",
    titleAr: "مدير الفعالية / النشاط",
    subtitleEn: "Team & Tasks",
    subtitleAr: "بناء الفريق وتوزيع المهام"
  },
  {
    id: "client",
    email: "client.vip@tourism.gov.sa",
    icon: ShieldCheck,
    titleEn: "Client Portal (VIP)",
    titleAr: "بوابة العميل (السياحة)",
    subtitleEn: "Reports & Comms",
    subtitleAr: "متابعة وتقارير وتواصل"
  },
  {
    id: "captain",
    email: "driver@midyaf.local",
    icon: Car,
    titleEn: "Fleet Captain",
    titleAr: "كابتن الأسطول",
    subtitleEn: "Fahad Al Qahtani",
    subtitleAr: "فهد القحطاني"
  },
  {
    id: "guest",
    email: "guest.vip@midyaf.local",
    icon: Star,
    titleEn: "VIP Guest",
    titleAr: "ضيف VIP",
    subtitleEn: "Noura Al Harbi",
    subtitleAr: "نورة الحربي"
  }
];

export function demoPersonasEnabled(): boolean {
  if (import.meta.env.VITE_DEMO_PERSONAS === "true") return true;
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get("demo") === "1") {
      sessionStorage.setItem("midyaf.demoPersonas", "1");
      return true;
    }
    return sessionStorage.getItem("midyaf.demoPersonas") === "1";
  } catch {
    return false;
  }
}

/**
 * Applies a persona shortcut to the login form: the email is filled and any
 * previously typed password is cleared. It cannot sign in; submitting the
 * form with an entered password is still required.
 */
export function selectPersona(
  persona: Pick<DemoPersona, "email">,
  form: { setEmail: (email: string) => void; setPassword: (password: string) => void }
) {
  form.setEmail(persona.email);
  form.setPassword("");
}

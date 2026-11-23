import i18n from "i18next";
import { initReactI18next } from "react-i18next";

const resources = {
  en: {
    translation: {
      brand: "Midyaf",
      brandArabic: "مِضْيَافٌ",
      city: "Summit Zone",
      comingSoon: "Expanded coverage coming soon",
      apiMode: "API connected",
      liveSystem: "Live system",
      switchLanguage: "العربية",
      signIn: "Sign in",
      signingIn: "Signing in",
      signInSubtitle: "Use your Midyaf account to access your role workspace.",
      email: "Email",
      password: "Password",
      logout: "Logout",
      loginFailed: "Login failed",
      loadingWorkspace: "Loading your workspace...",
      workspaceLoadFailed: "Workspace could not be loaded.",
      heroTitle: "Event logistics operations center for summit activities",
      heroSubtitle:
        "From organizing-company intake to AI planning, vendor quotations, contracts, commissions, guest journeys, captains, coordinators, and confirmed reports.",
      portals: {
        admin: "Admin & Owners",
        operations: "Operations Command",
        company: "Sila Organizer",
        client: "Client Portal",
        sila_operations: "Sila Operations",
        intake: "Activity Intake",
        guest: "Guest App",
        captain: "Captains App",
        coordinator: "Coordinators",
        supplier: "Supplier Workspace",
        messages: "Messages"
      },
      common: {
        riyadhOnly: "Operating Region: Summit Zone",
        live: "Live",
        status: "Status",
        send: "Send",
        confirm: "Confirm",
        reports: "Reports"
      },
      guest: {
        guide: "Smart Guest Guide"
      },
      organizer: {
        aiPlan: "Smart Logistics Planner"
      },
      ai: {
        placeholder: "Ask about transport, schedule, hotels, or events"
      }
    }
  },
  ar: {
    translation: {
      brand: "مضياف",
      brandArabic: "Midyaf",
      city: "نطاق القمة",
      comingSoon: "توسيع النطاق قريباً",
      apiMode: "متصل بالواجهة البرمجية",
      liveSystem: "نظام مباشر",
      switchLanguage: "English",
      signIn: "تسجيل الدخول",
      signingIn: "جاري تسجيل الدخول",
      signInSubtitle: "استخدم حساب مضياف للوصول إلى مساحة عملك حسب الدور.",
      email: "البريد الإلكتروني",
      password: "كلمة المرور",
      logout: "تسجيل الخروج",
      loginFailed: "تعذر تسجيل الدخول",
      loadingWorkspace: "جاري تحميل مساحة العمل...",
      workspaceLoadFailed: "تعذر تحميل مساحة العمل.",
      heroTitle: "مركز إدارة لوجستيات الفعاليات والقمم الكبرى",
      heroSubtitle:
        "من إدخال بيانات الشركة المنظمة إلى التخطيط بالذكاء الاصطناعي، عروض الموردين، العقود، العمولات، رحلة الضيف، الكباتن، المنسقين، والتقارير المعتمدة.",
      portals: {
        admin: "لوحة الملاك",
        operations: "قيادة العمليات",
        company: "الشركة المنظمة",
        client: "بوابة العميل",
        sila_operations: "عمليات صلة",
        intake: "إدخال الفعالية",
        guest: "تطبيق الضيف",
        captain: "تطبيق الكباتن",
        coordinator: "منسقو الميدان",
        supplier: "مساحة المورد",
        messages: "الرسائل"
      },
      common: {
        riyadhOnly: "منطقة العمليات: نطاق القمة",
        live: "مباشر",
        status: "الحالة",
        send: "إرسال",
        confirm: "اعتماد",
        reports: "التقارير"
      },
      guest: {
        guide: "دليل الضيف الذكي"
      },
      organizer: {
        aiPlan: "مخطط اللوجستيات الذكي"
      },
      ai: {
        placeholder: "اسأل عن النقل أو الجدول أو الفنادق أو الفعاليات"
      }
    }
  }
};

export const LANGUAGE_STORAGE_KEY = "midyaf.lang";

function readStoredLanguage(): "ar" | "en" {
  try {
    const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (stored === "en" || stored === "ar") return stored;
  } catch {
    // storage unavailable (private mode, SSR)
  }
  return "ar";
}

i18n.use(initReactI18next).init({
  resources,
  lng: readStoredLanguage(),
  fallbackLng: "en",
  interpolation: {
    escapeValue: false
  }
});

i18n.on("languageChanged", (lng) => {
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, lng);
  } catch {
    // ignore
  }
  document.documentElement.lang = lng;
  document.documentElement.dir = lng === "ar" ? "rtl" : "ltr";
});

export default i18n;

import i18n from "i18next";
import { initReactI18next } from "react-i18next";

const resources = {
  en: {
    translation: {
      brand: "Midyaf",
      brandArabic: "مِضْيَافٌ",
      city: "Riyadh",
      comingSoon: "More cities coming soon",
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
      heroTitle: "Event logistics command center for Riyadh activities",
      heroSubtitle:
        "From organizing-company intake to AI planning, vendor quotations, contracts, commissions, guest journeys, captains, coordinators, and confirmed reports.",
      portals: {
        intake: "Activity Intake",
        guest: "Guest App",
        captain: "Captains App",
        coordinator: "Coordinators",
        logistics: "Logistics Dashboard",
        company: "Company Dashboard"
      },
      common: {
        riyadhOnly: "Launch city: Riyadh only",
        live: "Live",
        status: "Status",
        send: "Send",
        confirm: "Confirm",
        reports: "Reports"
      },
      guest: {
        guide: "Guest AI guide"
      },
      organizer: {
        aiPlan: "AI logistics planner"
      },
      ai: {
        placeholder: "Ask about transport, schedule, hotels, or Riyadh"
      }
    }
  },
  ar: {
    translation: {
      brand: "مِضْيَافٌ",
      brandArabic: "Midyaf",
      city: "الرياض",
      comingSoon: "مدن أخرى قريباً",
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
      heroTitle: "مركز إدارة لوجستيات الفعاليات في الرياض",
      heroSubtitle:
        "من إدخال بيانات الشركة المنظمة إلى التخطيط بالذكاء الاصطناعي، عروض الموردين، العقود، العمولات، رحلة الضيف، الكباتن، المنسقين، والتقارير المعتمدة.",
      portals: {
        intake: "إدخال الفعالية",
        guest: "تطبيق الضيف",
        captain: "تطبيق الكباتن",
        coordinator: "تطبيق المنسقين",
        logistics: "لوحة المنظم",
        company: "لوحة الشركة المنظمة"
      },
      common: {
        riyadhOnly: "مدينة الإطلاق: الرياض فقط",
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
        placeholder: "اسأل عن النقل أو الجدول أو الفنادق أو الرياض"
      }
    }
  }
};

i18n.use(initReactI18next).init({
  resources,
  lng: "en",
  fallbackLng: "en",
  interpolation: {
    escapeValue: false
  }
});

export default i18n;

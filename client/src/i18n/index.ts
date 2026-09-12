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
      heroTitle: "Event logistics command center for sovereign summit activities",
      heroSubtitle:
        "From organizing-company intake to AI planning, vendor quotations, contracts, commissions, guest journeys, captains, coordinators, and confirmed reports.",
      portals: {
        admin: "Admin & Owners Dashboard",
        operations: "Operations Command Dashboard",
        company: "Sila Organizing Company",
        client: "Client Portal",
        sila_operations: "Sila Operations Command",
        intake: "Activity Intake",
        guest: "Guest App",
        captain: "Captains App",
        coordinator: "Coordinators"
      },
      common: {
        riyadhOnly: "Operating Region: Sovereign Summit Zone",
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
        admin: "لوحة الملاك والإدارة التنفيذية",
        operations: "لوحة العمليات والتحكم الميداني",
        company: "لوحة الشركة المنظمة (صلة)",
        client: "بوابة العميل المستفيد",
        sila_operations: "لوحة عمليات صلة (لوجستيات وفعاليات)",
        intake: "إدخال وتجهيز الفعالية",
        guest: "تطبيق الضيف والرحلة",
        captain: "تطبيق أسطول الكباتن",
        coordinator: "تطبيق منسقي الميدان"
      },
      common: {
        riyadhOnly: "منطقة العمليات: نطاق القمة السيادية",
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

i18n.use(initReactI18next).init({
  resources,
  lng: "en",
  fallbackLng: "en",
  interpolation: {
    escapeValue: false
  }
});

export default i18n;

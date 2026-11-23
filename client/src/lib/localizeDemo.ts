/**
 * Client-side display localization for seeded/demo persona names, organizing
 * entities, venues, and demo event titles.
 *
 * Strictly display-only (zero DB mutations) and matches exact seeded phrases
 * so real user-entered names or test fixtures pass through untouched.
 */

type BilingualPair = { en: string; ar: string };

const DEMO_PHRASES: BilingualPair[] = [
  // Default client executive profile (shared/constants.ts DEFAULT_CLIENT_CONFIG)
  {
    en: "Mr. Abdulrahman Al-Muhaidib",
    ar: "الأستاذ / عبد الرحمن المهيدب"
  },
  {
    en: "Ministry of Tourism & Hospitality",
    ar: "وزارة السياحة والضيافة"
  },
  {
    en: "Global Investment Summit",
    ar: "القمة العالمية للاستثمار"
  },
  // Seeded demo workspace event & venue labels
  {
    en: "Riyadh Global Hospitality Expo",
    ar: "معرض الرياض العالمي للضيافة"
  },
  {
    en: "Riyadh Front Exhibition Center",
    ar: "مركز واجهة الرياض للمعارض والمؤتمرات"
  },
  {
    en: "Riyadh Exhibition Center",
    ar: "مركز الرياض للمعارض والمؤتمرات"
  },
  {
    en: "Heritage Diriyah VIP Gala",
    ar: "حفل الدرعية التراثي لكبار الشخصيات"
  },
  {
    en: "KAFD Plenary & Financial Conference Center",
    ar: "مركز الملك عبدالله المالي — القاعة الكبرى"
  },
  {
    en: "The Ritz-Carlton Riyadh",
    ar: "فندق الريتز-كارلتون الرياض"
  },
  {
    en: "KKIA Royal Terminal",
    ar: "مطار الملك خالد الدولي — الصالة الملكية"
  },
  // Seeded demo organizations
  {
    en: "Sila Organizing Company",
    ar: "شركة صلة لتنظيم الفعاليات"
  },
  {
    en: "Sila Events",
    ar: "شركة صلة للفعاليات"
  },
  {
    en: "Al-Noor Luxury Hotels",
    ar: "فنادق النور الفاخرة"
  },
  {
    en: "Najd Executive Fleet",
    ar: "أسطول نجد التنفيذي"
  }
];

/** Exact aliases (including legacy synthetic seed labels) mapped to clean EN/AR pairs. */
const ALIAS_MAP: Record<string, BilingualPair> = {
  "overhaul demo expo (synthetic)": {
    en: "Riyadh Global Hospitality Expo",
    ar: "معرض الرياض العالمي للضيافة"
  },
  "overhaul demo expo": {
    en: "Riyadh Global Hospitality Expo",
    ar: "معرض الرياض العالمي للضيافة"
  },
  "sila demo organizing co.": {
    en: "Sila Organizing Company",
    ar: "شركة صلة لتنظيم الفعاليات"
  },
  "sila demo organizing company": {
    en: "Sila Organizing Company",
    ar: "شركة صلة لتنظيم الفعاليات"
  },
  "demo organizing co.": {
    en: "Sila Organizing Company",
    ar: "شركة صلة لتنظيم الفعاليات"
  },
  "al-noor hotels": {
    en: "Al-Noor Luxury Hotels",
    ar: "فنادق النور الفاخرة"
  }
};

const LOOKUP = new Map<string, BilingualPair>();
for (const pair of DEMO_PHRASES) {
  LOOKUP.set(pair.en.toLowerCase(), pair);
  LOOKUP.set(pair.ar.toLowerCase(), pair);
}
for (const [alias, pair] of Object.entries(ALIAS_MAP)) {
  LOOKUP.set(alias.toLowerCase(), pair);
}

/**
 * Localizes known seeded demo strings (client names, entities, event titles,
 * venue names) to match the active UI language without altering real user input.
 */
export function localizeDemoText(
  value: string | null | undefined,
  isArabic: boolean
): string {
  if (!value) return "";
  const trimmed = value.trim();
  const hit = LOOKUP.get(trimmed.toLowerCase());
  if (hit) {
    return isArabic ? hit.ar : hit.en;
  }
  return value;
}

import { useState, useEffect, useRef, useCallback } from "react";
import type { Driver, MidyafData } from "@shared/domain";

export interface DemoHotspot {
  id: string;
  nameEn: string;
  nameAr: string;
  category: "AIRPORT" | "VENUE" | "HOTEL" | "DINING" | "LOGISTICS";
  lat: number;
  lng: number;
  activeFleet: number;
  vipGuestsCount: number;
  statusEn: string;
  statusAr: string;
}

export interface DemoContract {
  id: string;
  contractNumber: string;
  vendorNameEn: string;
  vendorNameAr: string;
  categoryEn: string;
  categoryAr: string;
  scopeEn: string;
  scopeAr: string;
  amount: number;
  commissionPercent: number;
  commissionAmount: number;
  status: "SIGNED" | "ACTIVE" | "IN_EXECUTION";
  signedDate: string;
  certifiedHash: string;
}

export interface DemoVipGuest {
  id: string;
  nameEn: string;
  nameAr: string;
  titleEn: string;
  titleAr: string;
  hotelEn: string;
  hotelAr: string;
  flight: string;
  driverNameEn: string;
  driverNameAr: string;
  vehicleEn: string;
  vehicleAr: string;
  plate: string;
  statusEn: string;
  statusAr: string;
  stage: "TOUCHDOWN" | "IN_TRANSIT" | "CHECKED_IN" | "AT_VENUE";
}

// 6 Iconic Riyadh Summit Locations
export const DEMO_HOTSPOTS: DemoHotspot[] = [
  {
    id: "kkia-t2",
    nameEn: "King Khalid Intl. Airport (Terminal 2)",
    nameAr: "مطار الملك خالد الدولي (الصالة 2)",
    category: "AIRPORT",
    lat: 24.9576,
    lng: 46.6988,
    activeFleet: 8,
    vipGuestsCount: 14,
    statusEn: "Active Arrivals Corridor",
    statusAr: "ممر استقبال الرحلات نشط"
  },
  {
    id: "kafd-plenary",
    nameEn: "King Abdullah Financial District (KAFD Plenary)",
    nameAr: "مركز الملك عبدالله المالي (كافد - القاعة الكبرى)",
    category: "VENUE",
    lat: 24.7642,
    lng: 46.6406,
    activeFleet: 12,
    vipGuestsCount: 220,
    statusEn: "Main Summit Sessions",
    statusAr: "جلسات القمة الرئيسية"
  },
  {
    id: "ritz-carlton",
    nameEn: "The Ritz-Carlton Riyadh",
    nameAr: "فندق الريتز-كارلتون الرياض",
    category: "HOTEL",
    lat: 24.6661,
    lng: 46.6302,
    activeFleet: 15,
    vipGuestsCount: 100,
    statusEn: "VIP Delegation Base",
    statusAr: "مقر إقامة وفود كبار الشخصيات"
  },
  {
    id: "four-seasons",
    nameEn: "Four Seasons Hotel (Kingdom Centre)",
    nameAr: "فندق فور سيزونز (برج المملكة)",
    category: "HOTEL",
    lat: 24.7115,
    lng: 46.6744,
    activeFleet: 6,
    vipGuestsCount: 45,
    statusEn: "Executive Suites Active",
    statusAr: "الأجنحة التنفيذية نشطة"
  },
  {
    id: "diriyah-bujairi",
    nameEn: "Historic Diriyah & Bujairi Terrace",
    nameAr: "الدرعية التاريخية ومطل البجيري",
    category: "DINING",
    lat: 24.7335,
    lng: 46.5742,
    activeFleet: 10,
    vipGuestsCount: 85,
    statusEn: "VIP Royal Gala Dinner",
    statusAr: "حفل العشاء الملكي لكبار الشخصيات"
  },
  {
    id: "alfaisal-av",
    nameEn: "Al-Faisal AV Bay (King Fahd Rd)",
    nameAr: "الفيصل للصوتيات (طريق الملك فهد)",
    category: "LOGISTICS",
    lat: 24.7214,
    lng: 46.6698,
    activeFleet: 3,
    vipGuestsCount: 0,
    statusEn: "Technical Equipment Hub",
    statusAr: "مركز الدعم الفني واللوجستي"
  }
];

// 4 Certified High-Value FII 2027 Contracts
export const DEMO_CONTRACTS: DemoContract[] = [
  {
    id: "ct-2027-01",
    contractNumber: "MIDYAF-CT-2027-01",
    vendorNameEn: "The Ritz-Carlton Riyadh",
    vendorNameAr: "فندق الريتز-كارلتون الرياض",
    categoryEn: "Official VIP Hospitality Partner",
    categoryAr: "شريك الضيافة الرسمي لكبار الشخصيات",
    scopeEn: "100 Royal & Executive Suites for Summit Delegations, Private Lounge Access",
    scopeAr: "١٠٠ جناح ملكي وتنفيذي لوفود القمة مع دخول الاستراحة الملكية الخاصة",
    amount: 1250000,
    commissionPercent: 10,
    commissionAmount: 125000,
    status: "SIGNED",
    signedDate: "2026-09-14",
    certifiedHash: "0x8f2b...c91e"
  },
  {
    id: "ct-2027-02",
    contractNumber: "MIDYAF-CT-2027-02",
    vendorNameEn: "Royal Fleet VIP Services",
    vendorNameAr: "شركة الأسطول الملكي للتنقل الفاخر",
    categoryEn: "Chauffeur & Mobility Provider",
    categoryAr: "مزود النقل والتنقل الفاخر مع سائق",
    scopeEn: "50 Mercedes-Maybach S680 & V-Class Vans with 24/7 Diplomatic Escort",
    scopeAr: "٥٠ سيارة مايباخ وفانات مرسيدس مع مرافقة دبلوماسية على مدار الساعة",
    amount: 450000,
    commissionPercent: 10,
    commissionAmount: 45000,
    status: "SIGNED",
    signedDate: "2026-09-14",
    certifiedHash: "0x3e1a...7d44"
  },
  {
    id: "ct-2027-03",
    contractNumber: "MIDYAF-CT-2027-03",
    vendorNameEn: "Najd Royal Catering & Banqueting",
    vendorNameAr: "تموين نجد الملكي والضيافة الفاخرة",
    categoryEn: "Gourmet Catering & Specialty Coffee",
    categoryAr: "التموين الفاخر والقهوة السعودية المختصة",
    scopeEn: "VIP Plenary Barista Stations, Saudi Organic Dates & Diplomatic Banqueting",
    scopeAr: "محطات باريستا القاعة الكبرى، تمور عضوية فاخرة، وبوفيهات دبلوماسية",
    amount: 180000,
    commissionPercent: 11,
    commissionAmount: 19800,
    status: "SIGNED",
    signedDate: "2026-09-15",
    certifiedHash: "0xaa94...55bf"
  },
  {
    id: "ct-2027-04",
    contractNumber: "MIDYAF-CT-2027-04",
    vendorNameEn: "Al-Faisal Stage & Acoustic Engineering",
    vendorNameAr: "الفيصل لهندسة المسارح والصوتيات",
    categoryEn: "Plenary Audio-Visual & Translation",
    categoryAr: "الأنظمة المرئية والصوتية والترجمة الفورية",
    scopeEn: "Ultra-HD LED Curved Video Wall, 8-Language Simultaneous Translation Units",
    scopeAr: "شاشات LED منحنية فائقة الدقة، ووحدات ترجمة فورية لـ ٨ لغات",
    amount: 290000,
    commissionPercent: 12,
    commissionAmount: 34800,
    status: "SIGNED",
    signedDate: "2026-09-15",
    certifiedHash: "0xcc21...88fa"
  }
];

// 5 VIP Global Figures
export const DEMO_VIP_GUESTS: DemoVipGuest[] = [
  {
    id: "vip-1",
    nameEn: "Noura Al Harbi",
    nameAr: "نورة الحربي",
    titleEn: "Head of Strategic Partnerships (Ministry Delegation)",
    titleAr: "رئيسة الشراكات الاستراتيجية (وفد وزاري)",
    hotelEn: "The Ritz-Carlton Riyadh",
    hotelAr: "فندق الريتز-كارلتون الرياض",
    flight: "SV 1044",
    driverNameEn: "Capt. Sultan Al-Otaibi",
    driverNameAr: "الكابتن سلطان العتيبي",
    vehicleEn: "Mercedes-Maybach S680",
    vehicleAr: "مرسيدس مايباخ S680",
    plate: "KSA 9119",
    statusEn: "En Route to Ritz-Carlton",
    statusAr: "في الطريق إلى الريتز-كارلتون",
    stage: "IN_TRANSIT"
  },
  {
    id: "vip-2",
    nameEn: "H.E. Yasir Al-Rumayyan",
    nameAr: "معالي ياسر الرميان",
    titleEn: "Governor of Public Investment Fund (PIF)",
    titleAr: "محافظ صندوق الاستثمارات العامة",
    hotelEn: "The Ritz-Carlton Royal Suite",
    hotelAr: "الجناح الملكي بالريتز-كارلتون",
    flight: "Private Diplomatic",
    driverNameEn: "Capt. Nasser Al-Mutairi",
    driverNameAr: "الكابتن ناصر المطيري",
    vehicleEn: "Lexus LS 500 Executive",
    vehicleAr: "لكزس LS 500 التنفيذية",
    plate: "KSA 1122",
    statusEn: "Checked In · Opening Keynote Ready",
    statusAr: "تم تسليم الجناح · جاهز للكلمة الافتتاحية",
    stage: "AT_VENUE"
  },
  {
    id: "vip-3",
    nameEn: "Jamie Dimon",
    nameAr: "جيمي ديمون",
    titleEn: "Chairman & CEO, JPMorgan Chase",
    titleAr: "رئيس مجلس الإدارة والرئيس التنفيذي، جي بي مورغان",
    hotelEn: "Four Seasons Riyadh",
    hotelAr: "فندق فور سيزونز الرياض",
    flight: "SV 102 (Arrived KKIA T2)",
    driverNameEn: "Capt. Fahad Al-Qahtani",
    driverNameAr: "الكابتن فهد القحطاني",
    vehicleEn: "BMW 7-Series VIP",
    vehicleAr: "بي إم دبليو الفئة السابعة",
    plate: "KSA 2030",
    statusEn: "Landed KKIA T2 · Fast-Track Escort",
    statusAr: "هبط في الصالة 2 · مرافقة المسار السريع",
    stage: "TOUCHDOWN"
  },
  {
    id: "vip-4",
    nameEn: "Larry Fink",
    nameAr: "لاري فينك",
    titleEn: "Chairman & CEO, BlackRock",
    titleAr: "رئيس مجلس الإدارة والرئيس التنفيذي، بلاك روك",
    hotelEn: "The Ritz-Carlton Riyadh",
    hotelAr: "فندق الريتز-كارلتون الرياض",
    flight: "BA 263",
    driverNameEn: "Capt. Rakan Al-Dossary",
    driverNameAr: "الكابتن راكان الدوسري",
    vehicleEn: "Mercedes V-Class VIP Shuttle",
    vehicleAr: "مرسيدس V-Class فان VIP",
    plate: "KSA 7788",
    statusEn: "En Route to KAFD Plenary Hall",
    statusAr: "في الطريق إلى قاعة كافد الرئيسية",
    stage: "IN_TRANSIT"
  },
  {
    id: "vip-5",
    nameEn: "Ray Dalio",
    nameAr: "راي داليو",
    titleEn: "Founder & CIO Mentor, Bridgewater",
    titleAr: "مؤسس بريدج ووتر",
    hotelEn: "The Ritz-Carlton Riyadh",
    hotelAr: "فندق الريتز-كارلتون الرياض",
    flight: "EK 2042",
    driverNameEn: "Capt. Tariq Al-Ghamdi",
    driverNameAr: "الكابتن طارق الغامدي",
    vehicleEn: "Mercedes V-Class Executive",
    vehicleAr: "مرسيدس V-Class التنفيذية",
    plate: "KSA 5544",
    statusEn: "Bujairi Terrace Gala Confirmed",
    statusAr: "تم تأكيد مقعد حفل عشاء مطل البجيري",
    stage: "CHECKED_IN"
  }
];

// Predefined Route Waypoints for 5 Drivers across Riyadh Corridors
interface Waypoint {
  lat: number;
  lng: number;
  speed: number;
  locationEn: string;
  locationAr: string;
}

const DRIVER_ROUTES: Record<string, Waypoint[]> = {
  // Captain Sultan: KKIA Terminal 2 -> Airport Road -> King Salman -> Ritz-Carlton
  sultan: [
    { lat: 24.9576, lng: 46.6988, speed: 0, locationEn: "KKIA Terminal 2 VIP Curb", locationAr: "مطار الملك خالد - رصيف VIP الصالة 2" },
    { lat: 24.9120, lng: 46.7050, speed: 85, locationEn: "Airport Road Southbound", locationAr: "طريق المطار باتجاه الجنوب" },
    { lat: 24.8540, lng: 46.6910, speed: 92, locationEn: "King Salman interchange", locationAr: "تقاطع طريق الملك سلمان" },
    { lat: 24.7950, lng: 46.6710, speed: 78, locationEn: "Northern Ring Road corridor", locationAr: "الطريق الدائري الشمالي" },
    { lat: 24.7310, lng: 46.6500, speed: 65, locationEn: "King Fahd Road West junction", locationAr: "مخرج طريق الملك فهد غرباً" },
    { lat: 24.6661, lng: 46.6302, speed: 25, locationEn: "Arriving at The Ritz-Carlton Riyadh", locationAr: "الوصول إلى فندق الريتز-كارلتون" }
  ],
  // Captain Fahad: KAFD Loop & King Fahd Rd
  fahad: [
    { lat: 24.7642, lng: 46.6406, speed: 30, locationEn: "KAFD Conference Center VIP Gate 4", locationAr: "مركز مؤتمرات كافد - بوابة 4" },
    { lat: 24.7720, lng: 46.6480, speed: 55, locationEn: "KAFD Financial Hub Loop", locationAr: "حلقة مركز الملك عبدالله المالي" },
    { lat: 24.7810, lng: 46.6550, speed: 65, locationEn: "Northern Ring Service Corridor", locationAr: "طريق الخدمة بالدائري الشمالي" },
    { lat: 24.7690, lng: 46.6380, speed: 45, locationEn: "King Fahd Road KAFD approach", locationAr: "مدخل كافد من طريق الملك فهد" }
  ],
  // Captain Rakan: Ritz-Carlton <-> KAFD Plenary Shuttle
  rakan: [
    { lat: 24.6661, lng: 46.6302, speed: 0, locationEn: "The Ritz-Carlton Shuttle Station", locationAr: "محطة حافلات الريتز-كارلتون" },
    { lat: 24.7000, lng: 46.6350, speed: 70, locationEn: "Makkah Road expressway", locationAr: "طريق مكة السريع" },
    { lat: 24.7400, lng: 46.6420, speed: 65, locationEn: "King Fahd Road flyover", locationAr: "جسر طريق الملك فهد" },
    { lat: 24.7642, lng: 46.6406, speed: 30, locationEn: "KAFD VIP Plenary Drop-off", locationAr: "نقطة إنزال كبار الشخصيات بكافد" }
  ],
  // Captain Tariq: Eastern Ring <-> KKIA Airport Express
  tariq: [
    { lat: 24.8500, lng: 46.7300, speed: 85, locationEn: "Eastern Ring Road Northbound", locationAr: "الدائري الشرقي باتجاه الشمال" },
    { lat: 24.9100, lng: 46.7150, speed: 95, locationEn: "Approaching Airport Terminal 1 & 2", locationAr: "الاقتراب من صالات المطار 1 و 2" },
    { lat: 24.9576, lng: 46.6988, speed: 20, locationEn: "Terminal 2 Ground Operations Bay", locationAr: "ساحة العمليات الأرضية بالصالة 2" }
  ],
  // Captain Nasser: Diplomatic Escort to Historic Diriyah (At-Turaif)
  nasser: [
    { lat: 24.7642, lng: 46.6406, speed: 40, locationEn: "Departing KAFD with Escort Convoy", locationAr: "مغادرة كافد ضمن موكب المرافقة" },
    { lat: 24.7500, lng: 46.6100, speed: 75, locationEn: "King Salman Diriyah Branch Road", locationAr: "فرع طريق الملك سلمان باتجاه الدرعية" },
    { lat: 24.7335, lng: 46.5742, speed: 30, locationEn: "Arrived at Historic Diriyah (Bujairi)", locationAr: "الوصول إلى الدرعية التاريخية (مطل البجيري)" }
  ]
};

// Periodic Operational Dispatch Log Stream in bilingual format
export const SIMULATION_TICKER_EVENTS: { en: string; ar: string }[] = [
  {
    en: "✈️ Flight SV 102 landed at KKIA Terminal 2 with 14 Summit delegates.",
    ar: "✈️ هبوط رحلة الخطوط السعودية SV 102 بالصالة 2 مع 14 من وفود القمة."
  },
  {
    en: "🚗 Capt. Sultan confirmed VIP Noura Al Harbi aboard Maybach S680 (KSA 9119). Cabin: 20°C.",
    ar: "🚗 الكابتن سلطان استقبل نورة الحربي بالمايباخ S680 (أ ق ب 9119). التكييف: 20 درجة."
  },
  {
    en: "📜 Contract #CT-2027-01 active: The Ritz-Carlton 100 suites certified (SAR 1.25M).",
    ar: "📜 العقد #CT-2027-01 معتمد: الريتز-كارلتون 100 جناح موثقة (1.25 مليون ريال)."
  },
  {
    en: "🔐 Triple-Key Security Vault: 3/3 cryptographic approvals verified. Sealed bids intact.",
    ar: "🔐 الخزنة الثلاثية: التحقق من 3/3 موافقات مشفرة. العطاءات المختومة مكتملة ومحمية."
  },
  {
    en: "☕ Najd Catering: 2 baristas & specialty coffee stations deployed to KAFD Plenary Hall A.",
    ar: "☕ تموين نجد: نشر 2 باريستا ومحطات القهوة المختصة بقاعة كافد الكبرى أ."
  },
  {
    en: "⭐ H.E. Yasir Al-Rumayyan arrived at KAFD Plenary. Audio & visual translation cleared.",
    ar: "⭐ وصول معالي ياسر الرميان لقاعة كافد. اكتمال جاهزية الصوتيات وشاشات العرض."
  },
  {
    en: "🚐 Shuttle 1 (Capt. Rakan) departed Ritz-Carlton to KAFD (Capacity: 14/16 seats occupied).",
    ar: "🚐 الحافلة الترددية 1 غادرت الريتز-كارلتون لكافد (الإشغال: 14 من 16 مقعداً)."
  },
  {
    en: "🍽️ Bujairi Terrace: VIP table reservations locked for 85 guests at Maiz and Hakkasan.",
    ar: "🍽️ مطل البجيري: تأكيد حجوزات 85 ضيفاً في مطعم ميز وهاكاسان الدرعية."
  },
  {
    en: "⚡ Al-Faisal AV telemetry: Main stage 8K LED wall performing at 100% nominal output.",
    ar: "⚡ تقرير الفيصل للصوتيات: شاشات 8K بالمسرح الرئيسي تعمل بكفاءة 100%."
  },
  {
    en: "📊 Midyaf Cost Efficiency: Automated fleet dispatch achieved SAR 145,000 in direct fuel/idle savings.",
    ar: "📊 وفورات مضياف الذكية: جدولة الأسطول الذكية حققت وفراً قدره 145,000 ريال سعودي."
  }
];

export function useLiveDemoSimulation({
  data,
  setData,
  setRealtimeLog,
  isArabic
}: {
  data: MidyafData | null;
  setData: React.Dispatch<React.SetStateAction<MidyafData | null>>;
  setRealtimeLog: React.Dispatch<React.SetStateAction<string[]>>;
  isArabic: boolean;
}) {
  const [isSimulating, setIsSimulating] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [simulationStep, setSimulationStep] = useState(0);

  const stepRef = useRef(0);
  const tickerIndexRef = useRef(0);
  const isPausedRef = useRef(false);
  isPausedRef.current = isPaused;

  const tick = useCallback(() => {
    if (isPausedRef.current) return;

    stepRef.current += 1;
    const currentStep = stepRef.current;
    setSimulationStep(currentStep);

    // 1. Move Drivers along their Riyadh routes
    const sultanWp = DRIVER_ROUTES.sultan[currentStep % DRIVER_ROUTES.sultan.length];
    const fahadWp = DRIVER_ROUTES.fahad[currentStep % DRIVER_ROUTES.fahad.length];
    const rakanWp = DRIVER_ROUTES.rakan[currentStep % DRIVER_ROUTES.rakan.length];
    const tariqWp = DRIVER_ROUTES.tariq[currentStep % DRIVER_ROUTES.tariq.length];
    const nasserWp = DRIVER_ROUTES.nasser[currentStep % DRIVER_ROUTES.nasser.length];

    setData((current) => {
      if (!current) return current;

      // Map or update drivers
      const updatedDrivers = current.drivers.map((driver) => {
        const name = (driver.user?.name ?? "").toLowerCase();

        if (name.includes("sultan")) {
          return {
            ...driver,
            currentLat: sultanWp.lat,
            currentLng: sultanWp.lng,
            status: "EN_ROUTE" as const,
            zone: "NORTH_RIYADH" as const,
            lastLocationAt: new Date().toISOString()
          };
        } else if (name.includes("fahad") || name.includes("driver")) {
          return {
            ...driver,
            currentLat: fahadWp.lat,
            currentLng: fahadWp.lng,
            status: "EN_ROUTE" as const,
            zone: "CENTRAL_RIYADH" as const,
            lastLocationAt: new Date().toISOString()
          };
        } else if (name.includes("rakan")) {
          return {
            ...driver,
            currentLat: rakanWp.lat,
            currentLng: rakanWp.lng,
            status: "EN_ROUTE" as const,
            zone: "WEST_RIYADH" as const,
            lastLocationAt: new Date().toISOString()
          };
        } else if (name.includes("tariq")) {
          return {
            ...driver,
            currentLat: tariqWp.lat,
            currentLng: tariqWp.lng,
            status: "AVAILABLE" as const,
            zone: "EAST_RIYADH" as const,
            lastLocationAt: new Date().toISOString()
          };
        } else if (name.includes("nasser")) {
          return {
            ...driver,
            currentLat: nasserWp.lat,
            currentLng: nasserWp.lng,
            status: "EN_ROUTE" as const,
            zone: "DIRIYAH_CORRIDOR" as const,
            lastLocationAt: new Date().toISOString()
          };
        }

        // If generic, move towards KAFD
        return {
          ...driver,
          currentLat: sultanWp.lat,
          currentLng: sultanWp.lng,
          lastLocationAt: new Date().toISOString()
        };
      });

      return {
        ...current,
        drivers: updatedDrivers
      };
    });

    // 2. Push realistic event ticker into realtimeLog every 2 steps
    if (currentStep % 2 === 0) {
      const eventObj = SIMULATION_TICKER_EVENTS[tickerIndexRef.current % SIMULATION_TICKER_EVENTS.length];
      tickerIndexRef.current += 1;
      const message = isArabic ? eventObj.ar : eventObj.en;
      const timestamp = new Date().toLocaleTimeString(isArabic ? "ar-SA" : "en-SA", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
      });

      setRealtimeLog((prev) => [`${message} · ${timestamp}`, ...prev.slice(0, 5)]);
    }
  }, [isArabic, setData, setRealtimeLog]);

  useEffect(() => {
    if (!isSimulating) return;

    // Run initial tick immediately
    tick();

    const interval = setInterval(tick, 2500);
    return () => clearInterval(interval);
  }, [isSimulating, tick]);

  const startSimulation = useCallback(() => {
    setIsSimulating(true);
    setIsPaused(false);
    stepRef.current = 0;
    const timestamp = new Date().toLocaleTimeString(isArabic ? "ar-SA" : "en-SA");
    const welcome = isArabic
      ? `🚀 بدأت محاكاة عمليات قمة الرياض 2027 الحية · ${timestamp}`
      : `🚀 Live Riyadh Summit 2027 Operations Simulation Active · ${timestamp}`;
    setRealtimeLog((prev) => [welcome, ...prev.slice(0, 4)]);
  }, [isArabic, setRealtimeLog]);

  const pauseSimulation = useCallback(() => {
    setIsPaused(true);
  }, []);

  const resumeSimulation = useCallback(() => {
    setIsPaused(false);
  }, []);

  const resetSimulation = useCallback(() => {
    stepRef.current = 0;
    tickerIndexRef.current = 0;
    tick();
  }, [tick]);

  const stopSimulation = useCallback(() => {
    setIsSimulating(false);
    setIsPaused(false);
  }, []);

  return {
    isSimulating,
    isPaused,
    simulationStep,
    hotspots: DEMO_HOTSPOTS,
    contracts: DEMO_CONTRACTS,
    vipGuests: DEMO_VIP_GUESTS,
    startSimulation,
    pauseSimulation,
    resumeSimulation,
    resetSimulation,
    stopSimulation
  };
}

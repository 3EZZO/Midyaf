export const RIYADH = {
  code: "riyadh",
  nameEn: "Riyadh",
  nameAr: "الرياض",
  centerLat: 24.7136,
  centerLng: 46.6753,
  defaultZoom: 12,
  timezone: "Asia/Riyadh",
  currency: "SAR",
  vatPercent: 15
} as const;

export const BUSINESS_RULES = {
  freeTierGuestLimit: 50,
  commissionMinPercent: 10,
  commissionMaxPercent: 15,
  commissionDefaultPercent: 12,
  vipPriority: true,
  delayAlertMinutes: 5,
  normalGuestsPerShuttleCar: 4,
  vipCarRatio: 1
} as const;

export const DRIVER_ZONES = [
  "NORTH_RIYADH",
  "CENTRAL_RIYADH",
  "EAST_RIYADH",
  "WEST_RIYADH",
  "SOUTH_RIYADH",
  "DIRIYAH_CORRIDOR"
] as const;

export const PORTALS = [
  "intake",
  "guest",
  "captain",
  "coordinator",
  "logistics",
  "company"
] as const;

export const CONCENTRIC_GEOFENCES = [
  {
    id: "geo-kkia-royal",
    code: "KKIA_ROYAL_T5",
    nameEn: "KKIA Royal Terminal & VIP Pavilion",
    nameAr: "مطار الملك خالد الدولي - الصالة الملكية وصالة كبار الشخصيات",
    category: "AIRPORT" as const,
    centerLat: 24.9576,
    centerLng: 46.6988,
    rings: [
      {
        ring: "OUTER_APPROACH" as const,
        radiusMeters: 5000,
        labelEn: "Airport Highway Outer Approach",
        labelAr: "الممر السريع لمحيط المطار الخارجي",
        autoAction: "PRE_STAGING_ALERT"
      },
      {
        ring: "STAGING_HOLD" as const,
        radiusMeters: 1500,
        labelEn: "VIP Apron Staging Depot",
        labelAr: "منطقة الاصطفاف والانتظار بمهبط VIP",
        autoAction: "DISPATCH_STAGING_ORDER"
      },
      {
        ring: "CURBSIDE_GATE" as const,
        radiusMeters: 300,
        labelEn: "Royal Gate VIP Curbside",
        labelAr: "رصيف الاستقبال المباشر بالصالة الملكية",
        autoAction: "VIP_CURBSIDE_ALERT"
      },
      {
        ring: "DOCKED_BAY" as const,
        radiusMeters: 50,
        labelEn: "Bay 1 Diplomatic Dock",
        labelAr: "موقف المراسم الدبلوماسية رقم 1",
        autoAction: "AUTO_ARRIVE_TASK"
      }
    ]
  },
  {
    id: "geo-kafd-plenary",
    code: "KAFD_PLENARY_HALL",
    nameEn: "KAFD Plenary & Financial Conference Center",
    nameAr: "مركز الملك عبدالله المالي - القاعة الكبرى والمركز المالي",
    category: "VENUE" as const,
    centerLat: 24.7642,
    centerLng: 46.6406,
    rings: [
      {
        ring: "OUTER_APPROACH" as const,
        radiusMeters: 3000,
        labelEn: "Northern Ring KAFD Access Ramp",
        labelAr: "الممر المحيطي الشمالي لكافد",
        autoAction: "PRE_STAGING_ALERT"
      },
      {
        ring: "STAGING_HOLD" as const,
        radiusMeters: 800,
        labelEn: "KAFD Underground Staging Deck",
        labelAr: "منصة الاصطفاف السفلي بكافد",
        autoAction: "DISPATCH_STAGING_ORDER"
      },
      {
        ring: "CURBSIDE_GATE" as const,
        radiusMeters: 200,
        labelEn: "Main Plenary Hall Curbside",
        labelAr: "رصيف الدخول الرئيسي للقاعة الكبرى",
        autoAction: "VIP_CURBSIDE_ALERT"
      },
      {
        ring: "DOCKED_BAY" as const,
        radiusMeters: 40,
        labelEn: "Plenary VIP Entrance Dock",
        labelAr: "موقف الدخول الدبلوماسي بالقاعة الكبرى",
        autoAction: "AUTO_ARRIVE_TASK"
      }
    ]
  },
  {
    id: "geo-ritz-carlton",
    code: "RITZ_CARLTON_RIYADH",
    nameEn: "The Ritz-Carlton Riyadh Delegation Base",
    nameAr: "فندق الريتز-كارلتون الرياض - مقر الوفود الرسمية",
    category: "HOTEL" as const,
    centerLat: 24.6661,
    centerLng: 46.6302,
    rings: [
      {
        ring: "OUTER_APPROACH" as const,
        radiusMeters: 3000,
        labelEn: "Makkah Road Outer Security Gate",
        labelAr: "البوابة الأمنية الخارجية لطريق مكة",
        autoAction: "PRE_STAGING_ALERT"
      },
      {
        ring: "STAGING_HOLD" as const,
        radiusMeters: 600,
        labelEn: "Palace Grand Courtyard Staging",
        labelAr: "منطقة الانتظار بالفناء الملكي الخارجي",
        autoAction: "DISPATCH_STAGING_ORDER"
      },
      {
        ring: "CURBSIDE_GATE" as const,
        radiusMeters: 150,
        labelEn: "Palace Portico VIP Curbside",
        labelAr: "رصيف المدخل الرئيسي لقصر الريتز",
        autoAction: "VIP_CURBSIDE_ALERT"
      },
      {
        ring: "DOCKED_BAY" as const,
        radiusMeters: 35,
        labelEn: "Royal Suite Portico Dock",
        labelAr: "موقف المراسم الملكية الخاص",
        autoAction: "AUTO_ARRIVE_TASK"
      }
    ]
  },
  {
    id: "geo-diriyah-bujairi",
    code: "DIRIYAH_BUJAIRI",
    nameEn: "Historic Diriyah & Bujairi Terrace",
    nameAr: "الدرعية التاريخية ومطل البجيري",
    category: "HERITAGE" as const,
    centerLat: 24.7335,
    centerLng: 46.5742,
    rings: [
      {
        ring: "OUTER_APPROACH" as const,
        radiusMeters: 3500,
        labelEn: "Wadi Hanifah Perimeter Access",
        labelAr: "مدخل وادي حنيفة المحيطي",
        autoAction: "PRE_STAGING_ALERT"
      },
      {
        ring: "STAGING_HOLD" as const,
        radiusMeters: 750,
        labelEn: "Bujairi Valet & Staging Hub",
        labelAr: "منطقة اصطفاف البجيري التراثي",
        autoAction: "DISPATCH_STAGING_ORDER"
      },
      {
        ring: "CURBSIDE_GATE" as const,
        radiusMeters: 200,
        labelEn: "Heritage Gate VIP Curbside",
        labelAr: "رصيف بوابة الدرعية التاريخية",
        autoAction: "VIP_CURBSIDE_ALERT"
      },
      {
        ring: "DOCKED_BAY" as const,
        radiusMeters: 40,
        labelEn: "Heritage Pavilion Dock",
        labelAr: "موقف جناح كبار الشخصيات بالدرعية",
        autoAction: "AUTO_ARRIVE_TASK"
      }
    ]
  }
];


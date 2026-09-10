export const SUMMIT_REGION = {
  code: "summit_region",
  nameEn: "Summit Region",
  nameAr: "منطقة القمة",
  centerLat: 24.7136,
  centerLng: 46.6753,
  defaultZoom: 12,
  timezone: "Asia/Riyadh",
  currency: "SAR",
  vatPercent: 15
} as const;

export const RIYADH = SUMMIT_REGION;

export const OFFICIAL_SUPPLIER_CATEGORIES = [
  {
    key: "AIRLINE" as const,
    nameEn: "Airline Companies",
    nameAr: "شركات الطيران والرحلات الخاصة",
    icon: "Plane"
  },
  {
    key: "VEHICLE_BROKERAGE" as const,
    nameEn: "Vehicle & Cart Brokerage Companies",
    nameAr: "شركات وساطة المركبات والعربات",
    icon: "Car"
  },
  {
    key: "CAR_RENTAL" as const,
    nameEn: "Car & Bus Rental Companies",
    nameAr: "شركات تأجير السيارات والحافلات",
    icon: "CarFront"
  },
  {
    key: "MAN_POWER" as const,
    nameEn: "Manpower & Workforce Companies",
    nameAr: "شركات القوى البشرية والعمالة",
    icon: "Users"
  },
  {
    key: "GOLF_CARTS" as const,
    nameEn: "Golf Cart & Mini-Mobility Companies",
    nameAr: "شركات عربات الجولف والتنقل الداخلي",
    icon: "Zap"
  },
  {
    key: "HEAVY_TRUCKS" as const,
    nameEn: "Heavy Truck Companies",
    nameAr: "شركات الشاحنات الثقيلة والمقطورات",
    icon: "Truck"
  },
  {
    key: "HEAVY_EQUIPMENT" as const,
    nameEn: "Cranes & Heavy Equipment Companies",
    nameAr: "شركات الرافعات والمعدات الثقيلة",
    icon: "Building"
  },
  {
    key: "HOTEL" as const,
    nameEn: "Hotel & Hospitality Companies",
    nameAr: "شركات الفنادق والضيافة الفاخرة",
    icon: "Hotel"
  }
] as const;

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
  "NORTH_ZONE",
  "CENTRAL_ZONE",
  "EAST_ZONE",
  "WEST_ZONE",
  "SOUTH_ZONE",
  "SUMMIT_CORRIDOR",
  "NORTH_RIYADH",
  "CENTRAL_RIYADH",
  "EAST_RIYADH",
  "WEST_RIYADH",
  "SOUTH_RIYADH",
  "DIRIYAH_CORRIDOR"
] as const;

export const PORTALS = [
  "admin",
  "operations",
  "logistics",
  "company",
  "client",
  "logistics_mgr",
  "event_mgr",
  "intake",
  "guest",
  "captain",
  "coordinator"
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

export const DEFAULT_COMPLAINTS = [
  {
    id: "cmp-001",
    activityName: "Global Sovereign Investment Summit",
    complainantName: "الوفد الدبلوماسي البريطاني (Lord Harrington)",
    complainantRole: "VIP Guest",
    severity: "HIGH" as const,
    category: "TRANSPORT" as const,
    description: "تأخر وصول موكب الحراسة المرافق من صالة المطار الملكية لمدة 12 دقيقة بسبب تحويل مسار أمني مؤقت.",
    status: "IN_REVIEW" as const,
    createdAt: "2026-09-10T08:15:00Z"
  },
  {
    id: "cmp-002",
    activityName: "Global Sovereign Investment Summit",
    complainantName: "مساعد رئيس وفد سنغافورة (Dr. Chen Wei)",
    complainantRole: "VIP Guest Assistant",
    severity: "NORMAL" as const,
    category: "HOTEL" as const,
    description: "طلب تغيير الجناح الفندقي في فندق فورسيزونز إلى إطلالة هادئة غير مطلة على أعمال تجهيز الساحة.",
    status: "RESOLVED" as const,
    createdAt: "2026-09-10T07:30:00Z",
    resolvedAt: "2026-09-10T08:00:00Z",
    resolutionNotes: "تم التنسيق مع إدارة الفندق ونقل الضيف إلى جناح تنفيذي في الطابق 24."
  },
  {
    id: "cmp-003",
    activityName: "Heritage Diriyah VIP Gala",
    complainantName: "مشرف البروتوكول بالفعالية (فريق صلة الميداني)",
    complainantRole: "Field Coordinator",
    severity: "CRITICAL" as const,
    category: "SCHEDULE" as const,
    description: "تداخل وصول وفدين رئيسيين في بوابة وادي حنيفة بالتزامن مع إغلاق مسار الحافلات الترددية.",
    status: "OPEN" as const,
    createdAt: "2026-09-10T09:10:00Z"
  }
];

export const DEFAULT_CLIENT_CONFIG = {
  clientId: "cli-sila-gov-2026",
  clientName: "الأستاذ / عبد الرحمن المهيدب",
  clientEntity: "وزارة السياحة والضيافة السيادية",
  eventTitle: "Global Sovereign Investment Summit",
  shareableToken: "MIDYAF-CLIENT-SECURE-8842X",
  canViewReports: true,
  canViewScheduleAmendments: true,
  canCommunicateLogistics: true,
  canViewPerformance: true,
  createdAt: "2026-09-09T14:00:00Z",
  isActive: true
};

export const DEFAULT_TEAM_MEMBERS = [
  {
    id: "tm-001",
    name: "سلطان الغامدي",
    roleTitle: "قائد عمليات النقل الميداني (Ground Transport Lead)",
    phone: "+966551234001",
    email: "sultan.lead@sila.com",
    zone: "NORTH_ZONE",
    activeTasksCount: 4,
    status: "ON_MISSION" as const
  },
  {
    id: "tm-002",
    name: "ريم العتيبي",
    roleTitle: "مشرفة بروتوكول كبار الشخصيات (VIP Protocol Officer)",
    phone: "+966551234002",
    email: "reem.vip@sila.com",
    zone: "CENTRAL_ZONE",
    activeTasksCount: 2,
    status: "AVAILABLE" as const
  },
  {
    id: "tm-003",
    name: "عمر الحربي",
    roleTitle: "منسق حركة صالات المطار (Airport Terminal Dispatcher)",
    phone: "+966551234003",
    email: "omar.air@sila.com",
    zone: "SUMMIT_CORRIDOR",
    activeTasksCount: 5,
    status: "ON_MISSION" as const
  },
  {
    id: "tm-004",
    name: "فيصل الدوسري",
    roleTitle: "مشرف التسكين وضيافة الفنادق (Hotel Liaison Lead)",
    phone: "+966551234004",
    email: "faisal.hotel@sila.com",
    zone: "CENTRAL_ZONE",
    activeTasksCount: 1,
    status: "AVAILABLE" as const
  }
];

export const DEFAULT_SCHEDULE_AMENDMENTS = [
  {
    id: "amd-101",
    eventId: "sovereign-luxury-forum-2026",
    title: "تأخير موعد هبوط الطائرة الخاصة للوفد الإماراتي",
    titleAr: "تأخير موعد هبوط الطائرة الخاصة للوفد الإماراتي",
    type: "FLIGHT_DELAY" as const,
    originalTime: "14:30",
    revisedTime: "15:45",
    affectedGuests: "معالي رئيس الوفد والوفد المرافق (8 ضيوف VIP)",
    status: "CONFIRMED" as const,
    updatedAt: "منذ 20 دقيقة"
  },
  {
    id: "amd-102",
    eventId: "sovereign-luxury-forum-2026",
    title: "تقديم موعد اجتماع المائدة المستديرة الوزارية المغلقة",
    titleAr: "تقديم موعد اجتماع المائدة المستديرة الوزارية المغلقة",
    type: "VIP_AGENDA_SHIFT" as const,
    originalTime: "18:00",
    revisedTime: "17:15",
    affectedGuests: "كافة وزراء وممثلي الصناديق السيادية (18 ضيفاً)",
    status: "IN_PROGRESS" as const,
    updatedAt: "منذ 45 دقيقة"
  },
  {
    id: "amd-103",
    eventId: "sovereign-luxury-forum-2026",
    title: "تعديل مسار موكب العشاء الرسمي عبر طريق الملك سلمان",
    titleAr: "تعديل مسار موكب العشاء الرسمي عبر طريق الملك سلمان",
    type: "CONVOY_REROUTE" as const,
    originalTime: "20:00",
    revisedTime: "20:10",
    affectedGuests: "الموكب الملكي (12 مركبة كاديلك ومايباخ)",
    status: "CONFIRMED" as const,
    updatedAt: "منذ ساعة"
  }
];

export const DEFAULT_CLIENT_MESSAGES = [
  {
    id: "msg-001",
    clientId: "cli-sila-gov-2026",
    senderName: "الأستاذ / عبد الرحمن المهيدب (العميل)",
    senderRole: "CLIENT" as const,
    message: "نرجو التأكيد على جاهزية موكب الاستقبال الإضافي لوزير التجارة فور هبوط طائرته في الصالة الملكية الساعة 15:45.",
    timestamp: "10:14 AM",
    isRead: true
  },
  {
    id: "msg-002",
    clientId: "cli-sila-gov-2026",
    senderName: "مدير العمليات اللوجستية (صلة)",
    senderRole: "LOGISTICS_MANAGER" as const,
    message: "تم توجيه الكابتن فهد القحطاني وسيارتي مايباخ مرافقة للوقوف في الرصيف الداخلي للصالة الملكية، وجاهزون بنسبة 100%.",
    timestamp: "10:18 AM",
    isRead: true
  }
];


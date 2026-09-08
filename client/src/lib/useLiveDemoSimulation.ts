import { useState, useEffect, useRef, useCallback } from "react";
import type { Driver, MidyafData, VendorQuote, CategoryPriceRange, SupplierCategory } from "@shared/domain";
import { OFFICIAL_SUPPLIER_CATEGORIES } from "@shared/constants";
export { OFFICIAL_SUPPLIER_CATEGORIES };

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

// 6 Iconic Sovereign Summit Locations
export const DEMO_HOTSPOTS: DemoHotspot[] = [
  {
    id: "kkia-t2",
    nameEn: "International Airport (Terminal 2)",
    nameAr: "المطار الدولي (الصالة 2)",
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
    nameEn: "Financial District (Plenary Hall)",
    nameAr: "المركز المالي (القاعة الكبرى)",
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
    nameEn: "The Ritz-Carlton",
    nameAr: "فندق الريتز-كارلتون",
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
    nameEn: "Four Seasons Hotel",
    nameAr: "فندق فور سيزونز",
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
    nameEn: "Historic District & Bujairi Terrace",
    nameAr: "المنطقة التاريخية ومطل البجيري",
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
    nameEn: "Logistics AV Bay",
    nameAr: "مركز العمليات للصوتيات والأنظمة",
    category: "LOGISTICS",
    lat: 24.7214,
    lng: 46.6698,
    activeFleet: 3,
    vipGuestsCount: 0,
    statusEn: "Technical Equipment Hub",
    statusAr: "مركز الدعم الفني واللوجستي"
  }
];

// 8 Certified High-Value Sovereign Summit Contracts across the 8 Official Categories
export const DEMO_CONTRACTS: DemoContract[] = [
  {
    id: "ct-2027-01",
    contractNumber: "MIDYAF-CT-2027-01",
    vendorNameEn: "Saudia Private Aviation (SPA)",
    vendorNameAr: "طيران السعودية الخاص",
    categoryEn: "Airlines & VIP Flight Operations",
    categoryAr: "شركات الطيران والتنقل الجوي الخاص",
    scopeEn: "Diplomatic Private Charter & VIP Fast-Track Apron Operations",
    scopeAr: "طيران تنفيذي خاص وخدمات مدرج سريعة للوفود الدبلوماسية",
    amount: 580000,
    commissionPercent: 10,
    commissionAmount: 58000,
    status: "SIGNED",
    signedDate: "2026-09-12",
    certifiedHash: "0x7a11...41b2"
  },
  {
    id: "ct-2027-02",
    contractNumber: "MIDYAF-CT-2027-02",
    vendorNameEn: "Al-Wefaq Vehicle Brokerage",
    vendorNameAr: "شركة الوفاق لوساطة المركبات",
    categoryEn: "Vehicle & Cart Brokerage",
    categoryAr: "وساطة المركبات والعربات اللوجستية",
    scopeEn: "Sovereign Motorcade & Inter-Venue Cart Fleet Coordination",
    scopeAr: "تأمين ووساطة أسطول المواكب الرسمية وتوزيع العربات بين المقرات",
    amount: 320000,
    commissionPercent: 10,
    commissionAmount: 32000,
    status: "SIGNED",
    signedDate: "2026-09-13",
    certifiedHash: "0x4b89...12ce"
  },
  {
    id: "ct-2027-03",
    contractNumber: "MIDYAF-CT-2027-03",
    vendorNameEn: "Royal Fleet VIP Services",
    vendorNameAr: "شركة الأسطول الملكي للتنقل الفاخر",
    categoryEn: "Car & Bus Rental Fleet",
    categoryAr: "تأجير السيارات والحافلات الفاخرة",
    scopeEn: "50 Mercedes-Maybach S680 & 15 Luxury VIP Buses with 24/7 Diplomatic Escort",
    scopeAr: "٥٠ سيارة مايباخ و١٥ حافلة VIP فاخرة مع مرافقة دبلوماسية على مدار الساعة",
    amount: 450000,
    commissionPercent: 10,
    commissionAmount: 45000,
    status: "SIGNED",
    signedDate: "2026-09-14",
    certifiedHash: "0x3e1a...7d44"
  },
  {
    id: "ct-2027-04",
    contractNumber: "MIDYAF-CT-2027-04",
    vendorNameEn: "Maharah Human Resources",
    vendorNameAr: "شركة مهارة للموارد البشرية",
    categoryEn: "Manpower & Event Operations Staff",
    categoryAr: "القوى البشرية والتشغيل الميداني",
    scopeEn: "120 Protocol Ushers & 60 Cargo/Loading Ground Handlers",
    scopeAr: "١٢٠ مشرف مراسم وبروتوكول و٦٠ عامل تحميل وبضائع على مدار الساعة",
    amount: 195000,
    commissionPercent: 10,
    commissionAmount: 19500,
    status: "SIGNED",
    signedDate: "2026-09-14",
    certifiedHash: "0x9c3f...aa82"
  },
  {
    id: "ct-2027-05",
    contractNumber: "MIDYAF-CT-2027-05",
    vendorNameEn: "E-Z-GO Saudi Club Cars",
    vendorNameAr: "شركة إي-زي-جو لعربات الجولف",
    categoryEn: "Golf Carts & Mini-Mobility",
    categoryAr: "عربات الجولف والتنقل الداخلي",
    scopeEn: "35 Multi-Passenger Electric Golf Carts for Intra-Venue VIP Mobility",
    scopeAr: "٣٥ عربة جولف كهربائية فاخرة متعددة المقاعد للتنقل الداخلي",
    amount: 85000,
    commissionPercent: 10,
    commissionAmount: 8500,
    status: "SIGNED",
    signedDate: "2026-09-15",
    certifiedHash: "0x1d55...29ef"
  },
  {
    id: "ct-2027-06",
    contractNumber: "MIDYAF-CT-2027-06",
    vendorNameEn: "Almajdouie Heavy Logistics",
    vendorNameAr: "المجدوعي للوجستيات الثقيلة",
    categoryEn: "Transportation & Heavy Trucks",
    categoryAr: "شاحنات النقل والشاحنات الثقيلة",
    scopeEn: "18 Flatbed & Curtain Heavy Transportation Trucks for Staging Assets",
    scopeAr: "١٨ شاحنة ثقيلة لنقل المعدات ومستلزمات الفعالية الضخمة",
    amount: 216000,
    commissionPercent: 10,
    commissionAmount: 21600,
    status: "SIGNED",
    signedDate: "2026-09-15",
    certifiedHash: "0x78ab...9901"
  },
  {
    id: "ct-2027-07",
    contractNumber: "MIDYAF-CT-2027-07",
    vendorNameEn: "Zahid Tractor & Heavy Cranes",
    vendorNameAr: "شركة الزاهد للرافعات والمعدات الثقيلة",
    categoryEn: "Cranes & Heavy Equipment",
    categoryAr: "الرافعات والمعدات الثقيلة",
    scopeEn: "6 Mobile Hydraulic Cranes & Industrial Boom Lifts with Certified Riggers",
    scopeAr: "٦ رافعات هيدروليكية ومعدات رفع ثقيلة مع مشغلين معتمدين",
    amount: 270000,
    commissionPercent: 10,
    commissionAmount: 27000,
    status: "SIGNED",
    signedDate: "2026-09-15",
    certifiedHash: "0x61da...b442"
  },
  {
    id: "ct-2027-08",
    contractNumber: "MIDYAF-CT-2027-08",
    vendorNameEn: "The Ritz-Carlton",
    vendorNameAr: "فندق الريتز-كارلتون",
    categoryEn: "Hotels & VIP Hospitality",
    categoryAr: "الفنادق والضيافة الملكية",
    scopeEn: "100 Royal & Executive Suites for Summit Delegations, Private Lounge Access",
    scopeAr: "١٠٠ جناح ملكي وتنفيذي لوفود القمة مع دخول الاستراحة الملكية الخاصة",
    amount: 1250000,
    commissionPercent: 10,
    commissionAmount: 125000,
    status: "SIGNED",
    signedDate: "2026-09-16",
    certifiedHash: "0x8f2b...c91e"
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
    hotelEn: "The Ritz-Carlton",
    hotelAr: "فندق الريتز-كارلتون",
    flight: "SV 1044",
    driverNameEn: "Capt. Sultan Al-Otaibi",
    driverNameAr: "الكابتن سلطان العتيبي",
    vehicleEn: "Mercedes-Maybach S680",
    vehicleAr: "مرسيدس مايباخ S680",
    plate: "KSA 9119",
    statusEn: "En Route to The Ritz-Carlton",
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
    hotelEn: "Four Seasons Hotel",
    hotelAr: "فندق فور سيزونز",
    flight: "SV 102 (Arrived Terminal 2)",
    driverNameEn: "Capt. Fahad Al-Qahtani",
    driverNameAr: "الكابتن فهد القحطاني",
    vehicleEn: "BMW 7-Series VIP",
    vehicleAr: "بي إم دبليو الفئة السابعة",
    plate: "KSA 2030",
    statusEn: "Landed Terminal 2 · Fast-Track Escort",
    statusAr: "هبط في الصالة 2 · مرافقة المسار السريع",
    stage: "TOUCHDOWN"
  },
  {
    id: "vip-4",
    nameEn: "Larry Fink",
    nameAr: "لاري فينك",
    titleEn: "Chairman & CEO, BlackRock",
    titleAr: "رئيس مجلس الإدارة والرئيس التنفيذي، بلاك روك",
    hotelEn: "The Ritz-Carlton",
    hotelAr: "فندق الريتز-كارلتون",
    flight: "BA 263",
    driverNameEn: "Capt. Rakan Al-Dossary",
    driverNameAr: "الكابتن راكان الدوسري",
    vehicleEn: "Mercedes V-Class VIP Shuttle",
    vehicleAr: "مرسيدس V-Class فان VIP",
    plate: "KSA 7788",
    statusEn: "En Route to Financial District Plenary",
    statusAr: "في الطريق إلى قاعة المركز المالي الرئيسية",
    stage: "IN_TRANSIT"
  },
  {
    id: "vip-5",
    nameEn: "Ray Dalio",
    nameAr: "راي داليو",
    titleEn: "Founder & CIO Mentor, Bridgewater",
    titleAr: "مؤسس بريدج ووتر",
    hotelEn: "The Ritz-Carlton",
    hotelAr: "فندق الريتز-كارلتون",
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

// 35 Competitive Supplier Quotations across all 8 Official Supplier Categories (4-5 bids per category)
export const DEMO_VENDOR_QUOTES: VendorQuote[] = [
  // 1. AIRLINE (4 bids)
  {
    id: "vq-air-01",
    intakeId: "intake-sovereign-01",
    category: "AIRLINE",
    vendorName: "Saudia Private Aviation (SPA)",
    item: "VIP Charter Flights & Diplomatic Apron Handling (2 Gulfstream G650ER)",
    quantity: 2,
    unitPrice: 140000,
    totalPrice: 280000,
    commissionPercent: 10,
    commissionAmount: 28000,
    score: 98,
    status: "APPROVED",
    isVaultSealed: true
  },
  {
    id: "vq-air-02",
    intakeId: "intake-sovereign-01",
    category: "AIRLINE",
    vendorName: "Alpha Star Aviation Services",
    item: "Executive Delegation Jet Charter (Airbus ACJ319)",
    quantity: 1,
    unitPrice: 320000,
    totalPrice: 320000,
    commissionPercent: 10,
    commissionAmount: 32000,
    score: 94,
    status: "RECOMMENDED",
    isVaultSealed: true
  },
  {
    id: "vq-air-03",
    intakeId: "intake-sovereign-01",
    category: "AIRLINE",
    vendorName: "Flynas Corporate Charters",
    item: "Regional Ministerial Shuttles (3 Flights)",
    quantity: 3,
    unitPrice: 65000,
    totalPrice: 195000,
    commissionPercent: 10,
    commissionAmount: 19500,
    score: 91,
    status: "RECEIVED",
    isVaultSealed: true
  },
  {
    id: "vq-air-04",
    intakeId: "intake-sovereign-01",
    category: "AIRLINE",
    vendorName: "Sky Prime Aviation Services",
    item: "Heavy Diplomatic Charter & Ground VIP Protocol",
    quantity: 1,
    unitPrice: 260000,
    totalPrice: 260000,
    commissionPercent: 10,
    commissionAmount: 26000,
    score: 93,
    status: "RECEIVED",
    isVaultSealed: true
  },

  // 2. VEHICLE_BROKERAGE (4 bids)
  {
    id: "vq-brok-01",
    intakeId: "intake-sovereign-01",
    category: "VEHICLE_BROKERAGE",
    vendorName: "Al-Wefaq Vehicle Brokerage",
    item: "Sovereign Motorcade Brokerage & 40 Armored VIP Units",
    quantity: 40,
    unitPrice: 6500,
    totalPrice: 260000,
    commissionPercent: 10,
    commissionAmount: 26000,
    score: 96,
    status: "APPROVED",
    isVaultSealed: true
  },
  {
    id: "vq-brok-02",
    intakeId: "intake-sovereign-01",
    category: "VEHICLE_BROKERAGE",
    vendorName: "Hanco Fleet Brokerage",
    item: "VIP SUV & Diplomatic Escort Brokerage (30 Units)",
    quantity: 30,
    unitPrice: 9000,
    totalPrice: 270000,
    commissionPercent: 10,
    commissionAmount: 27000,
    score: 93,
    status: "RECOMMENDED",
    isVaultSealed: true
  },
  {
    id: "vq-brok-03",
    intakeId: "intake-sovereign-01",
    category: "VEHICLE_BROKERAGE",
    vendorName: "Key Fleet Brokerage Solutions",
    item: "Executive Sedan & Van Fleet Brokerage (35 Units)",
    quantity: 35,
    unitPrice: 7000,
    totalPrice: 245000,
    commissionPercent: 10,
    commissionAmount: 24500,
    score: 89,
    status: "RECEIVED",
    isVaultSealed: true
  },
  {
    id: "vq-brok-04",
    intakeId: "intake-sovereign-01",
    category: "VEHICLE_BROKERAGE",
    vendorName: "Budget Saudi Fleet Brokerage",
    item: "Corridor Dispatch Brokerage & 25 Standby Vehicles",
    quantity: 25,
    unitPrice: 8500,
    totalPrice: 212500,
    commissionPercent: 10,
    commissionAmount: 21250,
    score: 88,
    status: "RECEIVED",
    isVaultSealed: true
  },

  // 3. CAR_RENTAL (5 bids - includes Luxury Fleet & Buses)
  {
    id: "vq-car-01",
    intakeId: "intake-sovereign-01",
    category: "CAR_RENTAL",
    vendorName: "Royal Fleet VIP Services",
    item: "50 Mercedes-Maybach S680 Chauffeur Fleet (5 Days)",
    quantity: 50,
    unitPrice: 9000,
    totalPrice: 450000,
    commissionPercent: 10,
    commissionAmount: 45000,
    score: 98,
    status: "APPROVED",
    isVaultSealed: true
  },
  {
    id: "vq-car-02",
    intakeId: "intake-sovereign-01",
    category: "CAR_RENTAL",
    vendorName: "Elite Drive Co.",
    item: "50 BMW 7-Series VIP Chauffeur Fleet",
    quantity: 50,
    unitPrice: 8400,
    totalPrice: 420000,
    commissionPercent: 10,
    commissionAmount: 42000,
    score: 92,
    status: "RECEIVED",
    isVaultSealed: true
  },
  {
    id: "vq-car-03",
    intakeId: "intake-sovereign-01",
    category: "CAR_RENTAL",
    vendorName: "Lumi Luxury Fleet",
    item: "40 Audi A8 L & Lexus LS 500 Fleet",
    quantity: 40,
    unitPrice: 9500,
    totalPrice: 380000,
    commissionPercent: 10,
    commissionAmount: 38000,
    score: 94,
    status: "RECOMMENDED",
    isVaultSealed: true
  },
  {
    id: "vq-car-04",
    intakeId: "intake-sovereign-01",
    category: "CAR_RENTAL",
    vendorName: "Theeb Executive Fleet",
    item: "60 Mercedes V-Class Executive Vans",
    quantity: 60,
    unitPrice: 6500,
    totalPrice: 390000,
    commissionPercent: 10,
    commissionAmount: 39000,
    score: 90,
    status: "RECEIVED",
    isVaultSealed: true
  },
  {
    id: "vq-car-05",
    intakeId: "intake-sovereign-01",
    category: "CAR_RENTAL",
    vendorName: "SAPTCO Executive Coaches",
    item: "15 Luxury VIP Buses (50-Seater Coaches for Delegation Transfer)",
    quantity: 15,
    unitPrice: 22000,
    totalPrice: 330000,
    commissionPercent: 10,
    commissionAmount: 33000,
    score: 95,
    status: "RECOMMENDED",
    isVaultSealed: true
  },

  // 4. MAN_POWER (5 bids - Cargo/Loading & Event Organizers/Staff)
  {
    id: "vq-mp-01",
    intakeId: "intake-sovereign-01",
    category: "MAN_POWER",
    vendorName: "Maharah Human Resources",
    item: "80 Event Organizers & Diplomatic Protocol Ushers (5 Days)",
    quantity: 80,
    unitPrice: 1800,
    totalPrice: 144000,
    commissionPercent: 10,
    commissionAmount: 14400,
    score: 97,
    status: "APPROVED",
    isVaultSealed: true
  },
  {
    id: "vq-mp-02",
    intakeId: "intake-sovereign-01",
    category: "MAN_POWER",
    vendorName: "Tamkeen Workforce Solutions",
    item: "60 Cargo & Loading Heavy Workers (24/7 Logistics Shifts)",
    quantity: 60,
    unitPrice: 1600,
    totalPrice: 96000,
    commissionPercent: 10,
    commissionAmount: 9600,
    score: 93,
    status: "RECOMMENDED",
    isVaultSealed: true
  },
  {
    id: "vq-mp-03",
    intakeId: "intake-sovereign-01",
    category: "MAN_POWER",
    vendorName: "SMASCO Event Staffing",
    item: "100 Bilingual Guest Relations & Flow Organizers",
    quantity: 100,
    unitPrice: 1750,
    totalPrice: 175000,
    commissionPercent: 10,
    commissionAmount: 17500,
    score: 95,
    status: "RECOMMENDED",
    isVaultSealed: true
  },
  {
    id: "vq-mp-04",
    intakeId: "intake-sovereign-01",
    category: "MAN_POWER",
    vendorName: "ARCO Logistics Crew",
    item: "50 Heavy Loading & Equipment Cargo Crew",
    quantity: 50,
    unitPrice: 1700,
    totalPrice: 85000,
    commissionPercent: 10,
    commissionAmount: 8500,
    score: 89,
    status: "RECEIVED",
    isVaultSealed: true
  },
  {
    id: "vq-mp-05",
    intakeId: "intake-sovereign-01",
    category: "MAN_POWER",
    vendorName: "Mawarid Operations Workforce",
    item: "70 Venue Setup & Crowd Management Coordinators",
    quantity: 70,
    unitPrice: 1650,
    totalPrice: 115500,
    commissionPercent: 10,
    commissionAmount: 11550,
    score: 91,
    status: "RECEIVED",
    isVaultSealed: true
  },

  // 5. GOLF_CARTS (4 bids)
  {
    id: "vq-gc-01",
    intakeId: "intake-sovereign-01",
    category: "GOLF_CARTS",
    vendorName: "E-Z-GO Saudi Club Cars",
    item: "30 Premium 6-Seater VIP Golf Carts with Chauffeurs",
    quantity: 30,
    unitPrice: 2500,
    totalPrice: 75000,
    commissionPercent: 10,
    commissionAmount: 7500,
    score: 97,
    status: "APPROVED",
    isVaultSealed: true
  },
  {
    id: "vq-gc-02",
    intakeId: "intake-sovereign-01",
    category: "GOLF_CARTS",
    vendorName: "Club Car Arabia",
    item: "25 High-Torque 8-Seater VIP Shuttles",
    quantity: 25,
    unitPrice: 3200,
    totalPrice: 80000,
    commissionPercent: 10,
    commissionAmount: 8000,
    score: 94,
    status: "RECOMMENDED",
    isVaultSealed: true
  },
  {
    id: "vq-gc-03",
    intakeId: "intake-sovereign-01",
    category: "GOLF_CARTS",
    vendorName: "Green Mobility GCC",
    item: "35 Solar-Assisted Executive Mini Carts",
    quantity: 35,
    unitPrice: 2100,
    totalPrice: 73500,
    commissionPercent: 10,
    commissionAmount: 7350,
    score: 90,
    status: "RECEIVED",
    isVaultSealed: true
  },
  {
    id: "vq-gc-04",
    intakeId: "intake-sovereign-01",
    category: "GOLF_CARTS",
    vendorName: "Yamaha Fleet Mobility",
    item: "20 Enclosed Weatherproof VIP Carts",
    quantity: 20,
    unitPrice: 3400,
    totalPrice: 68000,
    commissionPercent: 10,
    commissionAmount: 6800,
    score: 92,
    status: "RECEIVED",
    isVaultSealed: true
  },

  // 6. HEAVY_TRUCKS (4 bids)
  {
    id: "vq-ht-01",
    intakeId: "intake-sovereign-01",
    category: "HEAVY_TRUCKS",
    vendorName: "Almajdouie Heavy Logistics",
    item: "18 Flatbed & Curtain-Side Heavy Haulage Trucks (5 Days)",
    quantity: 18,
    unitPrice: 12000,
    totalPrice: 216000,
    commissionPercent: 10,
    commissionAmount: 21600,
    score: 97,
    status: "APPROVED",
    isVaultSealed: true
  },
  {
    id: "vq-ht-02",
    intakeId: "intake-sovereign-01",
    category: "HEAVY_TRUCKS",
    vendorName: "Bahri Inland Freight",
    item: "15 Closed-Box Container Heavy Transportation Trucks",
    quantity: 15,
    unitPrice: 13500,
    totalPrice: 202500,
    commissionPercent: 10,
    commissionAmount: 20250,
    score: 94,
    status: "RECOMMENDED",
    isVaultSealed: true
  },
  {
    id: "vq-ht-03",
    intakeId: "intake-sovereign-01",
    category: "HEAVY_TRUCKS",
    vendorName: "Al-Farhan Transport & Haulage",
    item: "20 Multi-Axle Stage Transportation Trucks",
    quantity: 20,
    unitPrice: 11000,
    totalPrice: 220000,
    commissionPercent: 10,
    commissionAmount: 22000,
    score: 90,
    status: "RECEIVED",
    isVaultSealed: true
  },
  {
    id: "vq-ht-04",
    intakeId: "intake-sovereign-01",
    category: "HEAVY_TRUCKS",
    vendorName: "National Heavy Haulage Co.",
    item: "12 Lowbed Staging Asset Transportation Carriers",
    quantity: 12,
    unitPrice: 15000,
    totalPrice: 180000,
    commissionPercent: 10,
    commissionAmount: 18000,
    score: 91,
    status: "RECEIVED",
    isVaultSealed: true
  },

  // 7. HEAVY_EQUIPMENT (4 bids)
  {
    id: "vq-he-01",
    intakeId: "intake-sovereign-01",
    category: "HEAVY_EQUIPMENT",
    vendorName: "Zahid Tractor & Heavy Cranes",
    item: "6 Mobile Hydraulic Cranes (50T - 100T) with Rigging Teams",
    quantity: 6,
    unitPrice: 45000,
    totalPrice: 270000,
    commissionPercent: 10,
    commissionAmount: 27000,
    score: 98,
    status: "APPROVED",
    isVaultSealed: true
  },
  {
    id: "vq-he-02",
    intakeId: "intake-sovereign-01",
    category: "HEAVY_EQUIPMENT",
    vendorName: "Kanoo Machinery & Cranes",
    item: "8 Telescopic Boom Lifts & Industrial Forklifts",
    quantity: 8,
    unitPrice: 28000,
    totalPrice: 224000,
    commissionPercent: 10,
    commissionAmount: 22400,
    score: 93,
    status: "RECOMMENDED",
    isVaultSealed: true
  },
  {
    id: "vq-he-03",
    intakeId: "intake-sovereign-01",
    category: "HEAVY_EQUIPMENT",
    vendorName: "Al-Mutawa Crane Services",
    item: "5 Heavy Rough-Terrain Cranes (120T)",
    quantity: 5,
    unitPrice: 62000,
    totalPrice: 310000,
    commissionPercent: 10,
    commissionAmount: 31000,
    score: 92,
    status: "RECEIVED",
    isVaultSealed: true
  },
  {
    id: "vq-he-04",
    intakeId: "intake-sovereign-01",
    category: "HEAVY_EQUIPMENT",
    vendorName: "Rawabi Heavy Equipment",
    item: "10 Electric Scissor Lifts & Generator Bays",
    quantity: 10,
    unitPrice: 18500,
    totalPrice: 185000,
    commissionPercent: 10,
    commissionAmount: 18500,
    score: 89,
    status: "RECEIVED",
    isVaultSealed: true
  },

  // 8. HOTEL (5 bids)
  {
    id: "vq-hot-01",
    intakeId: "intake-sovereign-01",
    category: "HOTEL",
    vendorName: "The Ritz-Carlton",
    item: "100 Royal & Executive Suites (Sovereign Summit)",
    quantity: 100,
    unitPrice: 12500,
    totalPrice: 1250000,
    commissionPercent: 10,
    commissionAmount: 125000,
    score: 99,
    status: "APPROVED",
    isVaultSealed: true
  },
  {
    id: "vq-hot-02",
    intakeId: "intake-sovereign-01",
    category: "HOTEL",
    vendorName: "Four Seasons Hotel",
    item: "100 Luxury Executive Suites (Kingdom Tower)",
    quantity: 100,
    unitPrice: 13000,
    totalPrice: 1300000,
    commissionPercent: 10,
    commissionAmount: 130000,
    score: 96,
    status: "RECOMMENDED",
    isVaultSealed: true
  },
  {
    id: "vq-hot-03",
    intakeId: "intake-sovereign-01",
    category: "HOTEL",
    vendorName: "Mandarin Oriental Al Faisaliah",
    item: "80 Diplomatic Suites & Sovereign Majlis Access",
    quantity: 80,
    unitPrice: 14000,
    totalPrice: 1120000,
    commissionPercent: 10,
    commissionAmount: 112000,
    score: 94,
    status: "RECEIVED",
    isVaultSealed: true
  },
  {
    id: "vq-hot-04",
    intakeId: "intake-sovereign-01",
    category: "HOTEL",
    vendorName: "Fairmont Hotel",
    item: "90 Premium Executive Rooms & Lounge",
    quantity: 90,
    unitPrice: 11500,
    totalPrice: 1035000,
    commissionPercent: 10,
    commissionAmount: 103500,
    score: 92,
    status: "RECEIVED",
    isVaultSealed: true
  },
  {
    id: "vq-hot-05",
    intakeId: "intake-sovereign-01",
    category: "HOTEL",
    vendorName: "St. Regis Sovereign Suites",
    item: "60 Butler-Serviced Sovereign Penthouses",
    quantity: 60,
    unitPrice: 16500,
    totalPrice: 990000,
    commissionPercent: 10,
    commissionAmount: 99000,
    score: 95,
    status: "RECEIVED",
    isVaultSealed: true
  }
];

export function calculateCategoryPriceRanges(quotes: VendorQuote[] = []): CategoryPriceRange[] {
  const sourceQuotes = quotes && quotes.length > 0 ? quotes : DEMO_VENDOR_QUOTES;

  return (OFFICIAL_SUPPLIER_CATEGORIES as readonly any[]).map((catMeta: any) => {
    const categoryQuotes = sourceQuotes.filter((q) => {
      if (q.category === catMeta.key) return true;
      if (catMeta.key === "HOTEL" && q.category === "HOTEL_OPERATOR") return true;
      if (catMeta.key === "CAR_RENTAL" && (q.category === "CAR" || q.category === "CAR_RENTAL")) return true;
      return false;
    });

    if (categoryQuotes.length === 0) {
      return {
        category: catMeta.key,
        categoryNameEn: catMeta.nameEn,
        categoryNameAr: catMeta.nameAr,
        minPrice: 0,
        maxPrice: 0,
        avgPrice: 0,
        bestTierPrice: 0,
        quoteCount: 0,
        currency: "SAR"
      };
    }

    const prices = categoryQuotes.map((q) => Number(q.totalPrice));
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const avgPrice = Math.round(prices.reduce((a, b) => a + b, 0) / prices.length);

    const approved = categoryQuotes.find((q) => q.status === "APPROVED");
    const recommended = categoryQuotes.find((q) => q.status === "RECOMMENDED");
    const bestTierPrice = approved ? Number(approved.totalPrice) : recommended ? Number(recommended.totalPrice) : minPrice;

    return {
      category: catMeta.key,
      categoryNameEn: catMeta.nameEn,
      categoryNameAr: catMeta.nameAr,
      minPrice,
      maxPrice,
      avgPrice,
      bestTierPrice,
      quoteCount: categoryQuotes.length,
      currency: "SAR"
    };
  });
}

// Predefined Route Waypoints for 5 Drivers across Summit Corridors
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
    { lat: 24.9576, lng: 46.6988, speed: 0, locationEn: "Airport Terminal 2 VIP Curb", locationAr: "المطار الدولي - رصيف VIP الصالة 2" },
    { lat: 24.9120, lng: 46.7050, speed: 85, locationEn: "Airport Road Southbound", locationAr: "طريق المطار باتجاه الجنوب" },
    { lat: 24.8540, lng: 46.6910, speed: 92, locationEn: "King Salman interchange", locationAr: "تقاطع طريق الملك سلمان" },
    { lat: 24.7950, lng: 46.6710, speed: 78, locationEn: "Northern Corridor expressway", locationAr: "الممر الشمالي السريع" },
    { lat: 24.7310, lng: 46.6500, speed: 65, locationEn: "King Fahd Corridor West junction", locationAr: "مخرج طريق الملك فهد غرباً" },
    { lat: 24.6661, lng: 46.6302, speed: 25, locationEn: "Arriving at The Ritz-Carlton", locationAr: "الوصول إلى فندق الريتز-كارلتون" }
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
    en: "[FLIGHT] Flight SV 102 landed at KKIA Terminal 2 with 14 Summit delegates.",
    ar: "[رحلات الطيران] هبوط رحلة الخطوط السعودية SV 102 بالصالة 2 مع 14 من وفود القمة."
  },
  {
    en: "[CHAUFFEUR] Capt. Sultan confirmed VIP Noura Al Harbi aboard Maybach S680 (KSA 9119). Cabin: 20°C.",
    ar: "[التوجيه الميداني] الكابتن سلطان استقبل نورة الحربي بالمايباخ S680 (أ ق ب 9119). التكييف: 20 درجة."
  },
  {
    en: "[CONTRACT] Contract #CT-2027-01 active: The Ritz-Carlton 100 suites certified (SAR 1.25M).",
    ar: "[العقود المعتمدة] العقد #CT-2027-01 معتمد: الريتز-كارلتون 100 جناح موثقة (1.25 مليون ريال)."
  },
  {
    en: "[SECURITY] Triple-Key Security Vault: 3/3 cryptographic approvals verified. Sealed bids intact.",
    ar: "[الخزنة المشفرة] الخزنة الثلاثية: التحقق من 3/3 موافقات مشفرة. العطاءات المختومة مكتملة ومحمية."
  },
  {
    en: "[HOSPITALITY] Najd Catering: 2 baristas & specialty coffee stations deployed to KAFD Plenary Hall A.",
    ar: "[الضيافة والتموين] تموين نجد: نشر 2 باريستا ومحطات القهوة المختصة بقاعة كافد الكبرى أ."
  },
  {
    en: "[PROTOCOL] H.E. Yasir Al-Rumayyan arrived at KAFD Plenary. Audio & visual translation cleared.",
    ar: "[مراسم الوفود] وصول معالي ياسر الرميان لقاعة كافد. اكتمال جاهزية الصوتيات وشاشات العرض."
  },
  {
    en: "[SHUTTLE] Shuttle 1 (Capt. Rakan) departed Ritz-Carlton to KAFD (Capacity: 14/16 seats occupied).",
    ar: "[الحافلات الترددية] الحافلة الترددية 1 غادرت الريتز-كارلتون لكافد (الإشغال: 14 من 16 مقعداً)."
  },
  {
    en: "[DINING] Bujairi Terrace: VIP table reservations locked for 85 guests at Maiz and Hakkasan.",
    ar: "[الحجوزات الدبلوماسية] مطل البجيري: تأكيد حجوزات 85 ضيفاً في مطعم ميز وهاكاسان الدرعية."
  },
  {
    en: "[AV/TECH] Al-Faisal AV telemetry: Main stage 8K LED wall performing at 100% nominal output.",
    ar: "[الأنظمة الفنية] تقرير الفيصل للصوتيات: شاشات 8K بالمسرح الرئيسي تعمل بكفاءة 100%."
  },
  {
    en: "[EFFICIENCY] Midyaf Cost Efficiency: Automated fleet dispatch achieved SAR 145,000 in direct fuel/idle savings.",
    ar: "[كفاءة العمليات] وفورات مضياف الذكية: جدولة الأسطول الذكية حققت وفراً قدره 145,000 ريال سعودي."
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

    // 1. Move Drivers along their summit routes
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
            speed: sultanWp.speed,
            vehicleModel: "Mercedes-Maybach S680",
            plateNumber: "KSA 9119",
            status: "EN_ROUTE" as const,
            zone: "NORTH_ZONE" as any,
            lastLocationAt: new Date().toISOString()
          };
        } else if (name.includes("fahad") || name.includes("driver")) {
          return {
            ...driver,
            currentLat: fahadWp.lat,
            currentLng: fahadWp.lng,
            speed: fahadWp.speed,
            vehicleModel: "BMW 7-Series VIP",
            plateNumber: "KSA 2030",
            status: "EN_ROUTE" as const,
            zone: "CENTRAL_ZONE" as any,
            lastLocationAt: new Date().toISOString()
          };
        } else if (name.includes("rakan")) {
          return {
            ...driver,
            currentLat: rakanWp.lat,
            currentLng: rakanWp.lng,
            speed: rakanWp.speed,
            vehicleModel: "Mercedes V-Class VIP Shuttle",
            plateNumber: "KSA 7788",
            status: "EN_ROUTE" as const,
            zone: "WEST_ZONE" as any,
            lastLocationAt: new Date().toISOString()
          };
        } else if (name.includes("tariq")) {
          return {
            ...driver,
            currentLat: tariqWp.lat,
            currentLng: tariqWp.lng,
            speed: tariqWp.speed,
            vehicleModel: "Mercedes V-Class Executive",
            plateNumber: "KSA 5544",
            status: "AVAILABLE" as const,
            zone: "EAST_ZONE" as any,
            lastLocationAt: new Date().toISOString()
          };
        } else if (name.includes("nasser")) {
          return {
            ...driver,
            currentLat: nasserWp.lat,
            currentLng: nasserWp.lng,
            speed: nasserWp.speed,
            vehicleModel: "Lexus LS 500 Executive",
            plateNumber: "KSA 1122",
            status: "EN_ROUTE" as const,
            zone: "SUMMIT_CORRIDOR" as any,
            lastLocationAt: new Date().toISOString()
          };
        }

        // If generic, move towards KAFD
        return {
          ...driver,
          currentLat: sultanWp.lat,
          currentLng: sultanWp.lng,
          speed: 65,
          lastLocationAt: new Date().toISOString()
        };
      });

      // 2. Synchronize event tasks dynamically
      const updatedEvents = current.events.map((evt, evtIdx) => {
        if (evtIdx !== 0) return evt;

        const updatedTasks = evt.tasks.map((task, tIdx) => {
          // Task 0 or Airport Chauffeur
          if (tIdx === 0 || (task.type as string).includes("CHAUFFEUR") || (task.type as string).includes("AIRPORT")) {
            const sultanCycle = currentStep % DRIVER_ROUTES.sultan.length;
            const nextStatus = sultanCycle < 2 ? "ASSIGNED" : sultanCycle < 5 ? "EN_ROUTE" : "COMPLETED";
            return {
              ...task,
              status: nextStatus as any,
              pickupLat: sultanWp.lat,
              pickupLng: sultanWp.lng
            };
          }
          // Task 1 or Plenary Shuttle
          if (tIdx === 1 || (task.type as string).includes("SHUTTLE") || (task.type as string).includes("PLENARY")) {
            const fahadCycle = currentStep % DRIVER_ROUTES.fahad.length;
            const nextStatus = fahadCycle < 1 ? "ASSIGNED" : "EN_ROUTE";
            return {
              ...task,
              status: nextStatus as any,
              pickupLat: fahadWp.lat,
              pickupLng: fahadWp.lng
            };
          }
          // Task 2 or Diriyah Gala
          if (tIdx === 2 || (task.type as string).includes("DIRIYAH") || (task.type as string).includes("GALA")) {
            const nasserCycle = currentStep % DRIVER_ROUTES.nasser.length;
            const nextStatus = nasserCycle === 0 ? "ASSIGNED" : nasserCycle === 1 ? "EN_ROUTE" : "COMPLETED";
            return {
              ...task,
              status: nextStatus as any
            };
          }
          return task;
        });

        return {
          ...evt,
          tasks: updatedTasks
        };
      });

      // 3. Synchronize VIP Guest Journey App
      const updatedJourneys = current.guestJourneys.map((journey, jIdx) => {
        if (jIdx === 0) {
          const sultanCycle = currentStep % DRIVER_ROUTES.sultan.length;
          const arrivalStatus = sultanCycle < 2 ? "LANDED" : sultanCycle < 5 ? "IN_TRANSIT" : "AT_HOTEL";
          return {
            ...journey,
            arrivalStatus: arrivalStatus as any
          };
        }
        return journey;
      });

      return {
        ...current,
        drivers: updatedDrivers,
        events: updatedEvents,
        guestJourneys: updatedJourneys
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
      ? `[بث مباشر] عمليات القمة السيادية 2027: بث العمليات اللوجستية المباشر نشط · ${timestamp}`
      : `[LIVE] Sovereign Summit 2027: Live Logistics Operations Synchronized · ${timestamp}`;
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
    vendorQuotes: DEMO_VENDOR_QUOTES,
    priceRanges: calculateCategoryPriceRanges(DEMO_VENDOR_QUOTES),
    startSimulation,
    pauseSimulation,
    resumeSimulation,
    resetSimulation,
    stopSimulation
  };
}

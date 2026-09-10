/**
 * Centralized Domain Localization Helper for Midyaf Platform.
 * Arabic is the PRIMARY language of the system.
 */

export function localizeStatus(status: string | null | undefined, isArabic = true): string {
  if (!status) return "";
  const upper = status.toUpperCase();

  const dict: Record<string, { ar: string; en: string }> = {
    // Activity / Intake Statuses
    DRAFT: { ar: "مسودة", en: "Draft" },
    AI_PLANNING: { ar: "تخطيط ذكي (AI)", en: "AI Planning" },
    PLAN_CONFIRMED: { ar: "خطة معتمدة", en: "Plan Confirmed" },
    QUOTING: { ar: "استدراج العروض", en: "Quoting" },
    CONTRACTING: { ar: "إبرام العقود", en: "Contracting" },
    OPERATIONS_OPEN: { ar: "العمليات جارية", en: "Operations Active" },

    // Plan Matrix Statuses
    APPROVED: { ar: "خطة معتمدة رسمياً", en: "Plan Approved" },
    PENDING: { ar: "بانتظار الاعتماد", en: "Pending Approval" },

    // Contract Statuses
    UNDER_REVIEW: { ar: "قيد المراجعة القانونية", en: "Under Review" },
    SIGNED: { ar: "موقّع ومعتمد", en: "Signed" },
    ACTIVE: { ar: "سارٍ ونشط", en: "Active" },
    PENDING_SIGNATURE: { ar: "بانتظار التوقيع", en: "Pending Signature" },

    // Task & Complaint Statuses
    NEW: { ar: "جديد", en: "New" },
    ASSIGNED: { ar: "تم التكليف", en: "Assigned" },
    IN_PROGRESS: { ar: "قيد التنفيذ الميداني", en: "In Progress" },
    COMPLETED: { ar: "مكتملة بنجاح", en: "Completed" },
    RESOLVED: { ar: "تم الحل والمعالجة", en: "Resolved" },
    OPEN: { ar: "مفتوح للمتابعة", en: "Open" },
    IN_REVIEW: { ar: "قيد التحقيق", en: "In Review" },
    DELAYED: { ar: "متأخر", en: "Delayed" },

    // Team Member Statuses
    AVAILABLE: { ar: "متاح للتكليف", en: "Available" },
    ON_MISSION: { ar: "في مهمة ميدانية", en: "On Mission" },
    BREAK: { ar: "في استراحة", en: "On Break" },

    // Company Report Statuses
    MANAGER_CONFIRMED: { ar: "معتمد ومصدق", en: "Manager Confirmed" },
    SENT_TO_COMPANY: { ar: "مرسل للشركة", en: "Sent to Client" }
  };

  if (dict[upper]) {
    return isArabic ? dict[upper].ar : dict[upper].en;
  }
  return status;
}

export function localizeSeverity(severity: string | null | undefined, isArabic = true): string {
  if (!severity) return "";
  const upper = severity.toUpperCase();

  const dict: Record<string, { ar: string; en: string }> = {
    CRITICAL: { ar: "حرجة وطارئة", en: "Critical" },
    HIGH: { ar: "أولوية عالية", en: "High" },
    NORMAL: { ar: "عادية", en: "Normal" },
    LOW: { ar: "منخفضة", en: "Low" }
  };

  if (dict[upper]) {
    return isArabic ? dict[upper].ar : dict[upper].en;
  }
  return severity;
}

export function localizePriority(priority: string | null | undefined, isArabic = true): string {
  if (!priority) return "";
  const upper = priority.toUpperCase();

  const dict: Record<string, { ar: string; en: string }> = {
    URGENT: { ar: "عاجلة وطارئة", en: "Urgent" },
    HIGH: { ar: "أولوية عالية", en: "High Priority" },
    NORMAL: { ar: "عادية", en: "Normal" },
    LOW: { ar: "روتينية", en: "Routine" }
  };

  if (dict[upper]) {
    return isArabic ? dict[upper].ar : dict[upper].en;
  }
  return priority;
}

export function localizeCategory(category: string | null | undefined, isArabic = true): string {
  if (!category) return "";
  const upper = category.toUpperCase();

  const dict: Record<string, { ar: string; en: string }> = {
    HOTEL: { ar: "فنادق وضيافة فاخرة", en: "Luxury Hotels" },
    CAR_RENTAL: { ar: "تأجير سيارات وحافلات", en: "Car & Bus Rental" },
    VEHICLE_BROKERAGE: { ar: "وساطة المركبات والعربات", en: "Vehicle Brokerage" },
    AIRLINE: { ar: "طيران ورحلات خاصة", en: "Airlines" },
    MAN_POWER: { ar: "قوى بشرية وتشريفات", en: "Manpower" },
    GOLF_CARTS: { ar: "عربات جولف وتسكين", en: "Golf Carts" },
    HEAVY_TRUCKS: { ar: "شاحنات ثقيلة ومقطورات", en: "Heavy Trucks" },
    HEAVY_EQUIPMENT: { ar: "رافعات ومعدات ثقيلة", en: "Heavy Equipment" },
    TRANSPORT: { ar: "النقل والمواكب", en: "Transport" },
    SCHEDULE: { ar: "المواعيد والجداول", en: "Schedule" },
    HOSPITALITY: { ar: "الضيافة والتموين", en: "Hospitality" },
    VIP_PROTOCOL: { ar: "التشريفات والبروتوكول", en: "VIP Protocol" }
  };

  if (dict[upper]) {
    return isArabic ? dict[upper].ar : dict[upper].en;
  }
  return category;
}

export function localizeZone(zone: string | null | undefined, isArabic = true): string {
  if (!zone) return "";
  const upper = zone.toUpperCase();

  const dict: Record<string, { ar: string; en: string }> = {
    NORTH_ZONE: { ar: "المنطقة الشمالية (المطار)", en: "North Zone (Airport)" },
    CENTRAL_ZONE: { ar: "المنطقة المركزية (الفنادق)", en: "Central Zone (Hotels)" },
    SUMMIT_CORRIDOR: { ar: "ممر القمة والدرعية التاريخية", en: "Summit Corridor (Diriyah)" },
    SOUTH_ZONE: { ar: "المنطقة الجنوبية", en: "South Zone" },
    EAST_ZONE: { ar: "المنطقة الشرقية", en: "East Zone" },
    WEST_ZONE: { ar: "المنطقة الغربية", en: "West Zone" },
    DIRIYAH_CORRIDOR: { ar: "ممر الدرعية التراثي", en: "Diriyah Heritage Corridor" },
    NORTH_RIYADH: { ar: "شمال الرياض", en: "North Riyadh" },
    CENTRAL_RIYADH: { ar: "وسط الرياض", en: "Central Riyadh" },
    EAST_RIYADH: { ar: "شرق الرياض", en: "East Riyadh" },
    WEST_RIYADH: { ar: "غرب الرياض", en: "West Riyadh" },
    SOUTH_RIYADH: { ar: "جنوب الرياض", en: "South Riyadh" }
  };

  if (dict[upper]) {
    return isArabic ? dict[upper].ar : dict[upper].en;
  }
  return zone;
}

export function localizeAmendmentType(type: string | null | undefined, isArabic = true): string {
  if (!type) return "";
  const upper = type.toUpperCase();

  const dict: Record<string, { ar: string; en: string }> = {
    FLIGHT_DELAY: { ar: "تأخير رحلة طيران", en: "Flight Delay" },
    VENUE_CHANGE: { ar: "تغيير موقع القاعة", en: "Venue Change" },
    VIP_AGENDA_SHIFT: { ar: "تعديل جدول VIP", en: "VIP Agenda Shift" },
    CONVOY_REROUTE: { ar: "تغيير مسار الموكب", en: "Convoy Reroute" }
  };

  if (dict[upper]) {
    return isArabic ? dict[upper].ar : dict[upper].en;
  }
  return type;
}

export function localizePaymentTerms(terms: string | null | undefined, isArabic = true): string {
  if (!terms) return isArabic ? "دفعة مقدمة 40%" : "Downpayment 40%";
  const upper = terms.toUpperCase();

  if (upper === "INSTALLMENTS") {
    return isArabic ? "أقساط مجدولة" : "Installments";
  }
  return isArabic ? "دفعة مقدمة 40%" : "Downpayment 40%";
}

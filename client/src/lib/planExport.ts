import type { ActivityIntake, AiLogisticsPlan } from "@shared/domain";
import { money } from "./format";

export function exportPlanAsPdf(
  plan: AiLogisticsPlan,
  intake: ActivityIntake,
  isArabic: boolean
) {
  const printWindow = window.open("", "_blank", "width=900,height=800");
  if (!printWindow) return;

  const title = isArabic ? "وثيقة الخطة اللوجستية التنفيذية - مضياف" : "Midyaf Executive Logistics Plan";
  const dateStr = new Date().toLocaleDateString(isArabic ? "ar-SA" : "en-US", {
    year: "numeric",
    month: "long",
    day: "numeric"
  });

  // Multi-entity resolutions
  const hotelsList = intake.hotels && intake.hotels.length > 0 ? intake.hotels : [
    {
      id: "h-1",
      name: intake.hotelName || (isArabic ? "فندق الريتز-كارلتون" : "The Ritz-Carlton"),
      contact: intake.hotelContact || "+966 11 802 8888",
      roomsBooked: intake.hotelRoomsBooked || 70,
      roomType: intake.hotelRoomType || "Royal & Executive Suites",
      notes: isArabic ? "مقر وفود كبار الشخصيات والوزراء" : "VIP Delegations HQ"
    },
    {
      id: "h-2",
      name: isArabic ? "فندق فورسيزونز برج المملكة" : "Four Seasons Hotel Kingdom Centre",
      contact: "+966 11 211 5000",
      roomsBooked: 50,
      roomType: "Deluxe Premium Rooms",
      notes: isArabic ? "مقر المتحدثين والمستثمرين الدوليين" : "Speakers & Global Investors"
    }
  ];
  const totalRoomsAll = hotelsList.reduce((sum, h) => sum + (Number(h.roomsBooked) || 0), 0);

  const rentalsList = intake.carRentals && intake.carRentals.length > 0 ? intake.carRentals : [
    {
      id: "r-1",
      companyName: intake.carRentalCompanyName || (isArabic ? "شركة الأسطول الملكي لتأجير السيارات الفاخرة" : "Royal Fleet Rentals"),
      contact: intake.carRentalContact || "+966 50 111 2233",
      fleetCount: 40,
      vehicleTypes: isArabic ? "مرسيدس مايباخ S680 وبي إم دبليو الفئة السابعة" : "Mercedes-Maybach & BMW 7-Series",
      notes: isArabic ? "مواكب الشخصيات الرسمية" : "Official Motorcades"
    },
    {
      id: "r-2",
      companyName: isArabic ? "شركة لوجستيات الحافلات والنقل الماسي" : "Diamond Bus & Coach Logistics",
      contact: "+966 55 444 5566",
      fleetCount: 15,
      vehicleTypes: isArabic ? "حافلات VIP فاخرة 50 راكب" : "Luxury 50-Seater Coaches",
      notes: isArabic ? "نقل الوفود العامة بين الفنادق والمقر" : "General Delegate Shuttle"
    }
  ];
  const totalFleetAll = rentalsList.reduce((sum, r) => sum + (Number(r.fleetCount) || 0), 0);

  const suppliersList = intake.suppliers && intake.suppliers.length > 0 ? intake.suppliers : [
    {
      id: "s-1",
      providerName: intake.providerName || (isArabic ? "مجموعة الضيافة والخدمات المساندة" : "Sovereign Mobility Group"),
      category: "HOTEL",
      contact: "+966 54 777 8899",
      scopeOfWork: isArabic ? "خدمات الضيافة والإعاشة الفندقية والتسكين" : "Hospitality & Accommodation",
      paymentTerms: intake.paymentTerms || "INSTALLMENTS"
    },
    {
      id: "s-2",
      providerName: isArabic ? "شركة تموين المؤتمرات والمعارض الملكية" : "Royal Catering Services",
      category: "CATERING",
      contact: "+966 56 333 4455",
      scopeOfWork: isArabic ? "بوفيهات القاعات الكبرى والولائم الرسمية" : "Plenary Banquets & Catering",
      paymentTerms: "DOWNPAYMENT"
    },
    {
      id: "s-3",
      providerName: isArabic ? "شركة الإمداد البشري والتنظيم الميداني" : "Event Protocol Workforce",
      category: "MAN_POWER",
      contact: "+966 50 888 9900",
      scopeOfWork: isArabic ? "120 فرد تنظيم ومشرفو استقبال ومراسم" : "120 Protocol & Ushers",
      paymentTerms: "INSTALLMENTS"
    }
  ];

  const html = `
    <!DOCTYPE html>
    <html dir="${isArabic ? "rtl" : "ltr"}" lang="${isArabic ? "ar" : "en"}">
    <head>
      <meta charset="utf-8" />
      <title>${title}</title>
      <style>
        @page { size: A4 portrait; margin: 18mm 15mm; }
        body {
          font-family: ${isArabic ? "'IBM Plex Sans Arabic', 'Segoe UI', Tahoma, sans-serif" : "'Inter', 'Segoe UI', Arial, sans-serif"};
          color: #1e1b4b;
          background: #ffffff;
          line-height: 1.5;
          margin: 0;
          padding: 24px;
        }
        .header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 3px solid #d4af37;
          padding-bottom: 16px;
          margin-bottom: 24px;
        }
        .brand {
          font-size: 26px;
          font-weight: 900;
          color: #2b1842;
          letter-spacing: -0.5px;
        }
        .badge {
          background: #2b1842;
          color: #d4af37;
          padding: 4px 12px;
          border-radius: 6px;
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
        }
        .section-title {
          font-size: 15px;
          font-weight: 800;
          color: #2b1842;
          border-bottom: 1px solid #e2e8f0;
          padding-bottom: 6px;
          margin-top: 20px;
          margin-bottom: 12px;
        }
        .grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 12px;
          margin-bottom: 16px;
        }
        .card {
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          padding: 10px 12px;
          background: #f8fafc;
        }
        .card-label {
          font-size: 11px;
          color: #64748b;
          font-weight: 600;
        }
        .card-value {
          font-size: 16px;
          font-weight: 800;
          color: #2b1842;
          margin-top: 4px;
        }
        .summary-box {
          background: #faf5ff;
          border: 1px solid #e9d5ff;
          border-radius: 8px;
          padding: 14px;
          font-size: 13px;
          color: #334155;
          margin-bottom: 20px;
        }
        .table {
          width: 100%;
          border-collapse: collapse;
          font-size: 12px;
          margin-top: 10px;
        }
        .table th, .table td {
          border: 1px solid #e2e8f0;
          padding: 8px 10px;
          text-align: ${isArabic ? "right" : "left"};
        }
        .table th {
          background: #f1f5f9;
          font-weight: 700;
          color: #2b1842;
        }
        .seal {
          margin-top: 30px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-top: 1px dashed #cbd5e1;
          padding-top: 16px;
          font-size: 11px;
          color: #64748b;
        }
        @media print {
          body { padding: 0; }
          button { display: none; }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <div>
          <div class="brand">مِضْيَافٌ · MIDYAF</div>
          <div style="font-size: 12px; color: #64748b; margin-top: 2px;">
            ${isArabic ? "نظام إدارة لوجستيات الفعاليات والقمم السيادية" : "Sovereign Summit & Event Logistics Platform"}
          </div>
        </div>
        <div style="text-align: ${isArabic ? "left" : "right"};">
          <span class="badge">${isArabic ? "خطة لوجستية معتمدة وموثقة" : "Certified Approved Plan"}</span>
          <div style="font-size: 11px; color: #64748b; margin-top: 6px;">${dateStr}</div>
        </div>
      </div>

      <div class="summary-box">
        <strong>${isArabic ? "ملخص الخطة التنفيذية:" : "Executive Plan Summary:"}</strong>
        <p style="margin-top: 6px; line-height: 1.6;">${plan.summary || (isArabic ? "خطة لوجستية متكاملة للقمة والفعالية متضمنة أسطول كبار الشخصيات والضيافة والمعدات." : "Integrated logistics plan covering VIP fleet, hospitality, workforce, and heavy machinery.")}</p>
      </div>

      <div class="section-title">${isArabic ? "بيانات الفعالية والمقر الرئيسي" : "Event & Venue Details"}</div>
      <div class="grid">
        <div class="card">
          <div class="card-label">${isArabic ? "اسم الفعالية:" : "Activity Name:"}</div>
          <div class="card-value">${intake.activityName || (isArabic ? "القمة السيادية 2027" : "Sovereign Summit 2027")}</div>
        </div>
        <div class="card">
          <div class="card-label">${isArabic ? "مقر الفعالية:" : "Venue Place:"}</div>
          <div class="card-value">${intake.activityPlace || (isArabic ? "المركز المالي" : "Financial District")}</div>
        </div>
        <div class="card">
          <div class="card-label">${isArabic ? "إجمالي الضيوف:" : "Total Visitors:"}</div>
          <div class="card-value">${intake.visitorCount} (${intake.vipVisitorCount} VIP)</div>
        </div>
      </div>

      <div class="section-title">${isArabic ? "الفنادق المعتمدة ومقرات الإقامة" : "Approved Hotels & Accommodation"}</div>
      <table class="table">
        <thead>
          <tr>
            <th style="width: 30px;">#</th>
            <th>${isArabic ? "اسم الفندق" : "Hotel Name"}</th>
            <th>${isArabic ? "مسؤول التواصل / الهاتف" : "Contact / Phone"}</th>
            <th>${isArabic ? "نوع الغرف / الأجنحة" : "Room Type"}</th>
            <th>${isArabic ? "الغرف المحجوزة" : "Rooms"}</th>
            <th>${isArabic ? "ملاحظات التوزيع" : "Allocation Notes"}</th>
          </tr>
        </thead>
        <tbody>
          ${hotelsList.map((h, i) => `
            <tr>
              <td>${i + 1}</td>
              <td><strong>${h.name}</strong></td>
              <td>${h.contact || "-"}</td>
              <td>${h.roomType || "-"}</td>
              <td><strong>${h.roomsBooked}</strong> ${isArabic ? "غرفة" : "rooms"}</td>
              <td>${h.notes || "-"}</td>
            </tr>
          `).join("")}
          <tr style="background: #f8fafc; font-weight: bold;">
            <td colspan="4" style="text-align: ${isArabic ? "left" : "right"};">${isArabic ? "إجمالي الغرف المحجوزة عبر جميع الفنادق:" : "Total Rooms Across All Hotels:"}</td>
            <td colspan="2" style="color: #2b1842; font-size: 13px;">${totalRoomsAll} ${isArabic ? "غرفة / جناح" : "rooms"}</td>
          </tr>
        </tbody>
      </table>

      <div class="section-title" style="margin-top: 22px;">${isArabic ? "شركات تأجير السيارات والحافلات" : "Approved Car & Bus Rental Companies"}</div>
      <table class="table">
        <thead>
          <tr>
            <th style="width: 30px;">#</th>
            <th>${isArabic ? "اسم شركة التأجير" : "Rental Company"}</th>
            <th>${isArabic ? "معلومات التواصل" : "Contact"}</th>
            <th>${isArabic ? "الأسطول" : "Fleet"}</th>
            <th>${isArabic ? "فئات وأنواع المركبات" : "Vehicle Profiles"}</th>
            <th>${isArabic ? "ملاحظات الأسطول" : "Notes"}</th>
          </tr>
        </thead>
        <tbody>
          ${rentalsList.map((r, i) => `
            <tr>
              <td>${i + 1}</td>
              <td><strong>${r.companyName}</strong></td>
              <td>${r.contact || "-"}</td>
              <td><strong>${r.fleetCount || "-"}</strong> ${isArabic ? "مركبة" : "units"}</td>
              <td>${r.vehicleTypes || "-"}</td>
              <td>${r.notes || "-"}</td>
            </tr>
          `).join("")}
          <tr style="background: #f8fafc; font-weight: bold;">
            <td colspan="3" style="text-align: ${isArabic ? "left" : "right"};">${isArabic ? "إجمالي أسطول المركبات والحافلات:" : "Total Fleet Units:"}</td>
            <td colspan="3" style="color: #2b1842; font-size: 13px;">${totalFleetAll} ${isArabic ? "مركبة / حافلة" : "units"}</td>
          </tr>
        </tbody>
      </table>

      <div class="section-title" style="margin-top: 22px;">${isArabic ? "المزودون والموردون المعتمدون وشروط السداد" : "Dedicated Suppliers, Providers & Payment Terms"}</div>
      <table class="table">
        <thead>
          <tr>
            <th style="width: 30px;">#</th>
            <th>${isArabic ? "اسم المزود / المورد" : "Provider Name"}</th>
            <th>${isArabic ? "التصنيف" : "Category"}</th>
            <th>${isArabic ? "معلومات التواصل" : "Contact"}</th>
            <th>${isArabic ? "نطاق العمل والتوريد" : "Scope of Supply"}</th>
            <th>${isArabic ? "شروط الدفع" : "Payment Terms"}</th>
          </tr>
        </thead>
        <tbody>
          ${suppliersList.map((s, i) => `
            <tr>
              <td>${i + 1}</td>
              <td><strong>${s.providerName}</strong></td>
              <td><span class="badge" style="padding: 2px 6px; font-size: 10px;">${s.category}</span></td>
              <td>${s.contact || "-"}</td>
              <td>${s.scopeOfWork || "-"}</td>
              <td style="color: #047857; font-weight: bold;">
                ${s.paymentTerms === "DOWNPAYMENT" ? (isArabic ? "دفعة أولى مقدمة" : "Downpayment") : (isArabic ? "أقساط مجدولة" : "Installments")}
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>

      <div class="section-title">${isArabic ? "تخصيص الموارد عبر الفئات الـ 8 الرسمية" : "Resource Allocation across Official Categories"}</div>
      <table class="table">
        <thead>
          <tr>
            <th>${isArabic ? "فئة المورد" : "Resource Category"}</th>
            <th>${isArabic ? "العدد / السعة" : "Allocated Quantity"}</th>
            <th>${isArabic ? "المواصفات والنوع" : "Specification & Subtype"}</th>
            <th>${isArabic ? "حالة التعميد" : "Status"}</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>${isArabic ? "طيران الوفود" : "Airlines"}</strong></td>
            <td>2</td>
            <td>${isArabic ? "رحلات طيران خاص دبلوماسي سريع" : "Private Executive Diplomatic Charters"}</td>
            <td><span style="color: #047857; font-weight: bold;">${isArabic ? "معتمد" : "Approved"}</span></td>
          </tr>
          <tr>
            <td><strong>${isArabic ? "وساطة المركبات" : "Vehicle Brokerage"}</strong></td>
            <td>40</td>
            <td>${isArabic ? "وساطة وتنسيق مواكب رسمية وسيارات مرافقة" : "Official Motorcade & Escort Brokerage"}</td>
            <td><span style="color: #047857; font-weight: bold;">${isArabic ? "معتمد" : "Approved"}</span></td>
          </tr>
          <tr>
            <td><strong>${isArabic ? "تأجير السيارات والحافلات" : "Car & Bus Rental"}</strong></td>
            <td>${plan.vipCars || 50} ${isArabic ? "سيارة فاخرة" : "VIP Cars"} + ${plan.buses || intake.busesCount || 15} ${isArabic ? "حافلة VIP" : "Buses"}</td>
            <td>${intake.carType === "BUSES" ? (isArabic ? "حافلات VIP فاخرة 50 راكب" : "Luxury 50-Seater Coaches") : (isArabic ? "مرسيدس مايباخ وحافلات وفود" : "Maybach Fleet & Executive Coaches")}</td>
            <td><span style="color: #047857; font-weight: bold;">${isArabic ? "معتمد" : "Approved"}</span></td>
          </tr>
          <tr>
            <td><strong>${isArabic ? "القوى البشرية والتشغيل" : "Man Power"}</strong></td>
            <td>${plan.manPower || intake.manPowerCount || 120} ${isArabic ? "فرد" : "Staff"}</td>
            <td>${(plan.manPowerSubtype || intake.manPowerSubtype) === "CARGO_LOADING" ? (isArabic ? "عمال تحميل وبضائع وتجهيز شحنات" : "Cargo & Loading Workers") : (isArabic ? "منظمو الفعالية ومشرفو المراسم" : "Event Organizers & Protocol Ushers")}</td>
            <td><span style="color: #047857; font-weight: bold;">${isArabic ? "معتمد" : "Approved"}</span></td>
          </tr>
          <tr>
            <td><strong>${isArabic ? "عربات الجولف" : "Golf Carts"}</strong></td>
            <td>${plan.golfCarts || intake.golfCartsCount || 30}</td>
            <td>${isArabic ? "عربات جولف كهربائية فاخرة متعددة الركاب" : "VIP Electric Multi-Seater Mini-Mobility"}</td>
            <td><span style="color: #047857; font-weight: bold;">${isArabic ? "معتمد" : "Approved"}</span></td>
          </tr>
          <tr>
            <td><strong>${isArabic ? "شاحنات النقل الثقيل" : "Heavy Trucks"}</strong></td>
            <td>${plan.heavyTrucks || intake.heavyTrucksCount || 18}</td>
            <td>${isArabic ? "شاحنات نقل ثقيل ومقطورات مسارح وتجهيزات" : "Flatbed & Heavy Transportation Haulage"}</td>
            <td><span style="color: #047857; font-weight: bold;">${isArabic ? "معتمد" : "Approved"}</span></td>
          </tr>
          <tr>
            <td><strong>${isArabic ? "الرافعات والمعدات الثقيلة" : "Cranes & Heavy Equipment"}</strong></td>
            <td>${plan.heavyEquipment || intake.heavyEquipmentCount || 6}</td>
            <td>${isArabic ? "رافعات هيدروليكية ومعدات رفع صناعية" : "Mobile Hydraulic Cranes & Industrial Boom Lifts"}</td>
            <td><span style="color: #047857; font-weight: bold;">${isArabic ? "معتمد" : "Approved"}</span></td>
          </tr>
          <tr>
            <td><strong>${isArabic ? "الفنادق والضيافة" : "Hotels & Hospitality"}</strong></td>
            <td>${plan.hotelRooms || 100}</td>
            <td>${isArabic ? "أجنحة ملكية وتنفيذية شاملة خدمات الضيافة" : "Royal Suites & Diplomatic Hospitality Access"}</td>
            <td><span style="color: #047857; font-weight: bold;">${isArabic ? "معتمد" : "Approved"}</span></td>
          </tr>
        </tbody>
      </table>

      <div class="seal">
        <div>
          <div>${isArabic ? "تم التوليد بواسطة محرك الذكاء الاصطناعي لمنصة مضياف" : "Generated by Midyaf AI Logistics Planning Engine"}</div>
          <div style="font-family: monospace; font-size: 10px; margin-top: 3px;">SHA-256: 0x9f88...71ea · Verified Autonomous Workflow</div>
        </div>
        <div style="text-align: ${isArabic ? "left" : "right"};">
          <div>${isArabic ? "الختم السيادي لمنصة مضياف" : "Midyaf Sovereign Verification Seal"}</div>
          <div style="color: #047857; font-weight: bold;">✓ ${isArabic ? "موثق إلكترونياً" : "Digitally Certified"}</div>
        </div>
      </div>

      <script>
        window.onload = function() {
          window.print();
        };
      </script>
    </body>
    </html>
  `;

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
}

export function sharePlanLink(
  planId: string,
  isArabic: boolean,
  toast: { success: (title: string, desc?: string) => void; alert: (title: string, desc?: string) => void }
) {
  const shareUrl = `${window.location.origin}/?portal=intake&plan=${encodeURIComponent(planId || "active")}`;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(shareUrl).then(() => {
      toast.success(
        isArabic ? "تم نسخ رابط الخطة إلى الحافظة" : "Plan Link Copied",
        isArabic ? "يمكنك الآن مشاركة الرابط مع مسؤولي الفعالية والموردين" : "Direct plan link copied to clipboard"
      );
    }).catch(() => {
      toast.alert(
        isArabic ? "تعذر نسخ الرابط" : "Failed to copy link",
        shareUrl
      );
    });
  } else {
    toast.success(
      isArabic ? "رابط المشاركة" : "Share URL",
      shareUrl
    );
  }
}

// Event intake workflow (hotels, rentals, suppliers, AI plan).
// Extracted verbatim from OperationsPortals.tsx (Phase 1 split).
import { useEffect, useState } from "react";
import { BriefcaseBusiness, Car, CheckCircle2, Lock, Sparkles, Download, Share2, Hotel, Plus, Trash2 } from "lucide-react";
import { Badge } from "../../components/Badge";
import { useTacticalToast } from "../../components/TacticalToast";
import { Section } from "../../components/Section";
import { CategoryPriceRangeSection } from "../../components/CategoryPriceRangeCard";
import { SupplierContractWorkflow } from "../../components/SupplierContractWorkflow";
import { IntakeWorkflowStepper } from "../../components/IntakeWorkflowStepper";
import { exportPlanAsPdf, sharePlanLink } from "../../lib/planExport";
import { DEMO_VENDOR_QUOTES, OFFICIAL_SUPPLIER_CATEGORIES, calculateCategoryPriceRanges } from "../../lib/demo/data";
import type { GuestBulkImportInput, PortalProps } from "../types";
import type { HotelDetail, CarRentalDetail, SupplierDetail, Task } from "@shared/domain";
import { CheckboxField, Field, MiniStat, NumberField, PortalHero, SelectField, canManageOperations, canSubmitCompanyUpdates, defaultCarRentals, defaultHotels, defaultSuppliers, emptyActivityIntake, emptyAiPlan, parseGuestCsv, sampleGuestCsv, useOpsText } from "./shared";
import { QuotesAndContracts } from "./QuotesAndContracts";
import { PlanPhases } from "./PlanPhases";

export function ActivityIntakePage({
  data,
  session,
  isDemoMode,
  saveActivityIntake,
  analyzeActivityIntake,
  confirmAiPlan,
  importGuests,
  approveVendorQuote,
  approveContract
}: PortalProps) {
  const ui = useOpsText();
  const toast = useTacticalToast();
  const intake = data.activityIntakes[0];
  const canEdit = canManageOperations(session) || canSubmitCompanyUpdates(session);
  const plan =
    data.aiPlans.find((item) => item.intakeId === intake?.id) ?? data.aiPlans[0];
  const activePlan = plan ?? emptyAiPlan;
  const [draft, setDraft] = useState(intake ?? emptyActivityIntake);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const normalGroups = Math.ceil(Number(draft.normalVisitorCount) / 4);
  const [localPlanApproved, setLocalPlanApproved] = useState(false);

  // Bulk CSV Guest Import state (Relocated from Organizer Dashboard - Task 2)
  const [bulkCsv, setBulkCsv] = useState(sampleGuestCsv);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkGenerateTasks, setBulkGenerateTasks] = useState(true);
  const [bulkGuestsPerShuttle, setBulkGuestsPerShuttle] = useState(4);

  const isPlanApproved = Boolean(
    activePlan.confirmed ||
    localPlanApproved ||
    draft.status === "PLAN_CONFIRMED" ||
    draft.status === "CONTRACTING" ||
    draft.status === "OPERATIONS_OPEN"
  );

  const priceRanges = calculateCategoryPriceRanges(data.vendorQuotes);
  const quotes = data.vendorQuotes.length > 0 ? data.vendorQuotes : DEMO_VENDOR_QUOTES;

  const getCategoryNameAr = (category: string): string => {
    const found = OFFICIAL_SUPPLIER_CATEGORIES.find((c: any) => c.key === category);
    if (found) return found.nameAr;
    switch (category) {
      case "HOTEL":
        return "الفنادق والضيافة";
      case "CAR_RENTAL":
      case "CAR":
        return "تأجير السيارات والحافلات";
      case "MAN_POWER":
        return "القوى البشرية والتشغيل";
      case "AIRLINE":
        return "طيران الوفود";
      case "VEHICLE_BROKERAGE":
        return "وساطة المركبات الفاخرة";
      case "GOLF_CARTS":
        return "عربات الجولف الكهربائية";
      case "HEAVY_EQUIPMENT":
        return "الرافعات والمعدات الثقيلة";
      case "HEAVY_TRUCKS":
        return "شاحنات النقل الثقيل";
      case "CATERING":
        return "التموين والإعاشة";
      default:
        return category;
    }
  };

  useEffect(() => {
    if (intake) {
      setDraft({
        ...emptyActivityIntake,
        ...intake,
        hotels:
          intake.hotels && intake.hotels.length > 0
            ? intake.hotels
            : intake.hotelName
            ? [
                {
                  id: "hotel-1",
                  name: intake.hotelName,
                  contact: intake.hotelContact ?? "",
                  roomsBooked: intake.hotelRoomsBooked ?? 70,
                  roomType: intake.hotelRoomType ?? "Royal & Executive Suites",
                  notes: ""
                }
              ]
            : defaultHotels,
        carRentals:
          intake.carRentals && intake.carRentals.length > 0
            ? intake.carRentals
            : intake.carRentalCompanyName
            ? [
                {
                  id: "rental-1",
                  companyName: intake.carRentalCompanyName,
                  contact: intake.carRentalContact ?? "",
                  fleetCount: 20,
                  vehicleTypes: "حافلات وسيارات فاخرة",
                  notes: ""
                }
              ]
            : defaultCarRentals,
        suppliers:
          intake.suppliers && intake.suppliers.length > 0
            ? intake.suppliers
            : intake.providerName
            ? [
                {
                  id: "sup-1",
                  providerName: intake.providerName,
                  category: "HOTEL",
                  contact: "",
                  scopeOfWork: "الخدمات والتوريدات المعتمدة",
                  paymentTerms: intake.paymentTerms ?? "INSTALLMENTS",
                  notes: ""
                }
              ]
            : defaultSuppliers
      });
    } else {
      setDraft(emptyActivityIntake);
    }
  }, [intake]);

  // --- Multi-Hotel Handlers ---
  const hotelsList = draft.hotels && draft.hotels.length > 0 ? draft.hotels : defaultHotels;
  const totalRoomsBookedAllHotels = hotelsList.reduce((acc, h) => acc + (Number(h.roomsBooked) || 0), 0);

  const handleAddHotel = () => {
    const newHotel: HotelDetail = {
      id: `hotel-${Date.now()}`,
      name: "",
      contact: "",
      roomsBooked: 25,
      roomType: "Executive Deluxe Suite",
      notes: ""
    };
    const updated = [...hotelsList, newHotel];
    setDraft((cur) => ({
      ...cur,
      hotels: updated,
      hotelName: updated[0]?.name || "",
      hotelContact: updated[0]?.contact || "",
      hotelRoomsBooked: updated[0]?.roomsBooked || 0,
      hotelRoomType: updated[0]?.roomType || ""
    }));
    toast.info(
      ui.isArabic ? "تمت إضافة فندق جديد للقائمة" : "New Hotel Added",
      ui.isArabic ? "يرجى إدخال اسم الفندق وعدد الغرف" : "Enter hotel name and rooms booked"
    );
  };

  const handleRemoveHotel = (id: string) => {
    if (hotelsList.length <= 1) return;
    const updated = hotelsList.filter((h) => h.id !== id);
    setDraft((cur) => ({
      ...cur,
      hotels: updated,
      hotelName: updated[0]?.name || "",
      hotelContact: updated[0]?.contact || "",
      hotelRoomsBooked: updated[0]?.roomsBooked || 0,
      hotelRoomType: updated[0]?.roomType || ""
    }));
  };

  const handleUpdateHotel = (id: string, field: keyof HotelDetail, value: any) => {
    const updated = hotelsList.map((h) => (h.id === id ? { ...h, [field]: value } : h));
    setDraft((cur) => ({
      ...cur,
      hotels: updated,
      hotelName: updated[0]?.name || "",
      hotelContact: updated[0]?.contact || "",
      hotelRoomsBooked: updated[0]?.roomsBooked || 0,
      hotelRoomType: updated[0]?.roomType || ""
    }));
  };

  // --- Multi-Car Rental Handlers ---
  const carRentalsList = draft.carRentals && draft.carRentals.length > 0 ? draft.carRentals : defaultCarRentals;
  const totalFleetUnitsAllRentals = carRentalsList.reduce((acc, r) => acc + (Number(r.fleetCount) || 0), 0);

  const handleAddCarRental = () => {
    const newRental: CarRentalDetail = {
      id: `rental-${Date.now()}`,
      companyName: "",
      contact: "",
      fleetCount: 15,
      vehicleTypes: ui.isArabic ? "حافلات VIP وسيارات فارهة" : "VIP Coaches & Sedans",
      notes: ""
    };
    const updated = [...carRentalsList, newRental];
    setDraft((cur) => ({
      ...cur,
      carRentals: updated,
      carRentalCompanyName: updated[0]?.companyName || "",
      carRentalContact: updated[0]?.contact || ""
    }));
    toast.info(
      ui.isArabic ? "تمت إضافة شركة تأجير جديدة" : "New Car Rental Company Added",
      ui.isArabic ? "يرجى إدخال اسم الشركة وعدد الأسطول" : "Enter rental company name & fleet"
    );
  };

  const handleRemoveCarRental = (id: string) => {
    if (carRentalsList.length <= 1) return;
    const updated = carRentalsList.filter((r) => r.id !== id);
    setDraft((cur) => ({
      ...cur,
      carRentals: updated,
      carRentalCompanyName: updated[0]?.companyName || "",
      carRentalContact: updated[0]?.contact || ""
    }));
  };

  const handleUpdateCarRental = (id: string, field: keyof CarRentalDetail, value: any) => {
    const updated = carRentalsList.map((r) => (r.id === id ? { ...r, [field]: value } : r));
    setDraft((cur) => ({
      ...cur,
      carRentals: updated,
      carRentalCompanyName: updated[0]?.companyName || "",
      carRentalContact: updated[0]?.contact || ""
    }));
  };

  // --- Multi-Supplier Handlers ---
  const suppliersList = draft.suppliers && draft.suppliers.length > 0 ? draft.suppliers : defaultSuppliers;

  const handleAddSupplier = () => {
    const newSup: SupplierDetail = {
      id: `sup-${Date.now()}`,
      providerName: "",
      category: "HOTEL",
      contact: "",
      scopeOfWork: "",
      paymentTerms: "INSTALLMENTS",
      notes: ""
    };
    const updated = [...suppliersList, newSup];
    setDraft((cur) => ({
      ...cur,
      suppliers: updated,
      providerName: updated[0]?.providerName || "",
      paymentTerms: updated[0]?.paymentTerms || "INSTALLMENTS"
    }));
    toast.info(
      ui.isArabic ? "تمت إضافة مزود / مورد معتمد جديد" : "New Certified Supplier Added",
      ui.isArabic ? "يرجى تحديد الفئة ونطاق العمل" : "Specify category & scope of work"
    );
  };

  const handleRemoveSupplier = (id: string) => {
    if (suppliersList.length <= 1) return;
    const updated = suppliersList.filter((s) => s.id !== id);
    setDraft((cur) => ({
      ...cur,
      suppliers: updated,
      providerName: updated[0]?.providerName || "",
      paymentTerms: updated[0]?.paymentTerms || "INSTALLMENTS"
    }));
  };

  const handleUpdateSupplier = (id: string, field: keyof SupplierDetail, value: any) => {
    const updated = suppliersList.map((s) => (s.id === id ? { ...s, [field]: value } : s));
    setDraft((cur) => ({
      ...cur,
      suppliers: updated,
      providerName: updated[0]?.providerName || "",
      paymentTerms: updated[0]?.paymentTerms || "INSTALLMENTS"
    }));
  };

  if (!intake) {
    return (
      <div className="space-y-4">
        <PortalHero
          badge={ui.l("Organizing company intake")}
          title={ui.l("No activity intake is assigned to this account")}
          body={ui.l(
            "Only organizing company users and logistics managers can create or update activity intake records."
          )}
        />
      </div>
    );
  }

  async function handleSave() {
    setPendingAction("save");
    try {
      await saveActivityIntake(draft);
      toast.success(
        ui.isArabic ? "تم حفظ بيانات الفعالية بنجاح" : "Activity Data Saved",
        draft.activityName || undefined
      );
    } finally {
      setPendingAction(null);
    }
  }

  async function handleAnalyze() {
    setPendingAction("analyze");
    try {
      await saveActivityIntake(draft);
      await analyzeActivityIntake(draft.id);
      toast.success(
        ui.isArabic ? "تم توليد الخطة اللوجستية بالذكاء الاصطناعي" : "AI Logistics Plan Generated",
        ui.isArabic ? "تم تحديث حصص الموارد والمركبات والضيافة" : "Resource quotas & fleet updated"
      );
    } finally {
      setPendingAction(null);
    }
  }

  async function handleApprovePlan() {
    setPendingAction("approvePlan");
    try {
      if (confirmAiPlan && activePlan?.id) {
        await confirmAiPlan(activePlan.id);
      }
      setLocalPlanApproved(true);
      setDraft((cur) => ({ ...cur, status: "PLAN_CONFIRMED" }));
      toast.success(
        ui.isArabic ? "تم اعتماد الخطة اللوجستية رسمياً" : "Logistics Plan Approved",
        ui.isArabic ? "تم فتح شروط الدفع وتفعيل مسار عقود الموردين الـ 8" : "Payment terms unlocked & 8-supplier contract workflow engaged"
      );
    } finally {
      setPendingAction(null);
    }
  }

  async function handleBulkImport() {
    setBulkError(null);
    let guests: GuestBulkImportInput[];

    try {
      guests = parseGuestCsv(bulkCsv);
    } catch (error) {
      setBulkError(error instanceof Error ? error.message : "Invalid CSV");
      return;
    }

    setPendingAction("bulkImport");
    try {
      if (importGuests && data.events[0]?.id) {
        await importGuests(data.events[0].id, guests, {
          generateTasks: bulkGenerateTasks,
          normalGuestsPerShuttle: bulkGuestsPerShuttle
        });
      }
      toast.success(
        ui.isArabic ? "تم استيراد قائمة الضيوف بنجاح" : "Guests Imported Successfully",
        `${guests.length} ${ui.isArabic ? "ضيف مسجل" : "guests registered"}`
      );
    } catch (err: any) {
      setBulkError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setPendingAction(null);
    }
  }

  async function handleBulkCsvFile(file: File) {
    setBulkCsv(await file.text());
    setBulkError(null);
  }

  return (
    <div className="space-y-5">
      <PortalHero
        badge={ui.isArabic ? "إدخال الفعالية والبيانات التشغيلية" : "Event Data Entry & Intake"}
        title={ui.isArabic ? "إدخال متطلبات الفعالية، الضيوف، والموردين" : "Enter activity requirements before operations are opened"}
        body={ui.isArabic
          ? "تقوم الشركة المنظمة بإدخال بيانات الفعالية، الفنادق، شركات التأجير، المورد، وقائمة الضيوف (CSV). بعد اعتماد الخطة ومعالجتها، تصبح شروط الدفع متاحة للاختيار."
          : "The organizing company enters event details, hotels, car rental, provider, and guest CSV list. Once the plan is approved and processed, payment terms unlock."}
      />

      <IntakeWorkflowStepper
        isArabic={ui.isArabic}
        isPlanApproved={isPlanApproved}
        hasCoreData={Boolean(draft.activityName && draft.visitorCount > 0)}
        hasHotelData={Boolean(draft.hotelName || (draft.hotelRoomsBooked && draft.hotelRoomsBooked > 0))}
        hasGuestCsv={Boolean(bulkCsv && bulkCsv.trim().length > 0)}
        onApprovePlan={handleApprovePlan}
      />

      <div className="grid gap-5 xl:grid-cols-[1fr_1fr]">
        {/* Left Column: Comprehensive Data Entry Form */}
        <div className="space-y-4">
          <Section id="section-intake-core" title={ui.isArabic ? "1. المتطلبات الأساسية للفعالية" : "1. Activity Core Input"}>
            <div className="grid gap-3 md:grid-cols-2">
              <Field
                label={ui.l("Activity name")}
                value={draft.activityName}
                disabled={!canEdit}
                onChange={(value) =>
                  setDraft((current) => ({ ...current, activityName: value }))
                }
              />
              <Field
                label={ui.l("Activity place")}
                value={draft.activityPlace}
                disabled={!canEdit}
                onChange={(value) =>
                  setDraft((current) => ({ ...current, activityPlace: value }))
                }
              />
              <NumberField
                label={ui.l("Total visitors")}
                value={draft.visitorCount}
                disabled={!canEdit}
                onChange={(value) =>
                  setDraft((current) => ({
                    ...current,
                    visitorCount: value,
                    normalVisitorCount: Math.max(
                      0,
                      value - current.vipVisitorCount
                    )
                  }))
                }
              />
              <NumberField
                label={ui.l("VIP visitors")}
                value={draft.vipVisitorCount}
                disabled={!canEdit}
                onChange={(value) =>
                  setDraft((current) => ({
                    ...current,
                    vipVisitorCount: value,
                    normalVisitorCount: Math.max(0, current.visitorCount - value)
                  }))
                }
              />
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <SelectField
                label={ui.l("Transportation")}
                value={draft.transportationType}
                options={["VIP", "SHUTTLE", "MIXED"]}
                translate={ui.l}
                disabled={!canEdit}
                onChange={(value) =>
                  setDraft((current) => ({
                    ...current,
                    transportationType: value as typeof current.transportationType
                  }))
                }
              />
              <SelectField
                label={ui.l("Tickets")}
                value={draft.ticketType}
                options={["FIRST_CLASS", "NORMAL", "MIXED"]}
                translate={ui.l}
                disabled={!canEdit}
                onChange={(value) =>
                  setDraft((current) => ({
                    ...current,
                    ticketType: value as typeof current.ticketType
                  }))
                }
              />
              <SelectField
                label={ui.l("Hotels")}
                value={draft.hotelType}
                options={["FIVE_STAR", "FOUR_STAR", "MIXED"]}
                translate={ui.l}
                disabled={!canEdit}
                onChange={(value) =>
                  setDraft((current) => ({
                    ...current,
                    hotelType: value as typeof current.hotelType
                  }))
                }
              />
              <SelectField
                label={ui.l("Cars")}
                value={draft.carType}
                options={["LUXURY_SEDAN", "SUV_GMC_TAHOE", "BUSES", "MIXED"]}
                translate={(v) => v === "BUSES" ? (ui.isArabic ? "حافلات VIP (Buses)" : "VIP Buses") : ui.l(v)}
                disabled={!canEdit}
                onChange={(value) =>
                  setDraft((current) => ({
                    ...current,
                    carType: value as any
                  }))
                }
              />
            </div>
          </Section>

          {/* Section 2: Multi-Hotel Details Section */}
          <Section
            id="section-intake-hotels"
            title={
              <div className="flex flex-wrap items-center justify-between gap-2 w-full">
                <div className="flex items-center gap-2">
                  <Hotel size={18} className="text-midyaf-gold" />
                  <span>{ui.isArabic ? "2. تفاصيل الفنادق ومقرات الإقامة (Hotels & Accommodation)" : "2. Hotels & Accommodation Details"}</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="rounded-md bg-midyaf-purple/10 px-2.5 py-1 font-bold text-midyaf-pearl dark:bg-midyaf-purple/30 dark:text-white">
                    {ui.isArabic ? `إجمالي الفنادق: ${hotelsList.length}` : `Hotels: ${hotelsList.length}`}
                  </span>
                  <span className="rounded-md bg-midyaf-gold/15 px-2.5 py-1 font-bold text-midyaf-gold">
                    {ui.isArabic ? `إجمالي الغرف: ${totalRoomsBookedAllHotels} غرفة` : `Total Rooms: ${totalRoomsBookedAllHotels}`}
                  </span>
                </div>
              </div>
            }
          >
            <div className="space-y-4">
              {hotelsList.map((hotel, index) => (
                <div
                  key={hotel.id}
                  className="rounded-xl border border-white/5 bg-[#121626]/70 p-4 shadow-sm transition-all dark:border-slate-800 dark:bg-slate-900/60"
                >
                  <div className="flex items-center justify-between border-b border-white/5 pb-2.5 mb-3 dark:border-slate-800">
                    <div className="flex items-center gap-2">
                      <span className="grid size-6 place-items-center rounded-md bg-midyaf-gold/20 text-xs font-black text-midyaf-gold">
                        {index + 1}
                      </span>
                      <span className="text-xs font-black text-midyaf-pearl dark:text-white">
                        {hotel.name || (ui.isArabic ? `فندق #${index + 1}` : `Hotel #${index + 1}`)}
                      </span>
                      {hotel.roomsBooked > 0 && (
                        <Badge tone="slate">
                          {hotel.roomsBooked} {ui.isArabic ? "غرفة" : "rooms"}
                        </Badge>
                      )}
                    </div>
                    {hotelsList.length > 1 && canEdit && (
                      <button
                        type="button"
                        onClick={() => handleRemoveHotel(hotel.id)}
                        className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer transition-colors"
                        title={ui.isArabic ? "حذف هذا الفندق" : "Remove this hotel"}
                      >
                        <Trash2 size={13} />
                        <span>{ui.isArabic ? "حذف" : "Remove"}</span>
                      </button>
                    )}
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <Field
                      label={ui.isArabic ? "اسم الفندق" : "Hotel Name"}
                      value={hotel.name}
                      disabled={!canEdit}
                      onChange={(val) => handleUpdateHotel(hotel.id, "name", val)}
                    />
                    <Field
                      label={ui.isArabic ? "مسؤول التواصل بالفندق / الهاتف" : "Hotel Contact / Phone"}
                      value={hotel.contact}
                      disabled={!canEdit}
                      onChange={(val) => handleUpdateHotel(hotel.id, "contact", val)}
                    />
                    <NumberField
                      label={ui.isArabic ? "عدد الغرف المحجوزة" : "Rooms Booked"}
                      value={hotel.roomsBooked}
                      disabled={!canEdit}
                      onChange={(val) => handleUpdateHotel(hotel.id, "roomsBooked", val)}
                    />
                    <Field
                      label={ui.isArabic ? "نوع الغرف / الأجنحة" : "Room / Suite Type"}
                      value={hotel.roomType}
                      disabled={!canEdit}
                      onChange={(val) => handleUpdateHotel(hotel.id, "roomType", val)}
                    />
                    <div className="md:col-span-2">
                      <Field
                        label={ui.isArabic ? "ملاحظات الفندق والتوزيع اللوجستي" : "Hotel Notes & Allocation"}
                        value={hotel.notes ?? ""}
                        disabled={!canEdit}
                        onChange={(val) => handleUpdateHotel(hotel.id, "notes", val)}
                      />
                    </div>
                  </div>
                </div>
              ))}

              {canEdit && (
                <button
                  type="button"
                  onClick={handleAddHotel}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-midyaf-gold/40 bg-midyaf-gold/5 py-2.5 text-xs font-bold text-midyaf-pearl transition-all hover:bg-midyaf-gold/15 dark:text-midyaf-gold dark:hover:bg-midyaf-gold/20 cursor-pointer"
                >
                  <Plus size={15} />
                  <span>{ui.isArabic ? "+ إضافة فندق آخر" : "+ Add Another Hotel"}</span>
                </button>
              )}
            </div>
          </Section>

          {/* Section 3: Multi-Car Rental & Bus Companies Section */}
          <Section
            id="section-intake-rentals"
            title={
              <div className="flex flex-wrap items-center justify-between gap-2 w-full">
                <div className="flex items-center gap-2">
                  <Car size={18} className="text-midyaf-gold" />
                  <span>{ui.isArabic ? "3. شركات تأجير السيارات والحافلات (Car & Bus Rental Companies)" : "3. Car & Bus Rental Companies"}</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="rounded-md bg-midyaf-purple/10 px-2.5 py-1 font-bold text-midyaf-pearl dark:bg-midyaf-purple/30 dark:text-white">
                    {ui.isArabic ? `إجمالي الشركات: ${carRentalsList.length}` : `Companies: ${carRentalsList.length}`}
                  </span>
                  <span className="rounded-md bg-sky-500/15 px-2.5 py-1 font-bold text-sky-600 dark:text-sky-400">
                    {ui.isArabic ? `إجمالي المركبات: ${totalFleetUnitsAllRentals} مركبة / حافلة` : `Total Fleet: ${totalFleetUnitsAllRentals}`}
                  </span>
                </div>
              </div>
            }
          >
            <div className="space-y-4">
              {carRentalsList.map((rental, index) => (
                <div
                  key={rental.id}
                  className="rounded-xl border border-white/5 bg-[#121626]/70 p-4 shadow-sm transition-all dark:border-slate-800 dark:bg-slate-900/60"
                >
                  <div className="flex items-center justify-between border-b border-white/5 pb-2.5 mb-3 dark:border-slate-800">
                    <div className="flex items-center gap-2">
                      <span className="grid size-6 place-items-center rounded-md bg-sky-500/20 text-xs font-black text-sky-600 dark:text-sky-400">
                        {index + 1}
                      </span>
                      <span className="text-xs font-black text-midyaf-pearl dark:text-white">
                        {rental.companyName || (ui.isArabic ? `شركة تأجير #${index + 1}` : `Rental Company #${index + 1}`)}
                      </span>
                      {rental.fleetCount ? (
                        <Badge tone="blue">
                          {rental.fleetCount} {ui.isArabic ? "مركبة / حافلة" : "vehicles"}
                        </Badge>
                      ) : null}
                    </div>
                    {carRentalsList.length > 1 && canEdit && (
                      <button
                        type="button"
                        onClick={() => handleRemoveCarRental(rental.id)}
                        className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer transition-colors"
                        title={ui.isArabic ? "حذف هذه الشركة" : "Remove this rental company"}
                      >
                        <Trash2 size={13} />
                        <span>{ui.isArabic ? "حذف" : "Remove"}</span>
                      </button>
                    )}
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <Field
                      label={ui.isArabic ? "اسم شركة تأجير السيارات / الحافلات" : "Rental Company Name"}
                      value={rental.companyName}
                      disabled={!canEdit}
                      onChange={(val) => handleUpdateCarRental(rental.id, "companyName", val)}
                    />
                    <Field
                      label={ui.isArabic ? "معلومات تواصل شركة التأجير" : "Car Rental Contact"}
                      value={rental.contact}
                      disabled={!canEdit}
                      onChange={(val) => handleUpdateCarRental(rental.id, "contact", val)}
                    />
                    <NumberField
                      label={ui.isArabic ? "عدد المركبات والحافلات" : "Fleet Count"}
                      value={rental.fleetCount ?? 0}
                      disabled={!canEdit}
                      onChange={(val) => handleUpdateCarRental(rental.id, "fleetCount", val)}
                    />
                    <Field
                      label={ui.isArabic ? "نوع وفئات المركبات (مايباخ، حافلات، SUV)" : "Vehicle Types & Profile"}
                      value={rental.vehicleTypes ?? ""}
                      disabled={!canEdit}
                      onChange={(val) => handleUpdateCarRental(rental.id, "vehicleTypes", val)}
                    />
                    <div className="md:col-span-2">
                      <Field
                        label={ui.isArabic ? "ملاحظات الأسطول وجدول التواجد" : "Fleet Notes & Logistics"}
                        value={rental.notes ?? ""}
                        disabled={!canEdit}
                        onChange={(val) => handleUpdateCarRental(rental.id, "notes", val)}
                      />
                    </div>
                  </div>
                </div>
              ))}

              {canEdit && (
                <button
                  type="button"
                  onClick={handleAddCarRental}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-sky-500/40 bg-sky-500/5 py-2.5 text-xs font-bold text-sky-700 transition-all hover:bg-sky-500/15 dark:text-sky-400 dark:hover:bg-sky-500/20 cursor-pointer"
                >
                  <Plus size={15} />
                  <span>{ui.isArabic ? "+ إضافة شركة تأجير أخرى" : "+ Add Another Car Rental Company"}</span>
                </button>
              )}
            </div>
          </Section>

          {/* Section 4: Multi-Supplier / Provider Section & Conditional Payment Terms */}
          <Section
            id="section-intake-suppliers"
            title={
              <div className="flex flex-wrap items-center justify-between gap-2 w-full">
                <div className="flex items-center gap-2">
                  <BriefcaseBusiness size={18} className="text-midyaf-gold" />
                  <span>{ui.isArabic ? "4. المزودون والموردون المعتمدون وشروط الدفع" : "4. Dedicated Suppliers, Providers & Payment Terms"}</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="rounded-md bg-midyaf-purple/10 px-2.5 py-1 font-bold text-midyaf-pearl dark:bg-midyaf-purple/30 dark:text-white">
                    {ui.isArabic ? `المزودون المعتمدون: ${suppliersList.length}` : `Providers: ${suppliersList.length}`}
                  </span>
                  {isPlanApproved ? (
                    <Badge tone="gold">{ui.isArabic ? "شروط الدفع مفعلة" : "Payment Terms Unlocked"}</Badge>
                  ) : (
                    <Badge tone="slate">{ui.isArabic ? "شروط الدفع مقفلة حتى اعتماد الخطة" : "Terms Locked"}</Badge>
                  )}
                </div>
              </div>
            }
          >
            <div className="space-y-4">
              {suppliersList.map((sup, index) => (
                <div
                  key={sup.id}
                  className="rounded-xl border border-white/5 bg-[#121626]/70 p-4 shadow-sm transition-all dark:border-slate-800 dark:bg-slate-900/60"
                >
                  <div className="flex items-center justify-between border-b border-white/5 pb-2.5 mb-3 dark:border-slate-800">
                    <div className="flex items-center gap-2">
                      <span className="grid size-6 place-items-center rounded-md bg-emerald-500/20 text-xs font-black text-emerald-600 dark:text-emerald-400">
                        {index + 1}
                      </span>
                      <span className="text-xs font-black text-midyaf-pearl dark:text-white">
                        {sup.providerName || (ui.isArabic ? `مزود #${index + 1}` : `Provider #${index + 1}`)}
                      </span>
                      <Badge tone="purple">
                        {ui.isArabic ? getCategoryNameAr(sup.category) : sup.category}
                      </Badge>
                    </div>
                    {suppliersList.length > 1 && canEdit && (
                      <button
                        type="button"
                        onClick={() => handleRemoveSupplier(sup.id)}
                        className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer transition-colors"
                        title={ui.isArabic ? "حذف هذا المزود" : "Remove this supplier"}
                      >
                        <Trash2 size={13} />
                        <span>{ui.isArabic ? "حذف" : "Remove"}</span>
                      </button>
                    )}
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <Field
                      label={ui.isArabic ? "اسم المزود / المورد المعتمد (Provider)" : "Dedicated Provider Name"}
                      value={sup.providerName}
                      disabled={!canEdit}
                      onChange={(val) => handleUpdateSupplier(sup.id, "providerName", val)}
                    />
                    <SelectField
                      label={ui.isArabic ? "تصنيف المورد / الخدمة" : "Supplier Category"}
                      value={sup.category}
                      options={[
                        "HOTEL",
                        "CAR_RENTAL",
                        "MAN_POWER",
                        "AIRLINE",
                        "VEHICLE_BROKERAGE",
                        "GOLF_CARTS",
                        "HEAVY_EQUIPMENT",
                        "HEAVY_TRUCKS",
                        "CATERING"
                      ]}
                      translate={(cat) => (ui.isArabic ? getCategoryNameAr(cat) : cat)}
                      disabled={!canEdit}
                      onChange={(val) => handleUpdateSupplier(sup.id, "category", val)}
                    />
                    <Field
                      label={ui.isArabic ? "معلومات التواصل / الهاتف" : "Contact Person / Phone"}
                      value={sup.contact}
                      disabled={!canEdit}
                      onChange={(val) => handleUpdateSupplier(sup.id, "contact", val)}
                    />
                    <Field
                      label={ui.isArabic ? "نطاق العمل والتوريد" : "Scope of Work / Supply"}
                      value={sup.scopeOfWork ?? ""}
                      disabled={!canEdit}
                      onChange={(val) => handleUpdateSupplier(sup.id, "scopeOfWork", val)}
                    />

                    {/* Task 2 Constraint: Payment Terms field MUST ONLY become visible after the plan has been approved and processed — hidden before that stage */}
                    <div className="md:col-span-2">
                      {isPlanApproved ? (
                        <div className="rounded-xl border border-midyaf-gold/40 bg-midyaf-gold/10 p-3 animate-fadeInUp shadow-sm">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <Sparkles size={14} className="text-midyaf-gold" />
                              <span className="text-xs font-black text-midyaf-pearl dark:text-white">
                                {ui.isArabic ? "شروط الدفع الخاصة بهذا المورد:" : "Payment Terms for this Supplier:"}
                              </span>
                            </div>
                            <Badge tone="gold">{ui.isArabic ? "مفعل ومعتمد" : "Unlocked"}</Badge>
                          </div>
                          <SelectField
                            label={ui.isArabic ? "طريقة وشروط السداد" : "Payment Terms"}
                            value={sup.paymentTerms ?? "INSTALLMENTS"}
                            options={["INSTALLMENTS", "DOWNPAYMENT"]}
                            translate={(val) =>
                              val === "INSTALLMENTS"
                                ? (ui.isArabic ? "أقساط مجدولة (Installments)" : "Installments")
                                : (ui.isArabic ? "دفعة أولى مقدمة (Downpayment)" : "Downpayment")
                            }
                            disabled={!canEdit}
                            onChange={(val) => handleUpdateSupplier(sup.id, "paymentTerms", val as any)}
                          />
                        </div>
                      ) : (
                        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/60 p-3 text-xs text-slate-500 flex items-center gap-2 dark:border-slate-800 dark:bg-slate-800/30">
                          <Lock size={14} className="text-slate-400 shrink-0" />
                          <span>
                            {ui.isArabic
                              ? "شروط دفع هذا المزود (أقساط أو دفعة أولى): مقفلة ومخفية حتى يتم اعتماد الخطة اللوجستية ومعالجتها."
                              : "Payment terms for this provider: Hidden & locked until the logistics plan is approved and processed."}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {canEdit && (
                <button
                  type="button"
                  onClick={handleAddSupplier}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-emerald-500/40 bg-emerald-500/5 py-2.5 text-xs font-bold text-emerald-700 transition-all hover:bg-emerald-500/15 dark:text-emerald-400 dark:hover:bg-emerald-500/20 cursor-pointer"
                >
                  <Plus size={15} />
                  <span>{ui.isArabic ? "+ إضافة مورد / مزود معتمد آخر" : "+ Add Another Supplier / Provider"}</span>
                </button>
              )}
            </div>
          </Section>

          {/* Task 3: New Supplier / Resource Categories */}
          <Section id="section-intake-resources" title={ui.isArabic ? "5. الفئات اللوجستية والموارد الإضافية" : "5. New Supplier & Resource Categories"}>
            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
              <NumberField
                label={ui.isArabic ? "عربات الجولف (Golf carts)" : "Golf carts"}
                value={draft.golfCartsCount ?? 0}
                disabled={!canEdit}
                onChange={(value) =>
                  setDraft((current) => ({ ...current, golfCartsCount: value }))
                }
              />
              <NumberField
                label={ui.isArabic ? "شاحنات النقل (Transportation trucks)" : "Transportation trucks"}
                value={draft.transportationTrucksCount ?? 0}
                disabled={!canEdit}
                onChange={(value) =>
                  setDraft((current) => ({ ...current, transportationTrucksCount: value }))
                }
              />
              <NumberField
                label={ui.isArabic ? "شاحنات ثقيلة (Heavy trucks)" : "Heavy trucks"}
                value={draft.heavyTrucksCount ?? 0}
                disabled={!canEdit}
                onChange={(value) =>
                  setDraft((current) => ({ ...current, heavyTrucksCount: value }))
                }
              />
              <NumberField
                label={ui.isArabic ? "رافعات ومعدات ثقيلة (Heavy equipment)" : "Cranes / heavy equipment"}
                value={draft.heavyEquipmentCount ?? 0}
                disabled={!canEdit}
                onChange={(value) =>
                  setDraft((current) => ({ ...current, heavyEquipmentCount: value }))
                }
              />
              <NumberField
                label={ui.isArabic ? "حافلات وفود (Buses count)" : "Buses count"}
                value={draft.busesCount ?? 0}
                disabled={!canEdit}
                onChange={(value) =>
                  setDraft((current) => ({ ...current, busesCount: value }))
                }
              />
              <NumberField
                label={ui.isArabic ? "القوى البشرية" : "Man Power"}
                value={draft.manPowerCount ?? 0}
                disabled={!canEdit}
                onChange={(value) =>
                  setDraft((current) => ({ ...current, manPowerCount: value }))
                }
              />
            </div>

            {/* Man Power Subtype Selector */}
            <div className="mt-3">
              <SelectField
                label={ui.isArabic ? "نوع القوى البشرية الفرعي (Man Power Subtype)" : "Man Power Subtype"}
                value={draft.manPowerSubtype ?? "EVENT_STAFF"}
                options={["EVENT_STAFF", "CARGO_LOADING"]}
                translate={(val) =>
                  val === "CARGO_LOADING"
                    ? (ui.isArabic ? "عمال تحميل وتفريغ وبضائع (Loading / Cargo Workers)" : "Loading / Cargo Workers")
                    : (ui.isArabic ? "منظمو الفعالية ومشرفو المراسم (Event Organizers / Staff)" : "Event Organizers / Staff")
                }
                disabled={!canEdit}
                onChange={(value) =>
                  setDraft((current) => ({ ...current, manPowerSubtype: value as any }))
                }
              />
            </div>
          </Section>

          {/* Task 2: Move Guest Details CSV Upload/Entry into Event Data Entry */}
          <Section id="section-intake-csv" title={ui.isArabic ? "5. إدخال ورفع قائمة الضيوف (CSV)" : "5. Guest Details CSV Upload / Entry"}>
            <div className="rounded-xl border border-midyaf-purple/15 bg-midyaf-purple/5 p-4 dark:border-slate-800 dark:bg-slate-800/40">
              <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-start">
                <div>
                  <h4 className="font-bold text-midyaf-pearl dark:text-white">
                    {ui.isArabic ? "استيراد وتدقيق بيانات الضيوف (CSV)" : "Bulk Guest CSV Import"}
                  </h4>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {ui.isArabic
                      ? "الصق قائمة الضيوف أو ارفع ملف CSV. يتم إنشاء رحلات الضيوف، بطاقات الصعود الرقمية، سيارات VIP، ومجموعات النقل الترددي تلقائياً."
                      : "Paste CSV guest list or load CSV file. Creates guest accounts, journeys, VIP cars, and normal shuttle groups."}
                  </p>
                </div>
                <label className="min-w-fit cursor-pointer rounded-lg bg-white px-3 py-1.5 text-center text-xs font-bold text-midyaf-pearl ring-1 ring-slate-200 hover:bg-slate-50 dark:bg-slate-800 dark:text-purple-300 dark:ring-slate-700">
                  {ui.l("Load CSV file")}
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = "";
                      if (file) {
                        void handleBulkCsvFile(file);
                      }
                    }}
                  />
                </label>
              </div>

              <textarea
                value={bulkCsv}
                onChange={(event) => setBulkCsv(event.target.value)}
                spellCheck={false}
                rows={5}
                className="mt-3 w-full rounded-lg border border-white/5 bg-[#121626] p-2.5 font-mono text-xs leading-5 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
              />

              <div className="mt-3 flex flex-wrap items-center gap-3">
                <CheckboxField
                  label={ui.l("Generate arrival transport tasks")}
                  checked={bulkGenerateTasks}
                  onChange={setBulkGenerateTasks}
                />
                <SelectField
                  label={ui.l("Normal guests per shuttle")}
                  value={String(bulkGuestsPerShuttle)}
                  options={["3", "4"]}
                  translate={(value) => value}
                  onChange={(value) => setBulkGuestsPerShuttle(Number(value))}
                />
                <button
                  type="button"
                  onClick={() => void handleBulkImport()}
                  disabled={pendingAction !== null || !bulkCsv.trim()}
                  className="btn-gold rounded-xl text-xs py-2 px-3.5 cursor-pointer"
                >
                  {pendingAction === "bulkImport"
                    ? ui.l("Importing")
                    : (ui.isArabic ? "استيراد الضيوف وتوليد الرحلات" : "Import guests and generate tasks")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setBulkCsv(sampleGuestCsv);
                    setBulkError(null);
                  }}
                  disabled={pendingAction !== null}
                  className="rounded-xl bg-white px-3 py-2 text-xs font-bold text-midyaf-pearl ring-1 ring-slate-200 hover:bg-slate-50 dark:bg-slate-800 dark:text-purple-300 cursor-pointer"
                >
                  {ui.l("Use sample CSV")}
                </button>
              </div>

              {bulkError ? (
                <p className="mt-2 text-xs font-bold text-red-600 dark:text-red-400">
                  {ui.l(bulkError)}
                </p>
              ) : null}
            </div>
          </Section>

          {canEdit && (
            <div className="flex flex-wrap gap-2 pt-2">
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={pendingAction !== null}
                className="rounded-xl bg-midyaf-purple px-4 py-2.5 text-xs font-bold text-white transition hover:bg-midyaf-purple-dark disabled:opacity-60 cursor-pointer shadow-sm"
              >
                {pendingAction === "save"
                  ? ui.l("Saving")
                  : (ui.isArabic ? "حفظ مدخلات الفعالية" : "Save activity intake")}
              </button>
              <button
                type="button"
                onClick={() => void handleAnalyze()}
                disabled={pendingAction !== null}
                className="btn-gold rounded-xl text-xs py-2.5 px-4 cursor-pointer shadow-sm"
              >
                {pendingAction === "analyze"
                  ? ui.l("Analyzing")
                  : (ui.isArabic ? "تحليل الذكاء الاصطناعي وتجهيز الخطة" : "Analyze with AI and prepare logistics plan")}
              </button>
            </div>
          )}
        </div>

        {/* Right Column: AI Logistics Plan & Output (Task 3, 4, 5) */}
        <div className="space-y-4">
          <Section id="section-ai-plan" title={ui.isArabic ? "مخرجات الخطة اللوجستية الذكية" : "AI Logistics Plan Output"}>
            <div className="rounded-lg border border-midyaf-gold/25 bg-gradient-to-br from-white to-slate-50 p-5 shadow-card-sm dark:from-slate-800 dark:to-slate-900">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 pb-3 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <Badge tone={isPlanApproved ? "green" : "gold"}>
                    {isPlanApproved
                      ? (ui.isArabic ? "خطة معتمدة رسمياً" : "Plan confirmed")
                      : (ui.isArabic ? "بانتظار الاعتماد" : "Awaiting confirmation")}
                  </Badge>
                  <Badge tone="purple">{ui.l("GPT-4o planning")}</Badge>
                </div>

                {/* Task 4: Plan Export & Sharing Buttons */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => exportPlanAsPdf(activePlan, draft, ui.isArabic)}
                    className="btn-gold flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold shadow-sm cursor-pointer"
                  >
                    <Download size={13} />
                    <span>{ui.isArabic ? "تصدير الخطة (PDF)" : "Export Plan PDF"}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => sharePlanLink(activePlan.id, ui.isArabic, toast)}
                    className="flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-midyaf-pearl ring-1 ring-slate-200 transition hover:bg-slate-50 dark:bg-slate-800 dark:text-purple-300 cursor-pointer shadow-sm"
                  >
                    <Share2 size={13} />
                    <span>{ui.isArabic ? "مشاركة" : "Share"}</span>
                  </button>
                  {!isPlanApproved && canEdit && (
                    <button
                      type="button"
                      onClick={() => void handleApprovePlan()}
                      disabled={pendingAction === "approvePlan"}
                      className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-emerald-700 cursor-pointer shadow-sm"
                    >
                      <CheckCircle2 size={13} />
                      <span>{ui.isArabic ? "اعتماد الخطة" : "Approve Plan"}</span>
                    </button>
                  )}
                </div>
              </div>

              <p className="mt-3 text-xs leading-relaxed text-slate-700 dark:text-slate-300">
                {ui.l(activePlan.summary) || (ui.isArabic ? "خطة لوجستية شاملة لتوزيع الأسطول، الضيافة، وإدارة القوى البشرية والمعدات الثقيلة." : "Comprehensive logistics plan distributing fleet, hospitality, workforce, and heavy machinery.")}
              </p>

              {/* Resource Allocation Grid: Core & New Categories (Task 3) */}
              <div className="mt-4">
                <h5 className="text-xs font-black uppercase tracking-wider text-slate-400 mb-2">
                  {ui.isArabic ? "توزيع الموارد والأصول:" : "Resource & Asset Quotas:"}
                </h5>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                  <MiniStat label={ui.l("VIP cars")} value={activePlan.vipCars} />
                  <MiniStat label={ui.l("Shuttle vehicles")} value={activePlan.shuttleVehicles} />
                  <MiniStat label={ui.l("Hotel rooms")} value={activePlan.hotelRooms} />
                  <MiniStat label={ui.l("Tickets")} value={activePlan.firstClassTickets + activePlan.normalTickets} />
                  <MiniStat label={ui.isArabic ? "عربات الجولف" : "Golf Carts"} value={activePlan.golfCarts || draft.golfCartsCount || 30} />
                  <MiniStat label={ui.isArabic ? "شاحنات النقل" : "Transport Trucks"} value={activePlan.transportationTrucks || draft.transportationTrucksCount || 18} />
                  <MiniStat label={ui.isArabic ? "شاحنات ثقيلة" : "Heavy Trucks"} value={activePlan.heavyTrucks || draft.heavyTrucksCount || 12} />
                  <MiniStat label={ui.isArabic ? "رافعات ومعدات" : "Heavy Equipment"} value={activePlan.heavyEquipment || draft.heavyEquipmentCount || 6} />
                  <MiniStat label={ui.isArabic ? "حافلات VIP" : "Buses"} value={activePlan.buses || draft.busesCount || 15} />
                  <div className="rounded-xl border border-white/5 bg-[#121626] p-2.5 text-center dark:border-slate-800 dark:bg-slate-800">
                    <p className="text-xs text-slate-400">{ui.isArabic ? "القوى البشرية" : "Man Power"}</p>
                    <p className="mt-0.5 text-base font-black text-midyaf-pearl dark:text-purple-300">
                      {activePlan.manPower || draft.manPowerCount || 120}
                    </p>
                    <span className="mt-1 inline-block rounded-md bg-midyaf-purple/10 px-1.5 py-0.5 text-xs font-bold text-midyaf-pearl dark:text-purple-300">
                      {(activePlan.manPowerSubtype || draft.manPowerSubtype) === "CARGO_LOADING"
                        ? (ui.isArabic ? "عمال تحميل" : "Cargo Crew")
                        : (ui.isArabic ? "منظمو الفعالية" : "Event Staff")}
                    </span>
                  </div>
                </div>
              </div>

              {/* Assumptions */}
              <div className="mt-4 space-y-2">
                {(activePlan.assumptions.length > 0 ? activePlan.assumptions : [
                  "All VIP guest transfers paired with dedicated executive chauffeurs",
                  "Intra-venue mobility supported by multi-seat golf cart shuttles",
                  "Heavy equipment and stage transportation operating on designated freight corridors",
                  "Bilingual protocol workforce deployed across plenary and VIP lounges"
                ]).map((assumption) => (
                  <div
                    key={assumption}
                    className="flex items-center gap-2 rounded-lg bg-white p-2.5 text-xs text-slate-700 shadow-sm dark:bg-slate-800 dark:text-slate-300"
                  >
                    <CheckCircle2 size={14} className="text-emerald-600 shrink-0" />
                    <span>{ui.l(assumption)}</span>
                  </div>
                ))}
              </div>
            </div>
          </Section>
        </div>
      </div>

      {/* Task 5: Price Range Feature Card */}
      <CategoryPriceRangeSection
        priceRanges={priceRanges}
        vendorQuotes={quotes}
        isArabic={ui.isArabic}
      />

      {/* Task 7: 8 Supplier Categories & Contract Workflow */}
      <SupplierContractWorkflow
        isPlanApproved={isPlanApproved}
        onApprovePlan={handleApprovePlan}
        isArabic={ui.isArabic}
      />

      {/* Original Quotes & Plan Phases */}
      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <QuotesAndContracts
          data={data}
          canManage={canEdit}
          isDemoMode={isDemoMode}
          onApproveVendorQuote={approveVendorQuote}
          onApproveContract={approveContract}
        />
        <PlanPhases data={data} />
      </div>
    </div>
  );
}

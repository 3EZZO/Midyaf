// Constants, helpers, form fields and small presentational pieces shared by the ops portals.
// Extracted verbatim from OperationsPortals.tsx (Phase 1 split).
import { useTranslation } from "react-i18next";
import { FileText, Plane, ShieldCheck, Hotel } from "lucide-react";
import { Badge } from "../../components/Badge";
import { KpiTile } from "../../components/ui/KpiTile";
import { Surface } from "../../components/ui/Surface";
import { Badge as UiBadge } from "../../components/ui/Badge";
import { Section } from "../../components/Section";
import { shortDate, shortTime } from "../../lib/format";
import { isArabicLanguage, localizeText, pickText } from "../../lib/localize";
import type { GuestBulkImportInput, PortalProps } from "../types";
import type {
  AppNotification,
  AuditLog,
  FileAsset,
  FileAssetType,
  HotelDetail,
  CarRentalDetail,
  SupplierDetail,
  Task,
  TaskStatus,
  User
} from "@shared/domain";

export const driverZones = [
  "NORTH_ZONE",
  "CENTRAL_ZONE",
  "EAST_ZONE",
  "WEST_ZONE",
  "SUMMIT_CORRIDOR",
  "DIRIYAH_CORRIDOR"
] as const;

export const supplierCategories = [
  "AIRLINE",
  "VEHICLE_BROKERAGE",
  "CAR_RENTAL",
  "MAN_POWER",
  "GOLF_CARTS",
  "HEAVY_TRUCKS",
  "HEAVY_EQUIPMENT",
  "HOTEL",
  "CAR",
  "TICKET",
  "CATERING",
  "EQUIPMENT",
  "TOURISM"
] as const;

export const taskTypes = [
  "AIRPORT_PICKUP",
  "HOTEL_TRANSFER",
  "VENUE_TRANSFER",
  "RESTAURANT_PICKUP",
  "VIP_ESCORT"
] as const;

export const taskBoardStatuses: TaskStatus[] = [
  "PENDING",
  "ASSIGNED",
  "ACCEPTED",
  "EN_ROUTE",
  "ARRIVED",
  "PICKED_UP",
  "DELAYED",
  "COMPLETED",
  "CANCELLED"
];

export const assignableRoles = [
  "ORGANIZER",
  "COORDINATOR",
  "COMPANY_ORGANIZER",
  "SUPPLIER",
  "DRIVER",
  "GUEST"
] as const;

export const captainTypes = ["SHUTTLE", "VIP_CAPTAIN", "EMERGENCY"] as const;

export function useOpsText() {
  const { i18n } = useTranslation();
  const isArabic = isArabicLanguage(i18n.language);

  return {
    isArabic,
    l: (value: string | number | null | undefined) =>
      localizeText(value, isArabic),
    p: (english: string, arabic: string) => pickText(isArabic, english, arabic),
    time: (value: string) => shortTime(value, isArabic ? "ar" : "en"),
    date: (value: string) => shortDate(value, isArabic ? "ar" : "en")
  };
}

export function canManageOperations(session?: PortalProps["session"]) {
  return ["LOGISTICS_MANAGER", "ORGANIZER", "SUPER_ADMIN"].includes(
    session?.user.role ?? ""
  );
}

export function canConfirmReports(session?: PortalProps["session"]) {
  return ["LOGISTICS_MANAGER", "SUPER_ADMIN"].includes(
    session?.user.role ?? ""
  );
}

export function canManageVendorWorkflow(session?: PortalProps["session"]) {
  return ["LOGISTICS_MANAGER", "SUPER_ADMIN"].includes(
    session?.user.role ?? ""
  );
}

export function canSubmitCompanyUpdates(session?: PortalProps["session"]) {
  return session?.user.role === "COMPANY_ORGANIZER";
}

export function defaultDeadline() {
  const deadline = new Date(Date.now() + 60 * 60 * 1000);
  return deadline.toISOString().slice(0, 16);
}

export function dateTimeInHours(hours: number) {
  const date = new Date(Date.now() + hours * 60 * 60 * 1000);
  return date.toISOString().slice(0, 16);
}

export const sampleGuestCsv = [
  "name,email,phone,isVIP,tier,language,arrivalGate,pickupLocation,dropoffLocation,pickupLat,pickupLng,dropoffLat,dropoffLng,scheduledAt,departureFlight,departurePickupTime",
  "VIP Guest One,vip.one@example.com,+966500000101,true,vip,ar,Gate A4,King Khalid International Airport,Four Seasons Hotel,24.9576,46.6988,24.7118,46.6744,2026-09-10T18:00,SV120,2026-09-13T13:00",
  "Normal Guest One,normal.one@example.com,+966500000102,false,standard,ar,Gate A4,King Khalid International Airport,Voco Summit Hotel,24.9576,46.6988,24.6707,46.7000,2026-09-10T18:20,SV121,2026-09-13T13:30"
].join("\n");

export const uploadAcceptByType: Record<FileAssetType, string> = {
  VISA: ".pdf,image/*",
  TICKET: ".pdf,image/*",
  GUEST_PHOTO: "image/*",
  DRIVER_PHOTO: "image/*",
  PROMO_VIDEO: "video/*",
  REPORT_PDF: ".pdf",
  OTHER: "*/*"
};

export const defaultHotels: HotelDetail[] = [
  {
    id: "hotel-1",
    name: "فندق الريتز-كارلتون (The Ritz-Carlton)",
    contact: "+966 11 802 8888",
    roomsBooked: 70,
    roomType: "Royal & Executive Suites",
    notes: "مقر إقامة وفود كبار الشخصيات والوزراء"
  },
  {
    id: "hotel-2",
    name: "فندق فورسيزونز برج المملكة (Four Seasons)",
    contact: "+966 11 211 5000",
    roomsBooked: 50,
    roomType: "Deluxe Premium Rooms",
    notes: "مقر إقامة المتحدثين والمستثمرين الدوليين"
  }
];

export const defaultCarRentals: CarRentalDetail[] = [
  {
    id: "rental-1",
    companyName: "شركة الأسطول الملكي لتأجير السيارات الفاخرة",
    contact: "+966 50 111 2233",
    fleetCount: 40,
    vehicleTypes: "مرسيدس مايباخ S680 وبي إم دبليو الفئة السابعة",
    notes: "مواكب الشخصيات الرسمية والدبلوماسية"
  },
  {
    id: "rental-2",
    companyName: "شركة لوجستيات الحافلات والنقل الماسي",
    contact: "+966 55 444 5566",
    fleetCount: 15,
    vehicleTypes: "حافلات VIP فاخرة 50 راكب",
    notes: "نقل الوفود العامة بين الفنادق وموقع الفعالية"
  }
];

export const defaultSuppliers: SupplierDetail[] = [
  {
    id: "sup-1",
    providerName: "مجموعة الضيافة والخدمات الفندقية المساندة",
    category: "HOTEL",
    contact: "+966 54 777 8899",
    scopeOfWork: "خدمات الضيافة الفندقية والإعاشة والتسكين",
    paymentTerms: "INSTALLMENTS",
    notes: "المزود المعتمد لخدمات الضيافة الفندقية"
  },
  {
    id: "sup-2",
    providerName: "شركة تموين المؤتمرات والفعاليات الملكية",
    category: "CATERING",
    contact: "+966 56 333 4455",
    scopeOfWork: "بوفيهات القاعات الكبرى والولائم الرسمية",
    paymentTerms: "DOWNPAYMENT",
    notes: "عقد التموين والإعاشة للقمة"
  },
  {
    id: "sup-3",
    providerName: "شركة الإمداد البشري والتنظيم الميداني",
    category: "MAN_POWER",
    contact: "+966 50 888 9900",
    scopeOfWork: "120 فرد تنظيم ومشرفو استقبال ومراسم",
    paymentTerms: "INSTALLMENTS",
    notes: "تشغيل القاعات وتوجيه الوفود"
  },
  {
    id: "sup-4",
    providerName: "مؤسسة النقل الثقيل والمعدات اللوجستية",
    category: "HEAVY_TRUCKS",
    contact: "+966 53 222 1100",
    scopeOfWork: "شاحنات نقل ثقيل ومعدات مسارح وتجهيز قاعات",
    paymentTerms: "INSTALLMENTS",
    notes: "التجهيزات اللوجستية والنقل الثقيل"
  }
];

export const emptyActivityIntake = {
  id: "",
  eventId: null,
  activityName: "",
  activityPlace: "",
  visitorCount: 0,
  vipVisitorCount: 0,
  normalVisitorCount: 0,
  transportationType: "MIXED",
  ticketType: "MIXED",
  hotelType: "MIXED",
  carType: "MIXED",
  status: "DRAFT",
  submittedBy: "",
  submittedAt: new Date(0).toISOString(),
  hotelName: defaultHotels[0].name,
  hotelContact: defaultHotels[0].contact,
  hotelRoomsBooked: defaultHotels[0].roomsBooked,
  hotelRoomType: defaultHotels[0].roomType,
  carRentalCompanyName: defaultCarRentals[0].companyName,
  carRentalContact: defaultCarRentals[0].contact,
  providerName: defaultSuppliers[0].providerName,
  paymentTerms: "INSTALLMENTS",
  golfCartsCount: 0,
  transportationTrucksCount: 0,
  manPowerCount: 0,
  manPowerSubtype: "EVENT_STAFF",
  heavyEquipmentCount: 0,
  heavyTrucksCount: 0,
  busesCount: 0,
  hotels: defaultHotels,
  carRentals: defaultCarRentals,
  suppliers: defaultSuppliers
} satisfies PortalProps["data"]["activityIntakes"][number];

export const emptyAiPlan = {
  id: "",
  intakeId: "",
  summary: "",
  assumptions: [],
  visitorGrouping: "",
  vipCars: 0,
  shuttleVehicles: 0,
  hotelRooms: 0,
  firstClassTickets: 0,
  normalTickets: 0,
  golfCarts: 0,
  transportationTrucks: 0,
  manPower: 0,
  manPowerSubtype: "EVENT_STAFF",
  heavyEquipment: 0,
  heavyTrucks: 0,
  buses: 0,
  phases: [],
  risks: [],
  confirmed: false
} satisfies PortalProps["data"]["aiPlans"][number];

export function latestFileAsset(
  assets: FileAsset[],
  type: FileAssetType,
  matches: (asset: FileAsset) => boolean
) {
  return [...assets]
    .filter((asset) => asset.type === type && matches(asset))
    .sort(
      (left, right) =>
        new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
    )[0];
}

export function assetFileName(asset: FileAsset) {
  return (
    asset.key
      .split("/")
      .pop()
      ?.replace(/^\d+-[a-f0-9-]+-/i, "") ?? asset.key
  );
}

export function nextTaskStatuses(status: TaskStatus): TaskStatus[] {
  switch (status) {
    case "PENDING":
      return ["ASSIGNED", "DELAYED", "CANCELLED"];
    case "ASSIGNED":
      return ["ACCEPTED", "EN_ROUTE", "DELAYED", "CANCELLED"];
    case "ACCEPTED":
      return ["EN_ROUTE", "DELAYED", "CANCELLED"];
    case "EN_ROUTE":
      return ["ARRIVED", "DELAYED", "CANCELLED"];
    case "ARRIVED":
      return ["PICKED_UP", "DELAYED", "CANCELLED"];
    case "PICKED_UP":
      return ["COMPLETED", "DELAYED", "CANCELLED"];
    case "DELAYED":
      return ["ASSIGNED", "EN_ROUTE", "CANCELLED"];
    case "COMPLETED":
    case "CANCELLED":
    default:
      return [];
  }
}

export function statusActionLabel(status: TaskStatus) {
  switch (status) {
    case "ASSIGNED":
      return "Mark assigned";
    case "ACCEPTED":
      return "Mark accepted";
    case "EN_ROUTE":
      return "Mark en route";
    case "ARRIVED":
      return "Mark arrived";
    case "PICKED_UP":
      return "Mark picked up";
    case "COMPLETED":
      return "Mark completed";
    case "DELAYED":
      return "Mark delayed";
    case "CANCELLED":
      return "Cancel task";
    case "PENDING":
    default:
      return "Mark pending";
  }
}

export function taskStatusTone(status: TaskStatus) {
  if (status === "COMPLETED") {
    return "green";
  }

  if (status === "DELAYED" || status === "CANCELLED") {
    return "red";
  }

  if (status === "PENDING") {
    return "gold";
  }

  return "purple";
}

export { PortalHero } from "../../components/ui/PortalHero";

export function RouteLine({
  title,
  route,
  meta,
  badge,
  danger
}: {
  title: string;
  route: string;
  meta?: string;
  badge: string;
  danger?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-white/60 p-3.5 ring-1 ring-slate-100 transition-all duration-200 hover:translate-x-1 hover:bg-white hover:shadow-sm">
      <div>
        <p className="font-semibold text-slate-900 dark:text-white">{title}</p>
        <p className="text-xs text-slate-500">{route}</p>
      </div>
      <div className="text-end">
        <Badge tone={danger ? "red" : "purple"}>{badge}</Badge>
        {meta ? <p className="mt-1 text-xs text-slate-500">{meta}</p> : null}
      </div>
    </div>
  );
}

export function Field({
  label,
  value,
  disabled = false,
  onChange
}: {
  label: string;
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs font-bold text-slate-500">{label}</span>
      <input
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="m-input rounded-xl"
      />
    </label>
  );
}

export function NumberField({
  label,
  value,
  disabled = false,
  onChange
}: {
  label: string;
  value: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs font-bold text-slate-500">{label}</span>
      <input
        type="number"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
        className="m-input rounded-xl"
      />
    </label>
  );
}

export function SelectField({
  label,
  value,
  options,
  translate,
  disabled = false,
  onChange
}: {
  label: string;
  value: string;
  options: string[];
  translate: (value: string) => string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs font-bold text-slate-500">{label}</span>
      <select
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="m-input m-select rounded-xl"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {translate(option)}
          </option>
        ))}
      </select>
    </label>
  );
}

export function CheckboxField({
  label,
  checked,
  onChange
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2.5 rounded-xl bg-white/80 px-3.5 py-2.5 text-sm font-bold text-slate-600 ring-1 ring-slate-100 transition-all hover:bg-white hover:shadow-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="m-checkbox"
      />
      {label}
    </label>
  );
}

export function parseGuestCsv(csv: string): GuestBulkImportInput[] {
  const rows = csv
    .split(/\r?\n/)
    .map((row) => row.trim())
    .filter(Boolean);

  if (rows.length < 2) {
    throw new Error("CSV must include headers and at least one guest row");
  }

  const headers = parseCsvLine(rows[0]).map(normalizeCsvHeader);

  return rows.slice(1).map((row, index) => {
    const columns = parseCsvLine(row);
    const value = (header: string) => {
      const columnIndex = headers.indexOf(header);
      return columnIndex >= 0 ? (columns[columnIndex] ?? "").trim() : "";
    };
    const name = value("name");
    const email = value("email");
    const phone = value("phone");

    if (!name || !email || !phone) {
      throw new Error(
        `CSV row ${index + 2}: name, email, and phone are required`
      );
    }

    return {
      name,
      email,
      phone,
      language: value("language") === "en" ? "en" : "ar",
      isVIP: parseCsvBoolean(value("isvip")),
      tier:
        value("tier") || (parseCsvBoolean(value("isvip")) ? "vip" : "standard"),
      arrivalGate: optionalString(value("arrivalgate")),
      arrivalFlight: optionalString(value("arrivalflight")),
      pickupLocation: optionalString(value("pickuplocation")),
      dropoffLocation: optionalString(value("dropofflocation")),
      pickupLat: optionalNumber(value("pickuplat")),
      pickupLng: optionalNumber(value("pickuplng")),
      dropoffLat: optionalNumber(value("dropofflat")),
      dropoffLng: optionalNumber(value("dropofflng")),
      scheduledAt: optionalString(value("scheduledat")),
      departureFlight: optionalString(value("departureflight")),
      departurePickupTime: optionalString(value("departurepickuptime"))
    };
  });
}

function parseCsvLine(line: string) {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    const nextCharacter = line[index + 1];

    if (character === '"' && inQuotes && nextCharacter === '"') {
      current += '"';
      index += 1;
      continue;
    }

    if (character === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (character === "," && !inQuotes) {
      values.push(current);
      current = "";
      continue;
    }

    current += character;
  }

  values.push(current);
  return values;
}

function normalizeCsvHeader(header: string) {
  return header.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function parseCsvBoolean(value: string) {
  return ["1", "true", "yes", "y", "vip"].includes(value.toLowerCase());
}

function optionalString(value: string) {
  return value.trim() || undefined;
}

function optionalNumber(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return undefined;
  }

  const number = Number(trimmed);
  return Number.isFinite(number) ? number : undefined;
}

export function DateTimeField({
  label,
  value,
  onChange
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs font-bold text-slate-500">{label}</span>
      <input
        type="datetime-local"
        value={value.slice(0, 16)}
        onChange={(event) => onChange(event.target.value)}
        className="m-input rounded-xl"
      />
    </label>
  );
}

export function MiniStat({
  label,
  value,
  onClick
}: {
  label: string;
  value: string | number;
  onClick?: () => void;
}) {
  return (
    <KpiTile
      label={label}
      value={value}
      format="raw"
      onClick={onClick}
      size="md"
      className="p-3.5"
    />
  );
}

export function FileAssetList({ assets }: { assets: FileAsset[] }) {
  const ui = useOpsText();

  if (!assets.length) {
    return (
      <p className="mt-3 rounded-lg bg-white p-3 text-xs text-slate-500">
        {ui.l("No files uploaded yet")}
      </p>
    );
  }

  return (
    <div className="mt-3 space-y-2">
      {assets.map((asset) => (
        <a
          key={asset.id}
          href={asset.url}
          target="_blank"
          rel="noreferrer"
          className="flex items-center justify-between gap-3 rounded-lg bg-white p-3 text-xs text-slate-600 ring-1 ring-slate-100"
        >
          <span className="min-w-0 truncate">{assetFileName(asset)}</span>
          <Badge tone="purple">{ui.l(asset.type)}</Badge>
        </a>
      ))}
    </div>
  );
}

export function DeliveryLog({
  title,
  notifications,
  users
}: {
  title: string;
  notifications: AppNotification[];
  users: User[];
}) {
  const ui = useOpsText();

  return (
    <Section title={title}>
      {notifications.length ? (
        <div className="space-y-3">
          {notifications.map((notification) => {
            const user = users.find((item) => item.id === notification.userId);

            return (
              <div
                key={notification.id}
                className="rounded-lg bg-surface-3 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-ink">
                      {ui.l(notification.title)}
                    </p>
                    <p className="mt-1 text-sm text-ink-muted">
                      {ui.l(notification.body)}
                    </p>
                    <p className="mt-2 text-xs text-ink-faint">
                      {ui.l("Recipient")}:{" "}
                      {ui.l(user?.name ?? notification.recipientPhone)}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <UiBadge tone={notification.read ? "neutral" : "ok"}>
                      {ui.l(notification.deliveryStatus)}
                    </UiBadge>
                    <UiBadge tone="gold">{ui.l(notification.channel)}</UiBadge>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-ink-faint">
                  <span>{ui.date(notification.createdAt)}</span>
                  <span>{ui.time(notification.createdAt)}</span>
                  {notification.provider ? (
                    <span>{ui.l(notification.provider)}</span>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="rounded-lg bg-surface-3 p-4 text-sm text-ink-muted">
          {ui.l("No delivery notifications yet")}
        </p>
      )}
    </Section>
  );
}

export function AuditLogPanel({ auditLogs }: { auditLogs: AuditLog[] }) {
  const ui = useOpsText();

  return (
    <Section title={ui.p("Operational audit trail", "سجل التدقيق التشغيلي")}>
      {auditLogs.length ? (
        <div className="space-y-3">
          {auditLogs.map((log) => (
            <div key={log.id} className="rounded-lg bg-slate-50 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="purple">
                      {auditEntityLabel(log.entityType, ui.isArabic)}
                    </Badge>
                    <p className="font-semibold text-slate-900 dark:text-white">
                      {auditActionLabel(log.action, ui.isArabic)}
                    </p>
                  </div>
                  <p className="mt-2 text-sm text-slate-600">
                    {ui.p("Record", "السجل")}: {shortAuditId(log.entityId)}
                    {log.eventId
                      ? ` · ${ui.p("Event", "الفعالية")}: ${shortAuditId(
                          log.eventId
                        )}`
                      : ""}
                  </p>
                  <p className="mt-2 text-xs text-slate-500">
                    {ui.p("By", "بواسطة")}:{" "}
                    {ui.l(log.actor?.name ?? log.actorRole ?? "System")}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1 text-xs text-slate-500">
                  <span>{ui.date(log.createdAt)}</span>
                  <span>{ui.time(log.createdAt)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">
          <div className="mb-2 flex items-center gap-2 font-semibold text-slate-900 dark:text-white">
            <ShieldCheck size={16} />
            {ui.p(
              "No operational changes recorded yet",
              "لا توجد تغييرات تشغيلية مسجلة بعد"
            )}
          </div>
          <p>
            {ui.p(
              "New intake, task, quote, contract, upload, and report actions will appear here after they are saved.",
              "ستظهر هنا إجراءات الإدخال والمهام والعروض والعقود والملفات والتقارير بعد حفظها."
            )}
          </p>
        </div>
      )}
    </Section>
  );
}

export function FileUploadButton({
  label,
  accept,
  isUploading,
  disabled,
  onUpload
}: {
  label: string;
  accept: string;
  isUploading: boolean;
  disabled?: boolean;
  onUpload: (file: File) => void;
}) {
  const ui = useOpsText();

  return (
    <label
      className={
        disabled
          ? "block cursor-not-allowed rounded-lg bg-slate-200 px-3 py-2 text-center text-xs font-bold text-slate-400"
          : "block cursor-pointer rounded-lg bg-midyaf-purple px-3 py-2 text-center text-xs font-bold text-white"
      }
    >
      {isUploading ? ui.l("Uploading") : label}
      <input
        type="file"
        accept={accept}
        disabled={disabled}
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";

          if (file) {
            onUpload(file);
          }
        }}
      />
    </label>
  );
}

const auditActionLabels: Record<string, { en: string; ar: string }> = {
  "activity_intake.create": {
    en: "Activity intake created",
    ar: "تم إنشاء بيانات الفعالية"
  },
  "activity_intake.update": {
    en: "Activity intake updated",
    ar: "تم تحديث بيانات الفعالية"
  },
  "activity_intake.delete": {
    en: "Activity intake deleted",
    ar: "تم حذف بيانات الفعالية"
  },
  "ai_plan.generate": {
    en: "AI logistics plan generated",
    ar: "تم إنشاء خطة لوجستية بالذكاء الاصطناعي"
  },
  "ai_plan.confirm": {
    en: "AI logistics plan confirmed",
    ar: "تم اعتماد الخطة اللوجستية"
  },
  "vendor_quote.approve": {
    en: "Vendor quote approved",
    ar: "تم اعتماد عرض المورد"
  },
  "contract.approve": {
    en: "Contract approved",
    ar: "تم اعتماد العقد"
  },
  "guest_journey.update": {
    en: "Guest journey updated",
    ar: "تم تحديث رحلة الضيف"
  },
  "coordinator_request.create": {
    en: "Coordinator request created",
    ar: "تم إنشاء طلب منسق"
  },
  "coordinator_request.update": {
    en: "Coordinator request updated",
    ar: "تم تحديث طلب المنسق"
  },
  "company_report.confirm": {
    en: "Company report confirmed",
    ar: "تم اعتماد تقرير الشركة"
  },
  "task.create": {
    en: "Task created",
    ar: "تم إنشاء مهمة"
  },
  "task.status_update": {
    en: "Task status updated",
    ar: "تم تحديث حالة المهمة"
  },
  "task.assignment_update": {
    en: "Task assignment updated",
    ar: "تم تحديث تعيين المهمة"
  },
  "task.reassign": {
    en: "Task reassigned",
    ar: "تمت إعادة تعيين المهمة"
  },
  "driver.location_update": {
    en: "Captain location updated",
    ar: "تم تحديث موقع الكابتن"
  },
  "file_asset.upload": {
    en: "File uploaded",
    ar: "تم رفع ملف"
  },
  "booking.create": {
    en: "Supplier booking created",
    ar: "تم إنشاء حجز مورد"
  },
  "supplier.create": {
    en: "Supplier created",
    ar: "تم إنشاء مورد"
  },
  "user.create": {
    en: "User created",
    ar: "تم إنشاء مستخدم"
  },
  "user.update": {
    en: "User updated",
    ar: "تم تحديث مستخدم"
  },
  "event.create": {
    en: "Event created",
    ar: "تم إنشاء فعالية"
  },
  "event.update": {
    en: "Event updated",
    ar: "تم تحديث فعالية"
  },
  "guest.invite": {
    en: "Guest invited",
    ar: "تم إرسال دعوة ضيف"
  },
  "guest.bulk_import": {
    en: "Guest list imported",
    ar: "تم استيراد قائمة الضيوف"
  }
};

const auditEntityLabels: Record<string, { en: string; ar: string }> = {
  ACTIVITY_INTAKE: { en: "Intake", ar: "الإدخال" },
  AI_PLAN: { en: "AI plan", ar: "الخطة" },
  BOOKING: { en: "Booking", ar: "الحجز" },
  COMPANY_REPORT: { en: "Report", ar: "التقرير" },
  CONTRACT: { en: "Contract", ar: "العقد" },
  COORDINATOR_REQUEST: { en: "Request", ar: "الطلب" },
  DRIVER: { en: "Captain", ar: "الكابتن" },
  EVENT: { en: "Event", ar: "الفعالية" },
  FILE_ASSET: { en: "File", ar: "الملف" },
  GUEST: { en: "Guest", ar: "الضيف" },
  GUEST_JOURNEY: { en: "Journey", ar: "الرحلة" },
  SUPPLIER: { en: "Supplier", ar: "المورد" },
  TASK: { en: "Task", ar: "المهمة" },
  USER: { en: "User", ar: "المستخدم" },
  VENDOR_QUOTE: { en: "Quote", ar: "العرض" }
};

function auditActionLabel(action: string, isArabic: boolean) {
  const label = auditActionLabels[action];

  if (label) {
    return isArabic ? label.ar : label.en;
  }

  return action.replaceAll("_", " ").replaceAll(".", " / ");
}

function auditEntityLabel(entityType: string, isArabic: boolean) {
  const label = auditEntityLabels[entityType];

  if (label) {
    return isArabic ? label.ar : label.en;
  }

  return entityType.replaceAll("_", " ");
}

function shortAuditId(id: string) {
  return id.length > 8 ? id.slice(-8) : id;
}

export function JourneyCard({
  icon: Icon,
  title,
  detail,
  active
}: {
  icon: typeof Plane;
  title: string;
  detail: string;
  active?: boolean;
}) {
  return (
    <Surface
      tone={active ? "gold" : "none"}
      padding="sm"
      level={active ? 3 : 2}
    >
      <Icon
        className={active ? "size-5 text-gold-300" : "size-5 text-ink-muted"}
      />
      <p className="mt-3 text-sm font-bold text-ink">{title}</p>
      <p className="mt-0.5 text-xs text-ink-muted">{detail}</p>
    </Surface>
  );
}

export function DocumentCard({
  icon: Icon,
  title,
  status,
  detail,
  asset,
  translate
}: {
  icon: typeof FileText;
  title: string;
  status: string;
  detail: string;
  asset?: FileAsset;
  translate: (value: string) => string;
}) {
  return (
    <Surface padding="sm">
      <div className="flex items-center justify-between gap-3">
        <Icon className="size-5 text-gold-300" />
        <UiBadge tone={asset ? "ok" : "neutral"}>{status}</UiBadge>
      </div>
      <p className="mt-3 text-sm font-bold text-ink">{title}</p>
      <p className="mt-0.5 text-xs text-ink-muted">{detail}</p>
      {asset ? (
        <a
          href={asset.url}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex h-9 items-center rounded-lg border border-gold-500/40 px-3 text-xs font-bold text-gold-300 transition-colors duration-base hover:bg-gold-500/10"
        >
          {translate("Open file")}
        </a>
      ) : null}
    </Surface>
  );
}

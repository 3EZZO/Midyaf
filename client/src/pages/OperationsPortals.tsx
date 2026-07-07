import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Banknote,
  BriefcaseBusiness,
  Car,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Crown,
  FileText,
  Luggage,
  MapPin,
  MessageSquareText,
  Plane,
  Play,
  ReceiptText,
  ShieldCheck,
  Sparkles,
  Ticket,
  Users
} from "lucide-react";
import { Badge } from "../components/Badge";
import { MetricCard } from "../components/MetricCard";
import { RiyadhMap } from "../components/RiyadhMap";
import { Section } from "../components/Section";
import { money, percent, shortDate, shortTime } from "../lib/format";
import {
  isArabicLanguage,
  localizeText,
  pickText
} from "../lib/localize";
import type {
  DriverCreateInput,
  GuestBulkImportInput,
  GuestInviteInput,
  SupplierCreateInput,
  TaskCreateInput,
  UserCreateInput,
  CoordinatorRequestInput,
  PortalProps
} from "./types";
import type {
  AppNotification,
  AuditLog,
  Driver,
  FileAsset,
  FileAssetType,
  Task,
  TaskStatus,
  User
} from "@shared/domain";

const driverZones = [
  "NORTH_RIYADH",
  "CENTRAL_RIYADH",
  "EAST_RIYADH",
  "WEST_RIYADH",
  "SOUTH_RIYADH",
  "DIRIYAH_CORRIDOR"
] as const;

const supplierCategories = [
  "HOTEL",
  "CAR",
  "TICKET",
  "CATERING",
  "EQUIPMENT",
  "TOURISM"
] as const;

const taskTypes = [
  "AIRPORT_PICKUP",
  "HOTEL_TRANSFER",
  "VENUE_TRANSFER",
  "RESTAURANT_PICKUP",
  "VIP_ESCORT"
] as const;

const taskBoardStatuses: TaskStatus[] = [
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

const assignableRoles = [
  "ORGANIZER",
  "COORDINATOR",
  "COMPANY_ORGANIZER",
  "SUPPLIER",
  "DRIVER",
  "GUEST"
] as const;

const captainTypes = ["SHUTTLE", "VIP_CAPTAIN", "EMERGENCY"] as const;

function useOpsText() {
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

function canManageOperations(session?: PortalProps["session"]) {
  return ["LOGISTICS_MANAGER", "ORGANIZER", "SUPER_ADMIN"].includes(
    session?.user.role ?? ""
  );
}

function canConfirmReports(session?: PortalProps["session"]) {
  return ["LOGISTICS_MANAGER", "SUPER_ADMIN"].includes(
    session?.user.role ?? ""
  );
}

function canManageVendorWorkflow(session?: PortalProps["session"]) {
  return ["LOGISTICS_MANAGER", "SUPER_ADMIN"].includes(
    session?.user.role ?? ""
  );
}

function canSubmitCompanyUpdates(session?: PortalProps["session"]) {
  return session?.user.role === "COMPANY_ORGANIZER";
}

function defaultDeadline() {
  const deadline = new Date(Date.now() + 60 * 60 * 1000);
  return deadline.toISOString().slice(0, 16);
}

function dateTimeInHours(hours: number) {
  const date = new Date(Date.now() + hours * 60 * 60 * 1000);
  return date.toISOString().slice(0, 16);
}

const sampleGuestCsv = [
  "name,email,phone,isVIP,tier,language,arrivalGate,pickupLocation,dropoffLocation,pickupLat,pickupLng,dropoffLat,dropoffLng,scheduledAt,departureFlight,departurePickupTime",
  "VIP Guest One,vip.one@example.com,+966500000101,true,vip,ar,Gate A4,King Khalid International Airport,Four Seasons Riyadh,24.9576,46.6988,24.7118,46.6744,2026-09-10T18:00,SV120,2026-09-13T13:00",
  "Normal Guest One,normal.one@example.com,+966500000102,false,standard,ar,Gate A4,King Khalid International Airport,Voco Riyadh,24.9576,46.6988,24.6707,46.7000,2026-09-10T18:20,SV121,2026-09-13T13:30"
].join("\n");

const uploadAcceptByType: Record<FileAssetType, string> = {
  VISA: ".pdf,image/*",
  TICKET: ".pdf,image/*",
  GUEST_PHOTO: "image/*",
  DRIVER_PHOTO: "image/*",
  PROMO_VIDEO: "video/*",
  REPORT_PDF: ".pdf",
  OTHER: "*/*"
};

const emptyActivityIntake = {
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
  submittedAt: new Date(0).toISOString()
} satisfies PortalProps["data"]["activityIntakes"][number];

const emptyAiPlan = {
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
  phases: [],
  risks: [],
  confirmed: false
} satisfies PortalProps["data"]["aiPlans"][number];

function latestFileAsset(
  assets: FileAsset[],
  type: FileAssetType,
  matches: (asset: FileAsset) => boolean
) {
  return [...assets]
    .filter((asset) => asset.type === type && matches(asset))
    .sort(
      (left, right) =>
        new Date(right.createdAt).getTime() -
        new Date(left.createdAt).getTime()
    )[0];
}

function assetFileName(asset: FileAsset) {
  return asset.key.split("/").pop()?.replace(/^\d+-[a-f0-9-]+-/i, "") ?? asset.key;
}

export function ActivityIntakePage({
  data,
  session,
  saveActivityIntake,
  analyzeActivityIntake
}: PortalProps) {
  const ui = useOpsText();
  const intake = data.activityIntakes[0];
  const canEdit = canManageOperations(session) || canSubmitCompanyUpdates(session);
  const plan =
    data.aiPlans.find((item) => item.intakeId === intake?.id) ?? data.aiPlans[0];
  const activePlan = plan ?? emptyAiPlan;
  const [draft, setDraft] = useState(intake ?? emptyActivityIntake);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const normalGroups = Math.ceil(Number(draft.normalVisitorCount) / 4);

  useEffect(() => {
    setDraft(intake ?? emptyActivityIntake);
  }, [intake]);

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
    } finally {
      setPendingAction(null);
    }
  }

  async function handleAnalyze() {
    setPendingAction("analyze");
    try {
      await saveActivityIntake(draft);
      await analyzeActivityIntake(draft.id);
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <div className="space-y-4">
      <PortalHero
        badge={ui.l("Organizing company intake")}
        title={ui.l("Enter activity requirements before operations are opened")}
        body={ui.l(
          "The organizing company enters the activity, guests, VIP rules, tickets, hotels, and cars. Midyaf AI prepares the logistics plan, then vendor quotations and contracts are managed by the logistics team."
        )}
      />

      <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <Section title={ui.l("Activity input")}>
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
              options={["LUXURY_SEDAN", "SUV_GMC_TAHOE", "MIXED"]}
              translate={ui.l}
              disabled={!canEdit}
              onChange={(value) =>
                setDraft((current) => ({
                  ...current,
                  carType: value as typeof current.carType
                }))
              }
            />
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <MetricCard
              label={ui.l("VIP dedicated cars")}
              value={draft.vipVisitorCount}
              detail={ui.l("One car per VIP for full stay")}
              icon={<Crown size={17} />}
            />
            <MetricCard
              label={ui.l("Normal shuttle groups")}
              value={normalGroups}
              detail={ui.l("3-4 guests per group")}
              icon={<Users size={17} />}
            />
            <MetricCard
              label={ui.l("Planning status")}
              value={
                activePlan.confirmed ? ui.l("Plan confirmed") : ui.l(draft.status)
              }
              detail={ui.l("Confirm before vendor RFQs")}
              icon={<Sparkles size={17} />}
            />
          </div>

          {canEdit ? (
            <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={() => void handleSave()}
              disabled={pendingAction !== null}
              className="rounded-lg bg-midyaf-purple px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
            >
              {pendingAction === "save"
                ? ui.l("Saving")
                : ui.l("Save activity intake")}
            </button>
            <button
              onClick={() => void handleAnalyze()}
              disabled={pendingAction !== null}
              className="btn-gold rounded-xl"
            >
              {pendingAction === "analyze"
                ? ui.l("Analyzing")
                : ui.l("Analyze with AI and prepare logistics plan")}
            </button>
            </div>
          ) : null}
        </Section>

        {plan ? (
          <Section title={ui.l("AI plan output")}>
          <div className="rounded-lg bg-midyaf-pearl p-4">
            <div className="flex items-center justify-between gap-3">
              <Badge tone={activePlan.confirmed ? "green" : "gold"}>
                {activePlan.confirmed
                  ? ui.l("Plan confirmed")
                  : ui.l("Awaiting confirmation")}
              </Badge>
              <Badge tone="purple">{ui.l("GPT-4o planning")}</Badge>
            </div>
            <p className="mt-4 text-sm leading-6 text-slate-700">
              {ui.l(activePlan.summary)}
            </p>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-4">
            <MiniStat label={ui.l("VIP cars")} value={activePlan.vipCars} />
            <MiniStat
              label={ui.l("Shuttle vehicles")}
              value={activePlan.shuttleVehicles}
            />
            <MiniStat label={ui.l("Hotel rooms")} value={activePlan.hotelRooms} />
            <MiniStat
              label={ui.l("Tickets")}
              value={activePlan.firstClassTickets + activePlan.normalTickets}
            />
          </div>

          <div className="mt-4 space-y-2">
            {activePlan.assumptions.map((assumption) => (
              <div
                key={assumption}
                className="flex gap-2 rounded-lg bg-slate-50 p-3"
              >
                <CheckCircle2 size={16} className="mt-0.5 text-emerald-600" />
                <p className="text-sm text-slate-700">{ui.l(assumption)}</p>
              </div>
            ))}
          </div>
          </Section>
        ) : (
          <Section title={ui.l("AI plan output")}>
            <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">
              {ui.l("No AI plan has been generated for this intake yet.")}
            </p>
          </Section>
        )}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <QuotesAndContracts data={data} />
        <PlanPhases data={data} />
      </div>
    </div>
  );
}

export function GuestJourneyApp({ data, updateGuestJourney }: PortalProps) {
  const ui = useOpsText();
  const event = data.events[0];
  const guest = event.guests[0];
  const journey = data.guestJourneys[0];
  const task = event.tasks.find((item) => item.guestId === guest.id);
  const assignedDriver = task?.driverId
    ? data.drivers.find((driver) => driver.id === task.driverId)
    : undefined;
  const visaAsset = latestFileAsset(
    data.fileAssets,
    "VISA",
    (asset) => asset.guestId === guest.id
  );
  const ticketAsset = latestFileAsset(
    data.fileAssets,
    "TICKET",
    (asset) => asset.guestId === guest.id
  );
  const driverPhotoAsset = assignedDriver
    ? latestFileAsset(
        data.fileAssets,
        "DRIVER_PHOTO",
        (asset) => asset.driverId === assignedDriver.id
      )
    : undefined;
  const promoVideoAssets = data.fileAssets.filter(
    (asset) =>
      asset.type === "PROMO_VIDEO" &&
      (asset.guestId === guest.id || asset.eventId === event.id)
  );
  const driverPhoto = driverPhotoAsset?.url ?? journey.driverPhoto;
  const [guestNote, setGuestNote] = useState("");
  const [status, setStatus] = useState(journey.arrivalStatus);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const journeyKey = journey.id ?? journey.guestId;

  useEffect(() => {
    setStatus(journey.arrivalStatus);
  }, [journey.arrivalStatus]);

  async function handleArrivalStatus(nextStatus: typeof status) {
    setStatus(nextStatus);
    setPendingAction(nextStatus);
    try {
      await updateGuestJourney(journeyKey, { arrivalStatus: nextStatus });
    } finally {
      setPendingAction(null);
    }
  }

  async function handleGuestNote() {
    const trimmed = guestNote.trim();

    if (!trimmed) {
      return;
    }

    setPendingAction("guestNote");
    try {
      await updateGuestJourney(journeyKey, {
        notes: [...journey.notes, trimmed]
      });
      setGuestNote("");
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
      <div className="space-y-4">
        <PortalHero
          badge={ui.l("Guest App")}
          title={`${ui.l(guest.user.name)} ${ui.l("hospitality journey")}`}
          body={ui.l(
            "Visa, tickets, promotional videos, arrival tracking, event transportation, personal requests, complaints, and departure timing."
          )}
        />

        <div className="grid gap-3 sm:grid-cols-3">
          <JourneyCard
            icon={Plane}
            title={ui.l("1. Arrival")}
            detail={`${ui.l("Gate")} ${journey.arrivalGate} · ${ui.l(status)}`}
            active
          />
          <JourneyCard
            icon={Car}
            title={ui.l("2. Event transport")}
            detail={ui.l("Hotel to venue and return")}
          />
          <JourneyCard
            icon={Luggage}
            title={ui.l("3. Departure")}
            detail={`${ui.time(journey.departurePickupTime)} ${ui.l("pickup")}`}
          />
        </div>

        <Section title={ui.l("Documents and hospitality media")}>
          <div className="grid gap-3 md:grid-cols-2">
            <DocumentCard
              icon={FileText}
              title={ui.l("Visa")}
              status={ui.l(visaAsset ? "SENT" : journey.visaStatus)}
              detail={ui.l("Visa document sent to guest app.")}
              asset={visaAsset}
              translate={ui.l}
            />
            <DocumentCard
              icon={Ticket}
              title={ui.l("Tickets")}
              status={ui.l(ticketAsset ? "SENT" : journey.ticketStatus)}
              detail={ui.l("Event ticket and seating class sent.")}
              asset={ticketAsset}
              translate={ui.l}
            />
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {promoVideoAssets.map((asset) => (
              <div key={asset.id} className="rounded-lg bg-slate-50 p-3">
                {asset.mimeType.startsWith("video/") ? (
                  <video
                    src={asset.url}
                    controls
                    className="aspect-video w-full rounded-lg bg-black object-cover"
                  />
                ) : null}
                <div className="mt-3 flex items-center gap-3">
                  <div className="grid size-10 place-items-center rounded-lg bg-midyaf-purple text-white">
                    <Play size={17} />
                  </div>
                  <div>
                    <p className="font-semibold text-midyaf-ink">
                      {assetFileName(asset)}
                    </p>
                    <p className="text-xs text-slate-500">
                      {ui.l("Uploaded hospitality video")}
                    </p>
                  </div>
                </div>
              </div>
            ))}
            {journey.promoVideos.map((video) => (
              <div key={video} className="flex gap-3 rounded-lg bg-slate-50 p-3">
                <div className="grid size-10 place-items-center rounded-lg bg-midyaf-purple text-white">
                  <Play size={17} />
                </div>
                <div>
                  <p className="font-semibold text-midyaf-ink">{ui.l(video)}</p>
                  <p className="text-xs text-slate-500">
                    {ui.l("Country and hospitality preview video")}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </Section>

        <DeliveryLog
          title={ui.l("Delivery notifications")}
          notifications={data.notifications
            .filter((notification) => notification.userId === guest.userId)
            .slice(0, 4)}
          users={data.users}
        />

        <Section title={ui.l("Arrival status updates")}>
          <div className="grid gap-2 sm:grid-cols-5">
            {["PRE_ARRIVAL", "PASSPORT", "LUGGAGE", "GATE", "PICKED_UP"].map(
              (item) => (
                <button
                  key={item}
                  onClick={() =>
                    void handleArrivalStatus(item as typeof status)
                  }
                  disabled={pendingAction !== null}
                  className={
                    status === item
                      ? "rounded-lg bg-midyaf-purple px-3 py-2 text-xs font-bold text-white"
                      : "rounded-lg bg-slate-100 px-3 py-2 text-xs font-bold text-slate-600 disabled:opacity-60"
                  }
                >
                  {ui.l(item)}
                </button>
              )
            )}
          </div>
          <div className="mt-4 rounded-lg bg-midyaf-gold/10 p-4">
            <p className="text-sm font-bold text-midyaf-ink">
              {ui.l("Car arrives in")} {journey.etaMinutes} {ui.l("minutes")}
            </p>
            <p className="mt-1 text-sm text-slate-600">
              {ui.l(
                "Guest should be notified to wait outside before the captain arrives."
              )}
            </p>
          </div>
        </Section>
      </div>

      <div className="space-y-4">
        <Section title={ui.l("Captain and car details")}>
          <div className="flex gap-4 rounded-lg bg-slate-50 p-4">
            <img
              src={driverPhoto}
              alt={ui.l(journey.driverName)}
              className="size-16 rounded-lg object-cover"
            />
            <div className="min-w-0 flex-1">
              <p className="font-bold text-midyaf-ink">
                {ui.l(journey.driverName)}
              </p>
              <p className="text-sm text-slate-500">{journey.driverPhone}</p>
              <p className="mt-2 text-sm font-semibold text-midyaf-purple">
                {ui.l(journey.carDetails)}
              </p>
            </div>
            <Badge tone={guest.isVIP ? "gold" : "purple"}>
              {guest.isVIP ? ui.l("VIP dedicated car") : ui.l("Grouped shuttle")}
            </Badge>
          </div>
        </Section>

        <RiyadhMap event={event} drivers={data.drivers} tasks={task ? [task] : []} />

        <Section title={ui.l("Special requests, notes, complaints")}>
          <div className="space-y-2">
            {[
              ...journey.personalTripRequests,
              ...journey.notes,
              ...journey.complaints
            ].map((item) => (
              <p
                key={item}
                className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700"
              >
                {ui.l(item)}
              </p>
            ))}
          </div>
          <div className="mt-4 flex gap-2">
            <input
              value={guestNote}
              onChange={(event) => setGuestNote(event.target.value)}
              placeholder={ui.l("Add request, note, or complaint")}
              className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
            <button
              onClick={() => void handleGuestNote()}
              disabled={pendingAction !== null}
              className="rounded-lg bg-midyaf-purple px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
            >
              {pendingAction === "guestNote" ? ui.l("Saving") : ui.l("Send")}
            </button>
          </div>
        </Section>

        <Section title={ui.l("Departure confirmation")}>
          <div className="grid gap-3 sm:grid-cols-2">
            <MiniStat label={ui.l("Flight")} value={journey.departureFlight} />
            <MiniStat
              label={ui.l("Leave hotel")}
              value={ui.time(journey.departurePickupTime)}
            />
            <MiniStat
              label={ui.l("Midyaf transport")}
              value={journey.leavingWithMidyaf ? ui.l("Yes") : ui.l("No")}
            />
            <MiniStat
              label={ui.l("Timing confirmed")}
              value={
                journey.departureConfirmed
                  ? ui.l("Confirmed")
                  : ui.l("Pending")
              }
            />
          </div>
        </Section>
      </div>
    </div>
  );
}

export function CaptainsApp({
  data,
  shareDriverLocation,
  updateTaskStatus
}: PortalProps) {
  const ui = useOpsText();
  const event = data.events[0];
  const captain = data.drivers[0];
  const tasks = event.tasks.filter((task) => task.driverId === captain.id);
  const captainPhotoAsset = latestFileAsset(
    data.fileAssets,
    "DRIVER_PHOTO",
    (asset) => asset.driverId === captain.id
  );

  return (
    <div className="space-y-4">
      <PortalHero
        badge={ui.l("Captains App")}
        title={ui.l(captain.user.name)}
        body={ui.l(
          "Shifts, tasks, car information, visit count, active status, overtime availability, and task feedback."
        )}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <MetricCard
          label={ui.l("Shift")}
          value={`${ui.time(captain.shiftStart ?? event.date)}-${ui.time(
            captain.shiftEnd ?? event.date
          )}`}
          detail={
            captain.overtimeAvailable
              ? ui.l("Overtime available")
              : ui.l("No overtime")
          }
          icon={<Clock size={17} />}
        />
        <MetricCard
          label={ui.l("Visits")}
          value={captain.visitsCompleted ?? 0}
          detail={ui.l("Today")}
          icon={<MapPin size={17} />}
        />
        <MetricCard
          label={ui.l("Car")}
          value={ui.p("GMC Yukon", "جي إم سي يوكن")}
          detail={`${captain.licenseNo} · ${ui.l(captain.zone)}`}
          icon={<Car size={17} />}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <Section
          title={ui.l("Task routes and feedback")}
          action={
            <button
              onClick={() => void shareDriverLocation(captain.id)}
              className="btn-gold rounded-xl px-3 py-2 text-xs font-bold text-white"
            >
              {ui.l("Share location")}
            </button>
          }
        >
          <div className="space-y-3">
            {tasks.map((task) => (
              <CaptainTaskCard
                key={task.id}
                task={task}
                guestPhoto={latestFileAsset(
                  data.fileAssets,
                  "GUEST_PHOTO",
                  (asset) => asset.guestId === task.guestId
                )}
                translate={ui.l}
                formatTime={ui.time}
                onComplete={() => void updateTaskStatus(task.id, "COMPLETED")}
              />
            ))}
          </div>
        </Section>

        <div className="space-y-4">
          <Section title={ui.l("Captain media")}>
            <div className="flex items-center gap-3 rounded-lg bg-slate-50 p-4">
              <img
                src={captainPhotoAsset?.url ?? "/midyaf-logo.jpeg"}
                alt={ui.l(captain.user.name)}
                className="size-16 rounded-lg object-cover"
              />
              <div>
                <p className="font-semibold text-midyaf-ink">
                  {ui.l(captain.user.name)}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {captainPhotoAsset
                    ? assetFileName(captainPhotoAsset)
                    : ui.l("No uploaded driver photo yet")}
                </p>
              </div>
            </div>
          </Section>

          <DeliveryLog
            title={ui.l("Delivery notifications")}
            notifications={data.notifications
              .filter((notification) => notification.userId === captain.userId)
              .slice(0, 4)}
            users={data.users}
          />

          <RiyadhMap event={event} drivers={data.drivers} tasks={tasks} />
        </div>
      </div>
    </div>
  );
}

function CaptainTaskCard({
  task,
  guestPhoto,
  translate,
  formatTime,
  onComplete
}: {
  task: PortalProps["data"]["events"][number]["tasks"][number];
  guestPhoto?: FileAsset;
  translate: (value: string | number | null | undefined) => string;
  formatTime: (value: string) => string;
  onComplete: () => void;
}) {
  return (
    <div className="rounded-lg border border-slate-200 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 gap-3">
          <img
            src={guestPhoto?.url ?? "/midyaf-logo.jpeg"}
            alt={translate(task.guest?.user.name ?? "Guest")}
            className="size-14 rounded-lg object-cover"
          />
          <div>
            <Badge tone={task.status === "DELAYED" ? "red" : "purple"}>
              {translate(task.status)}
            </Badge>
            <h3 className="mt-3 font-bold text-midyaf-ink">
              {translate(task.pickupLocation)} {translate("to")}{" "}
              {translate(task.dropoffLocation)}
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              {translate("Deadline")}{" "}
              {formatTime(task.deadlineAt ?? task.scheduledAt)}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {guestPhoto
                ? translate("Guest photo ready")
                : translate("Guest photo not uploaded yet")}
            </p>
          </div>
        </div>
        <button
          onClick={onComplete}
          className="rounded-lg bg-midyaf-purple px-3 py-2 text-xs font-bold text-white"
        >
          {translate("Complete")}
        </button>
      </div>
    </div>
  );
}

function HospitalityRidersSection({
  data,
  session,
  refreshData
}: {
  data: PortalProps["data"];
  session?: PortalProps["session"];
  refreshData?: () => Promise<void>;
}) {
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  async function toggleFulfilled(riderId: string, currentStatus: boolean) {
    if (!session?.accessToken) return;
    setUpdatingId(riderId);
    try {
      await fetch(`/api/riders/${riderId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.accessToken}`
        },
        body: JSON.stringify({ fulfilled: !currentStatus })
      });
      if (refreshData) await refreshData();
    } finally {
      setUpdatingId(null);
    }
  }

  const riders = data.hospitalityRiders ?? [];
  if (riders.length === 0) {
    return (
      <Section title="VIP Hospitality Riders & Protocols">
        <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">
          No VIP hospitality riders are currently registered for this event.
        </p>
      </Section>
    );
  }

  return (
    <Section title="VIP Hospitality Riders & Protocols">
      <div className="grid gap-4 md:grid-cols-2">
        {riders.map((rider) => {
          const guest = data.events[0]?.guests.find((g) => g.id === rider.guestId);
          return (
            <div key={rider.id} className="rounded-xl border border-amber-200 bg-gradient-to-br from-white to-amber-50/40 p-5 shadow-card transition-all hover:shadow-luxury dark:border-amber-900/50 dark:bg-dark-card">
              <div className="flex items-start justify-between gap-3 border-b border-amber-100 pb-3 dark:border-amber-900/30">
                <div>
                  <Badge tone="gold">VIP Platinum Protocol</Badge>
                  <h3 className="mt-2 text-lg font-bold text-midyaf-ink dark:text-dark-primary">
                    {guest?.user.name ?? "VIP Guest"}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-dark-secondary">
                    Tier: {guest?.tier ?? "Platinum"} · {guest?.rsvpStatus ?? "CONFIRMED"}
                  </p>
                </div>
                <button
                  onClick={() => void toggleFulfilled(rider.id, rider.fulfilled)}
                  disabled={updatingId === rider.id}
                  className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition-all ${
                    rider.fulfilled
                      ? "bg-emerald-600 text-white shadow-sm hover:bg-emerald-700"
                      : "bg-amber-500 text-white shadow-sm hover:bg-amber-600"
                  }`}
                >
                  {updatingId === rider.id ? (
                    "Updating..."
                  ) : rider.fulfilled ? (
                    `✓ Fulfilled ${rider.fulfilledBy ? `by ${rider.fulfilledBy}` : ""}`
                  ) : (
                    "Mark as Fulfilled"
                  )}
                </button>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2 text-xs">
                <div className="rounded-lg bg-white/80 p-3 shadow-sm border border-slate-100 dark:bg-dark-surface dark:border-dark">
                  <p className="font-bold text-emerald-800 dark:text-emerald-400 mb-1 flex items-center gap-1">
                    🍽️ Dietary Needs
                  </p>
                  <ul className="list-disc start-4 space-y-1 text-slate-600 dark:text-slate-300">
                    {rider.dietaryNeeds?.map((item: string, i: number) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </div>

                <div className="rounded-lg bg-white/80 p-3 shadow-sm border border-slate-100 dark:bg-dark-surface dark:border-dark">
                  <p className="font-bold text-purple-800 dark:text-purple-400 mb-1 flex items-center gap-1">
                    🏨 Room Preferences
                  </p>
                  <ul className="list-disc start-4 space-y-1 text-slate-600 dark:text-slate-300">
                    {rider.roomPreferences?.map((item: string, i: number) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </div>

                <div className="rounded-lg bg-white/80 p-3 shadow-sm border border-slate-100 dark:bg-dark-surface dark:border-dark">
                  <p className="font-bold text-amber-800 dark:text-amber-400 mb-1 flex items-center gap-1">
                    🚘 Vehicle & Transit
                  </p>
                  <ul className="list-disc start-4 space-y-1 text-slate-600 dark:text-slate-300">
                    {rider.vehicleRider?.map((item: string, i: number) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </div>

                <div className="rounded-lg bg-red-50/80 p-3 shadow-sm border border-red-100 dark:bg-red-950/20 dark:border-red-900/30">
                  <p className="font-bold text-red-800 dark:text-red-400 mb-1 flex items-center gap-1">
                    🛡️ Security & Protocol
                  </p>
                  <ul className="list-disc start-4 space-y-1 text-red-700 dark:text-red-300">
                    {rider.securityNotes?.map((item: string, i: number) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Section>
  );
}

export function CoordinatorsApp({
  data,
  session,
  refreshData,
  createCoordinatorRequest,
  updateCoordinatorRequest
}: PortalProps) {
  const ui = useOpsText();
  const event = data.events[0];
  const [requestDraft, setRequestDraft] = useState<CoordinatorRequestInput>(
    () => ({
      guestName: event.guests[0]?.user.name ?? "Guest group",
      request: "Personal dinner trip after event",
      route: "Boulevard City to Diriyah, then hotel",
      priority: "VIP",
      status: "NEW",
      supervisor: "North Zone Supervisor",
      deadline: defaultDeadline()
    })
  );
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  async function handleCreateRequest() {
    setPendingAction("createRequest");
    try {
      await createCoordinatorRequest(requestDraft);
      setRequestDraft((current) => ({
        ...current,
        request: "",
        status: "NEW",
        deadline: defaultDeadline()
      }));
    } finally {
      setPendingAction(null);
    }
  }

  async function handleRequestStatus(
    requestId: string,
    status: "ASSIGNED" | "CLOSED"
  ) {
    setPendingAction(requestId);
    try {
      await updateCoordinatorRequest(requestId, { status });
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <div className="space-y-4">
      <PortalHero
        badge={ui.l("Coordinators App")}
        title={ui.l("Guest requests and supervisor car allocation")}
        body={ui.l(
          "Coordinators see who is coming from the airport, hotel, or venue, process guest car requests, escalate to supervisors, and submit feedback to the logistics manager."
        )}
      />

      <HospitalityRidersSection data={data} session={session} refreshData={refreshData} />

      <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <Section title={ui.l("Who is moving now?")}>
          <div className="space-y-3">
            {event.tasks.map((task) => (
              <RouteLine
                key={task.id}
                title={ui.l(task.guest?.user.name ?? "Guest group")}
                route={`${ui.l(task.pickupLocation)} ${ui.l("to")} ${ui.l(
                  task.dropoffLocation
                )}`}
                meta={ui.time(task.scheduledAt)}
                badge={ui.l(task.status)}
                danger={task.status === "DELAYED"}
              />
            ))}
          </div>
        </Section>

        <Section title={ui.l("Requests to supervisors")}>
          <div className="space-y-3">
            {data.coordinatorRequests.map((request) => (
              <div key={request.id} className="rounded-lg border border-slate-200 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <Badge tone={request.priority === "VIP" ? "gold" : "slate"}>
                      {ui.l(request.priority)}
                    </Badge>
                    <h3 className="mt-3 font-bold text-midyaf-ink">
                      {ui.l(request.guestName)}
                    </h3>
                    <p className="text-sm text-slate-600">{ui.l(request.request)}</p>
                    <p className="mt-2 text-xs text-slate-500">
                      {ui.l(request.route)}
                    </p>
                  </div>
                  <Badge tone="purple">{ui.l(request.status)}</Badge>
                </div>
                <div className="mt-3 flex items-center justify-between rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
                  <span>{ui.l(request.supervisor)}</span>
                  <span>
                    {ui.l("Deadline")} {ui.time(request.deadline)}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {request.status !== "ASSIGNED" ? (
                    <button
                      onClick={() =>
                        void handleRequestStatus(request.id, "ASSIGNED")
                      }
                      disabled={pendingAction !== null}
                      className="btn-primary rounded-xl px-3 py-2 text-xs"
                    >
                      {ui.l("Mark assigned")}
                    </button>
                  ) : null}
                  {request.status !== "CLOSED" ? (
                    <button
                      onClick={() =>
                        void handleRequestStatus(request.id, "CLOSED")
                      }
                      disabled={pendingAction !== null}
                      className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white disabled:opacity-60"
                    >
                      {ui.l("Close request")}
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </Section>
      </div>

      <Section title={ui.l("New supervisor request")}>
        <div className="grid gap-3 md:grid-cols-2">
          <Field
            label={ui.l("Guest name")}
            value={requestDraft.guestName}
            onChange={(value) =>
              setRequestDraft((current) => ({ ...current, guestName: value }))
            }
          />
          <SelectField
            label={ui.l("Priority")}
            value={requestDraft.priority}
            options={["VIP", "NORMAL"]}
            translate={ui.l}
            onChange={(value) =>
              setRequestDraft((current) => ({
                ...current,
                priority: value as CoordinatorRequestInput["priority"]
              }))
            }
          />
          <Field
            label={ui.l("Request summary")}
            value={requestDraft.request}
            onChange={(value) =>
              setRequestDraft((current) => ({ ...current, request: value }))
            }
          />
          <Field
            label={ui.l("Route")}
            value={requestDraft.route}
            onChange={(value) =>
              setRequestDraft((current) => ({ ...current, route: value }))
            }
          />
          <Field
            label={ui.l("Supervisor")}
            value={requestDraft.supervisor}
            onChange={(value) =>
              setRequestDraft((current) => ({ ...current, supervisor: value }))
            }
          />
          <DateTimeField
            label={ui.l("Deadline")}
            value={requestDraft.deadline}
            onChange={(value) =>
              setRequestDraft((current) => ({ ...current, deadline: value }))
            }
          />
        </div>
        <button
          onClick={() => void handleCreateRequest()}
          disabled={pendingAction !== null || !requestDraft.request.trim()}
          className="mt-4 rounded-lg bg-midyaf-gold px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
        >
          {pendingAction === "createRequest"
            ? ui.l("Saving")
            : ui.l("Submit request")}
        </button>
      </Section>

      <Section title={ui.l("Coordinator feedback")}>
        <div className="grid gap-3 md:grid-cols-3">
          {[
            "Airport team needs updated guest photos before passport control.",
            "VIP personal trip request sent to North Zone Supervisor.",
            "Normal shuttle group 4 has one extra passenger."
          ].map((item) => (
            <div key={item} className="rounded-lg bg-slate-50 p-4">
              <MessageSquareText className="mb-3 text-midyaf-purple" size={18} />
              <p className="text-sm text-slate-700">{ui.l(item)}</p>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

export function LogisticsDashboard({
  data,
  session,
  refreshData,
  inviteGuests,
  importGuests,
  createDriver,
  createSupplier,
  createUser,
  createTask,
  assignTask,
  confirmAiPlan,
  approveVendorQuote,
  approveContract,
  confirmCompanyReport,
  updateTaskStatus,
  updateGuestJourney,
  uploadFile
}: PortalProps) {
  const ui = useOpsText();
  const event = data.events[0];
  const report = data.companyReports[0];
  const canManage = canManageOperations(session);
  const canManageVendors = canManageVendorWorkflow(session);
  const canConfirmReport = canConfirmReports(session);
  const [uploadingAsset, setUploadingAsset] = useState<string | null>(null);
  const totalCommission = data.vendorQuotes.reduce(
    (sum, quote) => sum + Number(quote.commissionAmount),
    0
  );

  async function handleGuestAssetUpload(
    guest: (typeof event.guests)[number],
    type: "VISA" | "TICKET" | "GUEST_PHOTO" | "PROMO_VIDEO",
    file: File
  ) {
    const uploadKey = `${guest.id}:${type}`;
    setUploadingAsset(uploadKey);

    try {
      await uploadFile(file, {
        type,
        guestId: guest.id,
        userId: guest.userId,
        eventId: event.id
      });

      const journey = data.guestJourneys.find(
        (item) => item.guestId === guest.id
      );

      if (journey?.id && type === "VISA") {
        await updateGuestJourney(journey.id, { visaStatus: "SENT" });
      }

      if (journey?.id && type === "TICKET") {
        await updateGuestJourney(journey.id, { ticketStatus: "SENT" });
      }
    } finally {
      setUploadingAsset(null);
    }
  }

  async function handleDriverPhotoUpload(
    driver: (typeof data.drivers)[number],
    file: File
  ) {
    const uploadKey = `${driver.id}:DRIVER_PHOTO`;
    setUploadingAsset(uploadKey);

    try {
      const asset = await uploadFile(file, {
        type: "DRIVER_PHOTO",
        driverId: driver.id,
        userId: driver.userId,
        eventId: event.id
      });
      const guestIds = event.tasks
        .filter((task) => task.driverId === driver.id && task.guestId)
        .map((task) => task.guestId);
      const journeys = data.guestJourneys.filter((journey) =>
        guestIds.includes(journey.guestId)
      );

      for (const journey of journeys) {
        if (journey.id) {
          await updateGuestJourney(journey.id, {
            driverName: driver.user.name,
            driverPhoto: asset.url,
            driverPhone: driver.user.phone
          });
        }
      }
    } finally {
      setUploadingAsset(null);
    }
  }

  return (
    <div className="space-y-4">
      <PortalHero
        badge={ui.l("Logistics Dashboard")}
        title={ui.l("Logistics manager command dashboard")}
        body={ui.l(
          "The logistics manager owns the full event: tasks, managers, supervisors, captains, vendor contracts, deadlines, progress tracking, access distribution, and confirmed reports."
        )}
      />

      <HospitalityRidersSection data={data} session={session} refreshData={refreshData} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard
          label={ui.l("Visitors")}
          value={data.activityIntakes[0].visitorCount}
          detail={`${data.activityIntakes[0].vipVisitorCount} ${ui.l("VIP")}`}
          icon={<Users size={17} />}
        />
        <MetricCard
          label={ui.l("Open tasks")}
          value={event.tasks.length}
          detail={ui.l("Owners and deadlines assigned")}
          icon={<ClipboardCheck size={17} />}
        />
        <MetricCard
          label={ui.l("Contracts")}
          value={data.contracts.length}
          detail={ui.l("Signed or active")}
          icon={<ReceiptText size={17} />}
        />
        <MetricCard
          label={ui.l("Commission")}
          value={money(totalCommission)}
          detail={ui.l("From approved quotations")}
          icon={<Banknote size={17} />}
        />
        <MetricCard
          label={ui.l("Reports")}
          value={data.companyReports.length}
          detail={ui.l("Manager confirmed")}
          icon={<FileText size={17} />}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <RiyadhMap event={event} drivers={data.drivers} tasks={event.tasks} />
        <PlanPhases
          data={data}
          canManage={canManage}
          onConfirmAiPlan={confirmAiPlan}
        />
      </div>

      {canManage ? (
        <OperationsSetup
          data={data}
          event={event}
          session={session}
          inviteGuests={inviteGuests}
          importGuests={importGuests}
          createDriver={createDriver}
          createSupplier={createSupplier}
          createUser={createUser}
          createTask={createTask}
        />
      ) : null}

      <TaskAssignmentBoard
        event={event}
        drivers={data.drivers}
        canManage={canManage}
        assignTask={assignTask}
        updateTaskStatus={updateTaskStatus}
      />

      <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <Section title={ui.l("Task ownership and deadlines")}>
          <div className="space-y-3">
            {event.tasks.map((task) => (
              <RouteLine
                key={task.id}
                title={ui.l(task.type)}
                route={`${ui.l("Owner")}: ${ui.l(task.ownerName)} · ${ui.l(
                  "Deadline"
                )} ${ui.time(task.deadlineAt ?? task.scheduledAt)}`}
                badge={ui.l(task.status)}
                danger={task.status === "DELAYED"}
              />
            ))}
          </div>
        </Section>

        <Section title={ui.l("Managers and supervisors")}>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              ["Procurement Manager", "Vendor quotation and contracts"],
              ["Airport Supervisor", "Arrival gates and captain handoff"],
              ["North Zone Supervisor", "VIP trips and personal requests"],
              ["Departure Supervisor", "Flight confirmation and pickup timing"]
            ].map(([role, scope]) => (
              <div key={role} className="rounded-lg bg-slate-50 p-4">
                <BriefcaseBusiness
                  className="mb-3 text-midyaf-purple"
                  size={18}
                />
                <p className="font-semibold text-midyaf-ink">{ui.l(role)}</p>
                <p className="mt-1 text-xs text-slate-500">{ui.l(scope)}</p>
              </div>
            ))}
          </div>
        </Section>
      </div>

      <Section title={ui.l("Guest document dispatch")}>
        <div className="grid gap-3 lg:grid-cols-2">
          {event.guests.map((guest) => {
            const guestAssets = data.fileAssets.filter(
              (asset) =>
                asset.guestId === guest.id ||
                (asset.type === "PROMO_VIDEO" && asset.eventId === event.id)
            );
            const latestGuestPhoto = latestFileAsset(
              data.fileAssets,
              "GUEST_PHOTO",
              (asset) => asset.guestId === guest.id
            );

            return (
              <div key={guest.id} className="rounded-lg bg-slate-50 p-4">
                <div className="flex items-start gap-3">
                  <img
                    src={latestGuestPhoto?.url ?? "/midyaf-logo.jpeg"}
                    alt={ui.l(guest.user.name)}
                    className="size-14 rounded-lg object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-midyaf-ink">
                        {ui.l(guest.user.name)}
                      </p>
                      <Badge tone={guest.isVIP ? "gold" : "purple"}>
                        {guest.isVIP ? ui.l("VIP") : ui.l("NORMAL")}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {guest.qrCode}
                    </p>
                  </div>
                </div>

                <FileAssetList assets={guestAssets.slice(0, 4)} />

                {canManage ? (
                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    {[
                      ["VISA", "Upload visa"],
                      ["TICKET", "Upload ticket"],
                      ["GUEST_PHOTO", "Upload guest photo"],
                      ["PROMO_VIDEO", "Upload promo video"]
                    ].map(([type, label]) => (
                      <FileUploadButton
                        key={type}
                        label={ui.l(label)}
                        accept={uploadAcceptByType[type as FileAssetType]}
                        isUploading={uploadingAsset === `${guest.id}:${type}`}
                        disabled={uploadingAsset !== null}
                        onUpload={(file) =>
                          void handleGuestAssetUpload(
                            guest,
                            type as "VISA" | "TICKET" | "GUEST_PHOTO" | "PROMO_VIDEO",
                            file
                          )
                        }
                      />
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </Section>

      <DeliveryLog
        title={ui.l("Notification delivery log")}
        notifications={data.notifications.slice(0, 8)}
        users={data.users}
      />

      <AuditLogPanel auditLogs={data.auditLogs.slice(0, 10)} />

      <Section title={ui.l("Captains and priorities")}>
        <div className="grid gap-3 md:grid-cols-2">
          {data.drivers.map((driver) => {
            const driverPhoto = latestFileAsset(
              data.fileAssets,
              "DRIVER_PHOTO",
              (asset) => asset.driverId === driver.id
            );

            return (
              <div key={driver.id} className="rounded-lg bg-slate-50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 gap-3">
                    <img
                      src={driverPhoto?.url ?? "/midyaf-logo.jpeg"}
                      alt={ui.l(driver.user.name)}
                      className="size-14 rounded-lg object-cover"
                    />
                    <div>
                      <p className="font-semibold text-midyaf-ink">
                        {ui.l(driver.user.name)}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {driver.licenseNo} · {ui.l(driver.zone)}
                      </p>
                    </div>
                  </div>
                  <Badge tone="gold">
                    {ui.l(driver.captainType ?? "SHUTTLE")}
                  </Badge>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <MiniStat
                    label={ui.l("Driver status")}
                    value={ui.l(driver.status)}
                  />
                  <MiniStat label={ui.l("Zone")} value={ui.l(driver.zone)} />
                </div>
                {canManage ? (
                  <div className="mt-3">
                    <FileUploadButton
                      label={ui.l("Upload driver photo")}
                      accept={uploadAcceptByType.DRIVER_PHOTO}
                      isUploading={
                        uploadingAsset === `${driver.id}:DRIVER_PHOTO`
                      }
                      disabled={uploadingAsset !== null}
                      onUpload={(file) =>
                        void handleDriverPhotoUpload(driver, file)
                      }
                    />
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </Section>

      <QuotesAndContracts
        data={data}
        canManage={canManageVendors}
        onApproveVendorQuote={approveVendorQuote}
        onApproveContract={approveContract}
      />

      <Section title={ui.l("Confirmed report package")}>
        {report ? (
          <>
            <div className="grid gap-3 md:grid-cols-4">
              {report.kpis.map((kpi) => (
                <MiniStat
                  key={kpi.label}
                  label={ui.l(kpi.label)}
                  value={ui.l(kpi.value)}
                />
              ))}
            </div>
            <div className="mt-4 rounded-lg bg-emerald-50 p-4 text-sm text-emerald-700">
              {ui.l(
                "PDF report can be sent only after logistics manager confirmation."
              )}
            </div>
            {canConfirmReport && report.status !== "MANAGER_CONFIRMED" ? (
              <button
                onClick={() => void confirmCompanyReport(report.id)}
                className="mt-4 rounded-lg bg-midyaf-purple px-4 py-2 text-sm font-bold text-white"
              >
                {ui.l("Confirm report")}
              </button>
            ) : null}
          </>
        ) : (
          <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">
            {ui.l("No report package is available yet.")}
          </p>
        )}
      </Section>
    </div>
  );
}

function TaskAssignmentBoard({
  event,
  drivers,
  canManage,
  assignTask,
  updateTaskStatus
}: {
  event: PortalProps["data"]["events"][number];
  drivers: Driver[];
  canManage: boolean;
  assignTask: PortalProps["assignTask"];
  updateTaskStatus: PortalProps["updateTaskStatus"];
}) {
  const ui = useOpsText();
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const delayedCount = event.tasks.filter(
    (task) => task.status === "DELAYED"
  ).length;
  const assignedCount = event.tasks.filter((task) => task.driverId).length;

  async function runTaskAction(action: string, handler: () => Promise<void>) {
    setPendingAction(action);
    try {
      await handler();
    } finally {
      setPendingAction(null);
    }
  }

  async function handleDriverChange(task: Task, driverId: string) {
    await runTaskAction(`${task.id}:driver`, async () => {
      await assignTask(task.id, { driverId: driverId || null });
    });
  }

  async function handleStatusChange(task: Task, status: TaskStatus) {
    await runTaskAction(`${task.id}:${status}`, async () => {
      await updateTaskStatus(task.id, status);
    });
  }

  return (
    <Section
      title={ui.l("Task assignment board")}
      action={
        <div className="flex flex-wrap gap-2">
          <Badge tone="purple">
            {ui.l("Assigned tasks")}: {assignedCount}
          </Badge>
          <Badge tone={delayedCount ? "red" : "green"}>
            {ui.l("Delayed tasks")}: {delayedCount}
          </Badge>
        </div>
      }
    >
      <div className="overflow-x-auto pb-2">
        <div className="grid min-w-[1900px] grid-cols-9 gap-3">
          {taskBoardStatuses.map((status) => {
            const tasks = event.tasks.filter((task) => task.status === status);

            return (
              <div
                key={status}
                className="rounded-lg bg-slate-50 p-3 ring-1 ring-slate-100"
              >
                <div className="mb-3 flex items-center justify-between gap-2">
                  <Badge tone={taskStatusTone(status)}>{ui.l(status)}</Badge>
                  <span className="text-xs font-bold text-slate-400">
                    {tasks.length}
                  </span>
                </div>
                <div className="space-y-3">
                  {tasks.length ? (
                    tasks.map((task) => (
                      <TaskBoardCard
                        key={task.id}
                        task={task}
                        drivers={drivers}
                        canManage={canManage}
                        pendingAction={pendingAction}
                        translate={ui.l}
                        formatTime={ui.time}
                        onDriverChange={handleDriverChange}
                        onStatusChange={handleStatusChange}
                      />
                    ))
                  ) : (
                    <p className="rounded-lg bg-white p-3 text-xs font-semibold text-slate-400">
                      {ui.l("No tasks in this column")}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Section>
  );
}

function TaskBoardCard({
  task,
  drivers,
  canManage,
  pendingAction,
  translate,
  formatTime,
  onDriverChange,
  onStatusChange
}: {
  task: Task;
  drivers: Driver[];
  canManage: boolean;
  pendingAction: string | null;
  translate: (value: string | number | null | undefined) => string;
  formatTime: (value: string) => string;
  onDriverChange: (task: Task, driverId: string) => Promise<void>;
  onStatusChange: (task: Task, status: TaskStatus) => Promise<void>;
}) {
  const driver = task.driverId
    ? drivers.find((item) => item.id === task.driverId)
    : undefined;
  const statusActions = nextTaskStatuses(task.status);
  const isDriverPending = pendingAction === `${task.id}:driver`;

  return (
    <div className="rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-100 card-hover-lift transition-all duration-200">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-bold text-midyaf-ink">
            {translate(task.type)}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {translate(task.guest?.user.name ?? task.ownerName ?? "Guest group")}
          </p>
        </div>
        <Badge tone={taskStatusTone(task.status)}>
          {translate(task.status)}
        </Badge>
      </div>

      <div className="mt-3 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
        <p className="font-semibold text-slate-700">
          {translate(task.pickupLocation)}
        </p>
        <p className="mt-1">{translate("to")}</p>
        <p className="mt-1 font-semibold text-slate-700">
          {translate(task.dropoffLocation)}
        </p>
      </div>

      <div className="mt-3 grid gap-2 text-xs text-slate-500">
        <p>
          {translate("Scheduled time")}: {formatTime(task.scheduledAt)}
        </p>
        <p>
          {translate("Deadline")}:{" "}
          {formatTime(task.deadlineAt ?? task.scheduledAt)}
        </p>
        <p>
          {translate("Assigned captain")}:{" "}
          {driver ? translate(driver.user.name) : translate("No assigned captain")}
        </p>
      </div>

      {canManage ? (
        <div className="mt-3 space-y-2">
          <select
            value={task.driverId ?? ""}
            disabled={pendingAction !== null}
            onChange={(event) => void onDriverChange(task, event.target.value)}
            className="w-full rounded-xl border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-700 disabled:opacity-60 m-input m-select"
          >
            <option value="">{translate("No assigned captain")}</option>
            {drivers
              .filter((item) => item.active !== false)
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {translate(item.user.name)} - {translate(item.status)} -{" "}
                  {translate(item.zone)}
                </option>
              ))}
          </select>
          {isDriverPending ? (
            <p className="text-xs font-semibold text-midyaf-purple">
              {translate("Saving")}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {statusActions.map((status) => (
              <button
                key={status}
                onClick={() => void onStatusChange(task, status)}
                disabled={pendingAction !== null}
                className={
                  status === "DELAYED"
                    ? "rounded-xl bg-rose-600 px-2.5 py-1.5 text-xs font-bold text-white disabled:opacity-60 transition-all hover:bg-rose-700 hover:shadow-sm active:scale-95"
                    : "btn-primary rounded-xl px-2.5 py-1.5 text-xs"
                }
              >
                {pendingAction === `${task.id}:${status}`
                  ? translate("Saving")
                  : translate(statusActionLabel(status))}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function nextTaskStatuses(status: TaskStatus): TaskStatus[] {
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

function statusActionLabel(status: TaskStatus) {
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

function taskStatusTone(status: TaskStatus) {
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

function OperationsSetup({
  data,
  event,
  session,
  inviteGuests,
  importGuests,
  createDriver,
  createSupplier,
  createUser,
  createTask
}: Pick<
  PortalProps,
  | "data"
  | "session"
  | "inviteGuests"
  | "importGuests"
  | "createDriver"
  | "createSupplier"
  | "createUser"
  | "createTask"
> & {
  event: PortalProps["data"]["events"][number];
}) {
  const ui = useOpsText();
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [bulkCsv, setBulkCsv] = useState(sampleGuestCsv);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkGenerateTasks, setBulkGenerateTasks] = useState(true);
  const [bulkGuestsPerShuttle, setBulkGuestsPerShuttle] = useState(4);
  const [guestDraft, setGuestDraft] = useState<GuestInviteInput>({
    name: "",
    email: "",
    phone: "+9665",
    language: "ar",
    isVIP: false,
    tier: "standard"
  });
  const [driverDraft, setDriverDraft] = useState<DriverCreateInput>({
    name: "",
    email: "",
    phone: "+9665",
    licenseNo: "",
    nationalIdIqama: "",
    zone: "CENTRAL_RIYADH",
    captainType: "SHUTTLE",
    overtimeAvailable: false,
    active: true,
    currentLat: 24.7136,
    currentLng: 46.6753,
    shiftStart: dateTimeInHours(1),
    shiftEnd: dateTimeInHours(9)
  });
  const [supplierDraft, setSupplierDraft] = useState<SupplierCreateInput>({
    name: "",
    category: "HOTEL",
    rating: 4.5,
    verified: true,
    crNumber: "",
    commissionPercent: 12,
    services: [
      {
        name: "",
        price: 0,
        unit: "day",
        description: ""
      }
    ]
  });
  const [userDraft, setUserDraft] = useState<UserCreateInput>({
    name: "",
    email: "",
    phone: "+9665",
    role: "COORDINATOR",
    language: "ar",
    password: "Midyaf@2026"
  });
  const [taskDraft, setTaskDraft] = useState<TaskCreateInput>({
    eventId: event.id,
    driverId: "",
    guestId: event.guests[0]?.id ?? "",
    type: "AIRPORT_PICKUP",
    pickupLocation: "King Khalid International Airport",
    dropoffLocation: event.venue,
    pickupLat: 24.9576,
    pickupLng: 46.6988,
    dropoffLat: event.venueLat ?? 24.7136,
    dropoffLng: event.venueLng ?? 46.6753,
    scheduledAt: dateTimeInHours(2),
    deadlineAt: dateTimeInHours(3),
    ownerName: session?.user.name ?? "Logistics Manager"
  });

  async function runAction(action: string, handler: () => Promise<void>) {
    setPendingAction(action);
    try {
      await handler();
    } finally {
      setPendingAction(null);
    }
  }

  function updateService(
    key: keyof SupplierCreateInput["services"][number],
    value: string | number
  ) {
    setSupplierDraft((current) => ({
      ...current,
      services: [
        {
          ...current.services[0],
          [key]: value
        }
      ]
    }));
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

    await runAction("bulkImport", async () => {
      await importGuests(event.id, guests, {
        generateTasks: bulkGenerateTasks,
        normalGuestsPerShuttle: bulkGuestsPerShuttle
      });
    });
  }

  async function handleBulkCsvFile(file: File) {
    setBulkCsv(await file.text());
    setBulkError(null);
  }

  return (
    <Section title={ui.l("Operations setup")}>
      <p className="mb-4 text-sm text-slate-500">
        {ui.l(
          "Operations records are saved directly to PostgreSQL and are available to role portals after refresh."
        )}
      </p>
      <div className="mb-4 rounded-lg bg-midyaf-purple/5 p-4 ring-1 ring-midyaf-purple/10">
        <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-start">
          <div>
            <h3 className="font-bold text-midyaf-purple">
              {ui.l("Bulk guest import")}
            </h3>
            <p className="mt-1 max-w-3xl text-sm text-slate-500">
              {ui.l(
                "Paste a CSV guest list or load a CSV file. Midyaf creates guest accounts, journeys, QR invites, VIP cars, and normal shuttle groups."
              )}
            </p>
          </div>
          <label className="min-w-fit cursor-pointer rounded-lg bg-white px-3 py-2 text-center text-xs font-bold text-midyaf-purple ring-1 ring-slate-200">
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
          className="mt-4 min-h-44 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-xs leading-5 text-slate-700"
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
            onClick={() => void handleBulkImport()}
            disabled={pendingAction !== null || !bulkCsv.trim()}
            className="btn-gold rounded-xl"
          >
            {pendingAction === "bulkImport"
              ? ui.l("Importing")
              : ui.l("Import guests and generate tasks")}
          </button>
          <button
            onClick={() => {
              setBulkCsv(sampleGuestCsv);
              setBulkError(null);
            }}
            disabled={pendingAction !== null}
            className="rounded-xl bg-white px-4 py-2 text-sm font-bold text-midyaf-purple ring-1 ring-slate-200 transition-all hover:bg-slate-50 hover:shadow-sm disabled:opacity-60"
          >
            {ui.l("Use sample CSV")}
          </button>
        </div>
        {bulkError ? (
          <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-700">
            {ui.l(bulkError)}
          </p>
        ) : null}
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-lg bg-slate-50 p-4">
          <h3 className="font-bold text-midyaf-purple">{ui.l("Add guest")}</h3>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <Field
              label={ui.l("Guest name")}
              value={guestDraft.name}
              onChange={(value) =>
                setGuestDraft((current) => ({ ...current, name: value }))
              }
            />
            <Field
              label={ui.l("Email")}
              value={guestDraft.email}
              onChange={(value) =>
                setGuestDraft((current) => ({ ...current, email: value }))
              }
            />
            <Field
              label={ui.l("Phone")}
              value={guestDraft.phone}
              onChange={(value) =>
                setGuestDraft((current) => ({ ...current, phone: value }))
              }
            />
            <Field
              label={ui.l("Guest tier")}
              value={guestDraft.tier}
              onChange={(value) =>
                setGuestDraft((current) => ({ ...current, tier: value }))
              }
            />
          </div>
          <div className="mt-3 flex flex-wrap gap-3">
            <CheckboxField
              label={ui.l("VIP guest")}
              checked={guestDraft.isVIP}
              onChange={(value) =>
                setGuestDraft((current) => ({ ...current, isVIP: value }))
              }
            />
            <span className="text-xs font-semibold text-slate-500">
              {ui.l("Temporary password")}: Midyaf@2026
            </span>
          </div>
          <button
            onClick={() =>
              void runAction("guest", async () => {
                await inviteGuests(event.id, [guestDraft]);
                setGuestDraft({
                  name: "",
                  email: "",
                  phone: "+9665",
                  language: "ar",
                  isVIP: false,
                  tier: "standard"
                });
              })
            }
            disabled={
              pendingAction !== null ||
              !guestDraft.name.trim() ||
              !guestDraft.email.trim()
            }
            className="mt-4 btn-primary rounded-xl"
          >
            {pendingAction === "guest"
              ? ui.l("Saving")
              : ui.l("Create guest invite")}
          </button>
        </div>

        <div className="rounded-lg bg-slate-50 p-4">
          <h3 className="font-bold text-midyaf-purple">{ui.l("Add captain")}</h3>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <Field
              label={ui.l("Captain name")}
              value={driverDraft.name}
              onChange={(value) =>
                setDriverDraft((current) => ({ ...current, name: value }))
              }
            />
            <Field
              label={ui.l("Email")}
              value={driverDraft.email}
              onChange={(value) =>
                setDriverDraft((current) => ({ ...current, email: value }))
              }
            />
            <Field
              label={ui.l("Phone")}
              value={driverDraft.phone}
              onChange={(value) =>
                setDriverDraft((current) => ({ ...current, phone: value }))
              }
            />
            <Field
              label={ui.l("License number")}
              value={driverDraft.licenseNo}
              onChange={(value) =>
                setDriverDraft((current) => ({ ...current, licenseNo: value }))
              }
            />
            <Field
              label={ui.l("Saudi National ID/Iqama")}
              value={driverDraft.nationalIdIqama}
              onChange={(value) =>
                setDriverDraft((current) => ({
                  ...current,
                  nationalIdIqama: value
                }))
              }
            />
            <SelectField
              label={ui.l("Zone")}
              value={driverDraft.zone}
              options={[...driverZones]}
              translate={ui.l}
              onChange={(value) =>
                setDriverDraft((current) => ({
                  ...current,
                  zone: value as DriverCreateInput["zone"]
                }))
              }
            />
            <SelectField
              label={ui.l("Captain type")}
              value={driverDraft.captainType}
              options={[...captainTypes]}
              translate={ui.l}
              onChange={(value) =>
                setDriverDraft((current) => ({
                  ...current,
                  captainType: value as DriverCreateInput["captainType"]
                }))
              }
            />
            <DateTimeField
              label={ui.l("Shift start")}
              value={driverDraft.shiftStart ?? dateTimeInHours(1)}
              onChange={(value) =>
                setDriverDraft((current) => ({ ...current, shiftStart: value }))
              }
            />
            <DateTimeField
              label={ui.l("Shift end")}
              value={driverDraft.shiftEnd ?? dateTimeInHours(9)}
              onChange={(value) =>
                setDriverDraft((current) => ({ ...current, shiftEnd: value }))
              }
            />
            <NumberField
              label={ui.l("Current latitude")}
              value={driverDraft.currentLat ?? 24.7136}
              onChange={(value) =>
                setDriverDraft((current) => ({ ...current, currentLat: value }))
              }
            />
            <NumberField
              label={ui.l("Current longitude")}
              value={driverDraft.currentLng ?? 46.6753}
              onChange={(value) =>
                setDriverDraft((current) => ({ ...current, currentLng: value }))
              }
            />
          </div>
          <div className="mt-3 flex flex-wrap gap-3">
            <CheckboxField
              label={ui.l("Overtime available")}
              checked={driverDraft.overtimeAvailable}
              onChange={(value) =>
                setDriverDraft((current) => ({
                  ...current,
                  overtimeAvailable: value
                }))
              }
            />
            <CheckboxField
              label={ui.l("Active")}
              checked={driverDraft.active}
              onChange={(value) =>
                setDriverDraft((current) => ({ ...current, active: value }))
              }
            />
          </div>
          <button
            onClick={() =>
              void runAction("driver", async () => {
                await createDriver(driverDraft);
                setDriverDraft((current) => ({
                  ...current,
                  name: "",
                  email: "",
                  phone: "+9665",
                  licenseNo: "",
                  nationalIdIqama: ""
                }));
              })
            }
            disabled={
              pendingAction !== null ||
              !driverDraft.name.trim() ||
              !driverDraft.licenseNo.trim()
            }
            className="mt-4 btn-primary rounded-xl"
          >
            {pendingAction === "driver"
              ? ui.l("Saving")
              : ui.l("Create captain")}
          </button>
        </div>

        <div className="rounded-lg bg-slate-50 p-4">
          <h3 className="font-bold text-midyaf-purple">{ui.l("Add supplier")}</h3>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <Field
              label={ui.l("Supplier name")}
              value={supplierDraft.name}
              onChange={(value) =>
                setSupplierDraft((current) => ({ ...current, name: value }))
              }
            />
            <SelectField
              label={ui.l("Category")}
              value={supplierDraft.category}
              options={[...supplierCategories]}
              translate={ui.l}
              onChange={(value) =>
                setSupplierDraft((current) => ({
                  ...current,
                  category: value as SupplierCreateInput["category"]
                }))
              }
            />
            <Field
              label={ui.l("CR number")}
              value={supplierDraft.crNumber ?? ""}
              onChange={(value) =>
                setSupplierDraft((current) => ({ ...current, crNumber: value }))
              }
            />
            <NumberField
              label={ui.l("Rating")}
              value={supplierDraft.rating}
              onChange={(value) =>
                setSupplierDraft((current) => ({ ...current, rating: value }))
              }
            />
            <NumberField
              label={ui.l("Commission percent")}
              value={supplierDraft.commissionPercent}
              onChange={(value) =>
                setSupplierDraft((current) => ({
                  ...current,
                  commissionPercent: value
                }))
              }
            />
            <Field
              label={ui.l("Service name")}
              value={supplierDraft.services[0].name}
              onChange={(value) => updateService("name", value)}
            />
            <NumberField
              label={ui.l("Service price")}
              value={supplierDraft.services[0].price}
              onChange={(value) => updateService("price", value)}
            />
            <Field
              label={ui.l("Service unit")}
              value={supplierDraft.services[0].unit}
              onChange={(value) => updateService("unit", value)}
            />
          </div>
          <div className="mt-3">
            <CheckboxField
              label={ui.l("Verified supplier")}
              checked={supplierDraft.verified}
              onChange={(value) =>
                setSupplierDraft((current) => ({ ...current, verified: value }))
              }
            />
          </div>
          <button
            onClick={() =>
              void runAction("supplier", async () => {
                await createSupplier(supplierDraft);
                setSupplierDraft((current) => ({
                  ...current,
                  name: "",
                  crNumber: "",
                  services: [{ ...current.services[0], name: "", price: 0 }]
                }));
              })
            }
            disabled={
              pendingAction !== null ||
              !supplierDraft.name.trim() ||
              !supplierDraft.services[0].name.trim()
            }
            className="mt-4 btn-primary rounded-xl"
          >
            {pendingAction === "supplier"
              ? ui.l("Saving")
              : ui.l("Create supplier")}
          </button>
        </div>

        <div className="rounded-lg bg-slate-50 p-4">
          <h3 className="font-bold text-midyaf-purple">
            {ui.l("Add manager or coordinator")}
          </h3>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <Field
              label={ui.l("Name")}
              value={userDraft.name}
              onChange={(value) =>
                setUserDraft((current) => ({ ...current, name: value }))
              }
            />
            <Field
              label={ui.l("Email")}
              value={userDraft.email}
              onChange={(value) =>
                setUserDraft((current) => ({ ...current, email: value }))
              }
            />
            <Field
              label={ui.l("Phone")}
              value={userDraft.phone}
              onChange={(value) =>
                setUserDraft((current) => ({ ...current, phone: value }))
              }
            />
            <SelectField
              label={ui.l("Role")}
              value={userDraft.role}
              options={[...assignableRoles]}
              translate={ui.l}
              onChange={(value) =>
                setUserDraft((current) => ({
                  ...current,
                  role: value as UserCreateInput["role"]
                }))
              }
            />
            <Field
              label={ui.l("Temporary password")}
              value={userDraft.password ?? ""}
              onChange={(value) =>
                setUserDraft((current) => ({ ...current, password: value }))
              }
            />
          </div>
          <button
            onClick={() =>
              void runAction("user", async () => {
                await createUser(userDraft);
                setUserDraft((current) => ({
                  ...current,
                  name: "",
                  email: "",
                  phone: "+9665"
                }));
              })
            }
            disabled={
              pendingAction !== null ||
              !userDraft.name.trim() ||
              !userDraft.email.trim()
            }
            className="mt-4 btn-primary rounded-xl"
          >
            {pendingAction === "user" ? ui.l("Saving") : ui.l("Create user")}
          </button>
        </div>

        <div className="rounded-lg bg-slate-50 p-4 xl:col-span-2">
          <h3 className="font-bold text-midyaf-purple">
            {ui.l("Create operational task")}
          </h3>
          <p className="mt-1 text-xs text-slate-500">
            {ui.l("Auto assign nearest available captain")}
          </p>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <SelectField
              label={ui.l("Task type")}
              value={taskDraft.type}
              options={[...taskTypes]}
              translate={ui.l}
              onChange={(value) =>
                setTaskDraft((current) => ({
                  ...current,
                  type: value as TaskCreateInput["type"]
                }))
              }
            />
            <SelectField
              label={ui.l("Assigned captain")}
              value={taskDraft.driverId ?? ""}
              options={["", ...data.drivers.map((driver) => driver.id)]}
              translate={(value) =>
                value
                  ? ui.l(
                      data.drivers.find((driver) => driver.id === value)?.user
                        .name ?? value
                    )
                  : ui.l("No assigned captain")
              }
              onChange={(value) =>
                setTaskDraft((current) => ({ ...current, driverId: value }))
              }
            />
            <SelectField
              label={ui.l("Related guest")}
              value={taskDraft.guestId ?? ""}
              options={["", ...event.guests.map((guest) => guest.id)]}
              translate={(value) =>
                value
                  ? ui.l(
                      event.guests.find((guest) => guest.id === value)?.user
                        .name ?? value
                    )
                  : ui.l("No related guest")
              }
              onChange={(value) =>
                setTaskDraft((current) => ({ ...current, guestId: value }))
              }
            />
            <Field
              label={ui.l("Pickup location")}
              value={taskDraft.pickupLocation}
              onChange={(value) =>
                setTaskDraft((current) => ({
                  ...current,
                  pickupLocation: value
                }))
              }
            />
            <Field
              label={ui.l("Dropoff location")}
              value={taskDraft.dropoffLocation}
              onChange={(value) =>
                setTaskDraft((current) => ({
                  ...current,
                  dropoffLocation: value
                }))
              }
            />
            <Field
              label={ui.l("Task owner")}
              value={taskDraft.ownerName ?? ""}
              onChange={(value) =>
                setTaskDraft((current) => ({ ...current, ownerName: value }))
              }
            />
            <NumberField
              label={ui.l("Pickup latitude")}
              value={taskDraft.pickupLat ?? 24.7136}
              onChange={(value) =>
                setTaskDraft((current) => ({ ...current, pickupLat: value }))
              }
            />
            <NumberField
              label={ui.l("Pickup longitude")}
              value={taskDraft.pickupLng ?? 46.6753}
              onChange={(value) =>
                setTaskDraft((current) => ({ ...current, pickupLng: value }))
              }
            />
            <NumberField
              label={ui.l("Dropoff latitude")}
              value={taskDraft.dropoffLat ?? 24.7136}
              onChange={(value) =>
                setTaskDraft((current) => ({ ...current, dropoffLat: value }))
              }
            />
            <NumberField
              label={ui.l("Dropoff longitude")}
              value={taskDraft.dropoffLng ?? 46.6753}
              onChange={(value) =>
                setTaskDraft((current) => ({ ...current, dropoffLng: value }))
              }
            />
            <DateTimeField
              label={ui.l("Scheduled time")}
              value={taskDraft.scheduledAt}
              onChange={(value) =>
                setTaskDraft((current) => ({ ...current, scheduledAt: value }))
              }
            />
            <DateTimeField
              label={ui.l("Deadline")}
              value={taskDraft.deadlineAt ?? taskDraft.scheduledAt}
              onChange={(value) =>
                setTaskDraft((current) => ({ ...current, deadlineAt: value }))
              }
            />
          </div>
          <button
            onClick={() =>
              void runAction("task", async () => {
                await createTask({
                  ...taskDraft,
                  driverId: taskDraft.driverId || undefined,
                  guestId: taskDraft.guestId || undefined,
                  deadlineAt: taskDraft.deadlineAt || undefined
                });
                setTaskDraft((current) => ({
                  ...current,
                  scheduledAt: dateTimeInHours(2),
                  deadlineAt: dateTimeInHours(3)
                }));
              })
            }
            disabled={
              pendingAction !== null ||
              !taskDraft.pickupLocation.trim() ||
              !taskDraft.dropoffLocation.trim()
            }
            className="mt-4 btn-gold rounded-xl"
          >
            {pendingAction === "task" ? ui.l("Saving") : ui.l("Create task")}
          </button>
        </div>
      </div>
    </Section>
  );
}

export function CompanyDashboard({
  data,
  session,
  createCoordinatorRequest
}: PortalProps) {
  const ui = useOpsText();
  const intake = data.activityIntakes[0];
  const report = data.companyReports[0];
  const canSubmitUpdate = canSubmitCompanyUpdates(session) && Boolean(intake);
  const [newData, setNewData] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isDownloadingReport, setIsDownloadingReport] = useState(false);

  async function handleSendUpdate() {
    const trimmed = newData.trim();

    if (!trimmed) {
      return;
    }

    setIsSending(true);
    try {
      await createCoordinatorRequest({
        guestName: session?.user.name ?? "Organizing Company Ops",
        request: trimmed,
        route: intake?.activityPlace ?? "Company update",
        priority: "NORMAL",
        status: "NEW",
        supervisor: "Logistics Manager",
        deadline: defaultDeadline()
      });
      setNewData("");
    } finally {
      setIsSending(false);
    }
  }

  async function handleDownloadReport() {
    if (!report || !session) {
      return;
    }

    setIsDownloadingReport(true);
    try {
      const response = await fetch(`/api/company-reports/${report.id}/pdf`, {
        headers: { Authorization: `Bearer ${session.accessToken}` }
      });

      if (!response.ok) {
        throw new Error("Report download failed");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `midyaf-report-${report.id}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } finally {
      setIsDownloadingReport(false);
    }
  }

  return (
    <div className="space-y-4">
      <PortalHero
        badge={ui.l("Company Dashboard")}
        title={ui.l("Organizing company visibility and approved updates")}
        body={ui.l(
          "The organizing company can see logistics reports after manager confirmation, update activity data, and submit new tasks to the logistics manager for processing."
        )}
      />

      <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <Section title={ui.l("Activity summary")}>
          {intake ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <MiniStat
                label={ui.l("Activity")}
                value={ui.l(intake.activityName)}
              />
              <MiniStat label={ui.l("Place")} value={ui.l(intake.activityPlace)} />
              <MiniStat label={ui.l("Visitors")} value={intake.visitorCount} />
              <MiniStat label={ui.l("Status")} value={ui.l(intake.status)} />
            </div>
          ) : (
            <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">
              {ui.l("No company activity intake is assigned to this account.")}
            </p>
          )}
        </Section>

        <Section title={ui.l("Confirmed reports")}>
          {report ? (
            <div className="rounded-lg bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-bold text-midyaf-ink">
                    {ui.l(report.title)}
                  </p>
                  <p className="text-xs text-slate-500">
                    {ui.l("Updated")} {ui.date(report.updatedAt)}{" "}
                    {ui.time(report.updatedAt)}
                  </p>
                </div>
                <Badge tone="green">{ui.l(report.status)}</Badge>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-4">
                {report.kpis.map((kpi) => (
                  <MiniStat
                    key={kpi.label}
                    label={ui.l(kpi.label)}
                    value={ui.l(kpi.value)}
                  />
                ))}
              </div>
              <button
                onClick={() => void handleDownloadReport()}
                disabled={isDownloadingReport}
                className="mt-4 btn-primary rounded-xl"
              >
                {isDownloadingReport
                  ? ui.l("Downloading")
                  : ui.l("Download PDF report")}
              </button>
            </div>
          ) : (
            <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">
              {ui.l("No manager-confirmed report is available yet.")}
            </p>
          )}
        </Section>
      </div>

      {canSubmitUpdate ? (
        <Section title={ui.l("Submit new data to logistics manager")}>
        <div className="grid gap-3 md:grid-cols-[1fr_auto]">
          <textarea
            value={newData}
            onChange={(event) => setNewData(event.target.value)}
            placeholder={ui.p(
              "Example: 4 additional VIP guests arriving on SV102 at 18:20, need SUV and hotel rooms.",
              "مثال: وصول ٤ ضيوف VIP إضافيين على رحلة SV102 الساعة 18:20 ويحتاجون سيارة SUV وغرف فندقية."
            )}
            className="min-h-28 rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
          <button
            onClick={() => void handleSendUpdate()}
            disabled={isSending || !newData.trim()}
            className="btn-gold rounded-xl md:self-start"
          >
            {isSending ? ui.l("Saving") : ui.l("Send update")}
          </button>
        </div>
        <p className="mt-3 text-sm text-slate-500">
          {ui.l(
            "Updates become tasks for the logistics manager, who confirms scope, assigns managers or supervisors, then sends back approved reporting."
          )}
        </p>
        </Section>
      ) : null}
    </div>
  );
}

function QuotesAndContracts({
  data,
  canManage = false,
  onApproveVendorQuote,
  onApproveContract
}: Pick<PortalProps, "data"> & {
  canManage?: boolean;
  onApproveVendorQuote?: PortalProps["approveVendorQuote"];
  onApproveContract?: PortalProps["approveContract"];
}) {
  const ui = useOpsText();
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const totalCommission = data.vendorQuotes.reduce(
    (sum, quote) => sum + Number(quote.commissionAmount),
    0
  );

  async function handleApproveQuote(quoteId: string) {
    if (!onApproveVendorQuote) {
      return;
    }

    setPendingAction(quoteId);
    try {
      await onApproveVendorQuote(quoteId);
    } finally {
      setPendingAction(null);
    }
  }

  async function handleApproveContract(contractId: string) {
    if (!onApproveContract) {
      return;
    }

    setPendingAction(contractId);
    try {
      await onApproveContract(contractId);
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <Section title={ui.l("Vendor quotations, contracts, and commissions")}>
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <MiniStat label={ui.l("Quotes received")} value={data.vendorQuotes.length} />
        <MiniStat label={ui.l("Contracts")} value={data.contracts.length} />
        <MiniStat label={ui.l("Midyaf commission")} value={money(totalCommission)} />
      </div>
      <div className="space-y-3">
        {data.vendorQuotes.map((quote) => (
          <div
            key={quote.id}
            className="grid gap-3 rounded-lg bg-slate-50 p-3 md:grid-cols-[1fr_auto_auto]"
          >
            <div>
              <p className="font-semibold text-midyaf-ink">
                {ui.l(quote.vendorName)}
              </p>
              <p className="text-xs text-slate-500">
                {ui.l(quote.category)} · {ui.l(quote.item)}
              </p>
            </div>
            <div className="text-sm">
              <p className="font-bold text-midyaf-purple">
                {money(quote.totalPrice)}
              </p>
              <p className="text-xs text-slate-500">
                {ui.l("Commission")} {percent(quote.commissionPercent)} ·{" "}
                {money(quote.commissionAmount)}
              </p>
            </div>
            <Badge tone={quote.status === "APPROVED" ? "green" : "gold"}>
              {ui.l("Score")} {quote.score} · {ui.l(quote.status)}
            </Badge>
            {canManage && quote.status !== "APPROVED" ? (
              <button
                onClick={() => void handleApproveQuote(quote.id)}
                disabled={pendingAction !== null}
                className="btn-primary rounded-xl px-3 py-2 text-xs"
              >
                {pendingAction === quote.id
                  ? ui.l("Saving")
                  : ui.l("Approve quote")}
              </button>
            ) : null}
          </div>
        ))}
      </div>
      <div className="mt-5 space-y-3">
        <p className="text-sm font-bold text-midyaf-purple">
          {ui.l("Contracts")}
        </p>
        {data.contracts.map((contract) => (
          <div
            key={contract.id}
            className="grid gap-3 rounded-lg bg-white p-3 ring-1 ring-slate-100 md:grid-cols-[1fr_auto_auto]"
          >
            <div>
              <p className="font-semibold text-midyaf-ink">
                {ui.l(contract.vendorName)}
              </p>
              <p className="text-xs text-slate-500">
                {ui.l(contract.category)} · {money(contract.amount)}
              </p>
            </div>
            <Badge tone={contract.status === "SIGNED" ? "green" : "purple"}>
              {ui.l(contract.status)}
            </Badge>
            {canManage && contract.status !== "SIGNED" ? (
              <button
                onClick={() => void handleApproveContract(contract.id)}
                disabled={pendingAction !== null}
                className="btn-gold rounded-xl px-3 py-2 text-xs font-bold text-white"
              >
                {pendingAction === contract.id
                  ? ui.l("Saving")
                  : ui.l("Approve contract")}
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </Section>
  );
}

function PlanPhases({
  data,
  canManage = false,
  onConfirmAiPlan
}: Pick<PortalProps, "data"> & {
  canManage?: boolean;
  onConfirmAiPlan?: PortalProps["confirmAiPlan"];
}) {
  const ui = useOpsText();
  const plan = data.aiPlans[0];
  const safePlan = plan ?? emptyAiPlan;
  const [isConfirming, setIsConfirming] = useState(false);

  async function handleConfirmPlan() {
    if (!onConfirmAiPlan || !plan) {
      return;
    }

    setIsConfirming(true);
    try {
      await onConfirmAiPlan(plan.id);
    } finally {
      setIsConfirming(false);
    }
  }

  return (
    <Section title={ui.l("AI plan phases")}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-midyaf-pearl p-3">
        <Badge tone={safePlan.confirmed ? "green" : "gold"}>
          {safePlan.confirmed
            ? ui.l("Plan confirmed")
            : ui.l("Awaiting confirmation")}
        </Badge>
        {plan && canManage && !safePlan.confirmed ? (
          <button
            onClick={() => void handleConfirmPlan()}
            disabled={isConfirming}
            className="btn-primary rounded-xl px-3 py-2 text-xs"
          >
            {isConfirming ? ui.l("Saving") : ui.l("Confirm AI plan")}
          </button>
        ) : null}
      </div>
      <div className="space-y-3">
        {safePlan.phases.map((phase) => (
          <div key={phase.name} className="rounded-lg bg-slate-50 p-3">
            <div className="flex items-center justify-between gap-3">
              <p className="font-semibold text-midyaf-ink">{ui.l(phase.name)}</p>
              <Badge tone={phase.status === "CONFIRMED" ? "green" : "purple"}>
                {ui.l(phase.status)}
              </Badge>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {ui.l(phase.owner)} · {ui.l("Deadline")} {ui.date(phase.deadline)}{" "}
              {ui.time(phase.deadline)}
            </p>
          </div>
        ))}
      </div>
    </Section>
  );
}

function PortalHero({
  badge,
  title,
  body
}: {
  badge: string;
  title: string;
  body: string;
}) {
  return (
    <section className="hero-gradient rounded-xl p-6 text-white shadow-luxury-lg overflow-hidden animate-fadeInUp">
      <Badge tone="gold">{badge}</Badge>
      <h1 className="mt-4 text-2xl font-black tracking-tight animate-fadeInUp delay-200">{title}</h1>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-white/70 animate-fadeInUp delay-300">{body}</p>
    </section>
  );
}

function RouteLine({
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
        <p className="font-semibold text-midyaf-ink">{title}</p>
        <p className="text-xs text-slate-500">{route}</p>
      </div>
      <div className="text-end">
        <Badge tone={danger ? "red" : "purple"}>{badge}</Badge>
        {meta ? <p className="mt-1 text-xs text-slate-500">{meta}</p> : null}
      </div>
    </div>
  );
}

function Field({
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

function NumberField({
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

function SelectField({
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

function CheckboxField({
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

function parseGuestCsv(csv: string): GuestBulkImportInput[] {
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
      throw new Error(`CSV row ${index + 2}: name, email, and phone are required`);
    }

    return {
      name,
      email,
      phone,
      language: value("language") === "en" ? "en" : "ar",
      isVIP: parseCsvBoolean(value("isvip")),
      tier: value("tier") || (parseCsvBoolean(value("isvip")) ? "vip" : "standard"),
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

function DateTimeField({
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

function MiniStat({
  label,
  value
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-xl bg-white/80 p-3.5 shadow-sm ring-1 ring-slate-100 card-gradient-border card-hover-lift">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1.5 font-extrabold tabular-nums text-midyaf-purple">{value}</p>
    </div>
  );
}

function FileAssetList({ assets }: { assets: FileAsset[] }) {
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

function DeliveryLog({
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
                className="rounded-lg bg-slate-50 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-midyaf-ink">
                      {ui.l(notification.title)}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      {ui.l(notification.body)}
                    </p>
                    <p className="mt-2 text-xs text-slate-500">
                      {ui.l("Recipient")}:{" "}
                      {ui.l(user?.name ?? notification.recipientPhone)}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <Badge tone={notification.read ? "slate" : "green"}>
                      {ui.l(notification.deliveryStatus)}
                    </Badge>
                    <Badge tone="purple">{ui.l(notification.channel)}</Badge>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
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
        <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">
          {ui.l("No delivery notifications yet")}
        </p>
      )}
    </Section>
  );
}

function AuditLogPanel({ auditLogs }: { auditLogs: AuditLog[] }) {
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
                    <p className="font-semibold text-midyaf-ink">
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
          <div className="mb-2 flex items-center gap-2 font-semibold text-midyaf-ink">
            <ShieldCheck size={16} />
            {ui.p("No operational changes recorded yet", "لا توجد تغييرات تشغيلية مسجلة بعد")}
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

function FileUploadButton({
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

function JourneyCard({
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
    <div
      className={
        active
          ? "rounded-xl bg-gradient-to-br from-midyaf-purple to-midyaf-purple-dark p-4 text-white shadow-glow-purple animate-fadeInUp"
          : "rounded-xl glass-card p-4 text-midyaf-ink card-hover-lift animate-fadeInUp"
      }
    >
      <Icon className={active ? "text-midyaf-gold" : "text-midyaf-purple"} />
      <p className="mt-3 font-bold">{title}</p>
      <p className={active ? "text-sm text-white/70" : "text-sm text-slate-500"}>
        {detail}
      </p>
    </div>
  );
}

function DocumentCard({
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
    <div className="rounded-xl bg-white/60 p-4 ring-1 ring-slate-100 card-hover-lift">
      <div className="flex items-center justify-between gap-3">
        <Icon className="text-midyaf-purple" size={20} />
        <Badge tone="green">{status}</Badge>
      </div>
      <p className="mt-3 font-bold text-midyaf-ink">{title}</p>
      <p className="mt-1 text-sm text-slate-500">{detail}</p>
      {asset ? (
        <a
          href={asset.url}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex rounded-xl bg-white px-3 py-2 text-xs font-bold text-midyaf-purple ring-1 ring-slate-200 transition-all hover:shadow-sm hover:ring-midyaf-purple/20"
        >
          {translate("Open file")}
        </a>
      ) : null}
    </div>
  );
}

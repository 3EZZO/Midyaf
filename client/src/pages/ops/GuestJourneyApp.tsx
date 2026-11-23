import {OperationalEventEntry} from '../../components/EventRadar';
import { PlaneLanding } from "lucide-react";
import { EmptyState } from "../../components/ui/EmptyState";
// Guest-facing journey portal (phone-first).
import { useEffect, useMemo, useState } from "react";
import {
  Car,
  FileText,
  Maximize2,
  MessageCircle,
  Phone,
  Plane,
  Play,
  Send,
  Ticket
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type { GeofenceRingType, GuestJourney } from "@shared/domain";
import { RiyadhMap } from "../../components/map";
import {
  Badge,
  BoardingPass,
  Button,
  Card,
  Section,
  StatusPill
} from "../../components/ui";
import { useLiveEvent } from "../../lib/liveEvents";
import { driverRingPosition } from "../../lib/metrics";
import { fade } from "../../lib/motion";
import { buildGuestToCaptainWhatsAppUrl } from "../../lib/whatsappHandoff";
import type { PortalProps } from "../types";
import { CaptainPhoto } from "./CaptainPhoto";
import {
  DeliveryLog,
  DocumentCard,
  MiniStat,
  PortalHero,
  assetFileName,
  latestFileAsset,
  useOpsText
} from "./shared";

const ARRIVAL_STEPS: GuestJourney["arrivalStatus"][] = [
  "PRE_ARRIVAL",
  "PASSPORT",
  "LUGGAGE",
  "GATE",
  "PICKED_UP"
];

export function GuestJourneyApp(props:PortalProps){
 const ui=useOpsText();
 const legacy=props.data.events.length>0&&props.data.events[0].guests.length>0?<LegacyGuestJourneyApp {...props}/>:<EmptyState className="mx-auto max-w-md" icon={<PlaneLanding className="size-5" aria-hidden />} title={ui.isArabic?'لا توجد تفاصيل رحلة حاليًا':'No trip details yet'} description={ui.isArabic?'ستظهر بطاقة الصعود وتفاصيل الاستقبال هنا فور تأكيد رحلتكم.':'Your boarding pass and welcome details appear here once your trip is confirmed.'}/>;
 if(props.isDemoMode)return legacy;
 return <OperationalEventEntry session={props.session} isArabic={ui.isArabic} mode="guest">{legacy}</OperationalEventEntry>;
}
function LegacyGuestJourneyApp({
  data,
  session,
  updateGuestJourney
}: PortalProps) {
  const ui = useOpsText();
  const event = data.events[0];
  // The signed-in guest on a real phone; the first guest on a demo login.
  const guest =
    event.guests.find((g) => g.userId === session?.user.id) ?? event.guests[0];
  const journey =
    data.guestJourneys.find((j) => j.guestId === guest.id) ??
    data.guestJourneys[0];
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
  const [brightQrOpen, setBrightQrOpen] = useState(false);
  const journeyKey = journey.id ?? journey.guestId;

  useEffect(() => {
    setStatus(journey.arrivalStatus);
  }, [journey.arrivalStatus]);

  // ── The pass ──────────────────────────────────────────────────────────
  // Issued at the curbside handshake (the captain's convoy enters the
  // curbside ring) or on any arrival signal; once issued it stays.
  const alreadyArrived =
    status === "PICKED_UP" || guest.rsvpStatus === "ARRIVED";
  const [handshake, setHandshake] = useState<
    GeofenceRingType | "OUTSIDE" | null
  >(null);
  const [passRevealed, setPassRevealed] = useState(alreadyArrived);
  useEffect(() => {
    if (alreadyArrived) setPassRevealed(true);
  }, [alreadyArrived]);

  useLiveEvent("geofence:transition", (payload) => {
    if (!assignedDriver || payload.driverId !== assignedDriver.id) return;
    if (payload.direction !== "APPROACHING") return;
    setHandshake(payload.currentRing);
    if (
      payload.currentRing === "CURBSIDE_GATE" ||
      payload.currentRing === "DOCKED_BAY"
    ) {
      setPassRevealed(true);
    }
  });
  useLiveEvent("guest:arrived", (payload) => {
    if (payload.guestId === guest.id) setPassRevealed(true);
  });

  const ringPosition = useMemo(
    () => (assignedDriver ? driverRingPosition(assignedDriver) : null),
    [assignedDriver]
  );
  const ring = handshake ?? ringPosition?.ring ?? null;
  const siteName = ringPosition
    ? ui.isArabic
      ? ringPosition.siteNameAr
      : ringPosition.siteNameEn
    : null;

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
    if (!trimmed) return;
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
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[0.9fr_1.1fr]">
      <div className="min-w-0 space-y-4">
        <PortalHero
          badge={ui.l("Guest App")}
          title={`${ui.l(guest.user.name)} ${ui.l("hospitality journey")}`}
          body={ui.l(
            "Visa, tickets, promotional videos, arrival tracking, event transportation, personal requests, complaints, and departure timing."
          )}
        />

        <AnimatePresence initial={false}>
          {passRevealed ? (
            <BoardingPass
              key="pass"
              isArabic={ui.isArabic}
              eventName={ui.l(event.name)}
              guestName={ui.l(guest.user.name)}
              guestTitle={guest.isVIP ? ui.l(guest.tier) : null}
              captainName={
                assignedDriver
                  ? ui.l(assignedDriver.user.name)
                  : ui.l(journey.driverName)
              }
              vehicle={ui.l(journey.carDetails)}
              ring={ring}
              siteName={siteName}
              code={`midyaf:guest:${guest.qrCode}`}
              reveal
              brightQrOpen={brightQrOpen}
              onBrightQrOpenChange={setBrightQrOpen}
            />
          ) : (
            <motion.div
              key="waiting"
              variants={fade}
              initial="initial"
              animate="animate"
              exit="exit"
            >
              <Card
                tone="gold"
                padding="sm"
                className="flex items-center gap-3"
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-gold-500/10 text-gold-300">
                  <Ticket className="size-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-ink">
                    {ui.p("Arrival pass pending", "بطاقة الوصول قيد الإصدار")}
                  </p>
                  <p className="text-xs text-ink-muted">
                    {ui.p(
                      "It appears here the moment your captain reaches the curb.",
                      "تظهر هنا لحظة وصول الكابتن إلى الرصيف."
                    )}
                  </p>
                </div>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Calm 3-Card Concierge Itinerary: Flight & Gate · Captain & ETA · Curbside Pass */}
        <div
          data-guest-concierge-itinerary
          className="grid grid-cols-1 gap-3 sm:grid-cols-3"
        >
          <Card padding="sm" tone="gold" className="flex min-w-0 flex-col justify-between gap-2">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-label text-gold-300">
                <Plane className="size-3.5 shrink-0 text-gold-500" aria-hidden />
                {ui.p("1. Flight & Gate", "1. الرحلة والبوابة")}
              </span>
              <Badge tone="gold" size="sm">
                {ui.l(status)}
              </Badge>
            </div>
            <div className="min-w-0">
              <p className="font-tnum text-lg font-bold text-ink">
                {ui.l("Gate")} {journey.arrivalGate}
              </p>
              <p className="truncate text-xs text-ink-muted">
                {ui.p("Flight", "رحلة")} {journey.departureFlight} · {ui.time(journey.departurePickupTime)}
              </p>
            </div>
          </Card>

          <Card padding="sm" className="flex min-w-0 flex-col justify-between gap-2">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-label text-ink-muted">
                <Car className="size-3.5 shrink-0 text-gold-500" aria-hidden />
                {ui.p("2. Captain & ETA", "2. الكابتن والوصول")}
              </span>
              <span className="font-tnum text-sm font-bold text-gold-300">
                {journey.etaMinutes} {ui.p("min", "د")}
              </span>
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-ink">
                {assignedDriver ? ui.l(assignedDriver.user.name) : ui.l(journey.driverName)}
              </p>
              <p className="truncate text-xs text-ink-muted">
                {ui.l(journey.carDetails)}
              </p>
            </div>
          </Card>

          <Card
            padding="sm"
            tone={passRevealed ? "ok" : "none"}
            className="flex min-w-0 flex-col justify-between gap-2"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-label text-ink-muted">
                <Ticket className="size-3.5 shrink-0 text-gold-500" aria-hidden />
                {ui.p("3. Curbside Pass", "3. بطاقة الصعود")}
              </span>
              <Badge tone={passRevealed ? "ok" : "neutral"} size="sm">
                {passRevealed
                  ? ui.p("Ready", "جاهزة")
                  : ui.p("Pending", "قيد الإصدار")}
              </Badge>
            </div>
            {passRevealed ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full"
                leadingIcon={<Maximize2 className="size-3.5" aria-hidden />}
                onClick={() => setBrightQrOpen(true)}
              >
                {ui.p("Bright QR pass", "عرض الرمز الساطع")}
              </Button>
            ) : (
              <p className="text-xs text-ink-muted">
                {ui.p(
                  "Activates automatically at curbside.",
                  "تُفعَّل تلقائياً عند الوصول للرصيف."
                )}
              </p>
            )}
          </Card>
        </div>

        <Section title={ui.l("Arrival status updates")}>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {ARRIVAL_STEPS.map((item) => (
              <Button
                key={item}
                variant={status === item ? "gold" : "primary"}
                size="lg"
                className="h-11 px-2 text-xs"
                onClick={() => void handleArrivalStatus(item)}
                disabled={pendingAction !== null}
                aria-pressed={status === item}
              >
                {ui.l(item)}
              </Button>
            ))}
          </div>
          <Card tone="gold" padding="sm" className="mt-3">
            <p className="text-sm font-bold text-ink">
              {ui.l("Car arrives in")}{" "}
              <span className="font-tnum">{journey.etaMinutes}</span>{" "}
              {ui.l("minutes")}
            </p>
            <p className="mt-1 text-xs text-ink-muted">
              {ui.l(
                "Guest should be notified to wait outside before the captain arrives."
              )}
            </p>
          </Card>
        </Section>

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
          {promoVideoAssets.length || journey.promoVideos.length ? (
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {promoVideoAssets.map((asset) => (
                <Card key={asset.id} padding="sm">
                  {asset.mimeType.startsWith("video/") ? (
                    <video
                      src={asset.url}
                      controls
                      className="aspect-video w-full rounded-lg bg-surface-0 object-cover"
                    />
                  ) : null}
                  <div className="mt-3 flex items-center gap-3">
                    <span className="grid size-10 place-items-center rounded-lg bg-gold-500/10 text-gold-300">
                      <Play className="size-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-ink">
                        {assetFileName(asset)}
                      </p>
                      <p className="text-xs text-ink-muted">
                        {ui.l("Uploaded hospitality video")}
                      </p>
                    </div>
                  </div>
                </Card>
              ))}
              {journey.promoVideos.map((video) => (
                <Card key={video} padding="sm" className="flex gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-gold-500/10 text-gold-300">
                    <Play className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink">
                      {ui.l(video)}
                    </p>
                    <p className="text-xs text-ink-muted">
                      {ui.l("Country and hospitality preview video")}
                    </p>
                  </div>
                </Card>
              ))}
            </div>
          ) : null}
        </Section>

        <DeliveryLog
          title={ui.l("Delivery notifications")}
          notifications={data.notifications
            .filter((notification) => notification.userId === guest.userId)
            .slice(0, 4)}
          users={data.users}
        />
      </div>

      <div className="min-w-0 space-y-4">
        <Section title={ui.l("Captain and car details")}>
          <div className="flex gap-4">
            <CaptainPhoto
              src={driverPhoto}
              alt={
                assignedDriver
                  ? ui.l(assignedDriver.user.name)
                  : ui.l(journey.driverName)
              }
              className="size-16 shrink-0 rounded-lg object-cover"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate font-bold text-ink">
                {assignedDriver
                  ? ui.l(assignedDriver.user.name)
                  : ui.l(journey.driverName)}
              </p>
              <p className="mt-1 text-sm text-ink-muted">
                {ui.l(journey.carDetails)}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {assignedDriver ? (
                  <StatusPill
                    status={assignedDriver.status}
                    size="sm"
                    live={assignedDriver.status === "EN_ROUTE"}
                  />
                ) : null}
                <Badge tone={guest.isVIP ? "gold" : "neutral"}>
                  {guest.isVIP
                    ? ui.l("VIP dedicated car")
                    : ui.l("Grouped shuttle")}
                </Badge>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {(() => {
                const captainPhone = assignedDriver?.user.phone ?? journey.driverPhone;
                const captainName = assignedDriver
                  ? ui.l(assignedDriver.user.name)
                  : ui.l(journey.driverName);
                const whatsappHref = buildGuestToCaptainWhatsAppUrl({
                  phone: captainPhone,
                  captainName,
                  guestName: ui.l(guest.user.name),
                  arrivalGate: journey.arrivalGate,
                  arrivalStatus: ui.l(status),
                  isArabic: ui.isArabic
                });
                return whatsappHref ? (
                  <a
                    href={whatsappHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-whatsapp-handoff="guest-to-captain"
                    className="inline-flex h-11 items-center gap-1.5 rounded-lg border border-gold-500/40 bg-gold-500/10 px-3.5 text-sm font-semibold text-gold-300 transition-colors hover:border-gold-500 hover:bg-gold-500/20"
                  >
                    <MessageCircle className="size-4 shrink-0" aria-hidden />
                    {ui.p("WhatsApp", "واتساب")}
                  </a>
                ) : null;
              })()}
              <Button
                variant="outline"
                size="lg"
                className="h-11 shrink-0"
                leadingIcon={<Phone className="size-4" />}
                onClick={() => {
                  window.location.href = `tel:${(assignedDriver?.user.phone ?? journey.driverPhone).replace(/\s+/g, "")}`;
                }}
              >
                {ui.p("Call", "اتصال")}
              </Button>
            </div>
          </div>
        </Section>

        <RiyadhMap
          event={event}
          drivers={assignedDriver ? [assignedDriver] : data.drivers}
          tasks={task ? [task] : []}
          height="h-[320px]"
        />

        <Section title={ui.l("Special requests, notes, complaints")}>
          <div className="space-y-2">
            {[
              ...journey.personalTripRequests,
              ...journey.notes,
              ...journey.complaints
            ].map((item) => (
              <p
                key={item}
                className="rounded-lg bg-surface-3 p-3 text-sm text-ink"
              >
                {ui.l(item)}
              </p>
            ))}
          </div>
          <form
            className="mt-3 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void handleGuestNote();
            }}
          >
            <input
              value={guestNote}
              onChange={(e) => setGuestNote(e.target.value)}
              placeholder={ui.l("Add request, note, or complaint")}
              className="h-11 min-w-0 flex-1 rounded-lg border border-hairline bg-surface-1 px-3 text-sm text-ink placeholder:text-ink-faint focus-visible:outline-none focus-visible:shadow-focus"
            />
            <Button
              type="submit"
              variant="gold"
              size="lg"
              className="h-11"
              disabled={pendingAction !== null || !guestNote.trim()}
              loading={pendingAction === "guestNote"}
              leadingIcon={<Send className="size-4" />}
            >
              {ui.l("Send")}
            </Button>
          </form>
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
                journey.departureConfirmed ? ui.l("Confirmed") : ui.l("Pending")
              }
            />
          </div>
        </Section>
      </div>
    </div>
  );
}

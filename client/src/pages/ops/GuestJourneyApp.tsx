// Guest-facing journey portal.
// Extracted verbatim from OperationsPortals.tsx (Phase 1 split).
import { useEffect, useState } from "react";
import { Car, FileText, Luggage, Plane, Play, Ticket, Send, Hotel } from "lucide-react";
import { Badge } from "../../components/Badge";
import { RiyadhMap } from "../../components/map";
import { Section } from "../../components/Section";
import type { PortalProps } from "../types";
import { DeliveryLog, DocumentCard, JourneyCard, MiniStat, PortalHero, assetFileName, latestFileAsset, useOpsText } from "./shared";

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
                    <p className="font-semibold text-slate-900 dark:text-white">
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
                  <p className="font-semibold text-slate-900 dark:text-white">{ui.l(video)}</p>
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
            <p className="text-sm font-bold text-slate-900 dark:text-white">
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
              <p className="font-bold text-slate-900 dark:text-white">
                {ui.l(journey.driverName)}
              </p>
              <p className="text-sm text-slate-500">{journey.driverPhone}</p>
              <p className="mt-2 text-sm font-semibold text-midyaf-pearl">
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
              className="min-w-0 flex-1 rounded-lg border border-white/5 px-3 py-2 text-sm"
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

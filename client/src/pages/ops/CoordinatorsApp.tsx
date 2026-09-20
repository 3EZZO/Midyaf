// Field coordinator portal.
// Extracted verbatim from OperationsPortals.tsx (Phase 1 split).
import { useState } from "react";
import { MessageSquareText, Sparkles, Zap } from "lucide-react";
import { Badge } from "../../components/Badge";
import { Section } from "../../components/Section";
import type { CoordinatorRequestInput, PortalProps } from "../types";
import { DateTimeField, Field, PortalHero, RouteLine, SelectField, defaultDeadline, useOpsText } from "./shared";
import { AirportExpressSection, HospitalityRidersSection } from "./RiderSections";

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

      {/* Live Command Center AI Widget (PDF Page 3) */}
      <div className="glass-royal rounded-lg p-5 border border-amber-400/50 shadow-sm transition-all animate-fadeIn">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-amber-500/20 pb-4 mb-4">
          <div className="flex items-start gap-3">
            <div className="grid size-11 place-items-center rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 text-slate-950 font-black shadow-md shrink-0">
              <Zap size={20} className="text-slate-950 fill-current" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-500/40">
                  {ui.p("AMBER SURGE ALERT", "تنبيه ازدحام عاجل")}
                </span>
                <h3 className="text-base font-bold text-slate-900 dark:text-white dark:text-dark-primary">
                  {ui.p("Terminal 2 Arrival Surge — Live AI Command Center", "تنبيه ازدحام القادمين في الصالة 2 — مركز القيادة بالذكاء الاصطناعي")}
                </h3>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                {ui.p(
                  "Warning: Three delayed flights just landed at the same time. 40 guests need pickup soon, but we only have 15 vans assigned there. Should we divert 5 vans from Terminal 1?",
                  "تحذير: هبطت 3 رحلات متأخرة في نفس الوقت. 40 ضيفاً بحاجة لتوصيل فوري، ولكن يوجد لدينا 15 حافلة فقط مخصصة هناك. هل نرغب في تحويل 5 حافلات من الصالة 1؟"
                )}
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              alert(ui.p("5 Vans Diverted from Terminal 1 to Terminal 2. At-risk guest count reduced from 25 to 0.", "تم تحويل 5 حافلات بنجاح من الصالة 1 إلى الصالة 2. تم تأمين تنقل جميع الضيوف (25 ضيفاً)."));
            }}
            className="shrink-0 inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-midyaf-purple to-midyaf-purple-dark text-white font-bold px-4 py-2.5 text-xs shadow-md hover:shadow-glow hover:scale-105 active:scale-95 transition-all cursor-pointer"
          >
            <Sparkles size={14} className="text-midyaf-gold" />
            {ui.p("Yes, Divert 5 Vans", "نعم، تحويل 5 حافلات")}
          </button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="rounded-xl bg-white/70 dark:bg-dark-surface p-3 ring-1 ring-slate-200 dark:ring-white/10">
            <span className="text-slate-500 dark:text-slate-400 block">{ui.p("At-Risk Guests", "الضيوف المعرضون للتأخير")}</span>
            <strong className="text-amber-600 dark:text-amber-400 font-bold text-sm">25 {ui.p("VIPs", "شخصية هامة")}</strong>
          </div>
          <div className="rounded-xl bg-white/70 dark:bg-dark-surface p-3 ring-1 ring-slate-200 dark:ring-white/10">
            <span className="text-slate-500 dark:text-slate-400 block">{ui.p("Available Vans in T1", "الحافلات المتاحة في صالة 1")}</span>
            <strong className="text-emerald-600 dark:text-emerald-400 font-bold text-sm">8 {ui.p("Vans", "حافلات")}</strong>
          </div>
          <div className="rounded-xl bg-white/70 dark:bg-dark-surface p-3 ring-1 ring-slate-200 dark:ring-white/10">
            <span className="text-slate-500 dark:text-slate-400 block">{ui.p("Estimated Transfer ETA", "وقت وصول الدعم")}</span>
            <strong className="text-slate-900 dark:text-white dark:text-dark-text font-bold text-sm">6 {ui.p("Mins", "دقائق")}</strong>
          </div>
          <div className="rounded-xl bg-white/70 dark:bg-dark-surface p-3 ring-1 ring-slate-200 dark:ring-white/10">
            <span className="text-slate-500 dark:text-slate-400 block">{ui.p("Transit Confidence", "مؤشر الثقة بالذكاء الاصطناعي")}</span>
            <strong className="text-purple-600 dark:text-purple-400 font-bold text-sm">96.5%</strong>
          </div>
        </div>
      </div>

      <HospitalityRidersSection data={data} session={session} refreshData={refreshData} />
      <AirportExpressSection data={data} session={session} refreshData={refreshData} />

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
              <div key={request.id} className="rounded-lg border border-white/5 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <Badge tone={request.priority === "VIP" ? "gold" : "slate"}>
                      {ui.l(request.priority)}
                    </Badge>
                    <h3 className="mt-3 font-bold text-slate-900 dark:text-white">
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
              <MessageSquareText className="mb-3 text-midyaf-pearl" size={18} />
              <p className="text-sm text-slate-700">{ui.l(item)}</p>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

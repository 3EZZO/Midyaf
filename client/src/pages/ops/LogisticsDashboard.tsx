// Logistics command dashboard.
// Extracted verbatim from OperationsPortals.tsx (Phase 1 split).
import { useEffect, useState } from "react";
import {
  BriefcaseBusiness,
  Car,
  ClipboardCheck,
  FileText,
  Sparkles,
  Users,
  AlertTriangle,
  Shield
} from "lucide-react";
import { Badge } from "../../components/Badge";
import { MetricCard } from "../../components/MetricCard";
import { LogisticsMetricModal } from "../../components/LogisticsMetricModal";
import { useTacticalToast } from "../../components/TacticalToast";
import { RiyadhMap } from "../../components/map";
import { Section } from "../../components/Section";
import { AiPanel } from "../../components/AiPanel";
import { DashboardJumpDock } from "../../components/DashboardJumpDock";
import { apiFetch } from "../../lib/api";
import { DEMO_HOTSPOTS } from "../../lib/demo/data";
import type { DemoHotspot } from "../../lib/demo/data";
import type { PortalProps } from "../types";
import type { Driver, FileAssetType, Task } from "@shared/domain";
import {
  AuditLogPanel,
  DeliveryLog,
  Field,
  FileAssetList,
  FileUploadButton,
  MiniStat,
  PortalHero,
  RouteLine,
  canConfirmReports,
  canManageOperations,
  canManageVendorWorkflow,
  latestFileAsset,
  uploadAcceptByType,
  useOpsText
} from "./shared";
import {
  AirportExpressSection,
  HospitalityRidersSection
} from "./RiderSections";
import { TaskAssignmentBoard } from "./TaskAssignmentBoard";
import { OperationsSetup } from "./OperationsSetup";
import { PlanPhases } from "./PlanPhases";

function LiveCommandCenterSection({
  session
}: {
  session?: PortalProps["session"];
}) {
  const ui = useOpsText();
  const toast = useTacticalToast();
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    if (!session?.accessToken) return;
    apiFetch<any>("/operations/live-command-center", session.accessToken).then(
      (res) => {
        if (res.ok) setData(res);
      }
    );
  }, [session?.accessToken]);

  async function handleDivert() {
    if (!data?.activeAlert?.actionEndpoint || !session?.accessToken) return;
    await apiFetch<any>(data.activeAlert.actionEndpoint, session.accessToken, {
      method: "POST"
    });
    toast.success(ui.l("Fleet successfully diverted."));
    setData({ ...data, activeAlert: null });
  }

  if (!data) return null;

  return (
    <div className="border-l-4 border-amber-500 bg-slate-50 shadow-sm rounded-lg p-6">
      <h2 className="text-xl font-bold mb-4">{ui.l("Live Command Center")}</h2>
      {data.activeAlert && (
        <div className="mb-4 rounded bg-amber-50 p-4 border border-amber-200">
          <div className="flex items-center gap-2 text-amber-800 font-bold mb-2">
            <Sparkles size={18} /> {ui.l(data.activeAlert.title)}
          </div>
          <p className="text-amber-900 mb-3">
            {ui.l(data.activeAlert.message)}
          </p>
          <button
            onClick={handleDivert}
            className="bg-amber-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-amber-700 transition"
          >
            {ui.l(data.activeAlert.actionPrompt)}
          </button>
        </div>
      )}
      <div className="grid sm:grid-cols-3 gap-4">
        {data.flaggedTasks?.map((task: any) => (
          <div
            key={task.id}
            className="rounded border border-red-100 bg-red-50 p-3 text-sm"
          >
            <div className="font-bold text-red-700 flex items-center gap-1.5">
              <AlertTriangle size={14} className="text-red-600 shrink-0" />
              <span>
                {ui.l("At Risk")}: {task.ownerName}
              </span>
            </div>
            <div className="text-red-600 mt-1">{ui.l(task.reason)}</div>
            <div className="text-red-800 font-medium mt-2 text-xs">
              {ui.l("Recommendation")}: {ui.l(task.recommendedAction)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function LiveSummitHotspotsRadar({ hotspots }: { hotspots: DemoHotspot[] }) {
  const ui = useOpsText();

  return (
    <Section
      title={ui.p(
        "Live Summit Hotspots & Telemetry Radar",
        "رادار المواقع الحية وعمليات التتبع التكتيكية"
      )}
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {hotspots.map((spot) => (
          <div
            key={spot.id}
            className="rounded-xl border border-white/5 bg-[#121626] p-3.5 shadow-card-sm transition hover:shadow-card dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <span className="text-xs font-black uppercase tracking-wider text-midyaf-gold">
                  {spot.category}
                </span>
                <h4 className="mt-0.5 text-sm font-black text-slate-900 dark:text-white">
                  {ui.p(spot.nameEn, spot.nameAr)}
                </h4>
              </div>
              <span className="live-dot" />
            </div>

            <div className="mt-3 flex items-center justify-between text-xs border-t border-white/5 pt-2.5 dark:border-slate-800">
              <div>
                <span className="text-slate-400">
                  {ui.p("Fleet:", "الأسطول:")}{" "}
                </span>
                <span className="font-bold text-midyaf-pearl dark:text-midyaf-gold">
                  {spot.activeFleet} {ui.p("Vehicles", "مركبات")}
                </span>
              </div>
              {spot.vipGuestsCount > 0 && (
                <div>
                  <span className="text-slate-400">
                    {ui.p("VIPs:", "كبار الشخصيات:")}{" "}
                  </span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">
                    {spot.vipGuestsCount} {ui.p("Guests", "ضيوف")}
                  </span>
                </div>
              )}
            </div>

            <p className="mt-2 text-xs font-bold text-slate-500 dark:text-slate-400">
              ● {ui.p(spot.statusEn, spot.statusAr)}
            </p>
          </div>
        ))}
      </div>
    </Section>
  );
}

export function LogisticsDashboard({
  data,
  session,
  isDemoMode,
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
  const toast = useTacticalToast();
  const event = data.events[0];
  const report = data.companyReports[0];
  const canManage = canManageOperations(session);
  const canManageVendors = canManageVendorWorkflow(session);
  const canConfirmReport = canConfirmReports(session);
  const [uploadingAsset, setUploadingAsset] = useState<string | null>(null);
  const [activeMetricModal, setActiveMetricModal] = useState<
    "visitors" | "tasks" | "contracts" | "commission" | "reports" | null
  >(null);
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

      toast.success(
        ui.isArabic ? "تم رفع وتحديث المستند بنجاح" : "Asset Uploaded & Sent",
        `${ui.l(guest.user.name)} · ${type}`
      );
    } catch {
      toast.alert(
        ui.isArabic ? "فشل رفع المستند" : "Asset Upload Failed",
        file.name
      );
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
        badge={
          ui.isArabic
            ? "لوحة العمليات والتحكم الميداني"
            : "Operations Dashboard"
        }
        title={
          ui.isArabic
            ? "لوحة العمليات والتحكم الميداني الموحد"
            : "Unified Operations & Field Command Dashboard"
        }
        body={
          ui.isArabic
            ? "المركز التشغيلي الميداني لإدارة الفعاليات: رادار الوصول، خريطة الأسطول، توزيع المهام، وتفويج الضيوف والخدمات الميدانية (تنفيذ تشغيلي حصراً بدون بيانات مالية)."
            : "Operational command center for event delivery: live radar, fleet map, task dispatch, and guest logistics (strictly operational execution, zero financial data)."
        }
      />

      <DashboardJumpDock isArabic={ui.isArabic} isDemoMode={isDemoMode} />

      {canManage && (
        <>
          <LiveCommandCenterSection session={session} />
          <div id="section-smart-assistant">
            <AiPanel
              persona="Ops Manager"
              session={session}
              data={data}
              isDemoMode={isDemoMode}
              refreshData={refreshData}
            />
          </div>
        </>
      )}

      <HospitalityRidersSection
        data={data}
        session={session}
        refreshData={refreshData}
      />
      <AirportExpressSection
        data={data}
        session={session}
        refreshData={refreshData}
      />
      {isDemoMode && (
        <div id="section-hotspots-radar">
          <LiveSummitHotspotsRadar hotspots={DEMO_HOTSPOTS} />
        </div>
      )}

      <div
        id="section-metrics"
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        <MetricCard
          label={ui.l("Visitors")}
          value={data.activityIntakes[0].visitorCount}
          detail={`${data.activityIntakes[0].vipVisitorCount} ${ui.l("VIP")}`}
          icon={<Users size={17} />}
          onClick={() => setActiveMetricModal("visitors")}
        />
        <MetricCard
          label={ui.l("Open tasks")}
          value={event.tasks.length}
          detail={ui.l("Owners and deadlines assigned")}
          icon={<ClipboardCheck size={17} />}
          onClick={() => setActiveMetricModal("tasks")}
        />
        <MetricCard
          label={ui.isArabic ? "الكباتن بالخدمة" : "Active Captains"}
          value={data.drivers.length}
          detail={
            ui.isArabic ? "جاهزون للتفويج والمواكب" : "Ready for VIP dispatch"
          }
          icon={<Car size={17} />}
          onClick={() => setActiveMetricModal("tasks")}
        />
        <MetricCard
          label={ui.l("Reports")}
          value={data.companyReports.length}
          detail={ui.l("Manager confirmed")}
          icon={<FileText size={17} />}
          onClick={() => setActiveMetricModal("reports")}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <div id="section-tactical-map">
          <RiyadhMap event={event} drivers={data.drivers} tasks={event.tasks} />
        </div>
        <div id="section-contracts-phases">
          <PlanPhases
            data={data}
            canManage={canManage}
            onConfirmAiPlan={confirmAiPlan}
          />
        </div>
      </div>

      {canManage ? (
        <div id="section-operations-setup">
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
        </div>
      ) : null}

      <div id="section-task-board">
        <TaskAssignmentBoard
          event={event}
          drivers={data.drivers}
          canManage={canManage}
          assignTask={assignTask}
          updateTaskStatus={updateTaskStatus}
        />
      </div>

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
                  className="mb-3 text-midyaf-pearl"
                  size={18}
                />
                <p className="font-semibold text-slate-900 dark:text-white">
                  {ui.l(role)}
                </p>
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
                      <p className="font-semibold text-slate-900 dark:text-white">
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
                            type as
                              | "VISA"
                              | "TICKET"
                              | "GUEST_PHOTO"
                              | "PROMO_VIDEO",
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
                      <p className="font-semibold text-slate-900 dark:text-white">
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

      {/* Governance Notice: Financials Isolated in Admin Dashboard */}
      <div className="rounded-lg border border-midyaf-gold/30 bg-midyaf-gold/10 p-4 text-xs text-[#7A5D12] dark:text-midyaf-gold flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Shield size={18} className="text-midyaf-gold shrink-0" />
          <span className="font-semibold">
            {ui.isArabic
              ? "ملاحظة الحوكمة والسرية: تم عزل وحجب كافة البيانات المالية، عروض أسعار الموردين، والعمولات ونقلها حصرياً إلى لوحة الملاك والإدارة (Admin Dashboard)."
              : "Governance & Confidentiality Notice: All financial metrics, supplier quotations, and platform commissions are strictly isolated in the Admin Dashboard."}
          </span>
        </div>
      </div>

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

      {/* Interactive Full-Screen Metrics Details Modal */}
      {activeMetricModal && (
        <LogisticsMetricModal
          modal={activeMetricModal}
          onClose={() => setActiveMetricModal(null)}
          data={data}
          event={event}
          session={session}
          isDemoMode={isDemoMode}
          onApproveContract={approveContract}
          onApproveVendorQuote={approveVendorQuote}
          onUpdateTaskStatus={updateTaskStatus}
          onAssignTask={assignTask}
        />
      )}
    </div>
  );
}

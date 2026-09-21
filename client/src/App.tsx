import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { PORTALS } from "@shared/constants";
import type {
  ActivityIntake,
  CoordinatorRequest,
  Driver,
  Event,
  FileAsset,
  FileUploadInput,
  GuestJourney,
  MidyafData,
  PortalKey,
  Role,
  Session,
  Task,
  TaskStatus
} from "@shared/domain";
// Portals are code-split: each becomes its own chunk and loads on first use.
const ActivityIntakePage = lazy(() => import("./pages/ops/ActivityIntakePage").then((m) => ({ default: m.ActivityIntakePage })));
const CaptainsApp = lazy(() => import("./pages/ops/CaptainsApp").then((m) => ({ default: m.CaptainsApp })));
const CompanyDashboard = lazy(() => import("./pages/ops/CompanyDashboard").then((m) => ({ default: m.CompanyDashboard })));
const CoordinatorsApp = lazy(() => import("./pages/ops/CoordinatorsApp").then((m) => ({ default: m.CoordinatorsApp })));
const GuestJourneyApp = lazy(() => import("./pages/ops/GuestJourneyApp").then((m) => ({ default: m.GuestJourneyApp })));
const AdminExecutiveDashboard = lazy(() =>
  import("./components/AdminExecutiveDashboard").then((m) => ({ default: m.AdminExecutiveDashboard }))
);
const ClientDashboard = lazy(() => import("./components/ClientDashboard").then((m) => ({ default: m.ClientDashboard })));
const SilaOperationsDashboard = lazy(() =>
  import("./components/SilaOperationsDashboard").then((m) => ({ default: m.SilaOperationsDashboard }))
);
const DesignSystemPreview = lazy(() =>
  import("./pages/DesignSystemPreview").then((m) => ({ default: m.DesignSystemPreview }))
);
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "./components/ui/Button";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ShellFrame } from "./shell/ShellFrame";
import { LoginPage } from "./shell/LoginPage";
import { PortalSkeleton } from "./components/ui/Skeleton";
import { GuestSelfOnboarding } from "./pages/GuestSelfOnboarding";
import type {
  CoordinatorRequestInput,
  DriverCreateInput,
  GuestBulkImportInput,
  GuestBulkImportOptions,
  GuestInviteInput,
  PortalProps,
  TaskAssignmentInput,
  SupplierCreateInput,
  TaskCreateInput,
  UserCreateInput
} from "./pages/types";
import { apiFetch, apiUploadFile, getBootstrap, login } from "./lib/api";
import { SocketContext, useSocket } from "./lib/useSocket";
import {
  isArabicLanguage,
  localizeText,
  pickText
} from "./lib/localize";
import { useDemoDirector } from "./lib/demo/useDemoDirector";
import { exportPlanAsPdf, sharePlanLink } from "./lib/planExport";
import { tacticalAudio } from "./lib/tacticalAudio";
import { useTacticalToast } from "./components/TacticalToast";

const sessionStorageKey = "midyaf.session";

const portalsByRole: Record<Role, PortalKey[]> = {
  GUEST: ["guest"],
  DRIVER: ["captain"],
  ORGANIZER: [...PORTALS],
  SUPPLIER: ["company"],
  SUPER_ADMIN: [...PORTALS],
  COORDINATOR: ["coordinator"],
  LOGISTICS_MANAGER: ["sila_operations", "company", "coordinator", "intake"],
  COMPANY_ORGANIZER: ["company", "client", "intake", "sila_operations"],
  EVENT_MANAGER: ["sila_operations", "coordinator"],
  CLIENT: ["client"]
};


export function App() {
  const { t, i18n } = useTranslation();
  const isArabic = isArabicLanguage(i18n.language);
  const l = (value: string | number | null | undefined) =>
    localizeText(value, isArabic);
  const p = (english: string, arabic: string) =>
    pickText(isArabic, english, arabic);
  const toast = useTacticalToast();
  const [portal, setPortal] = useState<PortalKey>("sila_operations");
  const [isOnboarding, setIsOnboarding] = useState(
    window.location.hash.startsWith("#onboarding")
  );
  // Dev-only design-system gallery (see pages/DesignSystemPreview).
  const [isDesignPreview, setIsDesignPreview] = useState(
    import.meta.env.DEV && window.location.hash === "#design"
  );

  useEffect(() => {
    const handleHash = () => {
      setIsOnboarding(window.location.hash.startsWith("#onboarding"));
      setIsDesignPreview(import.meta.env.DEV && window.location.hash === "#design");
    };
    window.addEventListener("hashchange", handleHash);
    return () => window.removeEventListener("hashchange", handleHash);
  }, []);

  const [data, setData] = useState<MidyafData | null>(null);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const normalDataRef = useRef<MidyafData | null>(null);
  const [session, setSession] = useState<Session | null>(() =>
    loadStoredSession()
  );
  const [isLoading, setIsLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [realtimeLog, setRealtimeLog] = useState<string[]>([]);
  const [isWarRoomOpen, setIsWarRoomOpen] = useState(false);
  const [isQuickNavOpen, setIsQuickNavOpen] = useState(false);
  const allowedPortals = session ? portalsByRole[session.user.role] : [];
  const eventId = data?.events[0]?.id;

  const pushLog = useCallback(
    (line: string) => setRealtimeLog((current) => [line, ...current.slice(0, 4)]),
    []
  );

  // The scripted demo director drives the same event bus as the socket; it
  // runs whenever demo mode is on (not only while the War Room is open) so
  // closing and reopening the War Room mid-script keeps its place.
  const director = useDemoDirector({
    enabled: isDemoMode,
    data,
    setData,
    isArabic,
    toast,
    pushLog
  });

  const canTriggerSimulation = Boolean(
    session?.user &&
      (session.user.role === "SUPER_ADMIN" ||
        session.user.role === "LOGISTICS_MANAGER" ||
        session.user.role === "ORGANIZER" ||
        session.user.email === "admin@midyaf.local" ||
        session.user.email === "organizer@midyaf.local")
  );

  /** Full demo mode: swaps in virtual telemetry and unlocks the War Room. */
  function toggleDemoMode() {
    if (!canTriggerSimulation) return;
    if (isDemoMode) {
      // Deactivate demo mode: the director pauses itself; restore normal database data
      setIsDemoMode(false);
      setIsWarRoomOpen(false);
      if (normalDataRef.current) {
        setData(normalDataRef.current);
      }
      void refreshData();
      
      toast.info(
        isArabic ? "تم إيقاف الوضع التجريبي" : "Demo Mode Disengaged",
        isArabic
          ? "تمت العودة للبيانات والعمليات التشغيلية المعتمدة"
          : "Restored to normal production operations data"
      );
    } else {
      // Activate full demo mode with virtual event telemetry
      if (data) {
        normalDataRef.current = data;
      }
      setIsDemoMode(true);

      toast.success(
        isArabic
          ? "تم تفعيل وضع المحاكاة التجريبية الكامل (Ctrl + Shift + D)"
          : "Full Demo Mode Activated (Ctrl + Shift + D)",
        isArabic
          ? "تم تشغيل محاكاة الفعالية الافتراضية والأسطول المباشر · اضغط الآن Ctrl + Space لفتح غرفة العمليات"
          : "Virtual event telemetry engaged · Press Ctrl + Space for Sovereign War Room"
      );
    }
  }

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Ctrl + K or Cmd + K: Quick Navigator Command Palette
      const isKKey = e.key?.toLowerCase() === "k" || e.code === "KeyK";
      if ((e.ctrlKey || e.metaKey) && isKKey) {
        e.preventDefault();
        
        setIsQuickNavOpen((prev) => !prev);
        return;
      }

      const isDKey = e.key?.toLowerCase() === "d" || e.code === "KeyD";
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && isDKey) {
        e.preventDefault();
        if (!canTriggerSimulation) return;

        toggleDemoMode();
      }

      // Ctrl + Space or Cmd + Space: Sovereign Command Bridge (War Room)
      // Strictly guarded: only accessible when Full Demo Mode is active
      if ((e.ctrlKey || e.metaKey) && (e.code === "Space" || e.key === " ")) {
        e.preventDefault();
        if (!isDemoMode) {
          
          toast.alert(
            isArabic ? "غرفة العمليات مقفلة" : "War Room Locked",
            isArabic
              ? "يجب تفعيل الوضع التجريبي أولاً بالضغط على Ctrl + Shift + D"
              : "Activate Full Demo Mode first via Ctrl + Shift + D"
          );
          return;
        }

        
        setIsWarRoomOpen((prev) => !prev);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [canTriggerSimulation, isDemoMode, data, isArabic, toast]);

  // lang/dir are applied by i18n's languageChanged listener and the inline
  // boot script in index.html. The theme is always dark.
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", "dark");
  }, []);

  // Projector density: Ctrl/Cmd+Shift+P scales the root font size.
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "p") {
        event.preventDefault();
        const root = document.documentElement;
        const next = root.dataset.density === "projector" ? "" : "projector";
        if (next) root.dataset.density = next;
        else delete root.dataset.density;
        try {
          window.localStorage.setItem("midyaf.density", next);
        } catch {
          // ignore
        }
      }
    };
    try {
      if (window.localStorage.getItem("midyaf.density") === "projector") {
        document.documentElement.dataset.density = "projector";
      }
    } catch {
      // ignore
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    if (!session) {
      setData(null);
      return;
    }

    setPortal((current) =>
      portalsByRole[session.user.role].includes(current)
        ? current
        : portalsByRole[session.user.role].includes("sila_operations")
        ? "sila_operations"
        : portalsByRole[session.user.role][0]
    );
    void loadSessionData(session);
  }, [session?.accessToken]);

  const stamp = () =>
    new Date().toLocaleTimeString(isArabic ? "ar-SA-u-nu-latn" : "en-SA");
  // Explicit gate: while the director controls the demo captains, real
  // telemetry for those same ids is dropped so the two sources never fight.
  // Every other event still flows, so a live venue and the script coexist.
  const socketFilter = useCallback(
    (name: string, payload: unknown) => {
      if (!isDemoMode) return true;
      if (name !== "driver:location_update" && name !== "user:location_update") return true;
      const driverId = (payload as { driverId?: string | null }).driverId;
      return !driverId || !director.controlledDriverIds().has(driverId);
    },
    [director, isDemoMode]
  );

  const { socket, status: socketStatus } = useSocket({
    enabled: Boolean(session && data),
    sessionKey: session?.accessToken ?? null,
    eventId,
    userId: session?.user.id,
    joinOrganizers: portal === "coordinator",
    filter: socketFilter,
    handlers: {
      "driver:location_update": (payload) => {
        pushLog(`${p("Driver location updated", "تم تحديث موقع السائق")} · ${stamp()}`);
        setData((current) =>
          current
            ? {
                ...current,
                drivers: current.drivers.map((driver) =>
                  driver.id === payload.driverId
                    ? {
                        ...driver,
                        currentLat: payload.lat,
                        currentLng: payload.lng,
                        zone: payload.zone ?? driver.zone,
                        lastLocationAt: payload.updatedAt
                      }
                    : driver
                )
              }
            : current
        );
      },
      "user:location_update": (payload) => {
        pushLog(`${p("User GPS location updated", "تم تحديث موقع المستخدم GPS")} · ${stamp()}`);
        if (!payload.driverId) return;
        setData((current) =>
          current
            ? {
                ...current,
                drivers: current.drivers.map((driver) =>
                  driver.id === payload.driverId
                    ? {
                        ...driver,
                        currentLat: payload.lat,
                        currentLng: payload.lng,
                        lastLocationAt: payload.timestamp
                      }
                    : driver
                )
              }
            : current
        );
      },
      "rider:update": () => {
        pushLog(`${p("VIP Hospitality Rider updated", "تم تحديث رايدر الضيافة VIP")} · ${stamp()}`);
        void refreshData();
      },
      "task:status_change": (payload) => {
        pushLog(`${p("Task status changed", "تم تحديث حالة المهمة")} · ${l(payload.status)}`);
        updateTaskInState(payload.taskId, payload.status);
      },
      "task:assigned": (task) => {
        pushLog(`${p("Task assigned", "تم إسناد مهمة")} · ${l(task.pickupLocation ?? task.id)}`);
        void refreshData();
      },
      "guest:arrived": (payload) => {
        pushLog(`${p("Guest arrived", "وصل الضيف")} · ${l(payload.guestName ?? payload.guestId)}`);
      },
      "alert:delay": (payload) => {
        pushLog(`${p("Delay alert", "تنبيه تأخير")} · ${payload.taskId}`);
        updateTaskInState(payload.taskId, "DELAYED");
      },
      "geofence:transition": (event) => {
        const ring = l(event.currentRing);
        const site = isArabic ? event.geofenceNameAr : event.geofenceNameEn;
        pushLog(`${p("Geofence", "النطاق الجغرافي")} · ${site} · ${ring}`);
      },
      "fleet:diverted": (payload) => {
        pushLog(`${p("Fleet diverted", "تم تحويل مسار الأسطول")} · ${payload.message}`);
      }
    }
  });

  const portalProps = useMemo(
    () => ({
      data: data as MidyafData,
      session: session ?? undefined,
      isDemoMode,
      canTriggerSimulation,
      toggleDemoMode,
      refreshData,
      inviteGuests,
      importGuests,
      createDriver,
      createSupplier,
      createUser,
      createTask,
      assignTask,
      saveActivityIntake,
      analyzeActivityIntake,
      confirmAiPlan,
      approveVendorQuote,
      approveContract,
      updateGuestJourney,
      createCoordinatorRequest,
      updateCoordinatorRequest,
      confirmCompanyReport,
      updateTaskStatus,
      shareDriverLocation,
      createBooking,
      uploadFile
    }),
    [data, session, isDemoMode]
  );

  if (isDesignPreview) {
    return (
      <Suspense fallback={<PortalSkeleton />}>
        <DesignSystemPreview
          onLanguageToggle={() => void i18n.changeLanguage(i18n.language === "ar" ? "en" : "ar")}
        />
      </Suspense>
    );
  }

  if (!session) {
    if (isOnboarding) {
      return (
        <GuestSelfOnboarding
          isArabic={isArabic}
          onComplete={(nextSession) => {
            // Registration already signed the guest in; land them in their app.
            window.location.hash = "";
            setIsOnboarding(false);
            storeSession(nextSession);
            setSession(nextSession);
            setPortal(portalsByRole[nextSession.user.role][0]);
            toast.success(
              isArabic ? "تم التسجيل بنجاح" : "Registration complete",
              isArabic ? "مرحباً بك في تطبيق الضيف" : "Welcome to your guest app"
            );
          }}
        />
      );
    }
    return (
      <LoginPage
        isArabic={isArabic}
        error={authError}
        isLoading={isLoading}
        onLanguageToggle={() =>
          void i18n.changeLanguage(i18n.language === "ar" ? "en" : "ar")
        }
        onLogin={handleLogin}
      />
    );
  }

  const handleExportPdf = () => {
    if (data?.aiPlans[0] && data?.activityIntakes[0]) {
      exportPlanAsPdf(data.aiPlans[0], data.activityIntakes[0], isArabic);
    } else {
      toast.info(
        isArabic ? "الخطة اللوجستية قيد التجهيز" : "Plan in preparation",
        isArabic ? "قم بحفظ وتحليل بيانات الفعالية أولاً" : "Save and analyze activity data first"
      );
    }
  };

  const handleSharePlan = () => {
    if (data?.aiPlans[0]?.id) {
      sharePlanLink(data.aiPlans[0].id, isArabic, toast);
    }
  };

  if (!data || isLoading) {
    return (
      <ShellFrame
        isArabic={isArabic}
        session={session}
        allowedPortals={allowedPortals}
        portal={portal}
        setPortal={setPortal}
        isDemoMode={isDemoMode}
        isWarRoomOpen={isWarRoomOpen}
        setIsWarRoomOpen={setIsWarRoomOpen}
        isQuickNavOpen={isQuickNavOpen}
        setIsQuickNavOpen={setIsQuickNavOpen}
        onLanguageToggle={() =>
          void i18n.changeLanguage(i18n.language === "ar" ? "en" : "ar")
        }
        onLogout={handleLogout}
      >
        {loadError ? (
          <div
            role="alert"
            className="mx-auto flex max-w-xl flex-col items-center gap-4 rounded-lg border border-danger/30 bg-surface-2 p-8 text-center"
          >
            <span className="grid size-12 place-items-center rounded-lg bg-danger/10 text-danger">
              <AlertTriangle className="size-6" aria-hidden />
            </span>
            <div>
              <p className="text-base font-bold text-ink">
                {isArabic ? "تعذر تحميل مساحة العمل" : "Could not load your workspace"}
              </p>
              <p className="mt-1 text-sm text-ink-muted">{loadError}</p>
            </div>
            <Button variant="outline" leadingIcon={<RotateCcw className="size-4" aria-hidden />} onClick={() => void loadSessionData(session)}>
              {isArabic ? "إعادة المحاولة" : "Retry"}
            </Button>
          </div>
        ) : (
          <div aria-busy aria-label={t("loadingWorkspace")}>
            <PortalSkeleton />
          </div>
        )}
      </ShellFrame>
    );
  }

  return (
    <SocketContext.Provider value={{ socket, status: socketStatus }}>
    <ShellFrame
      isArabic={isArabic}
      session={session}
      allowedPortals={allowedPortals}
      portal={portal}
      setPortal={setPortal}
      isDemoMode={isDemoMode}
      realtimeLog={realtimeLog}
      event={data.events[0]}
      data={data}
      drivers={data.drivers}
      tasks={data.events[0]?.tasks ?? []}
      isWarRoomOpen={isWarRoomOpen}
      setIsWarRoomOpen={setIsWarRoomOpen}
      isQuickNavOpen={isQuickNavOpen}
      setIsQuickNavOpen={setIsQuickNavOpen}
      onExportPdf={handleExportPdf}
      onSharePlan={handleSharePlan}
      onLanguageToggle={() =>
        void i18n.changeLanguage(i18n.language === "ar" ? "en" : "ar")
      }
      onLogout={handleLogout}
    >
      <ErrorBoundary resetKey={portal} isArabic={isArabic}>
        <Suspense fallback={<PortalSkeleton />}>{renderPortal(portal, portalProps, isArabic)}</Suspense>
      </ErrorBoundary>
    </ShellFrame>
    </SocketContext.Provider>
  );

  async function handleLogin(email: string, password: string) {
    setIsLoading(true);
    setAuthError(null);

    try {
      const nextSession = await login(email, password);
      storeSession(nextSession);
      setSession(nextSession);
      setPortal(portalsByRole[nextSession.user.role][0]);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : t("loginFailed"));
    } finally {
      setIsLoading(false);
    }
  }

  function handleLogout() {
    window.localStorage.removeItem(sessionStorageKey);
    setSession(null);
    setData(null);
    setRealtimeLog([]);
  }

  async function loadSessionData(activeSession: Session) {
    setIsLoading(true);
    setLoadError(null);

    // Instant offline cache restore
    try {
      const cached = window.sessionStorage.getItem(`midyaf_data_${activeSession.user.id}`);
      if (cached) {
        setData(JSON.parse(cached));
      }
    } catch {
      // Ignore cache parse error
    }

    try {
      const fresh = await getBootstrap(activeSession.accessToken);
      setData(fresh);
      normalDataRef.current = fresh;
      try {
        window.sessionStorage.setItem(
          `midyaf_data_${activeSession.user.id}`,
          JSON.stringify(fresh)
        );
      } catch {
        // Ignore cache write error
      }
    } catch (error) {
      // If cached data is present, do not disrupt the UI with a blocking error
      setData((curr) => {
        if (!curr) {
          setLoadError(
            error instanceof Error ? error.message : t("workspaceLoadFailed")
          );
        }
        return curr;
      });
    } finally {
      setIsLoading(false);
    }
  }

  async function refreshData() {
    const activeSession = requireSession();
    try {
      const fresh = await getBootstrap(activeSession.accessToken);
      setData(fresh);
      if (!isDemoMode) {
        normalDataRef.current = fresh;
      }
      try {
        window.sessionStorage.setItem(
          `midyaf_data_${activeSession.user.id}`,
          JSON.stringify(fresh)
        );
      } catch {
        // Ignore
      }
    } catch {
      // Optimistic state preserved
    }
  }

  async function inviteGuests(eventId: string, guests: GuestInviteInput[]) {
    const activeSession = requireSession();

    await apiFetch(
      `/events/${eventId}/guests/invite`,
      activeSession.accessToken,
      {
        method: "POST",
        body: JSON.stringify({ guests })
      }
    );
    await refreshData();
  }

  async function importGuests(
    eventId: string,
    guests: GuestBulkImportInput[],
    options: GuestBulkImportOptions
  ) {
    const activeSession = requireSession();

    await apiFetch(
      `/events/${eventId}/guests/import`,
      activeSession.accessToken,
      {
        method: "POST",
        body: JSON.stringify({
          guests,
          generateTasks: options.generateTasks,
          normalGuestsPerShuttle: options.normalGuestsPerShuttle
        })
      }
    );
    await refreshData();
  }

  async function createDriver(driver: DriverCreateInput) {
    const activeSession = requireSession();

    await apiFetch("/drivers", activeSession.accessToken, {
      method: "POST",
      body: JSON.stringify(driver)
    });
    await refreshData();
  }

  async function createSupplier(supplier: SupplierCreateInput) {
    const activeSession = requireSession();

    await apiFetch("/suppliers", activeSession.accessToken, {
      method: "POST",
      body: JSON.stringify(supplier)
    });
    await refreshData();
  }

  async function createUser(user: UserCreateInput) {
    const activeSession = requireSession();

    await apiFetch("/users", activeSession.accessToken, {
      method: "POST",
      body: JSON.stringify(user)
    });
    await refreshData();
  }

  async function createTask(task: TaskCreateInput) {
    const activeSession = requireSession();
    const newTask = {
      ...task,
      id: `task-${Date.now()}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: "READY" as const
    } as any;

    setData((c) =>
      c
        ? {
            ...c,
            events: c.events.map((event) => ({
              ...event,
              tasks: [newTask, ...event.tasks]
            }))
          }
        : c
    );

    try {
      await apiFetch("/tasks", activeSession.accessToken, {
        method: "POST",
        body: JSON.stringify(task)
      });
      await refreshData();
    } catch {
      // Optimistic state preserved for live interactive demo
    }
  }

  async function assignTask(taskId: string, assignment: TaskAssignmentInput) {
    const activeSession = requireSession();

    setData((c) =>
      c
        ? {
            ...c,
            events: c.events.map((event) => ({
              ...event,
              tasks: event.tasks.map((t) =>
                t.id === taskId
                  ? {
                      ...t,
                      driverId: assignment.driverId ?? t.driverId,
                      status: "ASSIGNED" as const
                    }
                  : t
              )
            }))
          }
        : c
    );

    try {
      await apiFetch(`/tasks/${taskId}/assignment`, activeSession.accessToken, {
        method: "PUT",
        body: JSON.stringify(assignment)
      });
      await refreshData();
    } catch {
      // Optimistic state preserved
    }
  }

  async function saveActivityIntake(intake: ActivityIntake) {
    const currentData = requireData();
    const activeSession = requireSession();
    const payload = {
      eventId: intake.eventId ?? currentData.events[0]?.id,
      activityName: intake.activityName,
      activityPlace: intake.activityPlace,
      visitorCount: intake.visitorCount,
      vipVisitorCount: intake.vipVisitorCount,
      normalVisitorCount: Math.max(
        0,
        intake.visitorCount - intake.vipVisitorCount
      ),
      transportationType: intake.transportationType,
      ticketType: intake.ticketType,
      hotelType: intake.hotelType,
      carType: intake.carType,
      status: intake.status,
      submittedBy: intake.submittedBy || activeSession.user.name
    };

    try {
      await apiFetch(
        intake.id ? `/activity-intakes/${intake.id}` : "/activity-intakes",
        activeSession.accessToken,
        {
          method: intake.id ? "PUT" : "POST",
          body: JSON.stringify(payload)
        }
      );
      await refreshData();
    } catch {
      // Optimistic state preserved
    }
  }

  async function analyzeActivityIntake(intakeId: string) {
    const activeSession = requireSession();

    try {
      await apiFetch(
        `/activity-intakes/${intakeId}/analyze`,
        activeSession.accessToken,
        { method: "POST" }
      );
      await refreshData();
    } catch {
      // Optimistic state preserved
    }
  }

  async function confirmAiPlan(planId: string) {
    const activeSession = requireSession();

    setData((c) =>
      c
        ? {
            ...c,
            aiPlans: c.aiPlans.map((p) =>
              p.id === planId ? { ...p, status: "CONFIRMED" as any } : p
            )
          }
        : c
    );

    try {
      await apiFetch(`/ai-plans/${planId}/confirm`, activeSession.accessToken, {
        method: "PUT"
      });
      await refreshData();
    } catch {
      // Optimistic state preserved
    }
  }

  async function approveVendorQuote(quoteId: string) {
    const activeSession = requireSession();

    setData((c) =>
      c
        ? {
            ...c,
            vendorQuotes: c.vendorQuotes.map((q) =>
              q.id === quoteId ? { ...q, status: "APPROVED" as any } : q
            )
          }
        : c
    );

    try {
      await apiFetch(`/vendor-quotes/${quoteId}/approve`, activeSession.accessToken, {
        method: "PUT"
      });
      await refreshData();
    } catch {
      // Optimistic state preserved
    }
  }

  async function approveContract(contractId: string) {
    const activeSession = requireSession();

    setData((c) =>
      c
        ? {
            ...c,
            contracts: c.contracts.map((cnt) =>
              cnt.id === contractId ? { ...cnt, status: "APPROVED" as any } : cnt
            )
          }
        : c
    );

    try {
      await apiFetch(`/contracts/${contractId}/approve`, activeSession.accessToken, {
        method: "PUT"
      });
      await refreshData();
    } catch {
      // Optimistic state preserved
    }
  }

  async function updateGuestJourney(
    journeyId: string,
    updates: Partial<GuestJourney>
  ) {
    const activeSession = requireSession();

    setData((c) =>
      c
        ? {
            ...c,
            guestJourneys: c.guestJourneys.map((j) =>
              j.id === journeyId ? { ...j, ...updates } : j
            )
          }
        : c
    );

    try {
      await apiFetch(`/guest-journeys/${journeyId}`, activeSession.accessToken, {
        method: "PUT",
        body: JSON.stringify(updates)
      });
      await refreshData();
    } catch {
      // Optimistic state preserved
    }
  }

  async function createCoordinatorRequest(request: CoordinatorRequestInput) {
    const activeSession = requireSession();
    const newReq = {
      ...request,
      id: `req-${Date.now()}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: request.status ?? ("NEW" as const)
    } as any;

    setData((c) => (c ? { ...c, coordinatorRequests: [newReq, ...c.coordinatorRequests] } : c));

    try {
      await apiFetch("/coordinator-requests", activeSession.accessToken, {
        method: "POST",
        body: JSON.stringify(request)
      });
      await refreshData();
    } catch {
      // Optimistic state preserved
    }
  }

  async function updateCoordinatorRequest(
    requestId: string,
    updates: Partial<CoordinatorRequest>
  ) {
    const activeSession = requireSession();

    setData((c) =>
      c
        ? {
            ...c,
            coordinatorRequests: c.coordinatorRequests.map((r) =>
              r.id === requestId ? { ...r, ...updates } : r
            )
          }
        : c
    );

    try {
      await apiFetch(`/coordinator-requests/${requestId}`, activeSession.accessToken, {
        method: "PUT",
        body: JSON.stringify(updates)
      });
      await refreshData();
    } catch {
      // Optimistic state preserved
    }
  }

  async function confirmCompanyReport(reportId: string) {
    const activeSession = requireSession();

    setData((c) =>
      c
        ? {
            ...c,
            companyReports: c.companyReports.map((r) =>
              r.id === reportId ? { ...r, status: "MANAGER_CONFIRMED" as any } : r
            )
          }
        : c
    );

    try {
      await apiFetch(`/company-reports/${reportId}/confirm`, activeSession.accessToken, {
        method: "PUT"
      });
      await refreshData();
    } catch {
      // Optimistic state preserved
    }
  }

  async function updateTaskStatus(taskId: string, status: TaskStatus) {
    const activeSession = requireSession();

    updateTaskInState(taskId, status);

    try {
      await apiFetch(`/tasks/${taskId}/status`, activeSession.accessToken, {
        method: "PUT",
        body: JSON.stringify({ status })
      });
      await refreshData();
    } catch {
      // Optimistic state preserved
    }
  }

  async function shareDriverLocation(driverId: string) {
    const currentData = requireData();
    const activeSession = requireSession();
    const driver = currentData.drivers.find((item) => item.id === driverId);
    const event = currentData.events[0];
    const lat = Number(((driver?.currentLat ?? 24.7743) + 0.006).toFixed(5));
    const lng = Number(((driver?.currentLng ?? 46.7386) - 0.004).toFixed(5));

    setData((current) =>
      current
        ? {
            ...current,
            drivers: current.drivers.map((item) =>
              item.id === driverId
                ? {
                    ...item,
                    currentLat: lat,
                    currentLng: lng,
                    lastLocationAt: new Date().toISOString(),
                    status: "EN_ROUTE"
                  }
                : item
            )
          }
        : current
    );

    await apiFetch(`/drivers/${driverId}/location`, activeSession.accessToken, {
      method: "PUT",
      body: JSON.stringify({ lat, lng, eventId: event.id })
    });
    await refreshData();
  }

  async function createBooking(serviceId: string, supplierId: string) {
    const currentData = requireData();
    const activeSession = requireSession();
    const event = currentData.events[0];

    await apiFetch("/bookings", activeSession.accessToken, {
      method: "POST",
      body: JSON.stringify({
        eventId: event.id,
        supplierId,
        serviceId,
        quantity: 1
      })
    });
    await refreshData();
  }

  async function uploadFile(
    file: File,
    input: FileUploadInput
  ): Promise<FileAsset> {
    const activeSession = requireSession();
    const { fileAsset } = await apiUploadFile(
      file,
      input,
      activeSession.accessToken
    );
    await refreshData();
    return fileAsset;
  }

  function updateTaskInState(taskId: string, status: TaskStatus) {
    setData((current) =>
      current
        ? {
            ...current,
            events: current.events.map((event) => ({
              ...event,
              tasks: event.tasks.map((task) =>
                task.id === taskId ? { ...task, status } : task
              )
            }))
          }
        : current
    );
  }

  function requireSession() {
    if (!session) {
      throw new Error("No active session");
    }

    return session;
  }

  function requireData() {
    if (!data) {
      throw new Error("Workspace is not loaded");
    }

    return data;
  }
}

function renderPortal(
  portal: PortalKey,
  props: PortalProps,
  isArabic: boolean
) {
  switch (portal) {
    case "admin":
      return (
        <AdminExecutiveDashboard
          data={props.data}
          session={props.session ?? null}
          isDemoMode={props.isDemoMode}
          isArabic={isArabic}
          onApproveVendorQuote={props.approveVendorQuote}
          onApproveContract={props.approveContract}
          onConfirmAiPlan={props.confirmAiPlan}
        />
      );
    case "client":
      return (
        <ClientDashboard
          data={props.data}
          isArabic={isArabic}
          isDemoMode={props.isDemoMode ?? false}
          onDownloadReport={() => {
            const report = props.data.companyReports[0];
            if (report) {
              window.open(`/api/company-reports/${report.id}/pdf`, "_blank");
            }
          }}
        />
      );
    case "sila_operations":
      return (
        <SilaOperationsDashboard
          data={props.data}
          session={props.session ?? null}
          isDemoMode={props.isDemoMode ?? false}
          isArabic={isArabic}
          onToggleDemo={props.canTriggerSimulation ? props.toggleDemoMode : undefined}
          onDownloadReport={() => {
            const report = props.data.companyReports[0];
            if (report) {
              window.open(`/api/company-reports/${report.id}/pdf`, "_blank");
            }
          }}
        />
      );
    case "guest":
      return <GuestJourneyApp {...props} />;
    case "captain":
      return <CaptainsApp {...props} />;
    case "coordinator":
      return <CoordinatorsApp {...props} />;
    case "company":
      return <CompanyDashboard {...props} />;
    case "intake":
    default:
      return <ActivityIntakePage {...props} />;
  }
}

function loadStoredSession() {
  const stored = window.localStorage.getItem(sessionStorageKey);

  if (!stored) {
    return null;
  }

  try {
    return JSON.parse(stored) as Session;
  } catch {
    window.localStorage.removeItem(sessionStorageKey);
    return null;
  }
}

function storeSession(session: Session) {
  window.localStorage.setItem(sessionStorageKey, JSON.stringify(session));
}

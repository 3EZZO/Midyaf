import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  Building2,
  Car,
  ClipboardList,
  Crown,
  Globe2,
  LayoutDashboard,
  Shield,
  ShieldCheck,
  Sparkles,
  Users,
  KeyRound,
  Star,
  Search,
  Download,
  Share2,
  Briefcase
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
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
import { Badge } from "./components/Badge";
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
import { ErrorBoundary } from "./components/ErrorBoundary";
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
import { useLiveDemoSimulation } from "./lib/useLiveDemoSimulation";
import { SovereignCommandBridge } from "./components/SovereignCommandBridge";
import { QuickNavigator } from "./components/QuickNavigator";
import { exportPlanAsPdf, sharePlanLink } from "./lib/planExport";
import { tacticalAudio } from "./lib/tacticalAudio";
import { useTacticalToast } from "./components/TacticalToast";

const portalIcons: Record<PortalKey, LucideIcon> = {
  admin: Crown,
  company: Building2,
  client: Briefcase,
  sila_operations: Briefcase,
  intake: ClipboardList,
  guest: Crown,
  captain: Car,
  coordinator: Users
};

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

  const simulation = useLiveDemoSimulation({
    data,
    setData,
    setRealtimeLog,
    isArabic
  });

  const canTriggerSimulation = Boolean(
    session?.user &&
      (session.user.role === "SUPER_ADMIN" ||
        session.user.role === "LOGISTICS_MANAGER" ||
        session.user.role === "ORGANIZER" ||
        session.user.email === "admin@midyaf.local" ||
        session.user.email === "organizer@midyaf.local")
  );

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

        if (isDemoMode) {
          // Deactivate demo mode: stop simulation and restore normal database data
          setIsDemoMode(false);
          simulation.stopSimulation();
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
          simulation.startSimulation();
          
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
  }, [canTriggerSimulation, isDemoMode, data, simulation, isArabic, toast]);

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
  const pushLog = (line: string) =>
    setRealtimeLog((current) => [line, ...current.slice(0, 4)]);

  const { socket, status: socketStatus } = useSocket({
    enabled: Boolean(session && data),
    sessionKey: session?.accessToken ?? null,
    eventId,
    userId: session?.user.id,
    joinOrganizers: portal === "coordinator",
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
          onComplete={() => { 
            window.location.hash = ""; 
            setIsOnboarding(false);
            toast.success(isArabic ? "تم التسجيل بنجاح" : "Registration Complete", isArabic ? "يمكنك الآن تسجيل الدخول" : "You can now login");
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
        simulation={simulation}
        isWarRoomOpen={isWarRoomOpen}
        setIsWarRoomOpen={setIsWarRoomOpen}
        isQuickNavOpen={isQuickNavOpen}
        setIsQuickNavOpen={setIsQuickNavOpen}
        onLanguageToggle={() =>
          void i18n.changeLanguage(i18n.language === "ar" ? "en" : "ar")
        }
        onLogout={handleLogout}
      >
        <div className="bg-[#121626] border border-white/5 shadow-sm rounded-lg p-8 text-center animate-fadeInUp">
          <div className="skeleton mx-auto h-4 w-48 rounded-lg" />
          <p className="mt-4 text-sm font-semibold text-slate-500">
            {loadError ?? t("loadingWorkspace")}
          </p>
        </div>
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
      simulation={simulation}
      event={data.events[0]}
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

const portalMeta: Record<PortalKey, { titleEn: string; titleAr: string; descEn: string; descAr: string }> = {
  admin: {
    titleEn: "Midyaf Sovereign Admin Dashboard",
    titleAr: "لوحة الملاك والإدارة التنفيذية لمضياف",
    descEn: "Owners-only executive governance: submitter audit, plans approval, complaints registry & contracts",
    descAr: "خاصة بالملاك: سجل الجهات المدخلة، اعتماد الخطط، سجل الشكاوى، مؤشرات الفعاليات وخزنة العقود"
  },
  company: {
    titleEn: "Organizing Company Dashboard",
    titleAr: "لوحة الشركة المنظمة (صلة)",
    descEn: "Executive event overview, report approvals, and on-demand client dashboard generator",
    descAr: "المتابعة التنفيذية لشركة صلة، اعتماد التقارير، وتوليد لوحة العميل عند الطلب مع مصفوفة الصلاحيات"
  },
  client: {
    titleEn: "Client Executive Dashboard",
    titleAr: "لوحة العميل المستفيد المخصصة",
    descEn: "Exclusive client portal: reports, schedule amendments, direct logistics communication & performance KPIs",
    descAr: "بوابة العميل المستفيد: استعراض التقارير، تعديلات الجداول، التواصل المباشر مع مدير العمليات ومؤشرات الأداء"
  },
  sila_operations: {
    titleEn: "Sila Operations Command",
    titleAr: "لوحة عمليات صلة (لوجستيات وفعاليات)",
    descEn: "Unified operations command: view reports, activities, contracts & relay tasks",
    descAr: "قيادة العمليات الموحدة: متابعة التقارير، الأنشطة، العقود، وتفويض المهام"
  },
  intake: {
    titleEn: "Activity Intake & Logistics Setup",
    titleAr: "إدخال الفعالية والتجهيز اللوجستي",
    descEn: "Event core data, guest CSV import, hotel rooms, pricing bands & supplier contracts",
    descAr: "البيانات الأساسية، استيراد الضيوف، حجز الفنادق، نطاقات الأسعار وعقود الموردين"
  },
  guest: {
    titleEn: "Guest Hospitality Journey App",
    titleAr: "تطبيق الضيف والرحلة الشاملة",
    descEn: "VIP boarding pass, flight schedules, chauffeur tracking, accommodation & personal requests",
    descAr: "بطاقة الصعود الرقمية، مواعيد الرحلات، تتبع السائق، تفاصيل الإقامة والطلبات الخاصة"
  },
  captain: {
    titleEn: "Captains & Fleet Mobility App",
    titleAr: "تطبيق الكباتن وحركة الأسطول",
    descEn: "Executive chauffeur dispatch, VIP terminal transfers, shuttle routes & live GPS updates",
    descAr: "توزيع المشاوير، نقل كبار الشخصيات من المطار، مسارات التردد وتحديث الموقع المباشر"
  },
  coordinator: {
    titleEn: "Field Coordinators App",
    titleAr: "تطبيق المنسقين والميدان",
    descEn: "Zone supervision, guest ground protocol, incident escalation & dispatch tasks",
    descAr: "إدارة مناطق الفعالية، بروتوكول استقبال الضيوف، إرسال البلاغات وتنسيق الحركة"
  }
};

function ShellFrame({
  children,
  isArabic,
  session,
  allowedPortals,
  portal,
  setPortal,
  isDemoMode,
  realtimeLog = [],
  simulation,
  event,
  drivers,
  tasks,
  isWarRoomOpen,
  setIsWarRoomOpen,
  isQuickNavOpen,
  setIsQuickNavOpen,
  onExportPdf,
  onSharePlan,
  onLanguageToggle,
  onLogout
}: {
  children: ReactNode;
  isArabic: boolean;
  session: Session;
  allowedPortals: PortalKey[];
  portal: PortalKey;
  setPortal: (portal: PortalKey) => void;
  isDemoMode?: boolean;
  realtimeLog?: string[];
  simulation?: ReturnType<typeof useLiveDemoSimulation>;
  event?: Event;
  drivers?: Driver[];
  tasks?: Task[];
  isWarRoomOpen?: boolean;
  setIsWarRoomOpen?: (open: boolean) => void;
  isQuickNavOpen: boolean;
  setIsQuickNavOpen: (open: boolean) => void;
  onExportPdf?: () => void;
  onSharePlan?: () => void;
  onLanguageToggle: () => void;
  onLogout: () => void;
}) {
  const { t } = useTranslation();
  const l = (value: string | number | null | undefined) =>
    localizeText(value, isArabic);
  // Privileged roles are shown by title rather than personal name on shared screens.
  const roleDisplay: Partial<Record<Role, { en: string; ar: string; initials: string }>> = {
    SUPER_ADMIN: { en: "Sovereign System Administrator", ar: "المشرف العام للمنظومة", initials: "SA" },
    LOGISTICS_MANAGER: { en: "Logistics Operations Director", ar: "مدير العمليات اللوجستية", initials: "LD" }
  };
  const roleTitle = roleDisplay[session.user.role];

  const sanitizedUserName = roleTitle
    ? (isArabic ? roleTitle.ar : roleTitle.en)
    : session.user.name;

  const initials = roleTitle
    ? roleTitle.initials
    : session.user.name
        .split(" ")
        .map((w: string) => w[0])
        .filter(Boolean)
        .join("")
        .slice(0, 2)
        .toUpperCase() || "OP";

  const ActivePortalIcon = portalIcons[portal];
  const currentMeta = portalMeta[portal];

  return (
    <div
      className={
        isArabic
          ? "min-h-screen font-arabic text-slate-900 dark:text-white"
          : "min-h-screen font-english text-slate-900 dark:text-white"
      }
      style={{ background: "var(--m-pearl)" }}
    >
      <header className="sticky top-0 z-30 glass-royal shadow-sm transition-all duration-300" style={{ borderBottom: 'none' }}>
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-5 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3.5">
            <img
              src="/midyaf-icon.png"
              alt={t("brand")}
              className="size-11 rounded-xl object-cover shadow-card-sm ring-2 ring-midyaf-gold/30 transition-transform duration-300 hover:scale-105"
            />
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-black tracking-tight text-midyaf-pearl dark:text-white">
                  {t("brand")}
                </h1>
                <span className="text-shimmer text-sm font-bold">
                  {t("brandArabic")}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <Badge tone="purple">
                  <Globe2 size={13} />
                  {t("city")}
                </Badge>
                <Badge tone="green">
                  <span className="live-dot" style={{ width: 6, height: 6 }} />
                  {t("liveSystem")}
                </Badge>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Quick Command Palette (Spotlight Search) Trigger Button */}
            <button
              type="button"
              onClick={() => {
                
                setIsQuickNavOpen(true);
              }}
              className="flex items-center gap-2 rounded-xl bg-slate-100/90 hover:bg-slate-200/90 dark:bg-slate-800/90 dark:hover:bg-slate-700 px-3 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 shadow-sm transition-all ring-1 ring-slate-200/80 dark:ring-slate-700 cursor-pointer hover:ring-midyaf-gold/50"
              title={isArabic ? "البحث والتنقل السريع (Ctrl + K)" : "Quick Search & Jump (Ctrl + K)"}
            >
              <Search size={14} className="text-midyaf-gold" />
              <span className="hidden sm:inline font-medium">{isArabic ? "بحث سريع..." : "Quick Jump..."}</span>
              <kbd className="rounded bg-white dark:bg-slate-900 border border-white/5 dark:border-slate-700 px-1.5 py-0.5 text-xs font-mono text-midyaf-gold font-bold">
                ⌘K
              </kbd>
            </button>

            {/* Sovereign Command Bridge (War Room) & Full Demo Mode Badge */}
            {isDemoMode && (
              <>
                <div className="hidden sm:inline-flex items-center gap-1.5 rounded-xl bg-amber-500/15 border border-amber-500/30 px-2.5 py-1 text-xs font-black text-amber-500 animate-pulse">
                  <Sparkles size={13} />
                  <span>{isArabic ? "الوضع التجريبي نشط" : "DEMO MODE ACTIVE"}</span>
                  <span className="text-xs text-amber-400/80 font-mono">[Ctrl+Shift+D]</span>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    
                    setIsWarRoomOpen?.(true);
                  }}
                  className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-midyaf-purple via-slate-900 to-midyaf-purple-dark px-3.5 py-2 text-xs font-black text-midyaf-gold shadow-glow ring-1 ring-midyaf-gold/50 transition-all duration-300 hover:scale-105 active:scale-95 hover:ring-midyaf-gold"
                  title={isArabic ? "غرفة العمليات والقيادة السيادية (Ctrl + Space)" : "Sovereign Command Bridge (Ctrl + Space)"}
                >
                  <span className="relative flex size-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
                  </span>
                  <Shield size={14} className="text-midyaf-gold" />
                  <span>{isArabic ? "غرفة العمليات" : "WAR ROOM"}</span>
                  <span className="text-xs text-midyaf-gold/70 font-mono">[Ctrl+Space]</span>
                </button>
              </>
            )}

            <button
              onClick={onLanguageToggle}
              className="btn-ghost rounded-xl transition-transform duration-200 hover:scale-105 active:scale-95 cursor-pointer"
            >
              {t("switchLanguage")}
            </button>
            <div className="flex items-center gap-2.5 rounded-xl bg-midyaf-purple/5 px-3 py-2 ring-1 ring-midyaf-purple/10 dark:bg-midyaf-purple/20">
              <div className="grid size-8 place-items-center rounded-lg bg-[#121626] text-xs font-black text-white shadow-sm ring-1 ring-midyaf-gold/30">
                {initials}
              </div>
              <span className="text-sm font-bold text-midyaf-pearl dark:text-white">
                {sanitizedUserName}
              </span>
            </div>
            <button
              onClick={onLogout}
              className="btn-primary rounded-xl px-3.5 py-2 text-xs transition-transform duration-200 hover:scale-105 active:scale-95 cursor-pointer"
            >
              {t("logout")}
            </button>
          </div>
        </div>

        {/* Enhanced Portal Navigation Bar with Category Pills & Intuitive Highlights */}
        <nav className="mx-auto flex max-w-7xl items-center flex-wrap gap-2 px-5 pb-2.5">
          {allowedPortals.map((item) => {
            const Icon = portalIcons[item];
            const active = portal === item;
            
            const categoryTag = 
              item === "admin"
                ? (isArabic ? "الملاك" : "Owners")
                : item === "sila_operations"
                ? (isArabic ? "العمليات" : "Operations")
                : item === "company"
                ? (isArabic ? "المنظمة" : "Organizer")
                : item === "client"
                  ? (isArabic ? "العميل" : "Client")


                : item === "intake" 
                ? (isArabic ? "التخطيط" : "Planning")
                : (isArabic ? "الميدان" : "Ground");

            return (
              <button
                key={item}
                onClick={() => {
                  
                  setPortal(item);
                }}
                className={
                  active
                    ? "relative flex min-w-fit items-center gap-2 rounded-xl bg-gradient-to-r from-midyaf-purple via-midyaf-purple-light to-midyaf-purple-dark px-3.5 py-2 text-xs font-black text-white shadow-none ring-1 ring-midyaf-gold/40 transition-all duration-200 cursor-pointer"
                    : "flex min-w-fit items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-bold text-slate-500 transition-all duration-150 hover:bg-midyaf-purple/5 hover:text-midyaf-pearl dark:text-slate-400 dark:hover:bg-midyaf-purple/20 dark:hover:text-white cursor-pointer"
                }
              >
                <Icon size={15} className={active ? "text-midyaf-gold" : "text-slate-400"} />
                <span>{t(`portals.${item}`)}</span>
                <span className={`text-xs px-1.5 py-0.2 rounded font-semibold ${
                  active ? "bg-midyaf-gold/20 text-midyaf-gold" : "bg-slate-200/60 dark:bg-slate-800 text-slate-400"
                }`}>
                  {categoryTag}
                </span>
                {active && (
                  <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 size-1 rounded-full bg-midyaf-gold shadow-glow" />
                )}
              </button>
            );
          })}
        </nav>
        <div className="accent-line-gold shadow-glow" />
      </header>

      <main className="mx-auto max-w-7xl px-5 py-5">
        {/* Sleek Contextual Operations Bar (Replaces bulky static 220px banner) */}
        <div className="mb-5 flex flex-col gap-3.5 rounded-lg border border-white/5 bg-white/90 p-3.5 shadow-card-sm backdrop-blur-sm dark:border-slate-800 dark:bg-slate-900/90 lg:flex-row lg:items-center lg:justify-between animate-fadeInDown">
          <div className="flex items-center gap-3.5">
            <div className="grid size-11 place-items-center rounded-xl bg-[#121626] text-midyaf-gold shadow-sm ring-1 ring-midyaf-gold/30 shrink-0">
              <ActivePortalIcon size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-sm font-black text-midyaf-pearl dark:text-white">
                  {isArabic ? currentMeta?.titleAr : currentMeta?.titleEn}
                </h2>
                <span className="rounded-md bg-midyaf-gold/15 px-2 py-0.5 text-xs font-bold text-midyaf-gold ring-1 ring-midyaf-gold/30">
                  {isArabic ? "نطاق القمة السيادية" : "Sovereign Summit Zone"}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500/10 px-2 py-0.5 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                  <span className="live-dot" style={{ width: 5, height: 5 }} />
                  {isArabic ? "مباشر" : "Live"}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {isArabic ? currentMeta?.descAr : currentMeta?.descEn}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap justify-between lg:justify-end">
            {/* Realtime Event Telemetry Ticker */}
            <div className="flex items-center gap-2 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-white/5 dark:border-slate-700/60 px-3 py-1.5 text-xs text-slate-600 dark:text-slate-300">
              <span className="live-dot shrink-0" style={{ width: 6, height: 6 }} />
              <span className="truncate max-w-[220px] font-medium text-xs">
                {realtimeLog[0] ?? (isArabic ? "البث المباشر متصل" : "Live telemetry connected")}
              </span>
            </div>

            {/* Contextual Action Shortcuts */}
            {portal === "intake" && onExportPdf && (
              <button
                type="button"
                onClick={onExportPdf}
                className="btn-gold flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold shadow-sm cursor-pointer"
                title={isArabic ? "تصدير الخطة كملف PDF" : "Export Plan as PDF"}
              >
                <Download size={13} />
                <span>{isArabic ? "تصدير الخطة" : "Export PDF"}</span>
              </button>
            )}

            {portal === "intake" && onSharePlan && (
              <button
                type="button"
                onClick={onSharePlan}
                className="flex items-center gap-1.5 rounded-xl bg-white px-3 py-1.5 text-xs font-bold text-midyaf-pearl ring-1 ring-slate-200 transition hover:bg-slate-50 dark:bg-slate-800 dark:text-purple-300 cursor-pointer shadow-sm"
                title={isArabic ? "نسخ ومشاركة رابط الخطة" : "Share Plan Link"}
              >
                <Share2 size={13} />
                <span>{isArabic ? "مشاركة" : "Share"}</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                
                setIsQuickNavOpen(true);
              }}
              className="flex items-center gap-1.5 rounded-xl bg-midyaf-purple/10 hover:bg-midyaf-purple/20 text-midyaf-pearl dark:bg-purple-500/20 dark:text-purple-300 dark:hover:bg-purple-500/30 px-3 py-1.5 text-xs font-black transition-all cursor-pointer"
              title={isArabic ? "البحث والتنقل السريع (Ctrl + K)" : "Quick Search & Jump (Ctrl + K)"}
            >
              <Search size={13} className="text-midyaf-gold" />
              <span>{isArabic ? "بحث سريع" : "Quick Jump"}</span>
              <kbd className="text-xs font-mono opacity-75">⌘K</kbd>
            </button>
          </div>
        </div>

        {children}
      </main>

      {/* Sovereign Command Bridge (War Room Modal) */}
      {isWarRoomOpen && (
        <SovereignCommandBridge
          isOpen={isWarRoomOpen}
          onClose={() => setIsWarRoomOpen?.(false)}
          event={event}
          drivers={drivers ?? []}
          tasks={tasks ?? []}
        />
      )}

      {/* Quick Command Palette (Spotlight Search Modal) */}
      <QuickNavigator
        isOpen={isQuickNavOpen}
        onClose={() => setIsQuickNavOpen(false)}
        isArabic={isArabic}
        activePortal={portal}
        allowedPortals={allowedPortals}
        onSelectPortal={setPortal}
        onToggleLanguage={onLanguageToggle}
        isDemoMode={isDemoMode}
        onOpenWarRoom={() => setIsWarRoomOpen?.(true)}
        onExportPdf={onExportPdf}
        onSharePlan={onSharePlan}
      />
    </div>
  );
}

function LoginPage({
  isArabic,
  error,
  isLoading,
  onLanguageToggle,
  onLogin
}: {
  isArabic: boolean;
  error: string | null;
  isLoading: boolean;
  onLanguageToggle: () => void;
  onLogin: (email: string, password: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onLogin(email, password);
  }

  return (
    <div
      className={
        isArabic
          ? "min-h-screen login-bg font-arabic text-slate-900 dark:text-white"
          : "min-h-screen login-bg font-english text-slate-900 dark:text-white"
      }
    >
      {/* Floating decorative particles */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
        {[...Array(6)].map((_, i) => (
          <div
            key={i}
            className="absolute rounded-full bg-midyaf-gold/20"
            style={{
              width: 4 + i * 2,
              height: 4 + i * 2,
              left: `${15 + i * 14}%`,
              bottom: '-10px',
              animation: `particleDrift ${8 + i * 3}s linear infinite`,
              animationDelay: `${i * 1.5}s`
            }}
          />
        ))}
      </div>

      {/* Top bar with controls */}
      <div className="absolute top-0 start-0 end-0 z-10 flex items-center justify-end gap-2 px-5 py-4">
        <button
          onClick={onLanguageToggle}
          className="btn-ghost rounded-xl"
        >
          {t("switchLanguage")}
        </button>
      </div>

      <main className="relative z-[1] mx-auto grid min-h-screen max-w-6xl items-center gap-10 px-5 py-20 lg:grid-cols-[1.1fr_0.9fr]">
        {/* Brand hero side */}
        <section className="space-y-6 animate-fadeInUp">
          <img
            src="/midyaf-logo.png"
            alt={t("brand")}
            className="h-24 w-24 rounded-lg animate-float object-cover shadow-2xl ring-2 ring-midyaf-gold/50"
          />
          <div>
            <p className="text-sm font-bold text-shimmer animate-fadeInUp delay-200">
              {t("common.riyadhOnly")}
            </p>
            <h1 className="mt-3 text-4xl font-black tracking-tight text-midyaf-pearl animate-fadeInUp delay-300 lg:text-5xl">
              {t("heroTitle")}
            </h1>
            <p className="mt-4 max-w-xl text-sm leading-7 text-slate-500 animate-fadeInUp delay-400">
              {t("heroSubtitle")}
            </p>
          </div>

          {/* Feature highlights */}
          <div className="flex flex-wrap gap-3 animate-fadeInUp delay-500">
            {[
              { icon: Sparkles, label: isArabic ? 'تخطيط ذكي' : 'AI Planning' },
              { icon: Globe2, label: isArabic ? 'عمليات مباشرة' : 'Live Ops' },
              { icon: ShieldCheck, label: isArabic ? 'إطلاق العمليات' : 'Summit Launch' }
            ].map(({ icon: Ic, label }) => (
              <div key={label} className="flex items-center gap-2 rounded-xl bg-midyaf-purple/5 px-3.5 py-2 ring-1 ring-midyaf-purple/10">
                <Ic size={15} className="text-midyaf-pearl" />
                <span className="text-xs font-bold text-midyaf-pearl">{label}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Login card */}
        <form
          onSubmit={(event) => void handleSubmit(event)}
          className="login-card p-7 animate-fadeInUp delay-300"
        >
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-xl bg-[#121626] shadow-none">
              <ShieldCheck size={20} className="text-white" />
            </div>
            <div>
              <h2 className="text-xl font-black tracking-tight text-midyaf-pearl">
                {t("signIn")}
              </h2>
              <p className="text-xs text-slate-400">{t("signInSubtitle")}</p>
            </div>
          </div>

          <label className="mt-6 block m-label">
            <span>{t("email")}</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              className="m-input rounded-xl"
              placeholder="admin@midyaf.local"
            />
          </label>

          <label className="mt-4 block m-label">
            <span>{t("password")}</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              className="m-input rounded-xl"
              placeholder="••••••••"
            />
          </label>

          {error ? (
            <div className="mt-4 rounded-xl bg-red-50 p-3.5 text-sm font-bold text-red-600 ring-1 ring-red-100 animate-scaleIn">
              {error}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={isLoading}
            className="btn-primary mt-6 w-full rounded-xl py-3 text-sm"
          >
            {isLoading ? (
              <span className="flex items-center gap-2">
                <span className="inline-block size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                {t("signingIn")}
              </span>
            ) : t("signIn")}
          </button>

          {/* Executive Fast Access */}
          <div className="mt-6 border-t border-white/5 pt-5 dark:border-slate-800">
            <p className="text-xs font-bold uppercase tracking-wider text-midyaf-gold flex items-center gap-1.5">
              <ShieldCheck size={13} className="text-midyaf-gold" />
              <span>{isArabic ? "الدخول القيادي السريع" : "Executive Fast Access"}</span>
            </p>
            <div className="mt-2.5 grid grid-cols-2 sm:grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => void onLogin("admin@midyaf.local", "Midyaf@2026")}
                className="flex items-center gap-2.5 rounded-xl bg-midyaf-purple/5 p-2.5 text-left text-xs font-bold text-midyaf-pearl transition hover:bg-midyaf-purple/10 border border-midyaf-purple/10 dark:bg-white/5 dark:text-purple-300 dark:hover:bg-white/10 cursor-pointer"
              >
                <div className="grid size-7 shrink-0 place-items-center rounded-lg bg-midyaf-gold/15 text-midyaf-gold ring-1 ring-midyaf-gold/30">
                  <Crown size={14} />
                </div>
                <div className="truncate">
                  <p className="truncate text-xs font-black">{isArabic ? "مالك مضياف (الإدارة المالية)" : "Midyaf Owner (Admin)"}</p>
                  <p className="truncate text-xs text-slate-400">admin@midyaf.local</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => void onLogin("company@midyaf.local", "Midyaf@2026")}
                className="flex items-center gap-2.5 rounded-xl bg-sky-500/10 p-2.5 text-left text-xs font-bold text-sky-600 transition hover:bg-sky-500/15 border border-sky-500/15 dark:bg-sky-500/20 dark:text-sky-300 cursor-pointer"
              >
                <div className="grid size-7 shrink-0 place-items-center rounded-lg bg-sky-500/20 text-sky-500 ring-1 ring-sky-500/30">
                  <Building2 size={14} />
                </div>
                <div className="truncate">
                  <p className="truncate text-xs font-black">{isArabic ? "شركة صلة (المنظم)" : "Sila Organizer"}</p>
                  <p className="truncate text-xs text-slate-400">{isArabic ? "توليد لوحة العميل" : "Client Portal Gen"}</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => void onLogin("organizer@midyaf.local", "Midyaf@2026")}
                className="flex items-center gap-2.5 rounded-xl bg-indigo-500/10 p-2.5 text-left text-xs font-bold text-indigo-600 transition hover:bg-indigo-500/15 border border-indigo-500/15 dark:bg-indigo-500/20 dark:text-indigo-300 cursor-pointer"
              >
                <div className="grid size-7 shrink-0 place-items-center rounded-lg bg-indigo-500/20 text-indigo-500 ring-1 ring-indigo-500/30">
                  <Briefcase size={14} />
                </div>
                <div className="truncate">
                  <p className="truncate text-xs font-black">{isArabic ? "مدير اللوجستيات" : "Logistics Manager"}</p>
                  <p className="truncate text-xs text-slate-400">{isArabic ? "تقارير وتوجيه المهام" : "Ops & Task Relay"}</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => void onLogin("event.lead@sila.com", "Midyaf@2026")}
                className="flex items-center gap-2.5 rounded-xl bg-violet-500/10 p-2.5 text-left text-xs font-bold text-violet-600 transition hover:bg-violet-500/15 border border-violet-500/15 dark:bg-violet-500/20 dark:text-violet-300 cursor-pointer"
              >
                <div className="grid size-7 shrink-0 place-items-center rounded-lg bg-violet-500/20 text-violet-500 ring-1 ring-violet-500/30">
                  <Users size={14} />
                </div>
                <div className="truncate">
                  <p className="truncate text-xs font-black">{isArabic ? "مدير الفعالية / النشاط" : "Event / Activity Mgr"}</p>
                  <p className="truncate text-xs text-slate-400">{isArabic ? "بناء الفريق وتوزيع المهام" : "Team & Tasks"}</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => void onLogin("client.vip@tourism.gov.sa", "Midyaf@2026")}
                className="flex items-center gap-2.5 rounded-xl bg-teal-500/10 p-2.5 text-left text-xs font-bold text-teal-600 transition hover:bg-teal-500/15 border border-teal-500/15 dark:bg-teal-500/20 dark:text-teal-300 cursor-pointer"
              >
                <div className="grid size-7 shrink-0 place-items-center rounded-lg bg-teal-500/20 text-teal-500 ring-1 ring-teal-500/30">
                  <ShieldCheck size={14} />
                </div>
                <div className="truncate">
                  <p className="truncate text-xs font-black">{isArabic ? "بوابة العميل (السياحة)" : "Client Portal (VIP)"}</p>
                  <p className="truncate text-xs text-slate-400">{isArabic ? "متابعة وتقارير وتواصل" : "Reports & Comms"}</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => void onLogin("driver@midyaf.local", "Midyaf@2026")}
                className="flex items-center gap-2.5 rounded-xl bg-emerald-500/10 p-2.5 text-left text-xs font-bold text-emerald-600 transition hover:bg-emerald-500/15 border border-emerald-500/15 dark:bg-emerald-500/20 dark:text-emerald-300 cursor-pointer"
              >
                <div className="grid size-7 shrink-0 place-items-center rounded-lg bg-emerald-500/20 text-emerald-500 ring-1 ring-emerald-500/30">
                  <Car size={14} />
                </div>
                <div className="truncate">
                  <p className="truncate text-xs font-black">{isArabic ? "كابتن الأسطول" : "Fleet Captain"}</p>
                  <p className="truncate text-xs text-slate-400">{isArabic ? "فهد القحطاني" : "Fahad Al Qahtani"}</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => void onLogin("guest.vip@midyaf.local", "Midyaf@2026")}
                className="flex items-center gap-2.5 rounded-xl bg-amber-500/10 p-2.5 text-left text-xs font-bold text-amber-600 transition hover:bg-amber-500/15 border border-amber-500/15 dark:bg-amber-500/20 dark:text-amber-300 cursor-pointer"
              >
                <div className="grid size-7 shrink-0 place-items-center rounded-lg bg-amber-500/20 text-amber-500 ring-1 ring-amber-500/30">
                  <Star size={14} />
                </div>
                <div className="truncate">
                  <p className="truncate text-xs font-black">{isArabic ? "ضيف VIP" : "VIP Guest"}</p>
                  <p className="truncate text-xs text-slate-400">{isArabic ? "نورة الحربي" : "Noura Al Harbi"}</p>
                </div>
              </button>
            </div>
          </div>
        </form>
      </main>
    </div>
  );
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

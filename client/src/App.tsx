import { useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { io } from "socket.io-client";
import {
  Building2,
  Car,
  ClipboardList,
  Crown,
  Globe2,
  LayoutDashboard,
  Moon,
  ShieldCheck,
  Sparkles,
  Sun,
  Users
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PORTALS } from "@shared/constants";
import type {
  ActivityIntake,
  CoordinatorRequest,
  FileAsset,
  FileUploadInput,
  GuestJourney,
  MidyafData,
  PortalKey,
  Role,
  Session,
  TaskStatus
} from "@shared/domain";
import { Badge } from "./components/Badge";
import {
  ActivityIntakePage,
  CaptainsApp,
  CompanyDashboard,
  CoordinatorsApp,
  GuestJourneyApp,
  LogisticsDashboard
} from "./pages/OperationsPortals";
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
import {
  isArabicLanguage,
  localizeText,
  pickText
} from "./lib/localize";

const portalIcons: Record<PortalKey, LucideIcon> = {
  intake: ClipboardList,
  guest: Crown,
  captain: Car,
  coordinator: Users,
  logistics: LayoutDashboard,
  company: Building2
};

const sessionStorageKey = "midyaf.session";

const portalsByRole: Record<Role, PortalKey[]> = {
  GUEST: ["guest"],
  DRIVER: ["captain"],
  ORGANIZER: ["intake", "coordinator", "logistics", "company"],
  SUPPLIER: ["company"],
  SUPER_ADMIN: [...PORTALS],
  COORDINATOR: ["coordinator"],
  LOGISTICS_MANAGER: [...PORTALS],
  COMPANY_ORGANIZER: ["intake", "company"]
};

const platformLeaders = [
  {
    roleEn: "Founder & CEO",
    roleAr: "المؤسس والرئيس التنفيذي",
    nameEn: "Rashed Mohamed",
    nameAr: "راشد محمد"
  },
  {
    roleEn: "Developer & Quantitative Strategist",
    roleAr: "المطور والاستراتيجي الكمي",
    nameEn: "Mohamed Izeldin Al Shayghey",
    nameAr: "محمد عزالدين الشايقي"
  }
];

export function App() {
  const { t, i18n } = useTranslation();
  const isArabic = isArabicLanguage(i18n.language);
  const l = (value: string | number | null | undefined) =>
    localizeText(value, isArabic);
  const p = (english: string, arabic: string) =>
    pickText(isArabic, english, arabic);
  const [portal, setPortal] = useState<PortalKey>("logistics");
  const [data, setData] = useState<MidyafData | null>(null);
  const [session, setSession] = useState<Session | null>(() =>
    loadStoredSession()
  );
  const [isLoading, setIsLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [realtimeLog, setRealtimeLog] = useState<string[]>([]);
  const [darkMode, setDarkMode] = useState(() => {
    const stored = window.localStorage.getItem("midyaf.theme");
    if (stored) return stored === "dark";
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });
  const allowedPortals = session ? portalsByRole[session.user.role] : [];
  const eventId = data?.events[0]?.id;

  useEffect(() => {
    document.documentElement.lang = i18n.language;
    document.documentElement.dir = i18n.language === "ar" ? "rtl" : "ltr";
  }, [i18n.language]);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", darkMode ? "dark" : "light");
    window.localStorage.setItem("midyaf.theme", darkMode ? "dark" : "light");
  }, [darkMode]);

  useEffect(() => {
    if (!session) {
      setData(null);
      return;
    }

    setPortal((current) =>
      portalsByRole[session.user.role].includes(current)
        ? current
        : portalsByRole[session.user.role][0]
    );
    void loadSessionData(session);
  }, [session?.accessToken]);

  useEffect(() => {
    if (!session || !data) {
      return;
    }

    const socket = io({
      autoConnect: true,
      transports: ["websocket", "polling"]
    });

    socket.on("connect", () => {
      if (eventId) {
        socket.emit("event:join", eventId);
      }

      if (session.user.id) {
        socket.emit("user:join", session.user.id);
      }

      if (portal === "logistics" || portal === "coordinator") {
        socket.emit("organizer:join");
      }
    });

    socket.on("driver:location_update", (payload) => {
      setRealtimeLog((current) => [
        `${p("Driver location updated", "تم تحديث موقع السائق")} · ${new Date().toLocaleTimeString(
          isArabic ? "ar-SA" : "en-SA"
        )}`,
        ...current.slice(0, 4)
      ]);
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
    });

    socket.on("user:location_update", (payload) => {
      setRealtimeLog((current) => [
        `${p("User GPS location updated", "تم تحديث موقع المستخدم GPS")} · ${new Date().toLocaleTimeString(
          isArabic ? "ar-SA" : "en-SA"
        )}`,
        ...current.slice(0, 4)
      ]);
      if (payload.driverId) {
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
      }
    });

    socket.on("rider:update", () => {
      setRealtimeLog((current) => [
        `${p("VIP Hospitality Rider updated", "تم تحديث رايدر الضيافة VIP")} · ${new Date().toLocaleTimeString(
          isArabic ? "ar-SA" : "en-SA"
        )}`,
        ...current.slice(0, 4)
      ]);
      void refreshData();
    });

    socket.on("task:status_change", (payload) => {
      setRealtimeLog((current) => [
        `${p("Task status changed", "تم تحديث حالة المهمة")} · ${l(
          payload.status
        )}`,
        ...current.slice(0, 4)
      ]);
      updateTaskInState(payload.taskId, payload.status);
    });

    socket.on("guest:arrived", (payload) => {
      setRealtimeLog((current) => [
        `${p("Guest arrived", "وصل الضيف")} · ${l(
          payload.guestName ?? payload.guestId
        )}`,
        ...current.slice(0, 4)
      ]);
    });

    socket.on("alert:delay", (payload) => {
      setRealtimeLog((current) => [
        `${p("Delay alert", "تنبيه تأخير")} · ${payload.taskId}`,
        ...current.slice(0, 4)
      ]);
      updateTaskInState(payload.taskId, "DELAYED");
    });

    return () => {
      socket.disconnect();
    };
  }, [eventId, portal, session?.user.id, data]);

  const portalProps = useMemo(
    () => ({
      data: data as MidyafData,
      session: session ?? undefined,
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
    [data, session]
  );

  if (!session) {
    return (
      <LoginPage
        isArabic={isArabic}
        darkMode={darkMode}
        error={authError}
        isLoading={isLoading}
        onDarkModeToggle={() => setDarkMode((v) => !v)}
        onLanguageToggle={() =>
          void i18n.changeLanguage(i18n.language === "ar" ? "en" : "ar")
        }
        onLogin={handleLogin}
      />
    );
  }

  if (!data || isLoading) {
    return (
      <ShellFrame
        isArabic={isArabic}
        darkMode={darkMode}
        session={session}
        allowedPortals={allowedPortals}
        portal={portal}
        setPortal={setPortal}
        onDarkModeToggle={() => setDarkMode((v) => !v)}
        onLanguageToggle={() =>
          void i18n.changeLanguage(i18n.language === "ar" ? "en" : "ar")
        }
        onLogout={handleLogout}
      >
        <div className="glass-card rounded-xl p-8 text-center animate-fadeInUp">
          <div className="skeleton mx-auto h-4 w-48 rounded-lg" />
          <p className="mt-4 text-sm font-semibold text-slate-500">
            {loadError ?? t("loadingWorkspace")}
          </p>
        </div>
      </ShellFrame>
    );
  }

  return (
    <ShellFrame
      isArabic={isArabic}
      darkMode={darkMode}
      session={session}
      allowedPortals={allowedPortals}
      portal={portal}
      setPortal={setPortal}
      realtimeLog={realtimeLog}
      onDarkModeToggle={() => setDarkMode((v) => !v)}
      onLanguageToggle={() =>
        void i18n.changeLanguage(i18n.language === "ar" ? "en" : "ar")
      }
      onLogout={handleLogout}
    >
      {renderPortal(portal, portalProps)}
    </ShellFrame>
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

    try {
      setData(await getBootstrap(activeSession.accessToken));
    } catch (error) {
      setData(null);
      setLoadError(
        error instanceof Error ? error.message : t("workspaceLoadFailed")
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function refreshData() {
    const activeSession = requireSession();
    setData(await getBootstrap(activeSession.accessToken));
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

    await apiFetch("/tasks", activeSession.accessToken, {
      method: "POST",
      body: JSON.stringify(task)
    });
    await refreshData();
  }

  async function assignTask(taskId: string, assignment: TaskAssignmentInput) {
    const activeSession = requireSession();

    await apiFetch(`/tasks/${taskId}/assignment`, activeSession.accessToken, {
      method: "PUT",
      body: JSON.stringify(assignment)
    });
    await refreshData();
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

    await apiFetch(
      intake.id ? `/activity-intakes/${intake.id}` : "/activity-intakes",
      activeSession.accessToken,
      {
        method: intake.id ? "PUT" : "POST",
        body: JSON.stringify(payload)
      }
    );
    await refreshData();
  }

  async function analyzeActivityIntake(intakeId: string) {
    const activeSession = requireSession();

    await apiFetch(
      `/activity-intakes/${intakeId}/analyze`,
      activeSession.accessToken,
      { method: "POST" }
    );
    await refreshData();
  }

  async function confirmAiPlan(planId: string) {
    const activeSession = requireSession();

    await apiFetch(`/ai-plans/${planId}/confirm`, activeSession.accessToken, {
      method: "PUT"
    });
    await refreshData();
  }

  async function approveVendorQuote(quoteId: string) {
    const activeSession = requireSession();

    await apiFetch(`/vendor-quotes/${quoteId}/approve`, activeSession.accessToken, {
      method: "PUT"
    });
    await refreshData();
  }

  async function approveContract(contractId: string) {
    const activeSession = requireSession();

    await apiFetch(`/contracts/${contractId}/approve`, activeSession.accessToken, {
      method: "PUT"
    });
    await refreshData();
  }

  async function updateGuestJourney(
    journeyId: string,
    updates: Partial<GuestJourney>
  ) {
    const activeSession = requireSession();

    await apiFetch(`/guest-journeys/${journeyId}`, activeSession.accessToken, {
      method: "PUT",
      body: JSON.stringify(updates)
    });
    await refreshData();
  }

  async function createCoordinatorRequest(request: CoordinatorRequestInput) {
    const activeSession = requireSession();

    await apiFetch("/coordinator-requests", activeSession.accessToken, {
      method: "POST",
      body: JSON.stringify(request)
    });
    await refreshData();
  }

  async function updateCoordinatorRequest(
    requestId: string,
    updates: Partial<CoordinatorRequest>
  ) {
    const activeSession = requireSession();

    await apiFetch(`/coordinator-requests/${requestId}`, activeSession.accessToken, {
      method: "PUT",
      body: JSON.stringify(updates)
    });
    await refreshData();
  }

  async function confirmCompanyReport(reportId: string) {
    const activeSession = requireSession();

    await apiFetch(`/company-reports/${reportId}/confirm`, activeSession.accessToken, {
      method: "PUT"
    });
    await refreshData();
  }

  async function updateTaskStatus(taskId: string, status: TaskStatus) {
    const activeSession = requireSession();

    updateTaskInState(taskId, status);

    await apiFetch(`/tasks/${taskId}/status`, activeSession.accessToken, {
      method: "PUT",
      body: JSON.stringify({ status })
    });
    await refreshData();
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

function ShellFrame({
  children,
  isArabic,
  darkMode,
  session,
  allowedPortals,
  portal,
  setPortal,
  realtimeLog = [],
  onDarkModeToggle,
  onLanguageToggle,
  onLogout
}: {
  children: ReactNode;
  isArabic: boolean;
  darkMode: boolean;
  session: Session;
  allowedPortals: PortalKey[];
  portal: PortalKey;
  setPortal: (portal: PortalKey) => void;
  realtimeLog?: string[];
  onDarkModeToggle: () => void;
  onLanguageToggle: () => void;
  onLogout: () => void;
}) {
  const { t } = useTranslation();
  const l = (value: string | number | null | undefined) =>
    localizeText(value, isArabic);
  const initials = session.user.name
    .split(" ")
    .map((w: string) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div
      className={
        isArabic
          ? "min-h-screen font-arabic text-midyaf-ink"
          : "min-h-screen font-english text-midyaf-ink"
      }
      style={{ background: "var(--m-pearl)" }}
    >
      <header className="sticky top-0 z-30 glass" style={{ borderBottom: 'none' }}>
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-5 py-3.5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3.5">
            <img
              src="/midyaf-icon.png"
              alt={t("brand")}
              className="size-11 rounded-xl object-cover shadow-card-sm ring-2 ring-midyaf-gold/20"
            />
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-black tracking-tight text-midyaf-purple">
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
            <button
              onClick={onDarkModeToggle}
              className="btn-ghost rounded-xl px-2.5 py-2"
              aria-label="Toggle dark mode"
            >
              {darkMode ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <button
              onClick={onLanguageToggle}
              className="btn-ghost rounded-xl"
            >
              {t("switchLanguage")}
            </button>
            <div className="flex items-center gap-2.5 rounded-xl bg-midyaf-purple/5 px-3 py-2">
              <div className="grid size-8 place-items-center rounded-lg bg-gradient-to-br from-midyaf-purple to-midyaf-purple-dark text-xs font-black text-white shadow-sm">
                {initials}
              </div>
              <span className="text-sm font-bold">
                {l(session.user.name)}
              </span>
            </div>
            <button
              onClick={onLogout}
              className="btn-primary rounded-xl px-3.5 py-2 text-xs"
            >
              {t("logout")}
            </button>
          </div>
        </div>

        <nav className="mx-auto flex max-w-7xl gap-2 overflow-x-auto px-5 pb-3">
          {allowedPortals.map((item) => {
            const Icon = portalIcons[item];
            const active = portal === item;

            return (
              <button
                key={item}
                onClick={() => setPortal(item)}
                className={
                  active
                    ? "flex min-w-fit items-center gap-2 rounded-xl bg-gradient-to-r from-midyaf-purple to-midyaf-purple-dark px-4 py-2.5 text-sm font-bold text-white shadow-glow-purple transition-all duration-300"
                    : "flex min-w-fit items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-500 transition-all duration-300 hover:bg-midyaf-purple/5 hover:text-midyaf-purple"
                }
              >
                <Icon size={16} />
                {t(`portals.${item}`)}
              </button>
            );
          })}
        </nav>
        <div className="accent-line-gold" />
      </header>

      <main className="mx-auto max-w-7xl px-5 py-6">
        <section className="mb-6 glass-card rounded-xl p-5 pattern-arabesque animate-fadeInUp">
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
            <div>
              <p className="text-sm font-bold text-shimmer">
                {t("common.riyadhOnly")}
              </p>
              <h2 className="mt-1.5 text-2xl font-black tracking-tight text-midyaf-purple">
                {t("heroTitle")}
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">
                {t("heroSubtitle")}
              </p>
              <PlatformLeadership isArabic={isArabic} />
            </div>
            <div className="rounded-xl bg-midyaf-purple/5 p-4 text-xs text-slate-600 ring-1 ring-midyaf-purple/10">
              <div className="flex items-center gap-2">
                <span className="live-dot" />
                <p className="font-bold text-midyaf-purple">
                  {l("Realtime operations")}
                </p>
              </div>
              <div className="mt-2 space-y-1">
                {realtimeLog.length ? (
                  realtimeLog.map((item, i) => (
                    <p key={item} className="animate-fadeInUp" style={{ animationDelay: `${i * 75}ms` }}>{item}</p>
                  ))
                ) : (
                  <p className="text-slate-400">
                    {l(
                      "Socket.IO waiting for driver, task, guest, and delay events"
                    )}
                  </p>
                )}
              </div>
            </div>
          </div>
        </section>

        {children}
      </main>
    </div>
  );
}

function LoginPage({
  isArabic,
  darkMode,
  error,
  isLoading,
  onDarkModeToggle,
  onLanguageToggle,
  onLogin
}: {
  isArabic: boolean;
  darkMode: boolean;
  error: string | null;
  isLoading: boolean;
  onDarkModeToggle: () => void;
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
          ? "min-h-screen login-bg font-arabic text-midyaf-ink"
          : "min-h-screen login-bg font-english text-midyaf-ink"
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
          onClick={onDarkModeToggle}
          className="btn-ghost rounded-xl px-2.5 py-2"
          aria-label="Toggle dark mode"
        >
          {darkMode ? <Sun size={18} /> : <Moon size={18} />}
        </button>
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
            className="h-20 w-auto animate-float object-contain drop-shadow-lg"
          />
          <div>
            <p className="text-sm font-bold text-shimmer animate-fadeInUp delay-200">
              {t("common.riyadhOnly")}
            </p>
            <h1 className="mt-3 text-4xl font-black tracking-tight text-midyaf-purple animate-fadeInUp delay-300 lg:text-5xl">
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
              { icon: ShieldCheck, label: isArabic ? 'إطلاق الرياض' : 'Riyadh Launch' }
            ].map(({ icon: Ic, label }) => (
              <div key={label} className="flex items-center gap-2 rounded-xl bg-midyaf-purple/5 px-3.5 py-2 ring-1 ring-midyaf-purple/10">
                <Ic size={15} className="text-midyaf-purple" />
                <span className="text-xs font-bold text-midyaf-purple">{label}</span>
              </div>
            ))}
          </div>

          <PlatformLeadership isArabic={isArabic} elevated />
        </section>

        {/* Login card */}
        <form
          onSubmit={(event) => void handleSubmit(event)}
          className="login-card p-7 animate-fadeInUp delay-300"
        >
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-xl bg-gradient-to-br from-midyaf-purple to-midyaf-purple-dark shadow-glow-purple">
              <ShieldCheck size={20} className="text-white" />
            </div>
            <div>
              <h2 className="text-xl font-black tracking-tight text-midyaf-purple">
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
              placeholder="name@midyaf.local"
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
        </form>
      </main>
    </div>
  );
}

function PlatformLeadership({
  isArabic,
  elevated = false
}: {
  isArabic: boolean;
  elevated?: boolean;
}) {
  return (
    <div
      className={
        elevated
          ? "mt-5 grid gap-3 rounded-xl bg-white/75 p-4 shadow-card-sm ring-1 ring-midyaf-gold/20 sm:grid-cols-2"
          : "mt-4 grid gap-2 sm:grid-cols-2"
      }
    >
      {platformLeaders.map((leader) => (
        <div
          key={leader.nameEn}
          className={
            elevated
              ? "rounded-lg bg-midyaf-purple/5 p-3"
              : "rounded-lg bg-midyaf-purple/5 px-3 py-2 ring-1 ring-midyaf-purple/10"
          }
        >
          <p className="text-[11px] font-bold uppercase tracking-wide text-midyaf-gold">
            {isArabic ? leader.roleAr : leader.roleEn}
          </p>
          <p className="mt-1 text-sm font-black text-midyaf-purple">
            {isArabic ? leader.nameAr : leader.nameEn}
          </p>
        </div>
      ))}
    </div>
  );
}

function renderPortal(
  portal: PortalKey,
  props: PortalProps
) {
  switch (portal) {
    case "guest":
      return <GuestJourneyApp {...props} />;
    case "captain":
      return <CaptainsApp {...props} />;
    case "coordinator":
      return <CoordinatorsApp {...props} />;
    case "logistics":
      return <LogisticsDashboard {...props} />;
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

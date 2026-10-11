import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeftRight, History, Undo2, UserRoundCheck } from "lucide-react";
import type {
  MidyafData,
  Role,
  Session,
  Task,
  TaskHandoverEntry,
  TaskPerson
} from "@shared/domain";
import { ApiError, apiFetch } from "../lib/api";
import { shortDate, shortTime } from "../lib/format";
import { createRequestGeneration } from "../lib/requestGeneration";
import { Badge, Button, Dialog, EmptyState, Field, Select, Surface, Textarea, useToast } from "./ui";

/**
 * OPS-COLLAB-001: operations staff delegate a task to someone else (they stay
 * accountable), transfer it for good, or hand a delegated task back. The
 * server decides who may do what; this UI only offers the likely actions.
 */

export const HANDOVER_ROLES: Role[] = ["LOGISTICS_MANAGER", "SUPER_ADMIN", "ORGANIZER", "COORDINATOR"];

export type HandoverMode = "DELEGATE" | "TRANSFER";

export type HandoverDraft = { mode: HandoverMode; toUserId: string; reason: string };

export function canUseHandover(session: Session | null | undefined) {
  return Boolean(session && HANDOVER_ROLES.includes(session.user.role));
}

/** Client-side hint of the server's rules (utils/taskDelegation.ts). */
export function handoverOptions(
  task: Pick<Task, "status" | "responsibleUserId" | "delegateUserId">,
  me: { id: string; role: Role },
  eventOrganizerId?: string
) {
  const closed = task.status === "COMPLETED" || task.status === "CANCELLED";
  // Organizers act only on their own events, whatever the task stores.
  const foreignEvent = me.role === "ORGANIZER" && eventOrganizerId !== me.id;
  if (closed || foreignEvent || !HANDOVER_ROLES.includes(me.role)) {
    return { modes: [] as HandoverMode[], canReturn: false, closed };
  }
  const manages =
    me.role === "LOGISTICS_MANAGER" ||
    me.role === "SUPER_ADMIN" ||
    (me.role === "ORGANIZER" && eventOrganizerId === me.id);
  const responsible = task.responsibleUserId === me.id;
  const delegate = task.delegateUserId === me.id;
  const modes: HandoverMode[] = [];
  if (manages || responsible || delegate) modes.push("DELEGATE");
  if (manages || responsible) modes.push("TRANSFER");
  return {
    modes,
    canReturn: Boolean(task.delegateUserId) && (manages || responsible || delegate),
    closed
  };
}

export function validateHandoverDraft(draft: HandoverDraft, isArabic: boolean) {
  if (!draft.toUserId) return isArabic ? "اختر الشخص المستلم" : "Choose who takes the task";
  if (draft.reason.trim().length > 500) {
    return isArabic ? "السبب أطول من 500 حرف" : "The reason is longer than 500 characters";
  }
  return null;
}

export function handoverErrorMessage(error: unknown, isArabic: boolean) {
  const status = error instanceof ApiError ? error.status : 0;
  if (status === 403 || status === 404) {
    return isArabic ? "لا تملك صلاحية تسليم هذه المهمة" : "You cannot hand over this task";
  }
  if (status === 409) {
    return isArabic
      ? "تغيرت المهمة أو أُغلقت. حدّث الصفحة وحاول مجدداً"
      : "The task changed or is closed. Refresh and try again";
  }
  if (status === 400) {
    return isArabic ? "هذا الشخص لا يمكنه استلام المهمة" : "This person cannot take the task";
  }
  return isArabic ? "تعذر حفظ التسليم. حاول مجدداً" : "The handover could not be saved. Try again";
}

const ROLE_LABELS: Record<string, { en: string; ar: string }> = {
  LOGISTICS_MANAGER: { en: "Logistics manager", ar: "مدير اللوجستيات" },
  SUPER_ADMIN: { en: "Administrator", ar: "مدير النظام" },
  ORGANIZER: { en: "Event manager", ar: "مدير الفعالية" },
  COORDINATOR: { en: "Coordinator", ar: "منسق" }
};

export function personLabel(person: TaskPerson, isArabic: boolean) {
  const role = ROLE_LABELS[person.role];
  return role ? `${person.name} · ${isArabic ? role.ar : role.en}` : person.name;
}

const KIND_LABELS = {
  DELEGATE: { en: "Delegated", ar: "تفويض" },
  TRANSFER: { en: "Transferred", ar: "نقل المسؤولية" },
  RETURN: { en: "Returned", ar: "إعادة" }
} as const;

/** "Responsible" and "acting" people on a task card. */
export function ResponsibilityBadges({ task, isArabic }: { task: Task; isArabic: boolean }) {
  if (!task.responsibleUser && !task.delegateUser) return null;
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {task.responsibleUser ? (
        <Badge tone="neutral">
          <UserRoundCheck className="size-3" aria-hidden />
          {isArabic ? "المسؤول" : "Responsible"}: {task.responsibleUser.name}
        </Badge>
      ) : null}
      {task.delegateUser ? (
        <Badge tone="gold">
          <ArrowLeftRight className="size-3" aria-hidden />
          {isArabic ? "مفوَّض إلى" : "Delegated to"}: {task.delegateUser.name}
        </Badge>
      ) : null}
    </span>
  );
}

export function HandoverHistory({
  entries,
  isArabic
}: {
  entries: TaskHandoverEntry[];
  isArabic: boolean;
}) {
  if (!entries.length) {
    return (
      <p className="text-xs text-ink-faint">
        {isArabic ? "لم تُسلَّم هذه المهمة من قبل" : "This task has not been handed over yet"}
      </p>
    );
  }
  const locale = isArabic ? "ar" : "en";
  return (
    <ol className="space-y-2">
      {entries.map((entry) => (
        <li key={entry.id} className="rounded-lg border border-hairline bg-surface-1 px-3 py-2 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={entry.kind === "TRANSFER" ? "info" : entry.kind === "RETURN" ? "neutral" : "gold"}>
              {isArabic ? KIND_LABELS[entry.kind].ar : KIND_LABELS[entry.kind].en}
            </Badge>
            <span className="text-ink">
              {entry.fromUser?.name ?? (isArabic ? "غير محدد" : "Unassigned")} →{" "}
              {entry.toUser?.name ?? (isArabic ? "غير محدد" : "Unassigned")}
            </span>
            <span className="ms-auto font-tnum text-ink-faint">
              {shortDate(entry.createdAt, locale)} {shortTime(entry.createdAt, locale)}
            </span>
          </div>
          <p className="mt-1 text-ink-muted">
            {isArabic ? "بواسطة" : "By"} {entry.actor.name}
            {entry.reason ? ` · ${entry.reason}` : ""}
          </p>
        </li>
      ))}
    </ol>
  );
}

/** Presentational form; the dialog below owns loading and submission. */
export function HandoverForm({
  task,
  draft,
  candidates,
  modes,
  canReturn,
  pending,
  error,
  isArabic,
  onChange,
  onSubmit,
  onReturn
}: {
  task: Task;
  draft: HandoverDraft;
  candidates: TaskPerson[];
  modes: HandoverMode[];
  canReturn: boolean;
  pending: boolean;
  error: string | null;
  isArabic: boolean;
  onChange: (draft: HandoverDraft) => void;
  onSubmit: () => void;
  onReturn: () => void;
}) {
  const recipients = candidates.filter((person) =>
    draft.mode === "TRANSFER"
      ? person.id !== task.responsibleUserId || Boolean(task.delegateUserId)
      : person.id !== task.delegateUserId
  );

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <ResponsibilityBadges task={task} isArabic={isArabic} />
      {modes.length ? (
        <>
          <div role="radiogroup" aria-label={isArabic ? "نوع التسليم" : "Handover type"} className="grid gap-2 sm:grid-cols-2">
            {modes.map((mode) => (
              <label
                key={mode}
                className={`flex cursor-pointer flex-col gap-1 rounded-lg border px-3 py-2 text-sm ${
                  draft.mode === mode ? "border-gold-500/60 bg-gold-500/10" : "border-hairline bg-surface-1"
                }`}
              >
                <span className="flex items-center gap-2 font-semibold text-ink">
                  <input
                    type="radio"
                    name="handover-mode"
                    value={mode}
                    checked={draft.mode === mode}
                    onChange={() => onChange({ ...draft, mode })}
                  />
                  {mode === "DELEGATE"
                    ? isArabic
                      ? "تفويض مؤقت"
                      : "Delegate"
                    : isArabic
                      ? "نقل المسؤولية"
                      : "Transfer"}
                </span>
                <span className="text-xs text-ink-muted">
                  {mode === "DELEGATE"
                    ? isArabic
                      ? "شخص آخر ينفذ المهمة ويبقى المسؤول الحالي محاسباً عليها"
                      : "Someone else acts on it; the responsible person stays accountable"
                    : isArabic
                      ? "تنتقل المسؤولية بالكامل إلى شخص آخر"
                      : "Responsibility moves to someone else for good"}
                </span>
              </label>
            ))}
          </div>
          <Field label={isArabic ? "إلى" : "Hand to"} required>
            <Select
              value={draft.toUserId}
              placeholder={isArabic ? "اختر شخصاً" : "Choose a person"}
              options={recipients.map((person) => ({
                value: person.id,
                label: personLabel(person, isArabic)
              }))}
              onChange={(event) => onChange({ ...draft, toUserId: event.target.value })}
            />
          </Field>
          <Field
            label={isArabic ? "السبب (اختياري)" : "Reason (optional)"}
            hint={isArabic ? "يظهر في سجل التسليم" : "Shown in the handover history"}
          >
            <Textarea
              rows={2}
              maxLength={500}
              value={draft.reason}
              onChange={(event) => onChange({ ...draft, reason: event.target.value })}
            />
          </Field>
        </>
      ) : (
        <p className="text-sm text-ink-muted">
          {isArabic
            ? "لا يمكنك تفويض هذه المهمة أو نقلها"
            : "You cannot delegate or transfer this task"}
        </p>
      )}
      {error ? (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center justify-end gap-2">
        {canReturn ? (
          <Button
            variant="ghost"
            onClick={onReturn}
            disabled={pending}
            leadingIcon={<Undo2 className="size-4" aria-hidden />}
          >
            {isArabic ? "إعادة المهمة للمسؤول" : "Return to responsible"}
          </Button>
        ) : null}
        {modes.length ? (
          <Button type="submit" variant="gold" loading={pending}>
            {draft.mode === "DELEGATE"
              ? isArabic
                ? "تفويض المهمة"
                : "Delegate task"
              : isArabic
                ? "نقل المهمة"
                : "Transfer task"}
          </Button>
        ) : null}
      </div>
    </form>
  );
}

export type HandoverApi = {
  candidates: (eventId: string) => Promise<TaskPerson[]>;
  history: (taskId: string) => Promise<TaskHandoverEntry[]>;
  submit: (path: string, body: unknown) => Promise<void>;
};

/**
 * Async rules of the handover dialog, independent of React: people and
 * history belong to the task (and session) the dialog was opened for, and a
 * submission finished after the dialog moved on must not close or annotate
 * the next one.
 */
export function createHandoverController(
  api: HandoverApi,
  on: { loaded: (candidates: TaskPerson[], history: TaskHandoverEntry[]) => void; failed: () => void }
) {
  const scope = createRequestGeneration();

  async function open(task: { id: string; eventId: string }) {
    const current = scope.begin();
    try {
      const [people, log] = await Promise.all([api.candidates(task.eventId), api.history(task.id)]);
      if (current()) on.loaded(people, log);
    } catch {
      if (current()) on.failed();
    }
  }

  /** `current` is false when the dialog closed or moved to another task meanwhile. */
  async function submit(
    path: string,
    body: unknown
  ): Promise<{ ok: true; current: boolean } | { ok: false; current: boolean; error: unknown }> {
    const current = scope.capture();
    try {
      await api.submit(path, body);
      return { ok: true, current: current() };
    } catch (error) {
      return { ok: false, current: current(), error };
    }
  }

  return { open, submit, capture: () => scope.capture(), close: () => scope.invalidate() };
}

export type HandoverSubmitEffects = {
  /** Success toast and closing the dialog. */
  succeeded: () => void;
  failed: (error: unknown) => void;
  /** Clears the pending state. */
  settled: () => void;
  /** Reloads the caller's data; its own failures are reported elsewhere. */
  refresh: () => Promise<void> | void;
};

/**
 * Runs one dialog submission. Every visible effect (toast, close, error,
 * pending reset and the data refresh) happens only if the dialog is still on
 * the same task in the same session. After a close, task switch, logout or
 * unmount the outcome is dropped; the next open loads fresh history.
 */
export async function runHandoverSubmit(
  controller: Pick<ReturnType<typeof createHandoverController>, "submit" | "capture">,
  path: string,
  body: unknown,
  effects: HandoverSubmitEffects
) {
  const isCurrent = controller.capture();
  const result = await controller.submit(path, body);
  if (!result.current || !isCurrent()) return result;
  if (result.ok) {
    effects.succeeded();
    effects.settled();
    try {
      await effects.refresh();
    } catch {
      // The refresh reports its own failures; the handover itself succeeded.
    }
  } else {
    effects.failed(result.error);
    effects.settled();
  }
  return result;
}

export function TaskHandoverDialog({
  task,
  session,
  eventOrganizerId,
  isArabic,
  open,
  onOpenChange,
  onChanged
}: {
  task: Task | null;
  session: Session;
  eventOrganizerId?: string;
  isArabic: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged: () => Promise<void> | void;
}) {
  const toast = useToast();
  const [candidates, setCandidates] = useState<TaskPerson[]>([]);
  const [history, setHistory] = useState<TaskHandoverEntry[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const options = useMemo(
    () =>
      task ? handoverOptions(task, session.user, eventOrganizerId) : { modes: [], canReturn: false, closed: false },
    [task, session.user, eventOrganizerId]
  );
  const [draft, setDraft] = useState<HandoverDraft>({ mode: "DELEGATE", toUserId: "", reason: "" });
  const tokenRef = useRef(session.accessToken);
  tokenRef.current = session.accessToken;
  const isArabicRef = useRef(isArabic);
  isArabicRef.current = isArabic;

  const [controller] = useState(() =>
    createHandoverController(
      {
        candidates: async (eventId) =>
          (
            await apiFetch<{ candidates: TaskPerson[] }>(
              `/tasks/handover-candidates?eventId=${encodeURIComponent(eventId)}`,
              tokenRef.current
            )
          ).candidates,
        history: async (taskId) =>
          (
            await apiFetch<{ handovers: TaskHandoverEntry[] }>(
              `/tasks/${encodeURIComponent(taskId)}/handovers`,
              tokenRef.current
            )
          ).handovers,
        submit: async (path, body) => {
          await apiFetch(path, tokenRef.current, { method: "POST", body: JSON.stringify(body) });
        }
      },
      {
        loaded: (people, log) => {
          setCandidates(people);
          setHistory(log);
        },
        failed: () =>
          setLoadError(isArabicRef.current ? "تعذر تحميل قائمة الأشخاص" : "Could not load the people list")
      }
    )
  );

  useEffect(() => {
    // Never show the previous task's people or history, even briefly.
    setCandidates([]);
    setHistory([]);
    setPending(false);
    if (!open || !task) {
      controller.close();
      return;
    }
    setDraft({ mode: options.modes[0] ?? "DELEGATE", toUserId: "", reason: "" });
    setError(null);
    setLoadError(null);
    void controller.open(task);
    // Closing, switching task, signing out or unmounting ends this scope.
    return () => controller.close();
  }, [open, task?.id, session.accessToken, controller]);

  async function submit(path: string, body: unknown, success: string) {
    setPending(true);
    setError(null);
    await runHandoverSubmit(controller, path, body, {
      succeeded: () => {
        toast.success(success);
        onOpenChange(false);
      },
      failed: (failure) => setError(handoverErrorMessage(failure, isArabic)),
      settled: () => setPending(false),
      refresh: onChanged
    });
  }

  if (!task) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={isArabic ? "تسليم المهمة" : "Hand over task"}
      description={`${task.pickupLocation} → ${task.dropoffLocation}`}
      closeLabel={isArabic ? "إغلاق" : "Close"}
    >
      <div className="space-y-5">
        {loadError ? (
          <p role="alert" className="text-sm text-danger">
            {loadError}
          </p>
        ) : null}
        <HandoverForm
          task={task}
          draft={draft}
          candidates={candidates}
          modes={options.modes}
          canReturn={options.canReturn}
          pending={pending}
          error={error}
          isArabic={isArabic}
          onChange={setDraft}
          onSubmit={() => {
            const invalid = validateHandoverDraft(draft, isArabic);
            if (invalid) {
              setError(invalid);
              return;
            }
            void submit(
              `/tasks/${encodeURIComponent(task.id)}/handover`,
              {
                mode: draft.mode,
                toUserId: draft.toUserId,
                ...(draft.reason.trim() ? { reason: draft.reason.trim() } : {})
              },
              draft.mode === "DELEGATE"
                ? isArabic
                  ? "تم تفويض المهمة"
                  : "Task delegated"
                : isArabic
                  ? "تم نقل المسؤولية"
                  : "Task transferred"
            );
          }}
          onReturn={() =>
            void submit(
              `/tasks/${encodeURIComponent(task.id)}/handover/return`,
              draft.reason.trim() ? { reason: draft.reason.trim() } : {},
              isArabic ? "أُعيدت المهمة للمسؤول" : "Task returned"
            )
          }
        />
        <div>
          <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-label text-ink-muted">
            <History className="size-3.5" aria-hidden />
            {isArabic ? "سجل التسليم" : "Handover history"}
          </h3>
          <HandoverHistory entries={history} isArabic={isArabic} />
        </div>
      </div>
    </Dialog>
  );
}

/** Open tasks where the signed-in user is responsible or the delegate. */
export function myHandoverTasks(data: MidyafData, userId: string) {
  return data.events.flatMap((event) =>
    (event.tasks ?? [])
      .filter(
        (task) =>
          (task.responsibleUserId === userId || task.delegateUserId === userId) &&
          task.status !== "COMPLETED" &&
          task.status !== "CANCELLED"
      )
      .map((task) => ({ task, organizerId: event.organizerId }))
  );
}

export function MyHandoverTasks({
  data,
  session,
  isArabic,
  onChanged
}: {
  data: MidyafData;
  session: Session;
  isArabic: boolean;
  onChanged: () => Promise<void> | void;
}) {
  const mine = useMemo(() => myHandoverTasks(data, session.user.id), [data, session.user.id]);
  const [selected, setSelected] = useState<{ task: Task; organizerId?: string } | null>(null);

  return (
    <section className="rounded-lg border border-hairline bg-surface-2 p-5">
      <h2 className="mb-3 text-base font-bold text-ink">
        {isArabic ? "المهام المسندة إليّ" : "Tasks handed to me"}
      </h2>
      <MyHandoverTaskList
        items={mine}
        me={session.user.id}
        isArabic={isArabic}
        onOpen={(item) => setSelected(item)}
      />
      <TaskHandoverDialog
        task={selected?.task ?? null}
        eventOrganizerId={selected?.organizerId}
        session={session}
        isArabic={isArabic}
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
        onChanged={onChanged}
      />
    </section>
  );
}

export function MyHandoverTaskList({
  items,
  me,
  isArabic,
  onOpen
}: {
  items: Array<{ task: Task; organizerId?: string }>;
  me: string;
  isArabic: boolean;
  onOpen: (item: { task: Task; organizerId?: string }) => void;
}) {
  if (!items.length) {
    return (
      <EmptyState
        compact
        title={isArabic ? "لا توجد مهام مسندة إليك" : "No tasks are handed to you"}
        description={
          isArabic
            ? "عندما يفوّض أحد مهمة إليك أو ينقلها ستظهر هنا"
            : "When someone delegates or transfers a task to you, it appears here"
        }
      />
    );
  }
  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li key={item.task.id}>
          <Surface padding="sm" className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink">
                {item.task.pickupLocation} → {item.task.dropoffLocation}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                <Badge tone={item.task.delegateUserId === me ? "gold" : "info"}>
                  {item.task.delegateUserId === me
                    ? isArabic
                      ? "مفوَّضة إليك"
                      : "Delegated to you"
                    : isArabic
                      ? "أنت المسؤول"
                      : "You are responsible"}
                </Badge>
                <ResponsibilityBadges task={item.task} isArabic={isArabic} />
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onOpen(item)}
              leadingIcon={<ArrowLeftRight className="size-3.5" aria-hidden />}
            >
              {isArabic ? "تسليم" : "Hand over"}
            </Button>
          </Surface>
        </li>
      ))}
    </ul>
  );
}

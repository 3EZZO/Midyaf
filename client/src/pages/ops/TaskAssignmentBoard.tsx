// Kanban task assignment board.
// Extracted verbatim from OperationsPortals.tsx (Phase 1 split).
import { useState } from "react";
import { Badge } from "../../components/Badge";
import { useTacticalToast } from "../../components/TacticalToast";
import { Section } from "../../components/Section";
import type { PortalProps } from "../types";
import type { Driver, Task, TaskStatus } from "@shared/domain";
import { nextTaskStatuses, statusActionLabel, taskBoardStatuses, taskStatusTone, useOpsText } from "./shared";

export function TaskAssignmentBoard({
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
  const toast = useTacticalToast();
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
      const driverObj = drivers.find((d) => d.id === driverId);
      toast.success(
        ui.isArabic ? "تم تعيين السائق للمهمة بنجاح" : "Driver Assigned to Task",
        `${ui.l(task.type)}: ${driverObj ? driverObj.user.name : ui.l("Unassigned")}`
      );
    });
  }

  async function handleStatusChange(task: Task, status: TaskStatus) {
    await runTaskAction(`${task.id}:${status}`, async () => {
      await updateTaskStatus(task.id, status);
      toast.info(
        ui.isArabic ? "تم تحديث حالة المهمة" : "Task Status Updated",
        `${ui.l(task.type)} → ${ui.l(status)}`
      );
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
    <div className="rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-100 hover:-translate-y-0.5 transition-transform transition-all duration-200">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-bold text-slate-900 dark:text-white">
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
            className="w-full rounded-xl border border-white/5 px-2 py-2 text-xs font-semibold text-slate-700 disabled:opacity-60 m-input m-select"
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
            <p className="text-xs font-semibold text-midyaf-pearl">
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

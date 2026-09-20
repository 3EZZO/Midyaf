// Operations setup forms (drivers, users, suppliers, tasks, guests).
// Extracted verbatim from OperationsPortals.tsx (Phase 1 split).
import { useState } from "react";
import { FileText } from "lucide-react";
import { Section } from "../../components/Section";
import { percent } from "../../lib/format";
import type { DriverCreateInput, GuestInviteInput, SupplierCreateInput, TaskCreateInput, UserCreateInput, PortalProps } from "../types";
import type { Task } from "@shared/domain";
import { CheckboxField, DateTimeField, Field, NumberField, SelectField, assignableRoles, captainTypes, dateTimeInHours, driverZones, supplierCategories, taskTypes, useOpsText } from "./shared";

export function OperationsSetup({
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
    zone: "CENTRAL_ZONE",
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

  return (
    <Section title={ui.l("Operations setup")}>
      <p className="mb-4 text-sm text-slate-500">
        {ui.l(
          "Operations records are saved directly to PostgreSQL and are available to role portals after refresh."
        )}
      </p>
      <div className="mb-6 rounded-lg border border-midyaf-gold/30 bg-gradient-to-r from-midyaf-gold/10 via-amber-50/60 to-white p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-midyaf-purple text-white shadow-md">
              <FileText className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-slate-900 text-base">
                  {ui.isArabic
                    ? "تم نقل قسم رفع بيانات الضيوف (CSV) إلى بوابة إدخال الفعالية"
                    : "Guest Details (CSV) Relocated to Event Data Entry"}
                </h3>
                <span className="rounded-full bg-midyaf-purple/10 px-2.5 py-0.5 text-xs font-bold text-midyaf-pearl">
                  {ui.isArabic ? "تحديث العمليات" : "Operations Update"}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-600 leading-relaxed max-w-2xl">
                {ui.isArabic
                  ? "لإدخال وتحديث بيانات الضيوف بملفات CSV، وتفاصيل الفنادق، وشركات التأجير، والشروط المالية (أقساط / دفعة مقدمة)، يرجى استخدام بوابة إدخال بيانات الفعالية المخصصة."
                  : "To manage guest CSV lists, hotel accommodation, car rental providers, and post-approval payment terms (Installments / Downpayment), please access the dedicated Event Data Entry portal."}
              </p>
            </div>
          </div>
        </div>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-lg bg-slate-50 p-4">
          <h3 className="font-bold text-midyaf-pearl">{ui.l("Add guest")}</h3>
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
          <h3 className="font-bold text-midyaf-pearl">{ui.l("Add captain")}</h3>
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
          <h3 className="font-bold text-midyaf-pearl">{ui.l("Add supplier")}</h3>
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
          <h3 className="font-bold text-midyaf-pearl">
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
          <h3 className="font-bold text-midyaf-pearl">
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

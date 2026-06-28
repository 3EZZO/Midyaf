import type {
  ActivityIntake,
  CoordinatorRequest,
  FileAsset,
  FileUploadInput,
  GuestJourney,
  MidyafData,
  Role,
  Session,
  SupplierCategory,
  TaskStatus
} from "@shared/domain";
import type { DriverZone } from "@shared/domain";

export type CoordinatorRequestInput = Omit<
  CoordinatorRequest,
  "id" | "createdAt" | "updatedAt"
>;

export type PortalProps = {
  data: MidyafData;
  session?: Session;
  refreshData: () => Promise<void>;
  inviteGuests: (eventId: string, guests: GuestInviteInput[]) => Promise<void>;
  importGuests: (
    eventId: string,
    guests: GuestBulkImportInput[],
    options: GuestBulkImportOptions
  ) => Promise<void>;
  createDriver: (driver: DriverCreateInput) => Promise<void>;
  createSupplier: (supplier: SupplierCreateInput) => Promise<void>;
  createUser: (user: UserCreateInput) => Promise<void>;
  createTask: (task: TaskCreateInput) => Promise<void>;
  assignTask: (taskId: string, assignment: TaskAssignmentInput) => Promise<void>;
  saveActivityIntake: (intake: ActivityIntake) => Promise<void>;
  analyzeActivityIntake: (intakeId: string) => Promise<void>;
  confirmAiPlan: (planId: string) => Promise<void>;
  approveVendorQuote: (quoteId: string) => Promise<void>;
  approveContract: (contractId: string) => Promise<void>;
  updateGuestJourney: (
    journeyId: string,
    updates: Partial<GuestJourney>
  ) => Promise<void>;
  createCoordinatorRequest: (
    request: CoordinatorRequestInput
  ) => Promise<void>;
  updateCoordinatorRequest: (
    requestId: string,
    updates: Partial<CoordinatorRequest>
  ) => Promise<void>;
  confirmCompanyReport: (reportId: string) => Promise<void>;
  updateTaskStatus: (taskId: string, status: TaskStatus) => Promise<void>;
  shareDriverLocation: (driverId: string) => Promise<void>;
  createBooking: (serviceId: string, supplierId: string) => Promise<void>;
  uploadFile: (file: File, input: FileUploadInput) => Promise<FileAsset>;
};

export type GuestInviteInput = {
  name: string;
  email: string;
  phone: string;
  language: "ar" | "en";
  isVIP: boolean;
  tier: string;
};

export type GuestBulkImportInput = GuestInviteInput & {
  arrivalGate?: string;
  arrivalFlight?: string;
  pickupLocation?: string;
  dropoffLocation?: string;
  pickupLat?: number;
  pickupLng?: number;
  dropoffLat?: number;
  dropoffLng?: number;
  scheduledAt?: string;
  departureFlight?: string;
  departurePickupTime?: string;
};

export type GuestBulkImportOptions = {
  generateTasks: boolean;
  normalGuestsPerShuttle: number;
};

export type DriverCreateInput = {
  name: string;
  email: string;
  phone: string;
  licenseNo: string;
  nationalIdIqama: string;
  zone: DriverZone;
  captainType: "VIP_CAPTAIN" | "SHUTTLE" | "EMERGENCY";
  overtimeAvailable: boolean;
  active: boolean;
  currentLat?: number;
  currentLng?: number;
  shiftStart?: string;
  shiftEnd?: string;
};

export type SupplierCreateInput = {
  name: string;
  category: SupplierCategory;
  rating: number;
  verified: boolean;
  crNumber?: string;
  commissionPercent: number;
  services: Array<{
    name: string;
    price: number;
    unit: string;
    description?: string;
  }>;
};

export type UserCreateInput = {
  name: string;
  email: string;
  phone: string;
  role: Exclude<Role, "SUPER_ADMIN" | "LOGISTICS_MANAGER">;
  language: "ar" | "en";
  password?: string;
};

export type TaskCreateInput = {
  eventId: string;
  driverId?: string;
  guestId?: string;
  type:
    | "AIRPORT_PICKUP"
    | "HOTEL_TRANSFER"
    | "VENUE_TRANSFER"
    | "RESTAURANT_PICKUP"
    | "VIP_ESCORT";
  pickupLocation: string;
  dropoffLocation: string;
  pickupLat?: number;
  pickupLng?: number;
  dropoffLat?: number;
  dropoffLng?: number;
  scheduledAt: string;
  deadlineAt?: string;
  ownerName?: string;
};

export type TaskAssignmentInput = {
  driverId?: string | null;
  status?: TaskStatus;
  ownerName?: string | null;
  scheduledAt?: string;
  deadlineAt?: string | null;
};

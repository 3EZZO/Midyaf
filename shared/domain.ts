export type Role =
  | "GUEST"
  | "DRIVER"
  | "ORGANIZER"
  | "SUPPLIER"
  | "SUPER_ADMIN"
  | "COORDINATOR"
  | "LOGISTICS_MANAGER"
  | "COMPANY_ORGANIZER";

export type PortalKey =
  | "intake"
  | "guest"
  | "captain"
  | "coordinator"
  | "logistics"
  | "company";

export type DriverZone =
  | "NORTH_RIYADH"
  | "CENTRAL_RIYADH"
  | "EAST_RIYADH"
  | "WEST_RIYADH"
  | "SOUTH_RIYADH"
  | "DIRIYAH_CORRIDOR";

export type TaskStatus =
  | "PENDING"
  | "ASSIGNED"
  | "ACCEPTED"
  | "EN_ROUTE"
  | "ARRIVED"
  | "PICKED_UP"
  | "COMPLETED"
  | "DELAYED"
  | "CANCELLED";

export type SupplierCategory =
  | "HOTEL"
  | "CAR"
  | "TICKET"
  | "CATERING"
  | "EQUIPMENT"
  | "TOURISM";

export type Money = number | string;

export type FileAssetType =
  | "VISA"
  | "TICKET"
  | "GUEST_PHOTO"
  | "DRIVER_PHOTO"
  | "PROMO_VIDEO"
  | "REPORT_PDF"
  | "OTHER";

export type FileAsset = {
  id: string;
  type: FileAssetType;
  url: string;
  key: string;
  mimeType: string;
  size: number;
  userId?: string | null;
  guestId?: string | null;
  driverId?: string | null;
  eventId?: string | null;
  createdAt: string;
};

export type FileUploadInput = {
  type: FileAssetType;
  userId?: string;
  guestId?: string;
  driverId?: string;
  eventId?: string;
};

export type AppNotification = {
  id: string;
  userId: string;
  title: string;
  body: string;
  channel: "SMS" | "WHATSAPP" | "FCM" | "IN_APP" | string;
  deliveryStatus: string;
  provider?: string | null;
  recipientPhone?: string | null;
  metadata?: Record<string, unknown> | null;
  read: boolean;
  createdAt: string;
};

export type JsonRecord =
  | string
  | number
  | boolean
  | null
  | JsonRecord[]
  | { [key: string]: JsonRecord };

export type AuditLog = {
  id: string;
  actorUserId?: string | null;
  actorRole?: Role | null;
  action: string;
  entityType: string;
  entityId: string;
  eventId?: string | null;
  beforeData?: JsonRecord;
  afterData?: JsonRecord;
  metadata?: JsonRecord;
  ipAddress?: string | null;
  userAgent?: string | null;
  createdAt: string;
  actor?: Pick<User, "id" | "name" | "email" | "role"> | null;
};

export type User = {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: Role;
  language: "ar" | "en" | string;
  avatar?: string | null;
  createdAt?: string;
};

export type CityConfig = {
  id?: string;
  code: string;
  nameAr: string;
  nameEn: string;
  centerLat: number;
  centerLng: number;
  defaultZoom: number;
  timezone: string;
  currency: string;
  vatPercent: Money;
  enabled: boolean;
};

export type Guest = {
  id: string;
  userId: string;
  eventId: string;
  rsvpStatus: "INVITED" | "CONFIRMED" | "DECLINED" | "ARRIVED";
  isVIP: boolean;
  qrCode: string;
  tier: string;
  user: User;
};

export type CaptainFeedback = {
  id: string;
  taskId: string;
  rating: number;
  note: string;
  createdAt: string;
};

export type Driver = {
  id: string;
  userId: string;
  licenseNo: string;
  nationalIdIqama?: string;
  currentLat?: number | null;
  currentLng?: number | null;
  zone: DriverZone;
  status: "OFFLINE" | "AVAILABLE" | "ASSIGNED" | "EN_ROUTE" | "BUSY";
  shiftStart?: string | null;
  shiftEnd?: string | null;
  earnings?: Money;
  lastLocationAt?: string | null;
  captainType?: "VIP_CAPTAIN" | "SHUTTLE" | "EMERGENCY";
  visitsCompleted?: number;
  overtimeAvailable?: boolean;
  active?: boolean;
  feedback?: CaptainFeedback[];
  user: User;
  tasks?: Task[];
};

export type Task = {
  id: string;
  eventId: string;
  driverId?: string | null;
  guestId?: string | null;
  type:
    | "AIRPORT_PICKUP"
    | "HOTEL_TRANSFER"
    | "VENUE_TRANSFER"
    | "RESTAURANT_PICKUP"
    | "VIP_ESCORT";
  status: TaskStatus;
  pickupLocation: string;
  dropoffLocation: string;
  pickupLat?: number | null;
  pickupLng?: number | null;
  dropoffLat?: number | null;
  dropoffLng?: number | null;
  scheduledAt: string;
  deadlineAt?: string;
  completedAt?: string | null;
  ownerName?: string;
  driver?: Driver | null;
  guest?: Guest | null;
};

export type Service = {
  id: string;
  supplierId: string;
  name: string;
  price: Money;
  unit: string;
  available: boolean;
  description?: string | null;
};

export type Supplier = {
  id: string;
  userId?: string | null;
  cityId?: string | null;
  name: string;
  category: SupplierCategory;
  rating: number;
  verified: boolean;
  crNumber?: string | null;
  commissionPercent: Money;
  sponsoredRank?: number | null;
  zone?: DriverZone | null;
  services: Service[];
  bookings?: Booking[];
};

export type Booking = {
  id: string;
  eventId: string;
  supplierId: string;
  serviceId: string;
  quantity: number;
  totalPrice: Money;
  commissionPercent: Money;
  commissionAmount: Money;
  status: "PENDING" | "CONFIRMED" | "CANCELLED" | "COMPLETED";
  supplier: Supplier;
  service: Service;
};

export type Event = {
  id: string;
  name: string;
  date: string;
  venue: string;
  venueLat?: number | null;
  venueLng?: number | null;
  organizerId: string;
  status: "DRAFT" | "PUBLISHED" | "LIVE" | "COMPLETED" | "CANCELLED";
  brief?: string | null;
  timezone: string;
  currency: string;
  guests: Guest[];
  tasks: Task[];
  bookings: Booking[];
  city?: CityConfig | null;
};

export type ActivityIntake = {
  id: string;
  eventId?: string | null;
  activityName: string;
  activityPlace: string;
  visitorCount: number;
  vipVisitorCount: number;
  normalVisitorCount: number;
  transportationType: "VIP" | "SHUTTLE" | "MIXED";
  ticketType: "FIRST_CLASS" | "NORMAL" | "MIXED";
  hotelType: "FIVE_STAR" | "FOUR_STAR" | "MIXED";
  carType: "LUXURY_SEDAN" | "SUV_GMC_TAHOE" | "MIXED";
  status:
    | "DRAFT"
    | "AI_PLANNING"
    | "PLAN_CONFIRMED"
    | "QUOTING"
    | "CONTRACTING"
    | "OPERATIONS_OPEN";
  submittedBy: string;
  submittedAt: string;
  createdAt?: string;
  updatedAt?: string;
};

export type AiLogisticsPlan = {
  id: string;
  intakeId: string;
  summary: string;
  assumptions: string[];
  visitorGrouping: string;
  vipCars: number;
  shuttleVehicles: number;
  hotelRooms: number;
  firstClassTickets: number;
  normalTickets: number;
  phases: Array<{
    name: string;
    owner: string;
    deadline: string;
    status: "PENDING" | "IN_PROGRESS" | "CONFIRMED";
  }>;
  risks: string[];
  confirmed: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type VendorQuote = {
  id: string;
  intakeId: string;
  category:
    | SupplierCategory
    | "TICKET_AGENCY"
    | "CAR_RENTAL"
    | "HOTEL_OPERATOR";
  vendorName: string;
  item: string;
  quantity: number;
  unitPrice: Money;
  totalPrice: Money;
  commissionPercent: Money;
  commissionAmount: Money;
  score: number;
  status: "REQUESTED" | "RECEIVED" | "RECOMMENDED" | "APPROVED" | "REJECTED";
};

export type Contract = {
  id: string;
  quoteId: string;
  vendorName: string;
  category: VendorQuote["category"];
  amount: Money;
  commissionAmount: Money;
  status: "DRAFT" | "UNDER_REVIEW" | "SIGNED" | "ACTIVE";
  signedAt?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type GuestJourney = {
  id?: string;
  guestId: string;
  stage: "ARRIVAL" | "EVENT_TRANSPORTATION" | "DEPARTURE";
  visaStatus: "READY" | "SENT" | "ACKNOWLEDGED";
  ticketStatus: "READY" | "SENT" | "ACKNOWLEDGED";
  promoVideos: string[];
  arrivalStatus: "PRE_ARRIVAL" | "PASSPORT" | "LUGGAGE" | "GATE" | "PICKED_UP";
  arrivalGate: string;
  luggageStatus: "WAITING" | "RECEIVED";
  driverName: string;
  driverPhoto: string;
  driverPhone: string;
  carDetails: string;
  etaMinutes: number;
  personalTripRequests: string[];
  notes: string[];
  complaints: string[];
  departureFlight: string;
  departurePickupTime: string;
  departureConfirmed: boolean;
  leavingWithMidyaf: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type CoordinatorRequest = {
  id: string;
  guestName: string;
  request: string;
  route: string;
  priority: "VIP" | "NORMAL";
  status: "NEW" | "SENT_TO_SUPERVISOR" | "ASSIGNED" | "CLOSED";
  supervisor: string;
  deadline: string;
  createdAt?: string;
  updatedAt?: string;
};

export type CompanyReport = {
  id: string;
  title: string;
  status: "DRAFT" | "MANAGER_CONFIRMED" | "SENT_TO_COMPANY";
  kpis: Array<{ label: string; value: string }>;
  pdfUrl?: string;
  updatedAt: string;
};

export type CommissionConfig = {
  id?: string;
  category?: SupplierCategory | null;
  defaultPercent: Money;
  minPercent: Money;
  maxPercent: Money;
  sponsoredPlacementPrice?: Money;
};

export type MidyafData = {
  city: CityConfig;
  events: Event[];
  drivers: Driver[];
  suppliers: Supplier[];
  commission: CommissionConfig[];
  users: User[];
  activityIntakes: ActivityIntake[];
  aiPlans: AiLogisticsPlan[];
  vendorQuotes: VendorQuote[];
  contracts: Contract[];
  guestJourneys: GuestJourney[];
  coordinatorRequests: CoordinatorRequest[];
  companyReports: CompanyReport[];
  fileAssets: FileAsset[];
  notifications: AppNotification[];
  auditLogs: AuditLog[];
};

export type Session = {
  accessToken: string;
  refreshToken: string;
  user: User;
};

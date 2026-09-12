export type Role =
  | "GUEST"
  | "DRIVER"
  | "ORGANIZER"
  | "SUPPLIER"
  | "SUPER_ADMIN"
  | "COORDINATOR"
  | "LOGISTICS_MANAGER"
  | "COMPANY_ORGANIZER"
  | "EVENT_MANAGER"
  | "CLIENT";

export type PortalKey =
  | "admin"
  | "company"
  | "client"
  | "sila_operations"
  | "intake"
  | "guest"
  | "captain"
  | "coordinator";

export type DriverZone =
  | "NORTH_RIYADH"
  | "CENTRAL_RIYADH"
  | "EAST_RIYADH"
  | "WEST_RIYADH"
  | "SOUTH_RIYADH"
  | "DIRIYAH_CORRIDOR"
  | "NORTH_ZONE"
  | "CENTRAL_ZONE"
  | "EAST_ZONE"
  | "WEST_ZONE"
  | "SUMMIT_CORRIDOR";

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
  | "AIRLINE"
  | "VEHICLE_BROKERAGE"
  | "CAR_RENTAL"
  | "MAN_POWER"
  | "GOLF_CARTS"
  | "HEAVY_TRUCKS"
  | "HEAVY_EQUIPMENT"
  | "HOTEL"
  | "CAR"
  | "TICKET"
  | "CATERING"
  | "EQUIPMENT"
  | "TOURISM";

export type ManPowerSubtype = "CARGO_LOADING" | "EVENT_STAFF";
export type PaymentTerms = "INSTALLMENTS" | "DOWNPAYMENT";

export type HotelDetail = {
  id: string;
  name: string;
  contact: string;
  roomsBooked: number;
  roomType: string;
  notes?: string;
};

export type CarRentalDetail = {
  id: string;
  companyName: string;
  contact: string;
  fleetCount?: number;
  vehicleTypes?: string;
  notes?: string;
};

export type SupplierDetail = {
  id: string;
  providerName: string;
  category: SupplierCategory | string;
  contact: string;
  scopeOfWork?: string;
  paymentTerms?: PaymentTerms;
  notes?: string;
};

export type ComplaintSeverity = "LOW" | "NORMAL" | "HIGH" | "CRITICAL";
export type ComplaintStatus = "OPEN" | "IN_REVIEW" | "RESOLVED";

export type ComplaintItem = {
  id: string;
  activityId?: string;
  activityName: string;
  complainantName: string;
  complainantNameAr?: string;
  complainantNameEn?: string;
  complainantRole: string;
  complainantRoleAr?: string;
  complainantRoleEn?: string;
  severity: ComplaintSeverity;
  category: "TRANSPORT" | "HOTEL" | "SCHEDULE" | "HOSPITALITY" | "VIP_PROTOCOL" | "OTHER";
  description: string;
  descriptionAr?: string;
  descriptionEn?: string;
  status: ComplaintStatus;
  createdAt: string;
  resolvedAt?: string;
  resolutionNotes?: string;
  resolutionNotesAr?: string;
  resolutionNotesEn?: string;
};

export type ClientPermissionConfig = {
  clientId: string;
  clientName: string;
  clientEntity: string;
  eventTitle: string;
  shareableToken: string;
  canViewReports: boolean;
  canViewScheduleAmendments: boolean;
  canCommunicateLogistics: boolean;
  canViewPerformance: boolean;
  createdAt: string;
  isActive: boolean;
};

export type TeamMember = {
  id: string;
  eventId?: string;
  name: string;
  roleTitle: string;
  roleTitleAr?: string;
  roleTitleEn?: string;
  phone: string;
  email: string;
  zone: string;
  activeTasksCount: number;
  avatarUrl?: string;
  status: "AVAILABLE" | "ON_MISSION" | "BREAK";
};

export type TaskDelegation = {
  id: string;
  taskId: string;
  taskTitle: string;
  taskTitleAr?: string;
  taskTitleEn?: string;
  fromRole: "LOGISTICS_MANAGER" | "EVENT_MANAGER" | "TEAM_LEAD";
  toRole: "EVENT_MANAGER" | "TEAM_MEMBER";
  assignedBy: string;
  assignedTo: string;
  teamMemberId?: string;
  instructions: string;
  instructionsAr?: string;
  instructionsEn?: string;
  priority: "NORMAL" | "HIGH" | "URGENT";
  deadline: string;
  status: "ASSIGNED" | "ACKNOWLEDGED" | "IN_PROGRESS" | "COMPLETED";
  createdAt: string;
  updatedAt?: string;
};

export type ClientMessage = {
  id: string;
  clientId: string;
  senderName: string;
  senderNameAr?: string;
  senderNameEn?: string;
  senderRole: "CLIENT" | "LOGISTICS_MANAGER";
  message: string;
  messageAr?: string;
  messageEn?: string;
  timestamp: string;
  isRead: boolean;
};

export type ScheduleAmendment = {
  id: string;
  eventId: string;
  title: string;
  titleAr: string;
  titleEn?: string;
  type: "FLIGHT_DELAY" | "VENUE_CHANGE" | "VIP_AGENDA_SHIFT" | "CONVOY_REROUTE";
  originalTime: string;
  revisedTime: string;
  affectedGuests: string;
  affectedGuestsAr?: string;
  affectedGuestsEn?: string;
  status: "CONFIRMED" | "IN_PROGRESS";
  updatedAt: string;
};

export type CategoryPriceRange = {
  category: SupplierCategory;
  categoryNameEn: string;
  categoryNameAr: string;
  minPrice: number;
  maxPrice: number;
  avgPrice: number;
  bestTierPrice: number;
  quoteCount: number;
  currency: string;
};

export type SupplierContractWorkflowStage =
  | "PLAN_APPROVED"
  | "SENT_TO_SUPPLIERS"
  | "CONTRACTS_RETURNED"
  | "VERIFIED_SIGNED";

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

export type HospitalityRider = {
  id: string;
  guestId: string;
  dietaryNeeds: string[];
  roomPreferences: string[];
  vehicleRider: string[];
  securityNotes?: string[] | null;
  fulfilled: boolean;
  fulfilledBy?: string | null;
  createdAt?: string;
  updatedAt?: string;
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
  hospitalityRider?: HospitalityRider | null;
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
  carType: "LUXURY_SEDAN" | "SUV_GMC_TAHOE" | "BUSES" | "MIXED";
  status:
    | "DRAFT"
    | "AI_PLANNING"
    | "PLAN_CONFIRMED"
    | "QUOTING"
    | "CONTRACTING"
    | "OPERATIONS_OPEN";
  submittedBy: string;
  submittedAt: string;
  organizerCompany?: string;
  createdAt?: string;
  updatedAt?: string;

  // Task 2: Extended fields
  hotelName?: string;
  hotelContact?: string;
  hotelRoomsBooked?: number;
  hotelRoomType?: string;
  carRentalCompanyName?: string;
  carRentalContact?: string;
  providerName?: string;
  paymentTerms?: PaymentTerms;

  // Multiple Entities Support
  hotels?: HotelDetail[];
  carRentals?: CarRentalDetail[];
  suppliers?: SupplierDetail[];

  // Task 3: New Supplier / Resource Categories
  golfCartsCount?: number;
  transportationTrucksCount?: number;
  manPowerCount?: number;
  manPowerSubtype?: ManPowerSubtype;
  heavyEquipmentCount?: number;
  heavyTrucksCount?: number;
  busesCount?: number;
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

  // Task 3: Resource breakdown in plan
  golfCarts?: number;
  transportationTrucks?: number;
  manPower?: number;
  manPowerSubtype?: ManPowerSubtype;
  heavyEquipment?: number;
  heavyTrucks?: number;
  buses?: number;
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
  isVaultSealed?: boolean;
};

export type Contract = {
  id: string;
  quoteId: string;
  vendorName: string;
  category: VendorQuote["category"];
  amount: Money;
  commissionAmount: Money;
  status: "DRAFT" | "UNDER_REVIEW" | "SIGNED" | "ACTIVE" | "PENDING_SIGNATURE";
  signedAt?: string;
  createdAt?: string;
  updatedAt?: string;
  contractNumber?: string;
  totalValue?: Money;
  scopeOfWork?: string;
  paymentTerms?: string;
  digitalSeal?: string;
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
  summary?: string;
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
  hospitalityRiders?: HospitalityRider[];
};

export type Session = {
  accessToken: string;
  refreshToken: string;
  user: User;
};

export type GeofenceRingType =
  | "OUTER_APPROACH"
  | "STAGING_HOLD"
  | "CURBSIDE_GATE"
  | "DOCKED_BAY";

export type ConcentricRing = {
  ring: GeofenceRingType;
  radiusMeters: number;
  labelEn: string;
  labelAr: string;
  autoAction: string;
};

export type ConcentricGeofence = {
  id: string;
  code: string;
  nameEn: string;
  nameAr: string;
  category: "AIRPORT" | "VENUE" | "HOTEL" | "HERITAGE";
  centerLat: number;
  centerLng: number;
  rings: ConcentricRing[];
};

export type GeofenceTransitionEvent = {
  id: string;
  driverId: string;
  driverName?: string;
  geofenceId: string;
  geofenceCode: string;
  geofenceNameEn: string;
  geofenceNameAr: string;
  previousRing: GeofenceRingType | "OUTSIDE";
  currentRing: GeofenceRingType | "OUTSIDE";
  distanceMeters: number;
  direction: "APPROACHING" | "DEPARTING" | "STATIONARY";
  timestamp: string;
  automatedActionsTaken: string[];
};

export type GeofenceDriverState = {
  driverId: string;
  geofenceId: string;
  currentRing: GeofenceRingType | "OUTSIDE";
  distanceMeters: number;
  lastCrossedAt: string;
  direction: "APPROACHING" | "DEPARTING" | "STATIONARY";
};


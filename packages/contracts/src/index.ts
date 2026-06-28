export interface Money {
  readonly amountMinor: number;
  readonly currency: string;
}

export interface ApiErrorResponse {
  readonly code: string;
  readonly message: string;
  readonly details?: unknown;
}

export type ActorRole = "customer" | "partner" | "fleet" | "internal";

export interface Actor {
  readonly userId: string;
  readonly organizationId?: string;
  readonly role: ActorRole;
}

export interface AuthUser {
  readonly id: string;
  readonly role: "customer";
  readonly identifier: string;
  readonly displayName?: string;
  readonly onboardingComplete: boolean;
}

export interface RequestAuthCodeRequest {
  readonly identifier: string;
}

export interface RequestAuthCodeResponse {
  readonly challengeId: string;
  readonly expiresAt: string;
  readonly deliveryHint: string;
  readonly devCode?: string;
}

export interface VerifyAuthCodeRequest {
  readonly challengeId: string;
  readonly code: string;
}

export interface AuthSession {
  readonly accessToken: string;
  readonly expiresAt: string;
  readonly user: AuthUser;
}

export interface CustomerProfile {
  readonly userId: string;
  readonly identifier: string;
  readonly displayName: string;
  readonly phoneNumber?: string;
  readonly email?: string;
  readonly residentialProfile?: CustomerResidentialProfile;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type MarketMode = "residence_partnership" | "open_marketplace" | "mobile_dispatch" | "fleet_or_corporate";

export type ResidenceType = "multi_unit_private" | "public_housing" | "landed" | "commercial" | "other";

export type PropertyActivationStatus =
  | "suggested"
  | "interest_gathering"
  | "contacted"
  | "approved"
  | "active"
  | "paused"
  | "rejected";

export interface CustomerResidentialProfile {
  readonly marketId: string;
  readonly marketMode: MarketMode;
  readonly residenceType: ResidenceType;
  readonly localResidenceLabel: string;
  readonly propertyId?: string;
  readonly propertyName?: string;
  readonly propertyAddress?: string;
  readonly propertyActivationStatus?: PropertyActivationStatus;
  readonly propertyInterestCount?: number;
  readonly serviceAreaLabel?: string;
  readonly parkingNotes?: string;
  readonly accessNotes?: string;
  readonly updatedAt: string;
}

export interface UpdateCustomerResidentialProfileRequest {
  readonly marketId?: string;
  readonly marketMode?: MarketMode;
  readonly residenceType: ResidenceType;
  readonly localResidenceLabel?: string;
  readonly propertyId?: string;
  readonly propertyName?: string;
  readonly propertyAddress?: string;
  readonly propertyActivationStatus?: PropertyActivationStatus;
  readonly propertyInterestCount?: number;
  readonly serviceAreaLabel?: string;
  readonly parkingNotes?: string;
  readonly accessNotes?: string;
}

export interface Property {
  readonly id: string;
  readonly marketId: string;
  readonly residenceType: ResidenceType;
  readonly name: string;
  readonly addressLine1?: string;
  readonly city: string;
  readonly region: string;
  readonly countryCode: string;
  readonly activationStatus: PropertyActivationStatus;
  readonly interestCount: number;
  readonly managementContactName?: string;
  readonly managementContactEmail?: string;
  readonly managementContactPhone?: string;
  readonly outreachNotes?: string;
  readonly nextFollowUpAt?: string;
  readonly lastContactedAt?: string;
  readonly internalOwner?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface PropertyLead extends Property {
  readonly latestInterestAt?: string;
}

export interface PropertyInterest {
  readonly id: string;
  readonly propertyId: string;
  readonly ownerId: string;
  readonly requestedServiceCodes: readonly ServiceCode[];
  readonly preferredTimeWindows: readonly string[];
  readonly parkingNotes?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CreatePropertyInterestRequest {
  readonly propertyId?: string;
  readonly propertyName?: string;
  readonly propertyAddress?: string;
  readonly requestedServiceCodes?: readonly ServiceCode[];
  readonly preferredTimeWindows?: readonly string[];
  readonly parkingNotes?: string;
}

export interface CreatePropertyInterestResponse {
  readonly property: Property;
  readonly interest: PropertyInterest;
  readonly profile: CustomerProfile;
}

export interface UpdatePropertyActivationRequest {
  readonly activationStatus?: PropertyActivationStatus;
  readonly managementContactName?: string;
  readonly managementContactEmail?: string;
  readonly managementContactPhone?: string;
  readonly outreachNotes?: string;
  readonly nextFollowUpAt?: string;
  readonly lastContactedAt?: string;
  readonly internalOwner?: string;
}

export type WaterPolicy = "standard" | "rinseless_required" | "water_access_available" | "no_water_access";
export type VehicleMovementPolicy = "not_allowed" | "within_property_allowed" | "pickup_return_allowed";
export type PrimaWashDayStatus = "planned" | "approved" | "active" | "completed" | "cancelled";

export interface CondoOperationalProfile {
  readonly propertyId: string;
  readonly approvedServiceAreas: readonly string[];
  readonly operatingInstructions?: string;
  readonly waterPolicy: WaterPolicy;
  readonly vehicleMovementPolicy: VehicleMovementPolicy;
  readonly onsiteServiceAllowed: boolean;
  readonly pickupReturnAllowed: boolean;
  readonly simultaneousVehicleCapacity: number;
  readonly availableServiceCodes: readonly ServiceCode[];
  readonly safetyRequirements?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface UpdateCondoOperationalProfileRequest {
  readonly approvedServiceAreas?: readonly string[];
  readonly operatingInstructions?: string;
  readonly waterPolicy?: WaterPolicy;
  readonly vehicleMovementPolicy?: VehicleMovementPolicy;
  readonly onsiteServiceAllowed?: boolean;
  readonly pickupReturnAllowed?: boolean;
  readonly simultaneousVehicleCapacity?: number;
  readonly availableServiceCodes?: readonly ServiceCode[];
  readonly safetyRequirements?: string;
}

export interface PrimaWashDay {
  readonly id: string;
  readonly propertyId: string;
  readonly propertyName: string;
  readonly partnerLocationId?: string;
  readonly approvedServiceArea: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly capacity: number;
  readonly serviceCodes: readonly ServiceCode[];
  readonly status: PrimaWashDayStatus;
  readonly operatingNotes?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CreatePrimaWashDayRequest {
  readonly propertyId: string;
  readonly partnerLocationId?: string;
  readonly approvedServiceArea: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly capacity: number;
  readonly serviceCodes: readonly ServiceCode[];
  readonly status?: PrimaWashDayStatus;
  readonly operatingNotes?: string;
}

export interface UpdatePrimaWashDayRequest {
  readonly partnerLocationId?: string;
  readonly approvedServiceArea?: string;
  readonly startsAt?: string;
  readonly endsAt?: string;
  readonly capacity?: number;
  readonly serviceCodes?: readonly ServiceCode[];
  readonly status?: PrimaWashDayStatus;
  readonly operatingNotes?: string;
}

export interface UpdateCustomerProfileRequest {
  readonly displayName?: string;
  readonly phoneNumber?: string;
  readonly email?: string;
  readonly residentialProfile?: UpdateCustomerResidentialProfileRequest;
}

export interface AuditEvent {
  readonly id: string;
  readonly actorUserId?: string;
  readonly actorOrganizationId?: string;
  readonly action: string;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly metadata: Record<string, unknown>;
  readonly requestId?: string;
  readonly createdAt: string;
}

export interface PartnerDashboardMetric {
  readonly label: string;
  readonly value: string;
  readonly delta?: string;
}

export interface PartnerQueueItem {
  readonly bookingId: string;
  readonly vehicleId: string;
  readonly ownerId: string;
  readonly serviceCode: ServiceCode;
  readonly status: BookingStatus;
  readonly paymentStatus?: PaymentStatus;
  readonly paymentAmount?: Money;
  readonly actionHint: string;
  readonly scheduledStartAt: string;
}

export interface PartnerDashboardResponse {
  readonly partnerLocationId: string;
  readonly generatedAt: string;
  readonly metrics: readonly PartnerDashboardMetric[];
  readonly queue: readonly PartnerQueueItem[];
  readonly auditEvents: readonly AuditEvent[];
}

export type ProductEventName =
  | "vehicle_created"
  | "booking_created"
  | "booking_cancelled"
  | "service_completed";

export interface ProductEvent {
  readonly id: string;
  readonly ownerId: string;
  readonly name: ProductEventName;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly metadata: Record<string, unknown>;
  readonly occurredAt: string;
}

export interface MavoResponse {
  readonly month: string;
  readonly monthlyActiveVehicleOwners: number;
  readonly qualifyingEventNames: readonly ProductEventName[];
  readonly generatedAt: string;
}

export type BookingStatus =
  | "pending_payment"
  | "confirmed"
  | "checked_in"
  | "in_service"
  | "completed"
  | "cancelled";

export interface Vehicle {
  readonly id: string;
  readonly ownerId: string;
  readonly nickname?: string;
  readonly plateNumber: string;
  readonly make?: string;
  readonly model?: string;
  readonly year?: number;
  readonly isPrimary: boolean;
  readonly createdAt: string;
}

export interface CreateVehicleRequest {
  readonly ownerId?: string;
  readonly nickname?: string;
  readonly plateNumber: string;
  readonly make?: string;
  readonly model?: string;
  readonly year?: number;
  readonly isPrimary?: boolean;
}

export interface UpdateVehicleRequest {
  readonly nickname?: string;
  readonly plateNumber?: string;
  readonly make?: string;
  readonly model?: string;
  readonly year?: number;
  readonly isPrimary?: boolean;
}

export type ServiceCode = "wash_basic" | "wash_premium" | "detail_interior";

export interface ServiceOffering {
  readonly code: ServiceCode;
  readonly name: string;
  readonly durationMinutes: number;
  readonly price: Money;
}

export interface AvailabilitySlot {
  readonly id: string;
  readonly partnerLocationId: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly capacity: number;
  readonly bookedCount?: number;
  readonly closedAt?: string;
  readonly serviceCodes: readonly ServiceCode[];
}

export interface PartnerAvailabilitySlot extends AvailabilitySlot {
  readonly availableCount: number;
}

export interface CapacityTemplate {
  readonly id: string;
  readonly partnerLocationId: string;
  readonly name: string;
  readonly openTime: string;
  readonly closeTime: string;
  readonly staffCount: number;
  readonly bayCount: number;
  readonly serviceCodes: readonly ServiceCode[];
  readonly slotDurationMinutes: number;
  readonly bufferMinutes: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CreateCapacityTemplateRequest {
  readonly partnerLocationId?: string;
  readonly name: string;
  readonly openTime: string;
  readonly closeTime: string;
  readonly staffCount: number;
  readonly bayCount: number;
  readonly serviceCodes: readonly ServiceCode[];
  readonly slotDurationMinutes: number;
  readonly bufferMinutes: number;
}

export interface UpdateCapacityTemplateRequest {
  readonly name?: string;
  readonly openTime?: string;
  readonly closeTime?: string;
  readonly staffCount?: number;
  readonly bayCount?: number;
  readonly serviceCodes?: readonly ServiceCode[];
  readonly slotDurationMinutes?: number;
  readonly bufferMinutes?: number;
}

export interface GenerateCapacityTemplateSlotsRequest {
  readonly date: string;
}

export interface GenerateCapacityTemplateSlotsResponse {
  readonly template: CapacityTemplate;
  readonly slots: readonly PartnerAvailabilitySlot[];
}

export type CalendarExceptionType = "closed" | "special_hours";
export type ResourceType = "staff" | "wash_bay" | "detail_bay" | "interior_station";

export interface OperatingScheduleRule {
  readonly id: string;
  readonly partnerLocationId: string;
  readonly weekday: number;
  readonly openTime: string;
  readonly closeTime: string;
  readonly enabled: boolean;
}

export interface CalendarException {
  readonly id: string;
  readonly partnerLocationId: string;
  readonly date: string;
  readonly type: CalendarExceptionType;
  readonly reason: string;
  readonly openTime?: string;
  readonly closeTime?: string;
}

export interface ResourcePool {
  readonly id: string;
  readonly partnerLocationId: string;
  readonly resourceType: ResourceType;
  readonly name: string;
  readonly quantity: number;
  readonly enabled: boolean;
}

export interface ServiceCapacityRule {
  readonly id: string;
  readonly partnerLocationId: string;
  readonly serviceCode: ServiceCode;
  readonly durationMinutes: number;
  readonly preBufferMinutes: number;
  readonly postBufferMinutes: number;
  readonly requiredStaff: number;
  readonly requiredResourceType: ResourceType;
  readonly requiredResourceQuantity: number;
  readonly maxConcurrent: number;
  readonly maxDailyBookings: number;
  readonly enabled: boolean;
}

export interface SchedulingConfig {
  readonly operatingScheduleRules: readonly OperatingScheduleRule[];
  readonly calendarExceptions: readonly CalendarException[];
  readonly resourcePools: readonly ResourcePool[];
  readonly serviceCapacityRules: readonly ServiceCapacityRule[];
}

export interface UpdateSchedulingConfigRequest {
  readonly operatingScheduleRules?: readonly Omit<OperatingScheduleRule, "id" | "partnerLocationId">[];
  readonly calendarExceptions?: readonly Omit<CalendarException, "id" | "partnerLocationId">[];
  readonly resourcePools?: readonly Omit<ResourcePool, "id" | "partnerLocationId">[];
  readonly serviceCapacityRules?: readonly Omit<ServiceCapacityRule, "id" | "partnerLocationId">[];
}

export interface AvailabilitySearchSlot {
  readonly partnerLocationId: string;
  readonly serviceCode: ServiceCode;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly capacity: number;
  readonly availableCount: number;
  readonly source: "dynamic_rules";
}

export interface AvailabilitySearchResponse {
  readonly partnerLocationId: string;
  readonly serviceCode: ServiceCode;
  readonly date: string;
  readonly timezone: string;
  readonly slots: readonly AvailabilitySearchSlot[];
  readonly closedReason?: string;
}

export type BookingHoldStatus = "active" | "consumed" | "expired" | "released";

export interface BookingHold {
  readonly id: string;
  readonly ownerId: string;
  readonly vehicleId: string;
  readonly partnerLocationId: string;
  readonly serviceCode: ServiceCode;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly status: BookingHoldStatus;
  readonly expiresAt: string;
  readonly createdAt: string;
}

export interface CreateBookingHoldRequest {
  readonly vehicleId: string;
  readonly partnerLocationId: string;
  readonly serviceCode: ServiceCode;
  readonly startsAt: string;
}

export interface CreateBookingHoldResponse {
  readonly hold: BookingHold;
  readonly expiresInSeconds: number;
}

export interface PartnerLocation {
  readonly id: string;
  readonly organizationId: string;
  readonly name: string;
  readonly shortDescription: string;
  readonly timezone: string;
  readonly addressLine1: string;
  readonly city: string;
  readonly region: string;
  readonly countryCode: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly rating: number;
  readonly reviewCount: number;
  readonly distanceKm: number;
  readonly openingHours: string;
  readonly serviceCodes: readonly ServiceCode[];
  readonly verified: boolean;
}

export interface CreateAvailabilitySlotRequest {
  readonly partnerLocationId?: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly capacity: number;
  readonly serviceCodes: readonly ServiceCode[];
}

export interface UpdateAvailabilitySlotRequest {
  readonly capacity?: number;
  readonly serviceCodes?: readonly ServiceCode[];
  readonly closed?: boolean;
}

export interface Booking {
  readonly id: string;
  readonly ownerId: string;
  readonly vehicleId: string;
  readonly partnerLocationId: string;
  readonly primaWashDayId?: string;
  readonly serviceCode: ServiceCode;
  readonly status: BookingStatus;
  readonly scheduledStartAt: string;
  readonly scheduledEndAt: string;
  readonly acceptedPrice: Money;
  readonly createdAt: string;
}

export interface ServiceRecord {
  readonly id: string;
  readonly bookingId: string;
  readonly ownerId: string;
  readonly vehicleId: string;
  readonly partnerLocationId: string;
  readonly serviceCode: ServiceCode;
  readonly completedAt: string;
  readonly createdAt: string;
}

export type PaymentStatus =
  | "requires_authorization"
  | "authorized"
  | "captured"
  | "refunded"
  | "voided";

export interface PaymentIntent {
  readonly id: string;
  readonly bookingId: string;
  readonly ownerId: string;
  readonly amount: Money;
  readonly status: PaymentStatus;
  readonly authorizedAt?: string;
  readonly capturedAt?: string;
  readonly refundedAt?: string;
  readonly voidedAt?: string;
  readonly createdAt: string;
}

export interface CreatePaymentIntentRequest {
  readonly bookingId: string;
}

export interface UpdateBookingStatusRequest {
  readonly status: BookingStatus;
}

export interface CancelBookingRequest {
  readonly reason?: string;
}

export interface CreateBookingRequest {
  readonly ownerId?: string;
  readonly vehicleId: string;
  readonly availabilitySlotId?: string;
  readonly primaWashDayId?: string;
  readonly holdId?: string;
  readonly serviceCode: ServiceCode;
}

export interface HealthResponse {
  readonly service: "prima-wash-api";
  readonly status: "ok";
  readonly httpStatus: 200;
  readonly timestamp: string;
}

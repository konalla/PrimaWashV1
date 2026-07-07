export interface Money {
  readonly amountMinor: number;
  readonly currency: string;
}

export interface ApiErrorResponse {
  readonly code: string;
  readonly message: string;
  readonly details?: unknown;
}

export type ActorRole = "customer" | "partner" | "fleet" | "internal" | "property_manager";

export type InternalPermission =
  | "operations_read"
  | "operations_write"
  | "finance_read"
  | "finance_write"
  | "partner_manage"
  | "property_manage"
  | "super_admin";

export interface Actor {
  readonly userId: string;
  readonly organizationId?: string;
  readonly propertyId?: string;
  readonly permissions?: readonly InternalPermission[];
  readonly role: ActorRole;
}

export interface AuthUser {
  readonly id: string;
  readonly role: ActorRole;
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

export interface RefreshAuthSessionRequest {
  readonly refreshToken: string;
}

export interface AuthSession {
  readonly accessToken: string;
  readonly refreshToken?: string;
  readonly expiresAt: string;
  readonly refreshExpiresAt?: string;
  readonly user: AuthUser;
}

export type AccessInvitationRole = "internal" | "partner" | "property_manager";

export interface AccessInvitation {
  readonly id: string;
  readonly identifier: string;
  readonly role: AccessInvitationRole;
  readonly organizationId?: string;
  readonly partnerLocationId?: string;
  readonly propertyId?: string;
  readonly permissions: readonly InternalPermission[];
  readonly expiresAt: string;
  readonly acceptedAt?: string;
  readonly revokedAt?: string;
  readonly invitedByUserId: string;
  readonly createdAt: string;
  readonly devCode?: string;
}

export interface CreateAccessInvitationRequest {
  readonly identifier: string;
  readonly displayName: string;
  readonly role: AccessInvitationRole;
  readonly organizationId?: string;
  readonly partnerLocationId?: string;
  readonly propertyId?: string;
  readonly permissions?: readonly InternalPermission[];
}

export interface AcceptAccessInvitationRequest {
  readonly invitationId: string;
  readonly code: string;
}

export interface AcceptAccessInvitationResponse {
  readonly invitation: AccessInvitation;
  readonly session: AuthSession;
}

export interface ListAccessInvitationsResponse {
  readonly invitations: readonly AccessInvitation[];
}

export interface ResendAccessInvitationResponse {
  readonly invitation: AccessInvitation;
}

export interface AccessMembership {
  readonly id: string;
  readonly userId: string;
  readonly identifier: string;
  readonly displayName: string;
  readonly role: AccessInvitationRole;
  readonly organizationId?: string;
  readonly partnerLocationId?: string;
  readonly propertyId?: string;
  readonly permissions: readonly InternalPermission[];
  readonly active: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ListAccessMembershipsResponse {
  readonly memberships: readonly AccessMembership[];
}

export interface UpdateAccessMembershipRequest {
  readonly permissions?: readonly InternalPermission[];
  readonly active?: boolean;
}

export interface CustomerProfile {
  readonly userId: string;
  readonly identifier: string;
  readonly displayName: string;
  readonly phoneNumber?: string;
  readonly email?: string;
  readonly residentialProfile?: CustomerResidentialProfile;
  readonly billingProfile?: CustomerBillingProfile;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CustomerBillingProfile {
  readonly provider: string;
  readonly providerCustomerId: string;
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
  readonly residenceType?: ResidenceType;
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

export type CommunicationThreadType =
  | "prima_to_property"
  | "prima_to_owner"
  | "prima_to_partner"
  | "partner_to_owner";

export type CommunicationResourceType = "property" | "booking" | "partner_location" | "owner";

export interface CommunicationThread {
  readonly id: string;
  readonly type: CommunicationThreadType;
  readonly resourceType: CommunicationResourceType;
  readonly resourceId: string;
  readonly subject: string;
  readonly createdByRole: ActorRole;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CommunicationMessage {
  readonly id: string;
  readonly threadId: string;
  readonly senderUserId: string;
  readonly senderRole: ActorRole;
  readonly body: string;
  readonly createdAt: string;
}

export interface CommunicationThreadWithMessages {
  readonly thread: CommunicationThread;
  readonly messages: readonly CommunicationMessage[];
}

export interface CreateCommunicationThreadRequest {
  readonly type: CommunicationThreadType;
  readonly resourceType: CommunicationResourceType;
  readonly resourceId: string;
  readonly subject: string;
  readonly initialMessage?: string;
}

export interface CreateCommunicationMessageRequest {
  readonly body: string;
}

export interface PartnerDashboardMetric {
  readonly label: string;
  readonly value: string;
  readonly delta?: string;
}

export interface PartnerQueueVehicleSummary {
  readonly plateNumber: string;
  readonly make?: string;
  readonly model?: string;
  readonly nickname?: string;
}

export interface PartnerQueueLocationSummary {
  readonly name: string;
  readonly addressLine1: string;
  readonly city: string;
  readonly region: string;
  readonly countryCode: string;
  readonly openingHours: string;
}

export type BookingEvidenceType = "before" | "after" | "damage" | "handover" | "other";

export interface BookingEvidence {
  readonly id: string;
  readonly bookingId: string;
  readonly evidenceType: BookingEvidenceType;
  readonly storageKey?: string;
  readonly url?: string;
  readonly notes?: string;
  readonly uploadedByUserId?: string;
  readonly uploadedByRole: ActorRole;
  readonly createdAt: string;
}

export interface CreateBookingEvidenceRequest {
  readonly evidenceType: BookingEvidenceType;
  readonly storageKey?: string;
  readonly url?: string;
  readonly notes?: string;
}

export interface BookingEvidenceSummary {
  readonly beforeCount: number;
  readonly afterCount: number;
  readonly damageCount: number;
  readonly handoverCount: number;
  readonly otherCount: number;
  readonly totalCount: number;
}

export type BookingHandoverType = "pickup" | "return" | "onsite_receipt" | "onsite_release";

export interface BookingHandover {
  readonly id: string;
  readonly bookingId: string;
  readonly handoverType: BookingHandoverType;
  readonly contactName: string;
  readonly locationNotes: string;
  readonly keyHandoverMethod?: string;
  readonly odometerReading?: string;
  readonly fuelOrChargeLevel?: string;
  readonly conditionNotes?: string;
  readonly acknowledgedBy?: string;
  readonly recordedByUserId?: string;
  readonly recordedByRole: ActorRole;
  readonly createdAt: string;
}

export interface CreateBookingHandoverRequest {
  readonly handoverType: BookingHandoverType;
  readonly contactName: string;
  readonly locationNotes: string;
  readonly keyHandoverMethod?: string;
  readonly odometerReading?: string;
  readonly fuelOrChargeLevel?: string;
  readonly conditionNotes?: string;
  readonly acknowledgedBy?: string;
}

export interface BookingHandoverSummary {
  readonly pickupCount: number;
  readonly returnCount: number;
  readonly onsiteReceiptCount: number;
  readonly onsiteReleaseCount: number;
  readonly totalCount: number;
}

export interface PartnerQueueItem {
  readonly bookingId: string;
  readonly primaWashDayId?: string;
  readonly vehicleId: string;
  readonly vehicle?: PartnerQueueVehicleSummary;
  readonly ownerId: string;
  readonly partnerLocation?: PartnerQueueLocationSummary;
  readonly serviceCode: ServiceCode;
  readonly status: BookingStatus;
  readonly onsiteServiceMode?: BookingOnsiteServiceMode;
  readonly valetRequested: boolean;
  readonly executionNotes?: string;
  readonly assignedTechnicianName?: string;
  readonly completionNotes?: string;
  readonly beforeServicePhotoUrls?: readonly string[];
  readonly afterServicePhotoUrls?: readonly string[];
  readonly evidenceSummary?: BookingEvidenceSummary;
  readonly handoverSummary?: BookingHandoverSummary;
  readonly technicianCheckedInAt?: string;
  readonly technicianCheckedOutAt?: string;
  readonly operationalExceptionCode?: BookingOperationalExceptionCode;
  readonly operationalExceptionNotes?: string;
  readonly operationalExceptionReportedAt?: string;
  readonly operationalExceptionResolvedAt?: string;
  readonly paymentIntentId?: string;
  readonly paymentStatus?: PaymentStatus;
  readonly paymentAmount?: Money;
  readonly actionHint: string;
  readonly scheduledStartAt: string;
}

export interface PrimaWashDayBookingItem extends PartnerQueueItem {
  readonly primaWashDayId: string;
  readonly scheduledEndAt: string;
}

export interface PropertyManagementProperty {
  readonly id: string;
  readonly name: string;
  readonly addressLine1?: string;
  readonly city: string;
  readonly region: string;
  readonly countryCode: string;
  readonly activationStatus: PropertyActivationStatus;
  readonly interestCount: number;
}

export interface PropertyManagementPrimaWashDay extends PrimaWashDay {
  readonly bookedCount: number;
  readonly openCount: number;
  readonly confirmedCount: number;
  readonly paymentBlockedCount: number;
}

export interface PropertyManagementDashboardResponse {
  readonly property: PropertyManagementProperty;
  readonly operationalProfile?: CondoOperationalProfile;
  readonly upcomingPrimaWashDays: readonly PropertyManagementPrimaWashDay[];
  readonly generatedAt: string;
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

export type BookingOnsiteServiceMode = "onsite" | "partner_location" | "customer_property" | "pickup_return";

export type BookingConsentType = "pickup_return_terms" | "property_service_terms";

export interface BookingConsent {
  readonly id: string;
  readonly bookingId: string;
  readonly ownerId: string;
  readonly consentType: BookingConsentType;
  readonly termsVersion: string;
  readonly acceptedText?: string;
  readonly acceptedByUserId?: string;
  readonly acceptedAt: string;
}

export interface CreateBookingConsentRequest {
  readonly consentType: BookingConsentType;
  readonly termsVersion: string;
  readonly acceptedText?: string;
}

export interface BookingConsentSummary {
  readonly pickupReturnTermsAccepted: boolean;
  readonly propertyServiceTermsAccepted: boolean;
}

export interface UpdateBookingExecutionRequest {
  readonly onsiteServiceMode?: BookingOnsiteServiceMode;
  readonly valetRequested?: boolean;
  readonly executionNotes?: string;
  readonly assignedTechnicianName?: string;
  readonly completionNotes?: string;
  readonly beforeServicePhotoUrls?: readonly string[];
  readonly afterServicePhotoUrls?: readonly string[];
  readonly technicianCheckedIn?: boolean;
  readonly technicianCheckedOut?: boolean;
}

export type PartnerBookingDecision = "accept" | "request_clarification" | "reject_mode";

export interface PartnerBookingDecisionRequest {
  readonly decision: PartnerBookingDecision;
  readonly message?: string;
}

export type BookingOperationalExceptionCode =
  | "customer_no_show"
  | "partner_late"
  | "access_denied"
  | "vehicle_not_found"
  | "payment_authorization_failed"
  | "pickup_return_issue"
  | "property_rule_conflict"
  | "weather_or_safety_hold";

export interface UpdateBookingOperationalExceptionRequest {
  readonly code?: BookingOperationalExceptionCode;
  readonly notes?: string;
  readonly resolved?: boolean;
}

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
  readonly onsiteServiceMode?: BookingOnsiteServiceMode;
  readonly valetRequested: boolean;
  readonly executionNotes?: string;
  readonly assignedTechnicianName?: string;
  readonly completionNotes?: string;
  readonly beforeServicePhotoUrls?: readonly string[];
  readonly afterServicePhotoUrls?: readonly string[];
  readonly technicianCheckedInAt?: string;
  readonly technicianCheckedOutAt?: string;
  readonly operationalExceptionCode?: BookingOperationalExceptionCode;
  readonly operationalExceptionNotes?: string;
  readonly operationalExceptionReportedAt?: string;
  readonly operationalExceptionResolvedAt?: string;
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
  readonly provider?: string;
  readonly providerReference?: string;
  readonly clientSecret?: string;
  readonly authorizedAt?: string;
  readonly capturedAt?: string;
  readonly refundedAt?: string;
  readonly voidedAt?: string;
  readonly createdAt: string;
}

export interface CreatePaymentIntentRequest {
  readonly bookingId: string;
}

export type PaymentOperationName = "create" | "authorize" | "capture" | "void" | "refund" | "reconcile";

export type PaymentOperationStatus = "started" | "succeeded" | "failed" | "skipped";

export interface PaymentOperation {
  readonly id: string;
  readonly paymentIntentId?: string;
  readonly bookingId: string;
  readonly ownerId: string;
  readonly operation: PaymentOperationName;
  readonly status: PaymentOperationStatus;
  readonly provider?: string;
  readonly providerOperation?: string;
  readonly providerReference?: string;
  readonly providerStatus?: string;
  readonly providerProcessedAt?: string;
  readonly idempotencyKey?: string;
  readonly actorUserId?: string;
  readonly actorRole?: ActorRole;
  readonly requestId?: string;
  readonly errorMessage?: string;
  readonly metadata: Record<string, unknown>;
  readonly createdAt: string;
}

export type PaymentReconciliationCaseType =
  | "payment_failed"
  | "stripe_dispute"
  | "invalid_transition"
  | "duplicate_event"
  | "provider_mismatch";

export type PaymentReconciliationCaseStatus =
  | "open"
  | "waiting_customer"
  | "waiting_partner"
  | "resolved"
  | "written_off";

export type PaymentReconciliationCaseSeverity = "low" | "medium" | "high" | "critical";

export interface PaymentReconciliationCaseGuidance {
  readonly runbookKey: string;
  readonly recommendedAction: string;
  readonly actionLabel: string;
  readonly ownerTeam: "finance" | "support" | "partner_ops" | "engineering";
  readonly severity: PaymentReconciliationCaseSeverity;
  readonly slaHours: number;
  readonly customerImpact: string;
  readonly nextStep: string;
}

export interface PaymentReconciliationCase {
  readonly id: string;
  readonly caseType: PaymentReconciliationCaseType;
  readonly status: PaymentReconciliationCaseStatus;
  readonly bookingId: string;
  readonly ownerId: string;
  readonly paymentIntentId?: string;
  readonly paymentOperationId?: string;
  readonly providerReference?: string;
  readonly providerEventType?: string;
  readonly assignedToUserId?: string;
  readonly summary: string;
  readonly resolutionNotes?: string;
  readonly openedByUserId: string;
  readonly openedAt: string;
  readonly updatedAt: string;
  readonly resolvedAt?: string;
  readonly guidance: PaymentReconciliationCaseGuidance;
}

export interface PaymentReconciliationCaseEvent {
  readonly id: string;
  readonly caseId: string;
  readonly eventType: "created" | "note_added" | "status_changed" | "assigned" | "resolved";
  readonly actorUserId: string;
  readonly fromStatus?: PaymentReconciliationCaseStatus;
  readonly toStatus?: PaymentReconciliationCaseStatus;
  readonly note?: string;
  readonly metadata: Record<string, unknown>;
  readonly createdAt: string;
}

export interface CreatePaymentReconciliationCaseRequest {
  readonly paymentOperationId: string;
  readonly caseType: PaymentReconciliationCaseType;
  readonly summary: string;
  readonly assignedToUserId?: string;
  readonly note?: string;
}

export interface UpdatePaymentReconciliationCaseRequest {
  readonly status?: PaymentReconciliationCaseStatus;
  readonly assignedToUserId?: string | null;
  readonly note?: string;
  readonly resolutionNotes?: string;
}

export type PaymentReconciliationEvidenceRequestTarget = "partner" | "customer";

export interface CreatePaymentReconciliationEvidenceRequest {
  readonly target: PaymentReconciliationEvidenceRequestTarget;
  readonly evidenceKey: string;
  readonly message: string;
}

export interface PaymentReconciliationEvidenceRequestResponse {
  readonly caseDetail: PaymentReconciliationCaseDetail;
  readonly thread: CommunicationThreadWithMessages;
}

export interface PaymentReconciliationCaseDetail {
  readonly case: PaymentReconciliationCase;
  readonly events: readonly PaymentReconciliationCaseEvent[];
}

export type EvidencePackItemStatus = "present" | "missing" | "not_applicable";

export interface EvidencePackChecklistItem {
  readonly key: string;
  readonly label: string;
  readonly status: EvidencePackItemStatus;
  readonly detail?: string;
}

export type EvidencePackRequestedEvidenceStatus = "open" | "satisfied";

export interface EvidencePackRequestedEvidence {
  readonly messageId: string;
  readonly threadId: string;
  readonly target: PaymentReconciliationEvidenceRequestTarget;
  readonly evidenceKey: string;
  readonly label: string;
  readonly message: string;
  readonly requestedAt: string;
  readonly status: EvidencePackRequestedEvidenceStatus;
  readonly satisfiedBy: readonly string[];
}

export interface PaymentReconciliationEvidencePack {
  readonly case: PaymentReconciliationCase;
  readonly events: readonly PaymentReconciliationCaseEvent[];
  readonly booking?: Booking;
  readonly vehicle?: Vehicle;
  readonly partnerLocation?: PartnerLocation;
  readonly paymentIntent?: PaymentIntent;
  readonly paymentOperations: readonly PaymentOperation[];
  readonly bookingEvidence: readonly BookingEvidence[];
  readonly bookingHandovers: readonly BookingHandover[];
  readonly bookingConsents: readonly BookingConsent[];
  readonly serviceRecord?: ServiceRecord;
  readonly communicationThreads: readonly CommunicationThreadWithMessages[];
  readonly requestedEvidence: readonly EvidencePackRequestedEvidence[];
  readonly auditEvents: readonly AuditEvent[];
  readonly checklist: readonly EvidencePackChecklistItem[];
  readonly generatedAt: string;
}

export type PaymentProviderReconciliationRunStatus = "running" | "completed" | "failed";

export interface PaymentProviderReconciliationRun {
  readonly id: string;
  readonly provider: string;
  readonly status: PaymentProviderReconciliationRunStatus;
  readonly actorUserId?: string;
  readonly requestId?: string;
  readonly checked: number;
  readonly matched: number;
  readonly mismatched: number;
  readonly failed: number;
  readonly casesOpened: number;
  readonly errorMessage?: string;
  readonly startedAt: string;
  readonly completedAt?: string;
}

export interface BillingSession {
  readonly provider: string;
  readonly providerCustomerId: string;
  readonly ephemeralKeySecret?: string;
  readonly setupIntentClientSecret?: string;
}

export interface PaymentMethodSummary {
  readonly id: string;
  readonly provider: string;
  readonly brand: string;
  readonly last4: string;
  readonly expMonth: number;
  readonly expYear: number;
  readonly isDefault: boolean;
}

export interface PaymentHistoryItem {
  readonly paymentIntentId: string;
  readonly bookingId: string;
  readonly serviceCode: ServiceCode;
  readonly scheduledStartAt: string;
  readonly amount: Money;
  readonly status: PaymentStatus;
  readonly provider?: string;
  readonly providerReference?: string;
  readonly authorizedAt?: string;
  readonly capturedAt?: string;
  readonly refundedAt?: string;
  readonly voidedAt?: string;
  readonly createdAt: string;
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
  readonly onsiteServiceMode?: BookingOnsiteServiceMode;
  readonly executionNotes?: string;
  readonly serviceCode: ServiceCode;
}

export interface HealthResponse {
  readonly service: "prima-wash-api";
  readonly status: "ok";
  readonly httpStatus: 200;
  readonly timestamp: string;
}

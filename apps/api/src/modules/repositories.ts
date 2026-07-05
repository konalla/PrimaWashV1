import { createDatabasePool, type DatabasePool } from "../db/pool.js";
import {
  InMemoryAvailabilityRepository,
  PostgresAvailabilityRepository,
  type AvailabilityRepository,
} from "./availability/repository.js";
import { InMemoryAuditRepository, PostgresAuditRepository, type AuditRepository } from "./audit/repository.js";
import {
  InMemoryBookingRepository,
  PostgresBookingRepository,
  type BookingRepository,
} from "./bookings/repository.js";
import {
  InMemoryBookingHoldRepository,
  PostgresBookingHoldRepository,
  type BookingHoldRepository,
} from "./booking-holds/repository.js";
import {
  InMemoryBookingEvidenceRepository,
  PostgresBookingEvidenceRepository,
  type BookingEvidenceRepository,
} from "./booking-evidence/repository.js";
import {
  InMemoryBookingConsentRepository,
  PostgresBookingConsentRepository,
  type BookingConsentRepository,
} from "./booking-consents/repository.js";
import {
  InMemoryBookingHandoverRepository,
  PostgresBookingHandoverRepository,
  type BookingHandoverRepository,
} from "./booking-handovers/repository.js";
import {
  InMemoryServiceRecordRepository,
  PostgresServiceRecordRepository,
  type ServiceRecordRepository,
} from "./service-records/repository.js";
import {
  InMemoryProductEventRepository,
  PostgresProductEventRepository,
  type ProductEventRepository,
} from "./product-events/repository.js";
import {
  InMemoryPaymentRepository,
  PostgresPaymentRepository,
  type PaymentRepository,
} from "./payments/repository.js";
import {
  InMemoryPaymentOperationRepository,
  PostgresPaymentOperationRepository,
  type PaymentOperationRepository,
} from "./payment-operations/repository.js";
import {
  InMemoryVehicleRepository,
  PostgresVehicleRepository,
  type VehicleRepository,
} from "./vehicles/repository.js";
import {
  InMemoryProfileRepository,
  PostgresProfileRepository,
  type ProfileRepository,
} from "./profiles/repository.js";
import {
  InMemoryPartnerRepository,
  PostgresPartnerRepository,
  type PartnerRepository,
} from "./partners/repository.js";
import {
  InMemoryPropertyRepository,
  PostgresPropertyRepository,
  type PropertyRepository,
} from "./properties/repository.js";
import {
  InMemoryCondoOperationsRepository,
  PostgresCondoOperationsRepository,
  type CondoOperationsRepository,
} from "./condo-operations/repository.js";
import {
  InMemoryCapacityTemplateRepository,
  PostgresCapacityTemplateRepository,
  type CapacityTemplateRepository,
} from "./capacity-templates/repository.js";
import {
  InMemorySchedulingConfigRepository,
  PostgresSchedulingConfigRepository,
  type SchedulingConfigRepository,
} from "./scheduling/repository.js";
import {
  InMemoryCommunicationRepository,
  PostgresCommunicationRepository,
  type CommunicationRepository,
} from "./communications/repository.js";
import {
  InMemoryAccessControlRepository,
  PostgresAccessControlRepository,
  type AccessControlRepository,
} from "./access-control/repository.js";
import {
  InMemoryInvitationRepository,
  PostgresInvitationRepository,
  type InvitationRepository,
} from "./invitations/repository.js";
import { InMemoryAuthRepository, PostgresAuthRepository, type AuthRepository } from "./auth/repository.js";

export interface Repositories {
  readonly availability: AvailabilityRepository;
  readonly vehicles: VehicleRepository;
  readonly bookings: BookingRepository;
  readonly bookingHolds: BookingHoldRepository;
  readonly bookingConsents: BookingConsentRepository;
  readonly bookingEvidence: BookingEvidenceRepository;
  readonly bookingHandovers: BookingHandoverRepository;
  readonly serviceRecords: ServiceRecordRepository;
  readonly productEvents: ProductEventRepository;
  readonly payments: PaymentRepository;
  readonly paymentOperations: PaymentOperationRepository;
  readonly audit: AuditRepository;
  readonly profiles: ProfileRepository;
  readonly partners: PartnerRepository;
  readonly properties: PropertyRepository;
  readonly condoOperations: CondoOperationsRepository;
  readonly capacityTemplates: CapacityTemplateRepository;
  readonly scheduling: SchedulingConfigRepository;
  readonly communications: CommunicationRepository;
  readonly accessControl: AccessControlRepository;
  readonly invitations: InvitationRepository;
  readonly auth: AuthRepository;
  readonly databasePool?: DatabasePool;
}

export function createRepositories(databaseUrl?: string): Repositories {
  if (!databaseUrl) {
    const availability = new InMemoryAvailabilityRepository();
    const condoOperations = new InMemoryCondoOperationsRepository();

    return {
      availability,
      vehicles: new InMemoryVehicleRepository(),
      bookings: new InMemoryBookingRepository(availability, condoOperations),
      bookingHolds: new InMemoryBookingHoldRepository(),
      bookingConsents: new InMemoryBookingConsentRepository(),
      bookingEvidence: new InMemoryBookingEvidenceRepository(),
      bookingHandovers: new InMemoryBookingHandoverRepository(),
      serviceRecords: new InMemoryServiceRecordRepository(),
      productEvents: new InMemoryProductEventRepository(),
      payments: new InMemoryPaymentRepository(),
      paymentOperations: new InMemoryPaymentOperationRepository(),
      audit: new InMemoryAuditRepository(),
      profiles: new InMemoryProfileRepository(),
      partners: new InMemoryPartnerRepository(),
      properties: new InMemoryPropertyRepository(),
      condoOperations,
      capacityTemplates: new InMemoryCapacityTemplateRepository(),
      scheduling: new InMemorySchedulingConfigRepository(),
      communications: new InMemoryCommunicationRepository(),
      accessControl: new InMemoryAccessControlRepository(),
      invitations: new InMemoryInvitationRepository(),
      auth: new InMemoryAuthRepository(),
    };
  }

  const databasePool = createDatabasePool(databaseUrl);
  const availability = new PostgresAvailabilityRepository(databasePool);

  return {
    availability,
    vehicles: new PostgresVehicleRepository(databasePool),
    bookings: new PostgresBookingRepository(databasePool),
    bookingHolds: new PostgresBookingHoldRepository(databasePool),
    bookingConsents: new PostgresBookingConsentRepository(databasePool),
    bookingEvidence: new PostgresBookingEvidenceRepository(databasePool),
    bookingHandovers: new PostgresBookingHandoverRepository(databasePool),
    serviceRecords: new PostgresServiceRecordRepository(databasePool),
    productEvents: new PostgresProductEventRepository(databasePool),
    payments: new PostgresPaymentRepository(databasePool),
    paymentOperations: new PostgresPaymentOperationRepository(databasePool),
    audit: new PostgresAuditRepository(databasePool),
    profiles: new PostgresProfileRepository(databasePool),
    partners: new PostgresPartnerRepository(databasePool),
    properties: new PostgresPropertyRepository(databasePool),
    condoOperations: new PostgresCondoOperationsRepository(databasePool),
    capacityTemplates: new PostgresCapacityTemplateRepository(databasePool),
    scheduling: new PostgresSchedulingConfigRepository(databasePool),
    communications: new PostgresCommunicationRepository(databasePool),
    accessControl: new PostgresAccessControlRepository(databasePool),
    invitations: new PostgresInvitationRepository(databasePool),
    auth: new PostgresAuthRepository(databasePool),
    databasePool,
  };
}

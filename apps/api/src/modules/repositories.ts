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
  InMemoryCapacityTemplateRepository,
  PostgresCapacityTemplateRepository,
  type CapacityTemplateRepository,
} from "./capacity-templates/repository.js";
import {
  InMemorySchedulingConfigRepository,
  PostgresSchedulingConfigRepository,
  type SchedulingConfigRepository,
} from "./scheduling/repository.js";

export interface Repositories {
  readonly availability: AvailabilityRepository;
  readonly vehicles: VehicleRepository;
  readonly bookings: BookingRepository;
  readonly bookingHolds: BookingHoldRepository;
  readonly serviceRecords: ServiceRecordRepository;
  readonly productEvents: ProductEventRepository;
  readonly payments: PaymentRepository;
  readonly audit: AuditRepository;
  readonly profiles: ProfileRepository;
  readonly partners: PartnerRepository;
  readonly capacityTemplates: CapacityTemplateRepository;
  readonly scheduling: SchedulingConfigRepository;
  readonly databasePool?: DatabasePool;
}

export function createRepositories(databaseUrl?: string): Repositories {
  if (!databaseUrl) {
    const availability = new InMemoryAvailabilityRepository();

    return {
      availability,
      vehicles: new InMemoryVehicleRepository(),
      bookings: new InMemoryBookingRepository(availability),
      bookingHolds: new InMemoryBookingHoldRepository(),
      serviceRecords: new InMemoryServiceRecordRepository(),
      productEvents: new InMemoryProductEventRepository(),
      payments: new InMemoryPaymentRepository(),
      audit: new InMemoryAuditRepository(),
      profiles: new InMemoryProfileRepository(),
      partners: new InMemoryPartnerRepository(),
      capacityTemplates: new InMemoryCapacityTemplateRepository(),
      scheduling: new InMemorySchedulingConfigRepository(),
    };
  }

  const databasePool = createDatabasePool(databaseUrl);
  const availability = new PostgresAvailabilityRepository(databasePool);

  return {
    availability,
    vehicles: new PostgresVehicleRepository(databasePool),
    bookings: new PostgresBookingRepository(databasePool),
    bookingHolds: new PostgresBookingHoldRepository(databasePool),
    serviceRecords: new PostgresServiceRecordRepository(databasePool),
    productEvents: new PostgresProductEventRepository(databasePool),
    payments: new PostgresPaymentRepository(databasePool),
    audit: new PostgresAuditRepository(databasePool),
    profiles: new PostgresProfileRepository(databasePool),
    partners: new PostgresPartnerRepository(databasePool),
    capacityTemplates: new PostgresCapacityTemplateRepository(databasePool),
    scheduling: new PostgresSchedulingConfigRepository(databasePool),
    databasePool,
  };
}

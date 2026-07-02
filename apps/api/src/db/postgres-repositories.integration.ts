import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { Booking } from "@prima-wash/contracts";
import { createDatabasePool, type DatabasePool } from "./pool.js";
import { PostgresAvailabilityRepository } from "../modules/availability/repository.js";
import { PostgresBookingRepository } from "../modules/bookings/repository.js";
import { PostgresPaymentRepository } from "../modules/payments/repository.js";
import { PostgresVehicleRepository } from "../modules/vehicles/repository.js";

const databaseUrl = process.env.DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:5432/prima_wash";

describe("Postgres repository parity", () => {
  let pool: DatabasePool;
  let availability: PostgresAvailabilityRepository;
  let bookings: PostgresBookingRepository;
  let payments: PostgresPaymentRepository;
  let vehicles: PostgresVehicleRepository;

  before(async () => {
    pool = createDatabasePool(databaseUrl);
    await pool.query("select 1");
    availability = new PostgresAvailabilityRepository(pool);
    bookings = new PostgresBookingRepository(pool);
    payments = new PostgresPaymentRepository(pool);
    vehicles = new PostgresVehicleRepository(pool);
  });

  after(async () => {
    await pool.end();
  });

  it("persists marketplace bookings, execution fields, and payment transitions", async () => {
    const suffix = crypto.randomUUID().slice(0, 8);
    const created: CleanupIds = {};

    try {
      const vehicle = await vehicles.create({
        ownerId: "usr_demo_001",
        plateNumber: `PG${suffix}`,
        make: "Prima",
        model: "Postgres",
        nickname: "Repository parity",
        year: 2026,
        isPrimary: false,
      });
      created.vehicleId = vehicle.id;

      const slot = await availability.create({
        partnerLocationId: "loc_demo_001",
        startsAt: "2026-07-05T02:00:00.000Z",
        endsAt: "2026-07-05T03:00:00.000Z",
        capacity: 2,
        serviceCodes: ["wash_basic", "wash_premium"],
      });
      created.slotId = slot.id;

      const booking = await bookings.create({
        ownerId: "usr_demo_001",
        vehicleId: vehicle.id,
        availabilitySlotId: slot.id,
        serviceCode: "wash_basic",
        onsiteServiceMode: "pickup_return",
        executionNotes: "Pick up from lobby and return after cleaning.",
      });
      created.bookingId = booking.id;

      assert.equal(booking.ownerId, "usr_demo_001");
      assert.equal(booking.vehicleId, vehicle.id);
      assert.equal(booking.partnerLocationId, "loc_demo_001");
      assert.equal(booking.onsiteServiceMode, "pickup_return");
      assert.equal(booking.valetRequested, true);
      assert.equal(booking.executionNotes, "Pick up from lobby and return after cleaning.");
      assert.equal(booking.acceptedPrice.amountMinor, 2500);

      const updatedExecution = await bookings.updateExecution(booking.id, {
        onsiteServiceMode: "customer_property",
        valetRequested: false,
        executionNotes: "Customer changed to home service.",
        technicianCheckedInAt: "2026-07-05T02:05:00.000Z",
        technicianCheckedOutAt: "2026-07-05T02:35:00.000Z",
      });

      assert.equal(updatedExecution.onsiteServiceMode, "customer_property");
      assert.equal(updatedExecution.valetRequested, false);
      assert.equal(updatedExecution.executionNotes, "Customer changed to home service.");
      assert.equal(updatedExecution.technicianCheckedInAt, "2026-07-05T02:05:00.000Z");
      assert.equal(updatedExecution.technicianCheckedOutAt, "2026-07-05T02:35:00.000Z");

      const payment = await payments.createForBooking(updatedExecution, {
        provider: "stripe",
        operation: "create",
        providerReference: `pi_postgres_${suffix}`,
        clientSecret: `secret_${suffix}`,
        status: "succeeded",
        processedAt: "2026-07-05T02:01:00.000Z",
      });
      created.paymentId = payment.id;

      assert.equal(payment.provider, "stripe");
      assert.equal(payment.providerReference, `pi_postgres_${suffix}`);
      assert.equal(payment.clientSecret, `secret_${suffix}`);
      assert.equal(payment.status, "requires_authorization");

      const idempotentPayment = await payments.createForBooking(updatedExecution, {
        provider: "stripe",
        operation: "create",
        providerReference: `pi_postgres_repeated_${suffix}`,
        status: "succeeded",
        processedAt: "2026-07-05T02:01:01.000Z",
      });
      assert.equal(idempotentPayment.id, payment.id);
      assert.equal(idempotentPayment.providerReference, payment.providerReference);

      const byProviderReference = await payments.getByProviderReference("stripe", `pi_postgres_${suffix}`);
      assert.equal(byProviderReference?.id, payment.id);

      const authorized = await payments.authorize(payment.id);
      assert.equal(authorized.status, "authorized");
      assert.ok(authorized.authorizedAt);

      const captured = await payments.captureByBookingId(updatedExecution.id);
      assert.equal(captured.status, "captured");
      assert.ok(captured.capturedAt);

      const refunded = await payments.refund(payment.id);
      assert.equal(refunded.status, "refunded");
      assert.ok(refunded.refundedAt);

      const listed = await bookings.list("usr_demo_001");
      assert.ok(listed.some((item) => item.id === booking.id));
    } finally {
      await cleanup(pool, created);
    }
  });

  it("persists Prima Wash Day bookings with property-service defaults", async () => {
    const suffix = crypto.randomUUID().slice(0, 8);
    const created: CleanupIds = {};

    try {
      const vehicle = await vehicles.create({
        ownerId: "usr_demo_001",
        plateNumber: `PWD${suffix}`,
        make: "Prima",
        model: "Condo",
        isPrimary: false,
      });
      created.vehicleId = vehicle.id;

      const booking = await bookings.create({
        ownerId: "usr_demo_001",
        vehicleId: vehicle.id,
        primaWashDayId: "pwd_sg_marina_one_20260704",
        serviceCode: "wash_premium",
      });
      created.bookingId = booking.id;

      assert.equal(booking.primaWashDayId, "pwd_sg_marina_one_20260704");
      assert.equal(booking.partnerLocationId, "loc_demo_001");
      assert.equal(booking.onsiteServiceMode, "customer_property");
      assert.equal(booking.valetRequested, false);
      assert.equal(booking.acceptedPrice.amountMinor, 4500);
      assert.equal(booking.status, "pending_payment");

      const confirmed = await bookings.updateStatus(booking.id, "confirmed");
      assert.equal(confirmed.status, "confirmed");

      const reloaded = await bookings.get(booking.id);
      assertPrimaWashDayBooking(reloaded);
    } finally {
      await cleanup(pool, created);
    }
  });
});

interface CleanupIds {
  bookingId?: string;
  paymentId?: string;
  slotId?: string;
  vehicleId?: string;
}

async function cleanup(pool: DatabasePool, ids: CleanupIds): Promise<void> {
  if (ids.paymentId) {
    await pool.query("delete from payment_intents where id = $1", [ids.paymentId]);
  }

  if (ids.bookingId) {
    await pool.query("delete from bookings where id = $1", [ids.bookingId]);
  }

  if (ids.slotId) {
    await pool.query("delete from availability_slots where id = $1", [ids.slotId]);
  }

  if (ids.vehicleId) {
    await pool.query("delete from vehicles where id = $1", [ids.vehicleId]);
  }
}

function assertPrimaWashDayBooking(booking: Booking | undefined): asserts booking is Booking {
  assert.ok(booking);
  assert.equal(booking.primaWashDayId, "pwd_sg_marina_one_20260704");
  assert.equal(booking.onsiteServiceMode, "customer_property");
  assert.equal(booking.status, "confirmed");
}

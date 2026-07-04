import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { Booking } from "@prima-wash/contracts";
import { createDatabasePool, type DatabasePool } from "./pool.js";
import { PostgresAvailabilityRepository } from "../modules/availability/repository.js";
import { PostgresAccessControlRepository } from "../modules/access-control/repository.js";
import { PostgresAuthRepository } from "../modules/auth/repository.js";
import { PostgresBookingRepository } from "../modules/bookings/repository.js";
import { PostgresCommunicationRepository } from "../modules/communications/repository.js";
import { PostgresCondoOperationsRepository } from "../modules/condo-operations/repository.js";
import { PostgresInvitationRepository } from "../modules/invitations/repository.js";
import { PostgresPaymentRepository } from "../modules/payments/repository.js";
import { PostgresVehicleRepository } from "../modules/vehicles/repository.js";

const databaseUrl = process.env.DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:5432/prima_wash";

describe("Postgres repository parity", () => {
  let pool: DatabasePool;
  let availability: PostgresAvailabilityRepository;
  let accessControl: PostgresAccessControlRepository;
  let auth: PostgresAuthRepository;
  let bookings: PostgresBookingRepository;
  let communications: PostgresCommunicationRepository;
  let condoOperations: PostgresCondoOperationsRepository;
  let invitations: PostgresInvitationRepository;
  let payments: PostgresPaymentRepository;
  let vehicles: PostgresVehicleRepository;

  before(async () => {
    pool = createDatabasePool(databaseUrl);
    await pool.query("select 1");
    availability = new PostgresAvailabilityRepository(pool);
    accessControl = new PostgresAccessControlRepository(pool);
    auth = new PostgresAuthRepository(pool);
    bookings = new PostgresBookingRepository(pool);
    communications = new PostgresCommunicationRepository(pool);
    condoOperations = new PostgresCondoOperationsRepository(pool);
    invitations = new PostgresInvitationRepository(pool);
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

  it("persists access invitations and creates scoped memberships", async () => {
    const suffix = crypto.randomUUID().slice(0, 8);
    const identifier = `partner-invite-${suffix}@example.com`;
    let invitationId: string | undefined;
    let userId: string | undefined;

    try {
      const invitation = await invitations.create({
        identifier,
        displayName: "Invited Partner",
        role: "partner",
        organizationId: "org_partner_001",
        partnerLocationId: "loc_demo_001",
        permissions: [],
        codeHash: `hash_${suffix}`,
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        invitedByUserId: "usr_internal_001",
      });
      invitationId = invitation.id;

      const loaded = await invitations.get(invitation.id);
      const accepted = await invitations.markAccepted(invitation.id, new Date().toISOString());
      const identity = await accessControl.createUserMembership({
        identifier,
        displayName: "Invited Partner",
        role: "partner",
        organizationId: "org_partner_001",
        partnerLocationId: "loc_demo_001",
      });
      userId = identity.user.id;
      const resolved = await accessControl.resolveLogin(identifier);

      assert.equal(loaded?.codeHash, `hash_${suffix}`);
      assert.equal(accepted?.acceptedAt !== undefined, true);
      assert.equal(identity.user.role, "partner");
      assert.equal(resolved?.actor.role, "partner");
      assert.equal(resolved?.actor.organizationId, "org_partner_001");
    } finally {
      if (invitationId) {
        await pool.query("delete from access_invitations where id = $1", [invitationId]);
      }

      if (userId) {
        await pool.query("delete from access_memberships where user_id = $1", [userId]);
        await pool.query("delete from users where id = $1", [userId]);
      } else {
        await pool.query("delete from users where lower(email) = $1", [identifier]);
      }
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

      const primaWashDay = await condoOperations.createPrimaWashDay({
        propertyId: "prop_sg_marina_one",
        partnerLocationId: "loc_demo_001",
        approvedServiceArea: "Temporary integration-test visitor lot",
        startsAt: "2026-07-11T01:00:00.000Z",
        endsAt: "2026-07-11T05:00:00.000Z",
        capacity: 3,
        serviceCodes: ["wash_premium"],
        status: "planned",
      });
      created.primaWashDayIds = [primaWashDay.id];

      const booking = await bookings.create({
        ownerId: "usr_demo_001",
        vehicleId: vehicle.id,
        primaWashDayId: primaWashDay.id,
        serviceCode: "wash_premium",
      });
      created.bookingId = booking.id;

      assert.equal(booking.primaWashDayId, primaWashDay.id);
      assert.equal(booking.partnerLocationId, "loc_demo_001");
      assert.equal(booking.onsiteServiceMode, "customer_property");
      assert.equal(booking.valetRequested, false);
      assert.equal(booking.acceptedPrice.amountMinor, 4500);
      assert.equal(booking.status, "pending_payment");

      const confirmed = await bookings.updateStatus(booking.id, "confirmed");
      assert.equal(confirmed.status, "confirmed");

      const reloaded = await bookings.get(booking.id);
      assertPrimaWashDayBooking(reloaded, primaWashDay.id);
    } finally {
      await cleanup(pool, created);
    }
  });

  it("preserves communication thread history when existing threads are reused", async () => {
    const suffix = crypto.randomUUID().slice(0, 8);
    const created: CleanupIds = {};
    const actor = {
      userId: "usr_internal_001",
      role: "internal" as const,
      permissions: ["super_admin"] as const,
    };

    try {
      const thread = await communications.create({
        type: "prima_to_property",
        resourceType: "property",
        resourceId: `prop_comm_${suffix}`,
        subject: "Initial property operations thread",
        actor,
        initialMessage: "First immutable note for office management.",
      });
      created.threadId = thread.id;

      const reusedThread = await communications.create({
        type: "prima_to_property",
        resourceType: "property",
        resourceId: `prop_comm_${suffix}`,
        subject: "Updated subject without deleting history",
        actor,
        initialMessage: "Second note appended when thread is reused.",
      });

      assert.equal(reusedThread.id, thread.id);

      const partnerMessage = await communications.addMessage({
        threadId: thread.id,
        actor: {
          userId: "partner_demo_001",
          organizationId: "org_partner_001",
          role: "partner",
        },
        body: "Partner response is appended, not replacing prior messages.",
      });

      assert.equal(partnerMessage.threadId, thread.id);

      const messages = await communications.getMessages(thread.id);
      assert.deepEqual(
        messages.map((message) => message.body),
        [
          "First immutable note for office management.",
          "Second note appended when thread is reused.",
          "Partner response is appended, not replacing prior messages.",
        ],
      );

      const listed = await communications.list({ resourceType: "property", resourceId: `prop_comm_${suffix}` });
      assert.equal(listed.length, 1);
      assert.equal(listed[0]?.id, thread.id);
    } finally {
      await cleanup(pool, created);
    }
  });

  it("persists condo operational profiles and multiple Prima Wash Days for one property", async () => {
    const suffix = crypto.randomUUID().slice(0, 8);
    const propertyId = `prop_smoke_${suffix}`;
    const created: CleanupIds = { propertyId, primaWashDayIds: [] };

    try {
      await createTemporaryProperty(pool, propertyId, `Smoke Condo ${suffix}`);

      const profile = await condoOperations.upsertOperationalProfile(propertyId, {
        approvedServiceAreas: ["B1 visitor bay 12", "Loading bay after 7pm"],
        operatingInstructions: "Check in with security before setting cones.",
        waterPolicy: "rinseless_required",
        vehicleMovementPolicy: "pickup_return_allowed",
        onsiteServiceAllowed: true,
        pickupReturnAllowed: true,
        simultaneousVehicleCapacity: 4,
        availableServiceCodes: ["wash_basic", "wash_premium", "detail_interior"],
        safetyRequirements: "Keep pedestrian walkway clear.",
      });

      assert.equal(profile.propertyId, propertyId);
      assert.deepEqual(profile.approvedServiceAreas, ["B1 visitor bay 12", "Loading bay after 7pm"]);
      assert.equal(profile.waterPolicy, "rinseless_required");
      assert.equal(profile.vehicleMovementPolicy, "pickup_return_allowed");
      assert.equal(profile.pickupReturnAllowed, true);
      assert.equal(profile.simultaneousVehicleCapacity, 4);

      const updatedProfile = await condoOperations.upsertOperationalProfile(propertyId, {
        simultaneousVehicleCapacity: 6,
        waterPolicy: "water_access_available",
      });

      assert.deepEqual(updatedProfile.approvedServiceAreas, ["B1 visitor bay 12", "Loading bay after 7pm"]);
      assert.equal(updatedProfile.simultaneousVehicleCapacity, 6);
      assert.equal(updatedProfile.waterPolicy, "water_access_available");

      const firstDay = await condoOperations.createPrimaWashDay({
        propertyId,
        partnerLocationId: "loc_demo_001",
        approvedServiceArea: "B1 visitor bay 12",
        startsAt: "2026-07-08T01:00:00.000Z",
        endsAt: "2026-07-08T05:00:00.000Z",
        capacity: 10,
        serviceCodes: ["wash_basic", "wash_premium"],
        status: "planned",
        operatingNotes: "Rinseless setup only.",
      });
      created.primaWashDayIds?.push(firstDay.id);

      const secondDay = await condoOperations.createPrimaWashDay({
        propertyId,
        partnerLocationId: "loc_demo_001",
        approvedServiceArea: "Loading bay after 7pm",
        startsAt: "2026-07-09T11:00:00.000Z",
        endsAt: "2026-07-09T14:00:00.000Z",
        capacity: 8,
        serviceCodes: ["detail_interior"],
        status: "planned",
        operatingNotes: "Interior jobs only.",
      });
      created.primaWashDayIds?.push(secondDay.id);

      const updatedDay = await condoOperations.updatePrimaWashDay(firstDay.id, {
        capacity: 12,
        status: "approved",
        serviceCodes: ["wash_basic", "wash_premium", "detail_interior"],
      });

      assert.equal(updatedDay.capacity, 12);
      assert.equal(updatedDay.status, "approved");
      assert.deepEqual(updatedDay.serviceCodes, ["wash_basic", "wash_premium", "detail_interior"]);

      const days = await condoOperations.listPrimaWashDays({ propertyId });
      assert.equal(days.length, 2);
      assert.deepEqual(
        days.map((day) => day.id).sort(),
        [firstDay.id, secondDay.id].sort(),
      );
      assert.ok(days.every((day) => day.propertyName === `Smoke Condo ${suffix}`));
    } finally {
      await cleanup(pool, created);
    }
  });

  it("resolves actors from persisted access memberships", async () => {
    const partnerActor = await accessControl.resolveActor({
      userId: "partner_demo_001",
      role: "partner",
      organizationId: "org_partner_999",
    });
    const internalActor = await accessControl.resolveActor({
      userId: "usr_internal_001",
      role: "internal",
    });
    const propertyManagerActor = await accessControl.resolveActor({
      userId: "mgr_marina_001",
      role: "property_manager",
      propertyId: "prop_sg_reflections",
    });
    const unknownPartner = await accessControl.resolveActor({
      userId: `partner_unknown_${crypto.randomUUID().slice(0, 8)}`,
      role: "partner",
      organizationId: "org_partner_001",
    });

    assert.equal(partnerActor?.role, "partner");
    assert.equal(partnerActor?.organizationId, "org_partner_001");
    assert.equal(internalActor?.role, "internal");
    assert.deepEqual(internalActor?.permissions, ["super_admin"]);
    assert.equal(propertyManagerActor?.role, "property_manager");
    assert.equal(propertyManagerActor?.propertyId, "prop_sg_marina_one");
    assert.equal(unknownPartner, undefined);
  });

  it("resolves login identities from persisted users and memberships", async () => {
    const internalLogin = await accessControl.resolveLogin("internal.demo@primawash.local");
    const opsReadLogin = await accessControl.resolveLogin("ops.read@primawash.local");
    const partnerLogin = await accessControl.resolveLogin("partner.demo@primawash.local");
    const propertyManagerLogin = await accessControl.resolveLogin("manager.marina@primawash.local");
    const customerFallback = await accessControl.resolveLogin("not-seeded@example.com");

    assert.equal(internalLogin?.user.id, "usr_internal_001");
    assert.equal(internalLogin?.user.role, "internal");
    assert.deepEqual(internalLogin?.actor.permissions, ["super_admin"]);
    assert.equal(opsReadLogin?.user.id, "usr_internal_ops_read_001");
    assert.deepEqual(opsReadLogin?.actor.permissions, ["operations_read", "finance_read"]);
    assert.equal(partnerLogin?.user.role, "partner");
    assert.equal(partnerLogin?.actor.organizationId, "org_partner_001");
    assert.equal(propertyManagerLogin?.user.role, "property_manager");
    assert.equal(propertyManagerLogin?.actor.propertyId, "prop_sg_marina_one");
    assert.equal(customerFallback, undefined);
  });

  it("persists auth challenges, attempts, sessions, and revocation", async () => {
    const suffix = crypto.randomUUID().slice(0, 8);
    const challenge = await auth.createChallenge({
      identifier: `auth-${suffix}@example.com`,
      codeHash: `hash_${suffix}`,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    const attempted = await auth.incrementChallengeAttempts(challenge.id);
    const session = await auth.createSession({
      userId: `usr_auth_${suffix}`,
      role: "customer",
      identifier: `auth-${suffix}@example.com`,
      issuedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    const refreshToken = await auth.createRefreshToken({
      sessionId: session.id,
      userId: session.userId,
      role: session.role,
      identifier: session.identifier,
      tokenHash: `refresh_hash_${suffix}`,
      familyId: `refresh_family_${suffix}`,
      issuedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    const replacement = await auth.createRefreshToken({
      sessionId: session.id,
      userId: session.userId,
      role: session.role,
      identifier: session.identifier,
      tokenHash: `replacement_hash_${suffix}`,
      familyId: refreshToken.familyId,
      issuedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    const loadedSession = await auth.getSession(session.id);
    const loadedRefreshToken = await auth.getRefreshTokenByHash(`refresh_hash_${suffix}`);
    const usedRefreshToken = await auth.markRefreshTokenUsed(refreshToken.id, {
      usedAt: new Date().toISOString(),
      replacedByTokenId: replacement.id,
    });
    const revokedFamilyCount = await auth.revokeRefreshTokenFamily(refreshToken.familyId, new Date().toISOString());
    const revoked = await auth.revokeSession(session.id);

    try {
      assert.equal((await auth.getChallenge(challenge.id))?.codeHash, `hash_${suffix}`);
      assert.equal(attempted?.attempts, 1);
      assert.equal(loadedSession?.userId, `usr_auth_${suffix}`);
      assert.equal(loadedRefreshToken?.id, refreshToken.id);
      assert.equal(usedRefreshToken?.replacedByTokenId, replacement.id);
      assert.equal(revokedFamilyCount >= 2, true);
      assert.equal(revoked?.revokedAt !== undefined, true);
    } finally {
      await auth.deleteChallenge(challenge.id);
      await pool.query("delete from auth_sessions where id = $1", [session.id]);
    }
  });

  it("tracks auth request limits and cleans expired auth records safely", async () => {
    const suffix = crypto.randomUUID().slice(0, 8);
    const identifier = `limit-${suffix}@example.com`;
    let latestLimitResult;

    for (let index = 0; index < 6; index += 1) {
      latestLimitResult = await auth.recordCodeRequest({
        identifier,
        source: "198.51.100.20",
        occurredAt: new Date().toISOString(),
        windowStartsAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
        maxAttempts: 5,
      });
    }

    const expiredChallenge = await auth.createChallenge({
      identifier: `expired-${suffix}@example.com`,
      codeHash: `expired_hash_${suffix}`,
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
    });
    const validChallenge = await auth.createChallenge({
      identifier: `valid-${suffix}@example.com`,
      codeHash: `valid_hash_${suffix}`,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    const expiredSession = await auth.createSession({
      userId: `usr_expired_${suffix}`,
      role: "customer",
      identifier: `expired-${suffix}@example.com`,
      issuedAt: new Date(Date.now() - 120_000).toISOString(),
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
    });
    const validSession = await auth.createSession({
      userId: `usr_valid_${suffix}`,
      role: "customer",
      identifier: `valid-${suffix}@example.com`,
      issuedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    const expiredRefreshSession = await auth.createSession({
      userId: `usr_expired_refresh_${suffix}`,
      role: "customer",
      identifier: `expired-refresh-${suffix}@example.com`,
      issuedAt: new Date(Date.now() - 120_000).toISOString(),
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
    });
    const activeRefreshSession = await auth.createSession({
      userId: `usr_active_refresh_${suffix}`,
      role: "customer",
      identifier: `active-refresh-${suffix}@example.com`,
      issuedAt: new Date(Date.now() - 120_000).toISOString(),
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
    });
    const expiredRefreshToken = await auth.createRefreshToken({
      sessionId: expiredRefreshSession.id,
      userId: expiredRefreshSession.userId,
      role: expiredRefreshSession.role,
      identifier: expiredRefreshSession.identifier,
      tokenHash: `expired_refresh_hash_${suffix}`,
      familyId: `expired_refresh_family_${suffix}`,
      issuedAt: new Date(Date.now() - 120_000).toISOString(),
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
    });
    const activeRefreshToken = await auth.createRefreshToken({
      sessionId: activeRefreshSession.id,
      userId: activeRefreshSession.userId,
      role: activeRefreshSession.role,
      identifier: activeRefreshSession.identifier,
      tokenHash: `active_refresh_hash_${suffix}`,
      familyId: `active_refresh_family_${suffix}`,
      issuedAt: new Date(Date.now() - 120_000).toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    const cleanup = await auth.cleanupExpired({
      now: new Date().toISOString(),
      rateLimitEventsBefore: new Date(Date.now() + 1_000).toISOString(),
      revokedSessionsBefore: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      refreshTokensBefore: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    });

    try {
      assert.equal(latestLimitResult?.allowed, false);
      assert.equal(latestLimitResult?.count, 6);
      assert.equal(cleanup.deletedChallenges >= 1, true);
      assert.equal(cleanup.deletedRateLimitEvents >= 6, true);
      assert.equal(cleanup.deletedSessions >= 1, true);
      assert.equal(cleanup.deletedRefreshTokens >= 1, true);
      assert.equal(await auth.getChallenge(expiredChallenge.id), undefined);
      assert.equal((await auth.getChallenge(validChallenge.id))?.id, validChallenge.id);
      assert.equal(await auth.getSession(expiredSession.id), undefined);
      assert.equal((await auth.getSession(validSession.id))?.id, validSession.id);
      assert.equal(await auth.getRefreshTokenByHash(expiredRefreshToken.tokenHash), undefined);
      assert.equal((await auth.getRefreshTokenByHash(activeRefreshToken.tokenHash))?.id, activeRefreshToken.id);
      assert.equal((await auth.getSession(activeRefreshSession.id))?.id, activeRefreshSession.id);
    } finally {
      await auth.deleteChallenge(validChallenge.id);
      await pool.query("delete from auth_sessions where id = $1", [validSession.id]);
      await pool.query("delete from auth_sessions where id = $1", [expiredRefreshSession.id]);
      await pool.query("delete from auth_sessions where id = $1", [activeRefreshSession.id]);
      await pool.query("delete from auth_rate_limit_events where identifier = $1", [identifier]);
    }
  });
});

interface CleanupIds {
  bookingId?: string;
  paymentId?: string;
  primaWashDayIds?: string[];
  propertyId?: string;
  slotId?: string;
  threadId?: string;
  vehicleId?: string;
}

async function cleanup(pool: DatabasePool, ids: CleanupIds): Promise<void> {
  if (ids.threadId) {
    await pool.query("delete from communication_threads where id = $1", [ids.threadId]);
  }

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

  for (const dayId of ids.primaWashDayIds ?? []) {
    await pool.query("delete from prima_wash_days where id = $1", [dayId]);
  }

  if (ids.propertyId) {
    await pool.query("delete from condo_operational_profiles where property_id = $1", [ids.propertyId]);
    await pool.query("delete from properties where id = $1", [ids.propertyId]);
  }
}

async function createTemporaryProperty(pool: DatabasePool, propertyId: string, name: string): Promise<void> {
  await pool.query(
    `insert into properties (
       id, market_id, residence_type, name, address_line_1, city, region, country_code, activation_status
     )
     values ($1, 'sg', 'multi_unit_private', $2, '1 Smoke Test Drive', 'Singapore', 'Central Region', 'SG', 'interest_gathering')`,
    [propertyId, name],
  );
}

function assertPrimaWashDayBooking(booking: Booking | undefined, primaWashDayId: string): asserts booking is Booking {
  assert.ok(booking);
  assert.equal(booking.primaWashDayId, primaWashDayId);
  assert.equal(booking.onsiteServiceMode, "customer_property");
  assert.equal(booking.status, "confirmed");
}

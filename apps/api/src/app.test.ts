import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import type {
  ApiErrorResponse,
  AuthSession,
  CustomerProfile,
  Booking,
  BookingStatus,
  CapacityTemplate,
  GenerateCapacityTemplateSlotsResponse,
  AvailabilitySearchResponse,
  CreateBookingHoldResponse,
  SchedulingConfig,
  PartnerDashboardResponse,
  PartnerLocation,
  PartnerAvailabilitySlot,
  MavoResponse,
  PaymentIntent,
  ServiceRecord,
  Vehicle,
} from "@prima-wash/contracts";
import { createApiServer } from "./app.js";
import { createRepositories } from "./modules/repositories.js";

interface ApiResponse<T> {
  readonly data: T;
}

const customerHeaders = {
  "content-type": "application/json",
  "x-prima-user-id": "usr_demo_001",
  "x-prima-role": "customer",
  "x-request-id": "test-request-001",
};

const partnerHeaders = {
  "x-prima-user-id": "partner_demo_001",
  "x-prima-role": "partner",
  "x-prima-organization-id": "org_partner_001",
};

const internalHeaders = {
  "x-prima-user-id": "usr_internal_001",
  "x-prima-role": "internal",
};

describe("Prima Wash API", () => {
  let server: Server;
  let baseUrl: string;

  before(async () => {
    server = createApiServer({
      repositories: createRepositories(),
      enableRequestLogging: false,
    });

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", resolve);
    });

    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  after(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  });

  it("requires authentication for customer vehicle reads", async () => {
    const response = await fetch(`${baseUrl}/v1/vehicles`);
    const payload = (await response.json()) as ApiErrorResponse;

    assert.equal(response.status, 401);
    assert.equal(payload.code, "authentication_required");
  });

  it("creates a bearer session from a verified development code", async () => {
    const requestResponse = await fetch(`${baseUrl}/v1/auth/code/request`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ identifier: "nalla@example.com" }),
    });
    const requestPayload = (await requestResponse.json()) as ApiResponse<{
      challengeId: string;
      devCode?: string;
    }>;

    assert.equal(requestResponse.status, 201);
    assert.equal(requestPayload.data.devCode, "123456");

    const verifyResponse = await fetch(`${baseUrl}/v1/auth/code/verify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        challengeId: requestPayload.data.challengeId,
        code: requestPayload.data.devCode,
      }),
    });
    const verifyPayload = (await verifyResponse.json()) as ApiResponse<AuthSession>;

    assert.equal(verifyResponse.status, 200);
    assert.equal(verifyPayload.data.user.displayName, "Nalla");
    assert.equal(verifyPayload.data.user.role, "customer");

    const vehiclesResponse = await fetch(`${baseUrl}/v1/vehicles`, {
      headers: { authorization: `Bearer ${verifyPayload.data.accessToken}` },
    });

    assert.equal(vehiclesResponse.status, 200);
  });

  it("rejects an incorrect verification code", async () => {
    const requestResponse = await fetch(`${baseUrl}/v1/auth/code/request`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ identifier: "+12025550123" }),
    });
    const requestPayload = (await requestResponse.json()) as ApiResponse<{ challengeId: string }>;
    const verifyResponse = await fetch(`${baseUrl}/v1/auth/code/verify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ challengeId: requestPayload.data.challengeId, code: "000000" }),
    });
    const verifyPayload = (await verifyResponse.json()) as ApiErrorResponse;

    assert.equal(verifyResponse.status, 401);
    assert.equal(verifyPayload.code, "invalid_auth_code");
  });

  it("persists an authenticated customer profile", async () => {
    const session = await createCustomerSession("profile@example.com");
    const updateResponse = await fetch(`${baseUrl}/v1/profile`, {
      method: "PATCH",
      headers: {
        authorization: `Bearer ${session.accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ displayName: "Profile Owner", phoneNumber: "+12025550199" }),
    });
    const updatePayload = (await updateResponse.json()) as ApiResponse<CustomerProfile>;
    assert.equal(updateResponse.status, 200);
    assert.equal(updatePayload.data.displayName, "Profile Owner");

    const readResponse = await fetch(`${baseUrl}/v1/profile`, {
      headers: { authorization: `Bearer ${session.accessToken}` },
    });
    const readPayload = (await readResponse.json()) as ApiResponse<CustomerProfile>;
    assert.equal(readPayload.data.phoneNumber, "+12025550199");
  });

  it("persists residential profile context for Singapore condo onboarding", async () => {
    const session = await createCustomerSession("residence@example.com");
    const updateResponse = await fetch(`${baseUrl}/v1/profile`, {
      method: "PATCH",
      headers: {
        authorization: `Bearer ${session.accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        residentialProfile: {
          residenceType: "multi_unit_private",
          localResidenceLabel: "Condominium",
          propertyName: "The Seafront Residences",
          propertyAddress: "1 Example Coast Road",
          parkingNotes: "Basement visitor lots near lift lobby",
        },
      }),
    });
    const updatePayload = (await updateResponse.json()) as ApiResponse<CustomerProfile>;

    assert.equal(updateResponse.status, 200);
    assert.equal(updatePayload.data.residentialProfile?.marketId, "sg");
    assert.equal(updatePayload.data.residentialProfile?.marketMode, "residence_partnership");
    assert.equal(updatePayload.data.residentialProfile?.residenceType, "multi_unit_private");
    assert.equal(updatePayload.data.residentialProfile?.propertyActivationStatus, "suggested");

    const readResponse = await fetch(`${baseUrl}/v1/profile`, {
      headers: { authorization: `Bearer ${session.accessToken}` },
    });
    const readPayload = (await readResponse.json()) as ApiResponse<CustomerProfile>;

    assert.equal(readResponse.status, 200);
    assert.equal(readPayload.data.residentialProfile?.propertyName, "The Seafront Residences");
  });

  it("manages authenticated garage vehicles without duplicate booking vehicles", async () => {
    const session = await createCustomerSession("garage@example.com");
    const headers = {
      authorization: `Bearer ${session.accessToken}`,
      "content-type": "application/json",
    };
    const firstResponse = await fetch(`${baseUrl}/v1/vehicles`, {
      method: "POST",
      headers,
      body: JSON.stringify({ plateNumber: "GARAGE1", make: "Tesla", model: "Model Y" }),
    });
    const firstPayload = (await firstResponse.json()) as ApiResponse<Vehicle>;
    assert.equal(firstPayload.data.isPrimary, true);

    const secondResponse = await fetch(`${baseUrl}/v1/vehicles`, {
      method: "POST",
      headers,
      body: JSON.stringify({ plateNumber: "GARAGE2", make: "BMW", model: "i4" }),
    });
    const secondPayload = (await secondResponse.json()) as ApiResponse<Vehicle>;
    assert.equal(secondPayload.data.isPrimary, false);

    const primaryResponse = await fetch(`${baseUrl}/v1/vehicles/${secondPayload.data.id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ isPrimary: true, nickname: "Weekend" }),
    });
    const primaryPayload = (await primaryResponse.json()) as ApiResponse<Vehicle>;
    assert.equal(primaryPayload.data.isPrimary, true);
    assert.equal(primaryPayload.data.nickname, "Weekend");

    const listResponse = await fetch(`${baseUrl}/v1/vehicles`, { headers });
    const listPayload = (await listResponse.json()) as ApiResponse<Vehicle[]>;
    assert.equal(listPayload.data.filter((vehicle) => vehicle.isPrimary).length, 1);

    const deleteResponse = await fetch(`${baseUrl}/v1/vehicles/${firstPayload.data.id}`, {
      method: "DELETE",
      headers,
    });
    assert.equal(deleteResponse.status, 200);
  });

  it("supports browser CORS preflight for local web and mobile previews", async () => {
    for (const origin of ["http://127.0.0.1:3000", "http://127.0.0.1:8082"]) {
      const response = await fetch(`${baseUrl}/v1/partner/dashboard`, {
        method: "OPTIONS",
        headers: {
          origin,
          "access-control-request-method": "GET",
          "access-control-request-headers": "x-prima-user-id,x-prima-role,x-prima-organization-id",
        },
      });

      assert.equal(response.status, 204);
      assert.equal(response.headers.get("access-control-allow-origin"), origin);
      assert.match(response.headers.get("access-control-allow-headers") ?? "", /x-prima-user-id/);
    }
  });

  it("discovers verified partners and filters availability by location", async () => {
    const partnersResponse = await fetch(`${baseUrl}/v1/partners`);
    const partnersPayload = (await partnersResponse.json()) as ApiResponse<PartnerLocation[]>;
    assert.equal(partnersResponse.status, 200);
    assert.ok(partnersPayload.data.length >= 3);
    assert.ok(partnersPayload.data.every((partner) => partner.verified));

    const harbour = partnersPayload.data.find((partner) => partner.id === "loc_harbour_001");
    assert.ok(harbour);
    assert.ok(harbour.serviceCodes.includes("wash_basic"));

    const availabilityResponse = await fetch(
      `${baseUrl}/v1/availability?partnerLocationId=${harbour.id}`,
    );
    const availabilityPayload = (await availabilityResponse.json()) as ApiResponse<
      Array<{ partnerLocationId: string }>
    >;
    assert.equal(availabilityResponse.status, 200);
    assert.ok(availabilityPayload.data.length > 0);
    assert.ok(availabilityPayload.data.every((slot) => slot.partnerLocationId === harbour.id));
  });

  it("creates a booking at the selected marketplace partner", async () => {
    const session = await createCustomerSession("marketplace@example.com");
    const headers = {
      authorization: `Bearer ${session.accessToken}`,
      "content-type": "application/json",
    };
    const vehicleResponse = await fetch(`${baseUrl}/v1/vehicles`, {
      method: "POST",
      headers,
      body: JSON.stringify({ plateNumber: "MARKET1", make: "Audi", model: "Q4" }),
    });
    const vehiclePayload = (await vehicleResponse.json()) as ApiResponse<Vehicle>;
    const bookingResponse = await fetch(`${baseUrl}/v1/bookings`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        vehicleId: vehiclePayload.data.id,
        availabilitySlotId: "slot_harbour_0900",
        serviceCode: "wash_basic",
      }),
    });
    const bookingPayload = (await bookingResponse.json()) as ApiResponse<Booking>;
    assert.equal(bookingResponse.status, 201);
    assert.equal(bookingPayload.data.partnerLocationId, "loc_harbour_001");
  });

  it("prevents customer cross-owner access", async () => {
    const response = await fetch(`${baseUrl}/v1/vehicles?ownerId=usr_other_001`, {
      headers: customerHeaders,
    });
    const payload = (await response.json()) as ApiErrorResponse;

    assert.equal(response.status, 403);
    assert.equal(payload.code, "forbidden_owner_scope");
  });

  it("creates a vehicle, booking, and audit events", async () => {
    const vehicle = await createVehicle("TEST123");
    const booking = await createBooking(vehicle.id, "wash_premium");

    assert.equal(vehicle.ownerId, "usr_demo_001");
    assert.equal(vehicle.plateNumber, "TEST123");
    assert.equal(booking.ownerId, "usr_demo_001");
    assert.equal(booking.vehicleId, vehicle.id);
    assert.equal(booking.status, "pending_payment");
    assert.deepEqual(booking.acceptedPrice, { amountMinor: 4500, currency: "USD" });

    const response = await fetch(`${baseUrl}/v1/audit-events?limit=5`, {
      headers: internalHeaders,
    });
    const payload = (await response.json()) as ApiResponse<Array<{ action: string }>>;

    assert.equal(response.status, 200);
    assert.deepEqual(
      payload.data.slice(0, 2).map((event) => event.action),
      ["booking.created", "vehicle.created"],
    );
  });

  it("exposes partner dashboard metrics for partner actors", async () => {
    const vehicle = await createVehicle("DASH999");
    const booking = await createBooking(vehicle.id, "detail_interior");

    const response = await fetch(`${baseUrl}/v1/partner/dashboard`, {
      headers: partnerHeaders,
    });
    const payload = (await response.json()) as ApiResponse<PartnerDashboardResponse>;
    const queueItem = payload.data.queue.find((item) => item.bookingId === booking.id);

    assert.equal(response.status, 200);
    assert.equal(payload.data.partnerLocationId, "loc_demo_001");
    assert.ok(payload.data.queue.length >= 1);
    assert.ok(payload.data.metrics.some((metric) => metric.label === "Expected revenue"));
    assert.ok(payload.data.metrics.some((metric) => metric.label === "Payment risk"));
    assert.equal(queueItem?.actionHint, "Customer has not created a payment hold yet");
  });

  it("surfaces authorized payment readiness in the partner dashboard", async () => {
    const vehicle = await createVehicle("DASHREADY");
    const booking = await createBooking(vehicle.id, "wash_basic");
    await authorizeBookingPayment(booking.id);

    const response = await fetch(`${baseUrl}/v1/partner/dashboard`, {
      headers: partnerHeaders,
    });
    const payload = (await response.json()) as ApiResponse<PartnerDashboardResponse>;
    const queueItem = payload.data.queue.find((item) => item.bookingId === booking.id);

    assert.equal(response.status, 200);
    assert.equal(queueItem?.paymentStatus, "authorized");
    assert.deepEqual(queueItem?.paymentAmount, { amountMinor: 2500, currency: "USD" });
    assert.equal(queueItem?.actionHint, "Payment authorized; ready to confirm");
    assert.ok(payload.data.metrics.some((metric) => metric.label === "Authorized revenue"));
  });

  it("lets partner actors create and close availability slots", async () => {
    const startsAt = new Date(Date.UTC(2026, 6, 2, 9, 0, 0)).toISOString();
    const endsAt = new Date(Date.UTC(2026, 6, 2, 10, 0, 0)).toISOString();
    const createResponse = await fetch(`${baseUrl}/v1/partner/availability`, {
      method: "POST",
      headers: { ...partnerHeaders, "content-type": "application/json" },
      body: JSON.stringify({
        startsAt,
        endsAt,
        capacity: 2,
        serviceCodes: ["wash_basic"],
      }),
    });
    const createPayload = (await createResponse.json()) as ApiResponse<PartnerAvailabilitySlot>;

    assert.equal(createResponse.status, 201);
    assert.equal(createPayload.data.capacity, 2);
    assert.equal(createPayload.data.availableCount, 2);

    const closeResponse = await fetch(`${baseUrl}/v1/partner/availability/${createPayload.data.id}`, {
      method: "PATCH",
      headers: { ...partnerHeaders, "content-type": "application/json" },
      body: JSON.stringify({ closed: true }),
    });
    const closePayload = (await closeResponse.json()) as ApiResponse<PartnerAvailabilitySlot>;

    assert.equal(closeResponse.status, 200);
    assert.ok(closePayload.data.closedAt);
  });

  it("lets partner actors manage capacity templates and generate slots", async () => {
    const createResponse = await fetch(`${baseUrl}/v1/partner/capacity-templates`, {
      method: "POST",
      headers: { ...partnerHeaders, "content-type": "application/json" },
      body: JSON.stringify({
        name: "Saturday detail team",
        openTime: "09:00",
        closeTime: "13:00",
        staffCount: 4,
        bayCount: 2,
        serviceCodes: ["wash_basic", "wash_premium"],
        slotDurationMinutes: 60,
        bufferMinutes: 15,
      }),
    });
    const created = (await createResponse.json()) as ApiResponse<CapacityTemplate>;

    assert.equal(createResponse.status, 201);
    assert.equal(created.data.staffCount, 4);

    const listResponse = await fetch(`${baseUrl}/v1/partner/capacity-templates`, {
      headers: partnerHeaders,
    });
    const list = (await listResponse.json()) as ApiResponse<CapacityTemplate[]>;

    assert.equal(listResponse.status, 200);
    assert.equal(list.data.some((template) => template.id === created.data.id), true);

    const generateResponse = await fetch(`${baseUrl}/v1/partner/capacity-templates/${created.data.id}/generate`, {
      method: "POST",
      headers: { ...partnerHeaders, "content-type": "application/json" },
      body: JSON.stringify({ date: "2026-07-06" }),
    });
    const generated = (await generateResponse.json()) as ApiResponse<GenerateCapacityTemplateSlotsResponse>;

    assert.equal(generateResponse.status, 201);
    assert.equal(generated.data.template.id, created.data.id);
    assert.equal(generated.data.slots.length, 3);
    assert.equal(generated.data.slots[0]?.capacity, 2);
  });

  it("blocks customer actors from capacity template writes", async () => {
    const response = await fetch(`${baseUrl}/v1/partner/capacity-templates`, {
      method: "POST",
      headers: customerHeaders,
      body: JSON.stringify({
        name: "Customer should not write",
        openTime: "09:00",
        closeTime: "12:00",
        staffCount: 1,
        bayCount: 1,
        serviceCodes: ["wash_basic"],
        slotDurationMinutes: 30,
        bufferMinutes: 0,
      }),
    });
    const payload = (await response.json()) as ApiErrorResponse;

    assert.equal(response.status, 403);
    assert.equal(payload.code, "partner_role_required");
  });

  it("computes dynamic availability from scheduling rules", async () => {
    const response = await fetch(
      `${baseUrl}/v1/availability/search?partnerLocationId=loc_demo_001&serviceCode=wash_basic&date=2026-07-06`,
    );
    const payload = (await response.json()) as ApiResponse<AvailabilitySearchResponse>;

    assert.equal(response.status, 200);
    assert.equal(payload.data.partnerLocationId, "loc_demo_001");
    assert.equal(payload.data.serviceCode, "wash_basic");
    assert.equal(payload.data.timezone, "Asia/Singapore");
    assert.ok(payload.data.slots.length > 0);
    assert.equal(payload.data.slots[0]?.source, "dynamic_rules");
    assert.equal(payload.data.slots[0]?.capacity, 2);
  });

  it("computes dynamic availability for marketplace partners", async () => {
    const response = await fetch(
      `${baseUrl}/v1/availability/search?partnerLocationId=loc_harbour_001&serviceCode=detail_interior&date=2026-07-06`,
    );
    const payload = (await response.json()) as ApiResponse<AvailabilitySearchResponse>;

    assert.equal(response.status, 200);
    assert.equal(payload.data.partnerLocationId, "loc_harbour_001");
    assert.equal(payload.data.serviceCode, "detail_interior");
    assert.ok(payload.data.slots.length > 0);
    assert.equal(payload.data.closedReason, undefined);
  });

  it("lets partner actors configure closure exceptions for dynamic availability", async () => {
    const configResponse = await fetch(`${baseUrl}/v1/partner/scheduling/config`, {
      headers: partnerHeaders,
    });
    const configPayload = (await configResponse.json()) as ApiResponse<SchedulingConfig>;

    assert.equal(configResponse.status, 200);

    const patchResponse = await fetch(`${baseUrl}/v1/partner/scheduling/config`, {
      method: "PATCH",
      headers: { ...partnerHeaders, "content-type": "application/json" },
      body: JSON.stringify({
        calendarExceptions: [
          ...configPayload.data.calendarExceptions.map(({ id: _id, partnerLocationId: _partnerLocationId, ...exception }) => exception),
          {
            date: "2026-07-07",
            type: "closed",
            reason: "Public holiday",
          },
        ],
      }),
    });
    const patchPayload = (await patchResponse.json()) as ApiResponse<SchedulingConfig>;

    assert.equal(patchResponse.status, 200);
    assert.equal(patchPayload.data.calendarExceptions.some((exception) => exception.date === "2026-07-07"), true);

    const searchResponse = await fetch(
      `${baseUrl}/v1/availability/search?partnerLocationId=loc_demo_001&serviceCode=wash_basic&date=2026-07-07`,
    );
    const searchPayload = (await searchResponse.json()) as ApiResponse<AvailabilitySearchResponse>;

    assert.equal(searchResponse.status, 200);
    assert.equal(searchPayload.data.slots.length, 0);
    assert.equal(searchPayload.data.closedReason, "Public holiday");
  });

  it("creates booking holds that block dynamic availability and can be consumed by booking creation", async () => {
    const vehicle = await createVehicle("HOLD123");
    const searchResponse = await fetch(
      `${baseUrl}/v1/availability/search?partnerLocationId=loc_demo_001&serviceCode=detail_interior&date=2026-07-08`,
    );
    const searchPayload = (await searchResponse.json()) as ApiResponse<AvailabilitySearchResponse>;
    const selected = searchPayload.data.slots[0];

    assert.equal(searchResponse.status, 200);
    assert.ok(selected);
    assert.equal(selected.capacity, 1);

    const holdResponse = await fetch(`${baseUrl}/v1/booking-holds`, {
      method: "POST",
      headers: customerHeaders,
      body: JSON.stringify({
        vehicleId: vehicle.id,
        partnerLocationId: "loc_demo_001",
        serviceCode: "detail_interior",
        startsAt: selected.startsAt,
      }),
    });
    const holdPayload = (await holdResponse.json()) as ApiResponse<CreateBookingHoldResponse>;

    assert.equal(holdResponse.status, 201);
    assert.equal(holdPayload.data.hold.status, "active");
    assert.equal(holdPayload.data.hold.startsAt, selected.startsAt);

    const blockedSearchResponse = await fetch(
      `${baseUrl}/v1/availability/search?partnerLocationId=loc_demo_001&serviceCode=detail_interior&date=2026-07-08`,
    );
    const blockedSearchPayload = (await blockedSearchResponse.json()) as ApiResponse<AvailabilitySearchResponse>;

    assert.equal(blockedSearchResponse.status, 200);
    assert.equal(blockedSearchPayload.data.slots.some((slot) => slot.startsAt === selected.startsAt), false);

    const bookingResponse = await fetch(`${baseUrl}/v1/bookings`, {
      method: "POST",
      headers: customerHeaders,
      body: JSON.stringify({
        vehicleId: vehicle.id,
        holdId: holdPayload.data.hold.id,
        serviceCode: "detail_interior",
      }),
    });
    const bookingPayload = (await bookingResponse.json()) as ApiResponse<Booking>;

    assert.equal(bookingResponse.status, 201);
    assert.equal(bookingPayload.data.scheduledStartAt, selected.startsAt);
    assert.equal(bookingPayload.data.serviceCode, "detail_interior");
  });

  it("prevents customers from consuming another owner's booking hold", async () => {
    const vehicle = await createVehicle("HOLDOWN");
    const searchResponse = await fetch(
      `${baseUrl}/v1/availability/search?partnerLocationId=loc_demo_001&serviceCode=wash_basic&date=2026-07-09`,
    );
    const searchPayload = (await searchResponse.json()) as ApiResponse<AvailabilitySearchResponse>;
    const selected = searchPayload.data.slots[0];

    assert.ok(selected);

    const holdResponse = await fetch(`${baseUrl}/v1/booking-holds`, {
      method: "POST",
      headers: customerHeaders,
      body: JSON.stringify({
        vehicleId: vehicle.id,
        partnerLocationId: "loc_demo_001",
        serviceCode: "wash_basic",
        startsAt: selected.startsAt,
      }),
    });
    const holdPayload = (await holdResponse.json()) as ApiResponse<CreateBookingHoldResponse>;

    const response = await fetch(`${baseUrl}/v1/bookings`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-prima-user-id": "usr_other_001",
        "x-prima-role": "customer",
      },
      body: JSON.stringify({
        vehicleId: vehicle.id,
        holdId: holdPayload.data.hold.id,
        serviceCode: "wash_basic",
      }),
    });
    const payload = (await response.json()) as ApiErrorResponse;

    assert.equal(response.status, 403);
    assert.equal(payload.code, "forbidden_owner_scope");
  });

  it("blocks customer actors from availability writes", async () => {
    const response = await fetch(`${baseUrl}/v1/partner/availability`, {
      method: "POST",
      headers: customerHeaders,
      body: JSON.stringify({
        startsAt: new Date(Date.UTC(2026, 6, 3, 9, 0, 0)).toISOString(),
        endsAt: new Date(Date.UTC(2026, 6, 3, 10, 0, 0)).toISOString(),
        capacity: 1,
        serviceCodes: ["wash_basic"],
      }),
    });
    const payload = (await response.json()) as ApiErrorResponse;

    assert.equal(response.status, 403);
    assert.equal(payload.code, "partner_role_required");
  });

  it("prevents overbooking an availability slot beyond capacity", async () => {
    const slot = await createAvailabilitySlot({
      startsAt: new Date(Date.UTC(2026, 6, 4, 9, 0, 0)).toISOString(),
      endsAt: new Date(Date.UTC(2026, 6, 4, 10, 0, 0)).toISOString(),
      capacity: 1,
      serviceCodes: ["wash_basic"],
    });

    const firstVehicle = await createVehicle("CAPACITY1");
    await createBooking(firstVehicle.id, "wash_basic", slot.id);
    const secondVehicle = await createVehicle("CAPACITY2");
    const response = await fetch(`${baseUrl}/v1/bookings`, {
      method: "POST",
      headers: customerHeaders,
      body: JSON.stringify({
        vehicleId: secondVehicle.id,
        availabilitySlotId: slot.id,
        serviceCode: "wash_basic",
      }),
    });
    const payload = (await response.json()) as ApiErrorResponse;

    assert.equal(response.status, 409);
    assert.equal(payload.code, "availability_slot_full");
  });

  it("prevents customers from booking closed availability slots", async () => {
    const slot = await createAvailabilitySlot({
      startsAt: new Date(Date.UTC(2026, 6, 5, 9, 0, 0)).toISOString(),
      endsAt: new Date(Date.UTC(2026, 6, 5, 10, 0, 0)).toISOString(),
      capacity: 1,
      serviceCodes: ["wash_basic"],
    });
    await fetch(`${baseUrl}/v1/partner/availability/${slot.id}`, {
      method: "PATCH",
      headers: { ...partnerHeaders, "content-type": "application/json" },
      body: JSON.stringify({ closed: true }),
    });

    const vehicle = await createVehicle("CLOSED1");
    const response = await fetch(`${baseUrl}/v1/bookings`, {
      method: "POST",
      headers: customerHeaders,
      body: JSON.stringify({
        vehicleId: vehicle.id,
        availabilitySlotId: slot.id,
        serviceCode: "wash_basic",
      }),
    });
    const payload = (await response.json()) as ApiErrorResponse;

    assert.equal(response.status, 409);
    assert.equal(payload.code, "availability_slot_closed");
  });

  it("lets partner actors advance booking status through the operational workflow", async () => {
    const vehicle = await createVehicle("FLOW123");
    const booking = await createBooking(vehicle.id, "wash_basic");
    await authorizeBookingPayment(booking.id);

    const confirmed = await updateBookingStatus(booking.id, "confirmed");
    const checkedIn = await updateBookingStatus(booking.id, "checked_in");
    const inService = await updateBookingStatus(booking.id, "in_service");
    const completed = await updateBookingStatus(booking.id, "completed");

    assert.equal(confirmed.status, "confirmed");
    assert.equal(checkedIn.status, "checked_in");
    assert.equal(inService.status, "in_service");
    assert.equal(completed.status, "completed");

    const response = await fetch(`${baseUrl}/v1/audit-events?limit=5`, {
      headers: internalHeaders,
    });
    const payload = (await response.json()) as ApiResponse<Array<{ action: string; metadata: Record<string, unknown> }>>;
    const completionStatusEvent = payload.data.find(
      (event) => event.action === "booking.status_changed" && event.metadata.toStatus === "completed",
    );

    assert.equal(response.status, 200);
    assert.equal(completionStatusEvent?.metadata.toStatus, "completed");
  });

  it("shows partner status updates in the customer booking list", async () => {
    const vehicle = await createVehicle("VISIBLE1");
    const booking = await createBooking(vehicle.id, "wash_basic");
    await authorizeBookingPayment(booking.id);
    await updateBookingStatus(booking.id, "confirmed");

    const response = await fetch(`${baseUrl}/v1/bookings`, {
      headers: customerHeaders,
    });
    const payload = (await response.json()) as ApiResponse<Booking[]>;
    const customerBooking = payload.data.find((item) => item.id === booking.id);

    assert.equal(response.status, 200);
    assert.equal(customerBooking?.status, "confirmed");
  });

  it("loads one customer-owned booking by id", async () => {
    const vehicle = await createVehicle("DETAIL1");
    const booking = await createBooking(vehicle.id, "wash_premium");
    await authorizeBookingPayment(booking.id);
    await updateBookingStatus(booking.id, "confirmed");

    const response = await fetch(`${baseUrl}/v1/bookings/${booking.id}`, {
      headers: customerHeaders,
    });
    const payload = (await response.json()) as ApiResponse<Booking>;

    assert.equal(response.status, 200);
    assert.equal(payload.data.id, booking.id);
    assert.equal(payload.data.status, "confirmed");
    assert.equal(payload.data.serviceCode, "wash_premium");
  });

  it("prevents customers from reading another owner's booking by id", async () => {
    const vehicle = await createVehicle("DETAIL2");
    const booking = await createBooking(vehicle.id, "wash_basic");

    const response = await fetch(`${baseUrl}/v1/bookings/${booking.id}`, {
      headers: {
        "content-type": "application/json",
        "x-prima-user-id": "usr_other_001",
        "x-prima-role": "customer",
      },
    });
    const payload = (await response.json()) as ApiErrorResponse;

    assert.equal(response.status, 403);
    assert.equal(payload.code, "forbidden_owner_scope");
  });

  it("lets customers cancel their own booking before service starts", async () => {
    const vehicle = await createVehicle("CANCEL1");
    const booking = await createBooking(vehicle.id, "wash_basic");

    const response = await fetch(`${baseUrl}/v1/bookings/${booking.id}/cancel`, {
      method: "POST",
      headers: customerHeaders,
      body: JSON.stringify({ reason: "change_of_plan" }),
    });
    const payload = (await response.json()) as ApiResponse<Booking>;

    assert.equal(response.status, 200);
    assert.equal(payload.data.status, "cancelled");

    const auditResponse = await fetch(`${baseUrl}/v1/audit-events?limit=3`, {
      headers: internalHeaders,
    });
    const auditPayload = (await auditResponse.json()) as ApiResponse<Array<{ action: string; metadata: Record<string, unknown> }>>;

    assert.equal(auditPayload.data[0]?.action, "booking.cancelled");
    assert.equal(auditPayload.data[0]?.metadata.cancelledBy, "customer");
  });

  it("prevents customers from cancelling another owner's booking", async () => {
    const vehicle = await createVehicle("CANCEL2");
    const booking = await createBooking(vehicle.id, "wash_basic");

    const response = await fetch(`${baseUrl}/v1/bookings/${booking.id}/cancel`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-prima-user-id": "usr_other_001",
        "x-prima-role": "customer",
      },
      body: JSON.stringify({ reason: "not_allowed" }),
    });
    const payload = (await response.json()) as ApiErrorResponse;

    assert.equal(response.status, 403);
    assert.equal(payload.code, "forbidden_owner_scope");
  });

  it("rejects cancellation after service has started", async () => {
    const vehicle = await createVehicle("CANCEL3");
    const booking = await createBooking(vehicle.id, "wash_basic");
    await authorizeBookingPayment(booking.id);
    await updateBookingStatus(booking.id, "confirmed");
    await updateBookingStatus(booking.id, "checked_in");
    await updateBookingStatus(booking.id, "in_service");

    const response = await fetch(`${baseUrl}/v1/bookings/${booking.id}/cancel`, {
      method: "POST",
      headers: customerHeaders,
      body: JSON.stringify({ reason: "too_late" }),
    });
    const payload = (await response.json()) as ApiErrorResponse;

    assert.equal(response.status, 409);
    assert.equal(payload.code, "booking_cannot_be_cancelled");
  });

  it("creates a customer-readable service record when booking completes", async () => {
    const vehicle = await createVehicle("RECORD1");
    const booking = await createBooking(vehicle.id, "detail_interior");
    await authorizeBookingPayment(booking.id);
    await updateBookingStatus(booking.id, "confirmed");
    await updateBookingStatus(booking.id, "checked_in");
    await updateBookingStatus(booking.id, "in_service");
    await updateBookingStatus(booking.id, "completed");

    const response = await fetch(`${baseUrl}/v1/service-records`, {
      headers: customerHeaders,
    });
    const payload = (await response.json()) as ApiResponse<ServiceRecord[]>;
    const serviceRecord = payload.data.find((record) => record.bookingId === booking.id);

    assert.equal(response.status, 200);
    assert.equal(serviceRecord?.ownerId, "usr_demo_001");
    assert.equal(serviceRecord?.vehicleId, vehicle.id);
    assert.equal(serviceRecord?.serviceCode, "detail_interior");
  });

  it("calculates MAVO from qualifying ownership events", async () => {
    const vehicle = await createVehicle("MAVO1");
    const booking = await createBooking(vehicle.id, "wash_basic");
    await authorizeBookingPayment(booking.id);
    await updateBookingStatus(booking.id, "confirmed");
    await updateBookingStatus(booking.id, "checked_in");
    await updateBookingStatus(booking.id, "in_service");
    await updateBookingStatus(booking.id, "completed");

    const month = new Date().toISOString().slice(0, 7);
    const response = await fetch(`${baseUrl}/v1/analytics/mavo?month=${month}`, {
      headers: internalHeaders,
    });
    const payload = (await response.json()) as ApiResponse<MavoResponse>;

    assert.equal(response.status, 200);
    assert.equal(payload.data.month, month);
    assert.ok(payload.data.monthlyActiveVehicleOwners >= 1);
    assert.ok(payload.data.qualifyingEventNames.includes("service_completed"));
  });

  it("blocks non-internal actors from MAVO analytics", async () => {
    const response = await fetch(`${baseUrl}/v1/analytics/mavo`, {
      headers: customerHeaders,
    });
    const payload = (await response.json()) as ApiErrorResponse;

    assert.equal(response.status, 403);
    assert.equal(payload.code, "internal_role_required");
  });

  it("prevents customers from reading another owner's service records", async () => {
    const response = await fetch(`${baseUrl}/v1/service-records?ownerId=usr_other_001`, {
      headers: customerHeaders,
    });
    const payload = (await response.json()) as ApiErrorResponse;

    assert.equal(response.status, 403);
    assert.equal(payload.code, "forbidden_owner_scope");
  });

  it("rejects invalid booking status jumps", async () => {
    const vehicle = await createVehicle("JUMP123");
    const booking = await createBooking(vehicle.id, "wash_basic");

    const response = await fetch(`${baseUrl}/v1/bookings/${booking.id}/status`, {
      method: "PATCH",
      headers: { ...partnerHeaders, "content-type": "application/json" },
      body: JSON.stringify({ status: "completed" }),
    });
    const payload = (await response.json()) as ApiErrorResponse;

    assert.equal(response.status, 409);
    assert.equal(payload.code, "invalid_booking_status_transition");
  });

  it("requires payment authorization before partner confirmation", async () => {
    const vehicle = await createVehicle("PAYREQ1");
    const booking = await createBooking(vehicle.id, "wash_basic");

    const response = await fetch(`${baseUrl}/v1/bookings/${booking.id}/status`, {
      method: "PATCH",
      headers: { ...partnerHeaders, "content-type": "application/json" },
      body: JSON.stringify({ status: "confirmed" }),
    });
    const payload = (await response.json()) as ApiErrorResponse;

    assert.equal(response.status, 409);
    assert.equal(payload.code, "payment_authorization_required");
  });

  it("creates and authorizes customer-scoped payment intents", async () => {
    const vehicle = await createVehicle("PAYAUTH1");
    const booking = await createBooking(vehicle.id, "wash_premium");

    const payment = await createPaymentIntent(booking.id);
    const authorizedPayment = await authorizePayment(payment.id);

    assert.equal(payment.status, "requires_authorization");
    assert.equal(payment.bookingId, booking.id);
    assert.equal(payment.amount.amountMinor, booking.acceptedPrice.amountMinor);
    assert.equal(authorizedPayment.status, "authorized");

    const confirmed = await updateBookingStatus(booking.id, "confirmed");
    assert.equal(confirmed.status, "confirmed");
  });

  it("captures authorized payment when booking completes", async () => {
    const vehicle = await createVehicle("PAYCAP1");
    const booking = await createBooking(vehicle.id, "wash_basic");
    const payment = await authorizeBookingPayment(booking.id);

    await updateBookingStatus(booking.id, "confirmed");
    await updateBookingStatus(booking.id, "checked_in");
    await updateBookingStatus(booking.id, "in_service");
    await updateBookingStatus(booking.id, "completed");

    const response = await fetch(`${baseUrl}/v1/payments?bookingId=${booking.id}`, {
      headers: customerHeaders,
    });
    const payload = (await response.json()) as ApiResponse<PaymentIntent>;

    assert.equal(response.status, 200);
    assert.equal(payload.data.id, payment.id);
    assert.equal(payload.data.status, "captured");
    assert.ok(payload.data.capturedAt);
  });

  it("voids authorized payment when customer cancels before service starts", async () => {
    const vehicle = await createVehicle("PAYVOID1");
    const booking = await createBooking(vehicle.id, "wash_basic");
    await authorizeBookingPayment(booking.id);

    const response = await fetch(`${baseUrl}/v1/bookings/${booking.id}/cancel`, {
      method: "POST",
      headers: customerHeaders,
      body: JSON.stringify({ reason: "change_of_plan" }),
    });

    assert.equal(response.status, 200);

    const paymentResponse = await fetch(`${baseUrl}/v1/payments?bookingId=${booking.id}`, {
      headers: customerHeaders,
    });
    const paymentPayload = (await paymentResponse.json()) as ApiResponse<PaymentIntent>;

    assert.equal(paymentPayload.data.status, "voided");
    assert.ok(paymentPayload.data.voidedAt);
  });

  it("prevents customers from paying another owner's booking", async () => {
    const vehicle = await createVehicle("PAYOWN1");
    const booking = await createBooking(vehicle.id, "wash_basic");

    const response = await fetch(`${baseUrl}/v1/payments/intents`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-prima-user-id": "usr_other_001",
        "x-prima-role": "customer",
      },
      body: JSON.stringify({ bookingId: booking.id }),
    });
    const payload = (await response.json()) as ApiErrorResponse;

    assert.equal(response.status, 403);
    assert.equal(payload.code, "forbidden_owner_scope");
  });

  it("blocks customer actors from partner dashboard", async () => {
    const response = await fetch(`${baseUrl}/v1/partner/dashboard`, {
      headers: customerHeaders,
    });
    const payload = (await response.json()) as ApiErrorResponse;

    assert.equal(response.status, 403);
    assert.equal(payload.code, "partner_role_required");
  });

  async function createVehicle(plateNumber: string): Promise<Vehicle> {
    const response = await fetch(`${baseUrl}/v1/vehicles`, {
      method: "POST",
      headers: customerHeaders,
      body: JSON.stringify({
        plateNumber,
        make: "Tesla",
        model: "Model 3",
        year: 2026,
      }),
    });
    const payload = (await response.json()) as ApiResponse<Vehicle>;

    assert.equal(response.status, 201);
    return payload.data;
  }

  async function createCustomerSession(identifier: string): Promise<AuthSession> {
    const requestResponse = await fetch(`${baseUrl}/v1/auth/code/request`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ identifier }),
    });
    const requestPayload = (await requestResponse.json()) as ApiResponse<{ challengeId: string; devCode: string }>;
    const verifyResponse = await fetch(`${baseUrl}/v1/auth/code/verify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ challengeId: requestPayload.data.challengeId, code: requestPayload.data.devCode }),
    });
    const verifyPayload = (await verifyResponse.json()) as ApiResponse<AuthSession>;
    return verifyPayload.data;
  }

  async function createBooking(vehicleId: string, serviceCode: string, availabilitySlotId = "slot_demo_1100"): Promise<Booking> {
    const response = await fetch(`${baseUrl}/v1/bookings`, {
      method: "POST",
      headers: customerHeaders,
      body: JSON.stringify({
        vehicleId,
        availabilitySlotId,
        serviceCode,
      }),
    });
    const payload = (await response.json()) as ApiResponse<Booking>;

    assert.equal(response.status, 201);
    return payload.data;
  }

  async function createAvailabilitySlot(input: {
    readonly startsAt: string;
    readonly endsAt: string;
    readonly capacity: number;
    readonly serviceCodes: readonly string[];
  }): Promise<PartnerAvailabilitySlot> {
    const response = await fetch(`${baseUrl}/v1/partner/availability`, {
      method: "POST",
      headers: { ...partnerHeaders, "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    const payload = (await response.json()) as ApiResponse<PartnerAvailabilitySlot>;

    assert.equal(response.status, 201);
    return payload.data;
  }

  async function createPaymentIntent(bookingId: string): Promise<PaymentIntent> {
    const response = await fetch(`${baseUrl}/v1/payments/intents`, {
      method: "POST",
      headers: customerHeaders,
      body: JSON.stringify({ bookingId }),
    });
    const payload = (await response.json()) as ApiResponse<PaymentIntent>;

    assert.equal(response.status, 201);
    return payload.data;
  }

  async function authorizePayment(paymentIntentId: string): Promise<PaymentIntent> {
    const response = await fetch(`${baseUrl}/v1/payments/${paymentIntentId}/authorize`, {
      method: "POST",
      headers: customerHeaders,
    });
    const payload = (await response.json()) as ApiResponse<PaymentIntent>;

    assert.equal(response.status, 200);
    return payload.data;
  }

  async function authorizeBookingPayment(bookingId: string): Promise<PaymentIntent> {
    const payment = await createPaymentIntent(bookingId);
    return authorizePayment(payment.id);
  }

  async function updateBookingStatus(bookingId: string, status: BookingStatus): Promise<Booking> {
    const response = await fetch(`${baseUrl}/v1/bookings/${bookingId}/status`, {
      method: "PATCH",
      headers: { ...partnerHeaders, "content-type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const payload = (await response.json()) as ApiResponse<Booking>;

    assert.equal(response.status, 200);
    return payload.data;
  }
});

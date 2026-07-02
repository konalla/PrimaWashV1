import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import type {
  ApiErrorResponse,
  AuthSession,
  BillingSession,
  CommunicationMessage,
  CommunicationThread,
  CommunicationThreadWithMessages,
  CustomerProfile,
  Booking,
  BookingStatus,
  CapacityTemplate,
  GenerateCapacityTemplateSlotsResponse,
  AvailabilitySearchResponse,
  CreatePropertyInterestResponse,
  CreateBookingHoldResponse,
  SchedulingConfig,
  PartnerDashboardResponse,
  PartnerLocation,
  PartnerAvailabilitySlot,
  MavoResponse,
  PaymentIntent,
  PaymentHistoryItem,
  PaymentMethodSummary,
  PrimaWashDayBookingItem,
  Property,
  PropertyManagementDashboardResponse,
  PropertyLead,
  CondoOperationalProfile,
  PrimaWashDay,
  ServiceRecord,
  Vehicle,
} from "@prima-wash/contracts";
import { createApiServer } from "./app.js";
import { createRepositories } from "./modules/repositories.js";
import type { Repositories } from "./modules/repositories.js";
import type { PaymentProvider, PaymentProviderOperation, PaymentProviderResult } from "./modules/payments/provider.js";

interface ApiResponse<T> {
  readonly data: T;
}

function createRecordingPaymentProvider(operations: PaymentProviderOperation[]): PaymentProvider {
  async function record(operation: PaymentProviderOperation): Promise<PaymentProviderResult> {
    operations.push(operation);
    return {
      provider: "recording",
      operation,
      providerReference: `recording_${operation}_${operations.length}`,
      status: "succeeded",
      processedAt: new Date().toISOString(),
    };
  }

  return {
    ensureCustomer: async (profile) => {
      await record("customer");
      return {
        provider: "recording",
        providerCustomerId: `recording_customer_${profile.userId}`,
      };
    },
    createEphemeralKey: async (customer) => {
      await record("ephemeral_key");
      return {
        provider: "recording",
        providerCustomerId: customer.providerCustomerId,
        ephemeralKeySecret: `recording_ephemeral_${customer.providerCustomerId}`,
      };
    },
    createSetupIntent: async (customer) => {
      await record("setup_intent");
      return {
        provider: "recording",
        providerReference: `recording_setup_${customer.providerCustomerId}`,
        clientSecret: `recording_setup_secret_${customer.providerCustomerId}`,
      };
    },
    listPaymentMethods: async (customer) => {
      await record("list_payment_methods");
      return [
        {
          id: `recording_pm_${customer.providerCustomerId}`,
          provider: "recording",
          brand: "Visa",
          last4: "4242",
          expMonth: 12,
          expYear: 2029,
          isDefault: true,
        },
      ];
    },
    createIntent: () => record("create"),
    authorize: () => record("authorize"),
    capture: () => record("capture"),
    refund: () => record("refund"),
    void: () => record("void"),
  };
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

const propertyManagerHeaders = {
  "x-prima-user-id": "mgr_marina_001",
  "x-prima-role": "property_manager",
  "x-prima-property-id": "prop_sg_marina_one",
};

describe("Prima Wash API", () => {
  let server: Server;
  let baseUrl: string;
  let previousShowDevAuthCode: string | undefined;
  let repositories: Repositories;
  const paymentProviderOperations: PaymentProviderOperation[] = [];
  const stripeWebhookSecret = "whsec_test_secret";

  before(async () => {
    previousShowDevAuthCode = process.env.SHOW_DEV_AUTH_CODE;
    process.env.SHOW_DEV_AUTH_CODE = "true";
    repositories = createRepositories();

    server = createApiServer({
      repositories,
      paymentProvider: createRecordingPaymentProvider(paymentProviderOperations),
      enableRequestLogging: false,
      stripeWebhookSecret,
    });

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", resolve);
    });

    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  after(async () => {
    if (previousShowDevAuthCode === undefined) {
      delete process.env.SHOW_DEV_AUTH_CODE;
    } else {
      process.env.SHOW_DEV_AUTH_CODE = previousShowDevAuthCode;
    }

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

  it("creates internal bearer sessions from persisted access memberships", async () => {
    const session = await createCustomerSession("internal.demo@primawash.local");
    const response = await fetch(`${baseUrl}/v1/internal/operations-dashboard`, {
      headers: { authorization: `Bearer ${session.accessToken}` },
    });
    const payload = (await response.json()) as ApiResponse<PartnerDashboardResponse>;

    assert.equal(session.user.id, "usr_internal_001");
    assert.equal(session.user.role, "internal");
    assert.equal(response.status, 200);
    assert.equal(payload.data.partnerLocationId, "all_locations");
  });

  it("enforces limited internal bearer session permissions", async () => {
    const session = await createCustomerSession("ops.read@primawash.local");
    const operationsResponse = await fetch(`${baseUrl}/v1/internal/operations-dashboard`, {
      headers: { authorization: `Bearer ${session.accessToken}` },
    });
    const propertyLeadsResponse = await fetch(`${baseUrl}/v1/internal/property-leads`, {
      headers: { authorization: `Bearer ${session.accessToken}` },
    });
    const propertyLeadsPayload = (await propertyLeadsResponse.json()) as ApiErrorResponse;

    assert.equal(session.user.id, "usr_internal_ops_read_001");
    assert.equal(session.user.role, "internal");
    assert.equal(operationsResponse.status, 200);
    assert.equal(propertyLeadsResponse.status, 403);
    assert.equal(propertyLeadsPayload.code, "internal_permission_required");
  });

  it("creates partner bearer sessions scoped by persisted membership", async () => {
    const session = await createCustomerSession("partner.demo@primawash.local");
    const ownDashboardResponse = await fetch(`${baseUrl}/v1/partner/dashboard`, {
      headers: { authorization: `Bearer ${session.accessToken}` },
    });
    const competitorDashboardResponse = await fetch(`${baseUrl}/v1/partner/dashboard?partnerLocationId=loc_harbour_001`, {
      headers: { authorization: `Bearer ${session.accessToken}` },
    });
    const competitorPayload = (await competitorDashboardResponse.json()) as ApiErrorResponse;

    assert.equal(session.user.id, "partner_demo_001");
    assert.equal(session.user.role, "partner");
    assert.equal(ownDashboardResponse.status, 200);
    assert.equal(competitorDashboardResponse.status, 403);
    assert.equal(competitorPayload.code, "partner_location_forbidden");
  });

  it("creates property manager bearer sessions scoped by persisted membership", async () => {
    const session = await createCustomerSession("manager.marina@primawash.local");
    const ownDashboardResponse = await fetch(`${baseUrl}/v1/management/property-dashboard?propertyId=prop_sg_marina_one`, {
      headers: { authorization: `Bearer ${session.accessToken}` },
    });
    const otherDashboardResponse = await fetch(`${baseUrl}/v1/management/property-dashboard?propertyId=prop_sg_reflections`, {
      headers: { authorization: `Bearer ${session.accessToken}` },
    });
    const otherPayload = (await otherDashboardResponse.json()) as ApiErrorResponse;

    assert.equal(session.user.id, "mgr_marina_001");
    assert.equal(session.user.role, "property_manager");
    assert.equal(ownDashboardResponse.status, 200);
    assert.equal(otherDashboardResponse.status, 403);
    assert.equal(otherPayload.code, "forbidden_property_scope");
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

  it("creates reusable billing sessions and lists saved payment methods", async () => {
    const session = await createCustomerSession("billing@example.com");
    const headers = authHeaders(session);
    const operationCount = paymentProviderOperations.length;

    const response = await fetch(`${baseUrl}/v1/billing/session`, {
      method: "POST",
      headers,
    });
    const payload = (await response.json()) as ApiResponse<BillingSession>;

    assert.equal(response.status, 200);
    assert.equal(payload.data.provider, "recording");
    assert.equal(payload.data.providerCustomerId, `recording_customer_${session.user.id}`);
    assert.equal(payload.data.ephemeralKeySecret, `recording_ephemeral_recording_customer_${session.user.id}`);
    assert.equal(payload.data.setupIntentClientSecret, `recording_setup_secret_recording_customer_${session.user.id}`);
    assert.deepEqual(paymentProviderOperations.slice(operationCount), ["customer", "ephemeral_key", "setup_intent"]);

    const profileResponse = await fetch(`${baseUrl}/v1/profile`, { headers });
    const profilePayload = (await profileResponse.json()) as ApiResponse<CustomerProfile>;

    assert.equal(profilePayload.data.billingProfile?.provider, "recording");
    assert.equal(profilePayload.data.billingProfile.providerCustomerId, `recording_customer_${session.user.id}`);

    const secondOperationCount = paymentProviderOperations.length;
    const secondResponse = await fetch(`${baseUrl}/v1/billing/session`, {
      method: "POST",
      headers,
    });

    assert.equal(secondResponse.status, 200);
    assert.deepEqual(paymentProviderOperations.slice(secondOperationCount), ["ephemeral_key", "setup_intent"]);

    const methodsOperationCount = paymentProviderOperations.length;
    const methodsResponse = await fetch(`${baseUrl}/v1/billing/payment-methods`, { headers });
    const methodsPayload = (await methodsResponse.json()) as ApiResponse<readonly PaymentMethodSummary[]>;

    assert.equal(methodsResponse.status, 200);
    assert.equal(methodsPayload.data[0]?.last4, "4242");
    assert.deepEqual(paymentProviderOperations.slice(methodsOperationCount), ["list_payment_methods"]);

    const vehicle = await createVehicle("BILLPAY1", headers);
    const booking = await createBooking(vehicle.id, "wash_basic", "slot_demo_1100", headers);
    const createOperationCount = paymentProviderOperations.length;
    const payment = await createPaymentIntent(booking.id, headers);

    assert.equal(payment.provider, "recording");
    assert.equal(payment.status, "requires_authorization");
    assert.deepEqual(paymentProviderOperations.slice(createOperationCount), ["create"]);
  });

  it("persists customer-selected service modes when creating a booking", async () => {
    const pickupVehicle = await createVehicle("PICKUP1");
    const pickupResponse = await fetch(`${baseUrl}/v1/bookings`, {
      method: "POST",
      headers: customerHeaders,
      body: JSON.stringify({
        vehicleId: pickupVehicle.id,
        availabilitySlotId: "slot_demo_1100",
        serviceCode: "wash_basic",
        onsiteServiceMode: "pickup_return",
        executionNotes: "Pickup location: Tower lobby\nHandover contact: Nalla",
      }),
    });
    const pickupPayload = (await pickupResponse.json()) as ApiResponse<Booking>;

    const propertyVehicle = await createVehicle("HOME123");
    const propertyResponse = await fetch(`${baseUrl}/v1/bookings`, {
      method: "POST",
      headers: customerHeaders,
      body: JSON.stringify({
        vehicleId: propertyVehicle.id,
        availabilitySlotId: "slot_demo_1100",
        serviceCode: "wash_basic",
        onsiteServiceMode: "customer_property",
      }),
    });
    const propertyPayload = (await propertyResponse.json()) as ApiResponse<Booking>;

    const driveVehicle = await createVehicle("DRIVE123");
    const driveBooking = await createBooking(driveVehicle.id, "wash_basic");

    assert.equal(pickupResponse.status, 201);
    assert.equal(pickupPayload.data.onsiteServiceMode, "pickup_return");
    assert.equal(pickupPayload.data.valetRequested, true);
    assert.equal(pickupPayload.data.executionNotes, "Pickup location: Tower lobby\nHandover contact: Nalla");
    assert.equal(propertyResponse.status, 201);
    assert.equal(propertyPayload.data.onsiteServiceMode, "customer_property");
    assert.equal(propertyPayload.data.valetRequested, false);
    assert.equal(driveBooking.onsiteServiceMode, "partner_location");
    assert.equal(driveBooking.valetRequested, false);
  });

  it("lists condos and registers interest for an existing condo", async () => {
    const session = await createCustomerSession("condo-interest@example.com");
    const headers = {
      authorization: `Bearer ${session.accessToken}`,
      "content-type": "application/json",
    };
    const listResponse = await fetch(`${baseUrl}/v1/properties?query=Marina&residenceType=multi_unit_private`, {
      headers,
    });
    const listPayload = (await listResponse.json()) as ApiResponse<Property[]>;
    const marinaOne = listPayload.data.find((property) => property.id === "prop_sg_marina_one");

    assert.equal(listResponse.status, 200);
    assert.ok(marinaOne);

    const interestResponse = await fetch(`${baseUrl}/v1/property-interests`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        propertyId: marinaOne.id,
        requestedServiceCodes: ["wash_basic", "detail_interior"],
        preferredTimeWindows: ["Saturday morning"],
        parkingNotes: "Tower 1 visitor lots",
      }),
    });
    const interestPayload = (await interestResponse.json()) as ApiResponse<CreatePropertyInterestResponse>;

    assert.equal(interestResponse.status, 201);
    assert.equal(interestPayload.data.property.name, "Marina One Residences");
    assert.equal(interestPayload.data.interest.ownerId, session.user.id);
    assert.equal(interestPayload.data.profile.residentialProfile?.propertyId, "prop_sg_marina_one");
    assert.equal(interestPayload.data.profile.residentialProfile?.propertyInterestCount, interestPayload.data.property.interestCount);
  });

  it("creates a suggested condo when the resident adds a missing condo", async () => {
    const session = await createCustomerSession("new-condo@example.com");
    const response = await fetch(`${baseUrl}/v1/property-interests`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${session.accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        propertyName: "Caspian Heights",
        propertyAddress: "8 Example Avenue",
        parkingNotes: "Management usually allows visitor lots on weekdays",
      }),
    });
    const payload = (await response.json()) as ApiResponse<CreatePropertyInterestResponse>;

    assert.equal(response.status, 201);
    assert.equal(payload.data.property.name, "Caspian Heights");
    assert.equal(payload.data.property.activationStatus, "suggested");
    assert.equal(payload.data.profile.residentialProfile?.propertyName, "Caspian Heights");
    assert.equal(payload.data.profile.residentialProfile?.propertyActivationStatus, "suggested");
  });

  it("creates a suggested HDB car park lead when a resident requests shared service", async () => {
    const session = await createCustomerSession("hdb-interest@example.com");
    const response = await fetch(`${baseUrl}/v1/property-interests`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${session.accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        residenceType: "public_housing",
        propertyName: "Tampines Block 842A MSCP",
        propertyAddress: "842A Tampines Street 82",
        requestedServiceCodes: ["wash_basic", "wash_premium"],
        preferredTimeWindows: ["Saturday morning"],
        parkingNotes: "Multi-storey car park with EV charging bays nearby.",
      }),
    });
    const payload = (await response.json()) as ApiResponse<CreatePropertyInterestResponse>;

    assert.equal(response.status, 201);
    assert.equal(payload.data.property.residenceType, "public_housing");
    assert.equal(payload.data.property.name, "Tampines Block 842A MSCP");
    assert.equal(payload.data.profile.residentialProfile?.residenceType, "public_housing");
    assert.equal(payload.data.profile.residentialProfile?.marketMode, "residence_partnership");
    assert.equal(payload.data.profile.residentialProfile?.localResidenceLabel, "HDB / public housing");
    assert.equal(payload.data.profile.residentialProfile?.propertyName, "Tampines Block 842A MSCP");
  });

  it("exposes an internal property activation lead dashboard", async () => {
    const leadResponse = await fetch(`${baseUrl}/v1/internal/property-leads`, {
      headers: internalHeaders,
    });
    const leadPayload = (await leadResponse.json()) as ApiResponse<PropertyLead[]>;

    assert.equal(leadResponse.status, 200);
    assert.ok(leadPayload.data.some((property) => property.id === "prop_sg_marina_one"));
    assert.ok(leadPayload.data.some((property) => property.residenceType === "multi_unit_private"));
    assert.ok(leadPayload.data.some((property) => property.residenceType === "public_housing"));
  });

  it("lets internal operators update condo activation status and outreach details", async () => {
    const response = await fetch(`${baseUrl}/v1/internal/properties/prop_sg_reflections/activation`, {
      method: "PATCH",
      headers: {
        ...internalHeaders,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        activationStatus: "contacted",
        managementContactName: "Ms Tan",
        managementContactEmail: "management@example.sg",
        outreachNotes: "Residents asked for Saturday morning Prima Wash Days.",
        nextFollowUpAt: "2026-07-03T02:00:00.000Z",
        internalOwner: "Amadou",
      }),
    });
    const payload = (await response.json()) as ApiResponse<PropertyLead>;

    assert.equal(response.status, 200);
    assert.equal(payload.data.activationStatus, "contacted");
    assert.equal(payload.data.managementContactName, "Ms Tan");
    assert.equal(payload.data.managementContactEmail, "management@example.sg");
    assert.equal(payload.data.internalOwner, "Amadou");
  });

  it("blocks non-internal actors from condo activation leads", async () => {
    const response = await fetch(`${baseUrl}/v1/internal/property-leads`, {
      headers: customerHeaders,
    });
    const payload = (await response.json()) as ApiErrorResponse;

    assert.equal(response.status, 403);
    assert.equal(payload.code, "internal_role_required");
  });

  it("lets internal operators configure a condo operational profile", async () => {
    const response = await fetch(`${baseUrl}/v1/internal/properties/prop_sg_marina_one/operational-profile`, {
      method: "PATCH",
      headers: {
        ...internalHeaders,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        approvedServiceAreas: ["Basement visitor lots B1", "Loading bay overflow"],
        operatingInstructions: "Check in with security before setup.",
        waterPolicy: "rinseless_required",
        vehicleMovementPolicy: "pickup_return_allowed",
        onsiteServiceAllowed: true,
        pickupReturnAllowed: true,
        simultaneousVehicleCapacity: 4,
        availableServiceCodes: ["wash_basic", "wash_premium", "detail_interior"],
        safetyRequirements: "Keep walkways clear.",
      }),
    });
    const payload = (await response.json()) as ApiResponse<CondoOperationalProfile>;

    assert.equal(response.status, 200);
    assert.equal(payload.data.propertyId, "prop_sg_marina_one");
    assert.equal(payload.data.approvedServiceAreas.length, 2);
    assert.equal(payload.data.simultaneousVehicleCapacity, 4);
    assert.equal(payload.data.pickupReturnAllowed, true);
  });

  it("lets property managers view a scoped condo management dashboard without internal lead fields", async () => {
    const response = await fetch(`${baseUrl}/v1/management/property-dashboard?propertyId=prop_sg_marina_one`, {
      headers: propertyManagerHeaders,
    });
    const payload = (await response.json()) as ApiResponse<PropertyManagementDashboardResponse>;
    const serialized = JSON.stringify(payload.data);

    assert.equal(response.status, 200);
    assert.equal(payload.data.property.id, "prop_sg_marina_one");
    assert.equal(payload.data.property.name, "Marina One Residences");
    assert.ok(!serialized.includes("internalOwner"));
    assert.ok(!serialized.includes("outreachNotes"));
    assert.ok(Array.isArray(payload.data.upcomingPrimaWashDays));
  });

  it("blocks property managers from viewing another condo dashboard", async () => {
    const response = await fetch(`${baseUrl}/v1/management/property-dashboard?propertyId=prop_sg_reflections`, {
      headers: propertyManagerHeaders,
    });
    const payload = (await response.json()) as ApiErrorResponse;

    assert.equal(response.status, 403);
    assert.equal(payload.code, "forbidden_property_scope");
  });

  it("lets property managers update their scoped operational profile", async () => {
    const response = await fetch(`${baseUrl}/v1/management/properties/prop_sg_marina_one/operational-profile`, {
      method: "PATCH",
      headers: {
        ...propertyManagerHeaders,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        approvedServiceAreas: ["Visitor lots near Tower 1"],
        operatingInstructions: "Management office requires security notification before setup.",
        waterPolicy: "no_water_access",
        vehicleMovementPolicy: "within_property_allowed",
        onsiteServiceAllowed: true,
        pickupReturnAllowed: false,
        simultaneousVehicleCapacity: 2,
        availableServiceCodes: ["wash_basic"],
        safetyRequirements: "Keep resident lift lobby clear.",
      }),
    });
    const payload = (await response.json()) as ApiResponse<CondoOperationalProfile>;

    assert.equal(response.status, 200);
    assert.equal(payload.data.propertyId, "prop_sg_marina_one");
    assert.deepEqual(payload.data.approvedServiceAreas, ["Visitor lots near Tower 1"]);
    assert.equal(payload.data.waterPolicy, "no_water_access");
    assert.equal(payload.data.vehicleMovementPolicy, "within_property_allowed");
  });

  it("persists property communication threads between Prima Wash and office management", async () => {
    const createResponse = await fetch(`${baseUrl}/v1/communication/threads`, {
      method: "POST",
      headers: {
        ...internalHeaders,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        type: "prima_to_property",
        resourceType: "property",
        resourceId: "prop_sg_marina_one",
        subject: "July operating rules",
        initialMessage: "Please confirm visitor-lot access for the next Prima Wash Day.",
      }),
    });
    const createPayload = (await createResponse.json()) as ApiResponse<CommunicationThreadWithMessages>;
    const replyResponse = await fetch(`${baseUrl}/v1/communication/threads/${createPayload.data.thread.id}/messages`, {
      method: "POST",
      headers: {
        ...propertyManagerHeaders,
        "content-type": "application/json",
      },
      body: JSON.stringify({ body: "Approved for B1 visitor lots. Security has been briefed." }),
    });
    const replyPayload = (await replyResponse.json()) as ApiResponse<CommunicationMessage>;
    const readResponse = await fetch(`${baseUrl}/v1/communication/threads/${createPayload.data.thread.id}`, {
      headers: propertyManagerHeaders,
    });
    const readPayload = (await readResponse.json()) as ApiResponse<CommunicationThreadWithMessages>;

    assert.equal(createResponse.status, 201);
    assert.equal(createPayload.data.messages.length, 1);
    assert.equal(replyResponse.status, 201);
    assert.equal(replyPayload.data.senderRole, "property_manager");
    assert.equal(readResponse.status, 200);
    assert.equal(readPayload.data.messages.length, 2);
  });

  it("blocks property managers from another condo communication thread", async () => {
    const createResponse = await fetch(`${baseUrl}/v1/communication/threads`, {
      method: "POST",
      headers: {
        ...internalHeaders,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        type: "prima_to_property",
        resourceType: "property",
        resourceId: "prop_sg_reflections",
        subject: "Reflections access",
        initialMessage: "Confirm loading bay access.",
      }),
    });
    const createPayload = (await createResponse.json()) as ApiResponse<CommunicationThreadWithMessages>;
    const readResponse = await fetch(`${baseUrl}/v1/communication/threads/${createPayload.data.thread.id}`, {
      headers: propertyManagerHeaders,
    });
    const readPayload = (await readResponse.json()) as ApiErrorResponse;

    assert.equal(createResponse.status, 201);
    assert.equal(readResponse.status, 403);
    assert.equal(readPayload.code, "communication_thread_forbidden");
  });

  it("persists Prima Wash owner support threads with customer replies", async () => {
    const createResponse = await fetch(`${baseUrl}/v1/communication/threads`, {
      method: "POST",
      headers: {
        ...internalHeaders,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        type: "prima_to_owner",
        resourceType: "owner",
        resourceId: "usr_demo_001",
        subject: "Payment support",
        initialMessage: "We can help with the payment authorization before your appointment.",
      }),
    });
    const createPayload = (await createResponse.json()) as ApiResponse<CommunicationThreadWithMessages>;
    const replyResponse = await fetch(`${baseUrl}/v1/communication/threads/${createPayload.data.thread.id}/messages`, {
      method: "POST",
      headers: customerHeaders,
      body: JSON.stringify({ body: "Thanks, I will retry authorization now." }),
    });
    const readResponse = await fetch(`${baseUrl}/v1/communication/threads/${createPayload.data.thread.id}`, {
      headers: customerHeaders,
    });
    const readPayload = (await readResponse.json()) as ApiResponse<CommunicationThreadWithMessages>;

    assert.equal(createResponse.status, 201);
    assert.equal(replyResponse.status, 201);
    assert.equal(readResponse.status, 200);
    assert.deepEqual(readPayload.data.messages.map((message) => message.senderRole), ["internal", "customer"]);
  });

  it("persists Prima Wash partner operation threads with partner replies", async () => {
    const createResponse = await fetch(`${baseUrl}/v1/communication/threads`, {
      method: "POST",
      headers: {
        ...internalHeaders,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        type: "prima_to_partner",
        resourceType: "partner_location",
        resourceId: "loc_demo_001",
        subject: "Weekend capacity plan",
        initialMessage: "Please confirm technician coverage for the weekend slots.",
      }),
    });
    const createPayload = (await createResponse.json()) as ApiResponse<CommunicationThreadWithMessages>;
    const replyResponse = await fetch(`${baseUrl}/v1/communication/threads/${createPayload.data.thread.id}/messages`, {
      method: "POST",
      headers: {
        ...partnerHeaders,
        "content-type": "application/json",
      },
      body: JSON.stringify({ body: "Coverage confirmed for all published slots." }),
    });
    const readResponse = await fetch(`${baseUrl}/v1/communication/threads/${createPayload.data.thread.id}`, {
      headers: partnerHeaders,
    });
    const readPayload = (await readResponse.json()) as ApiResponse<CommunicationThreadWithMessages>;

    assert.equal(createResponse.status, 201);
    assert.equal(replyResponse.status, 201);
    assert.equal(readResponse.status, 200);
    assert.deepEqual(readPayload.data.messages.map((message) => message.senderRole), ["internal", "partner"]);
  });

  it("allows multiple Prima Wash Days for the same condo without a weekly or monthly cap", async () => {
    const created: PrimaWashDay[] = [];

    for (const date of ["2026-07-05", "2026-07-06", "2026-07-07"]) {
      const response = await fetch(`${baseUrl}/v1/internal/prima-wash-days`, {
        method: "POST",
        headers: {
          ...internalHeaders,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          propertyId: "prop_sg_marina_one",
          partnerLocationId: "loc_demo_001",
          approvedServiceArea: "Basement visitor lots B1",
          startsAt: `${date}T01:00:00.000Z`,
          endsAt: `${date}T05:00:00.000Z`,
          capacity: 12,
          serviceCodes: ["wash_basic", "wash_premium"],
          status: "planned",
          operatingNotes: "Extra resident-demand day.",
        }),
      });
      const payload = (await response.json()) as ApiResponse<PrimaWashDay>;

      assert.equal(response.status, 201);
      created.push(payload.data);
    }

    const listResponse = await fetch(`${baseUrl}/v1/internal/prima-wash-days?propertyId=prop_sg_marina_one`, {
      headers: internalHeaders,
    });
    const listPayload = (await listResponse.json()) as ApiResponse<PrimaWashDay[]>;
    const createdIds = new Set(created.map((day) => day.id));

    assert.equal(listResponse.status, 200);
    assert.equal(listPayload.data.filter((day) => createdIds.has(day.id)).length, 3);
  });

  it("lets authenticated residents see upcoming Prima Wash Days for their condo", async () => {
    const startsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const endsAt = new Date(startsAt.getTime() + 4 * 60 * 60 * 1000);
    const createResponse = await fetch(`${baseUrl}/v1/internal/prima-wash-days`, {
      method: "POST",
      headers: {
        ...internalHeaders,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        propertyId: "prop_sg_marina_one",
        partnerLocationId: "loc_demo_001",
        approvedServiceArea: "Basement visitor lots B1",
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        capacity: 12,
        serviceCodes: ["wash_basic", "wash_premium"],
        status: "approved",
      }),
    });
    const createPayload = (await createResponse.json()) as ApiResponse<PrimaWashDay>;
    const response = await fetch(`${baseUrl}/v1/properties/prop_sg_marina_one/prima-wash-days`, {
      headers: customerHeaders,
    });
    const payload = (await response.json()) as ApiResponse<PrimaWashDay[]>;

    assert.equal(createResponse.status, 201);
    assert.equal(response.status, 200);
    assert.ok(payload.data.some((day) => day.id === createPayload.data.id));
    assert.ok(payload.data.every((day) => day.propertyId === "prop_sg_marina_one"));
    assert.ok(payload.data.every((day) => ["planned", "approved", "active"].includes(day.status)));
  });

  it("creates a booking against a Prima Wash Day and enforces day capacity", async () => {
    const startsAt = new Date(Date.now() + 8 * 24 * 60 * 60 * 1000);
    const endsAt = new Date(startsAt.getTime() + 4 * 60 * 60 * 1000);
    const dayResponse = await fetch(`${baseUrl}/v1/internal/prima-wash-days`, {
      method: "POST",
      headers: {
        ...internalHeaders,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        propertyId: "prop_sg_marina_one",
        partnerLocationId: "loc_demo_001",
        approvedServiceArea: "Basement visitor lots B1",
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        capacity: 1,
        serviceCodes: ["wash_basic"],
        status: "approved",
      }),
    });
    const dayPayload = (await dayResponse.json()) as ApiResponse<PrimaWashDay>;
    const firstVehicle = await createVehicle("CONDO1");
    const bookingResponse = await fetch(`${baseUrl}/v1/bookings`, {
      method: "POST",
      headers: customerHeaders,
      body: JSON.stringify({
        vehicleId: firstVehicle.id,
        primaWashDayId: dayPayload.data.id,
        serviceCode: "wash_basic",
      }),
    });
    const bookingPayload = (await bookingResponse.json()) as ApiResponse<Booking>;

    assert.equal(dayResponse.status, 201);
    assert.equal(bookingResponse.status, 201);
    assert.equal(bookingPayload.data.primaWashDayId, dayPayload.data.id);
    assert.equal(bookingPayload.data.partnerLocationId, "loc_demo_001");
    assert.equal(bookingPayload.data.scheduledStartAt, dayPayload.data.startsAt);

    const secondVehicle = await createVehicle("CONDO2");
    const fullResponse = await fetch(`${baseUrl}/v1/bookings`, {
      method: "POST",
      headers: customerHeaders,
      body: JSON.stringify({
        vehicleId: secondVehicle.id,
        primaWashDayId: dayPayload.data.id,
        serviceCode: "wash_basic",
      }),
    });
    const fullPayload = (await fullResponse.json()) as ApiErrorResponse;

    assert.equal(fullResponse.status, 409);
    assert.equal(fullPayload.code, "prima_wash_day_full");
  });

  it("exposes an internal operational queue for Prima Wash Day bookings", async () => {
    const startsAt = new Date(Date.now() + 9 * 24 * 60 * 60 * 1000);
    const endsAt = new Date(startsAt.getTime() + 4 * 60 * 60 * 1000);
    const dayResponse = await fetch(`${baseUrl}/v1/internal/prima-wash-days`, {
      method: "POST",
      headers: {
        ...internalHeaders,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        propertyId: "prop_sg_marina_one",
        partnerLocationId: "loc_demo_001",
        approvedServiceArea: "Basement visitor lots B1",
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        capacity: 4,
        serviceCodes: ["wash_basic"],
        status: "approved",
      }),
    });
    const dayPayload = (await dayResponse.json()) as ApiResponse<PrimaWashDay>;
    const vehicle = await createVehicle("QUEUE1");
    const bookingResponse = await fetch(`${baseUrl}/v1/bookings`, {
      method: "POST",
      headers: customerHeaders,
      body: JSON.stringify({
        vehicleId: vehicle.id,
        primaWashDayId: dayPayload.data.id,
        serviceCode: "wash_basic",
      }),
    });
    const bookingPayload = (await bookingResponse.json()) as ApiResponse<Booking>;
    await authorizeBookingPayment(bookingPayload.data.id);

    const queueResponse = await fetch(
      `${baseUrl}/v1/internal/prima-wash-day-bookings?primaWashDayId=${dayPayload.data.id}`,
      { headers: internalHeaders },
    );
    const queuePayload = (await queueResponse.json()) as ApiResponse<PrimaWashDayBookingItem[]>;
    const item = queuePayload.data.find((item) => item.bookingId === bookingPayload.data.id);

    assert.equal(dayResponse.status, 201);
    assert.equal(bookingResponse.status, 201);
    assert.equal(queueResponse.status, 200);
    assert.equal(item?.primaWashDayId, dayPayload.data.id);
    assert.ok(item?.paymentIntentId);
    assert.equal(item?.paymentStatus, "authorized");
    assert.equal(item?.status, "confirmed");
    assert.equal(item?.onsiteServiceMode, "customer_property");
    assert.equal(item?.actionHint, "Property service requested; confirm access and service area");
  });

  it("lets partner actors update onsite execution details for a booking", async () => {
    const vehicle = await createVehicle("EXEC123");
    const booking = await createBooking(vehicle.id, "wash_basic");
    const response = await fetch(`${baseUrl}/v1/bookings/${booking.id}/execution`, {
      method: "PATCH",
      headers: {
        ...partnerHeaders,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        onsiteServiceMode: "pickup_return",
        valetRequested: true,
        executionNotes: "Owner approved handover at lobby concierge.",
        technicianCheckedIn: true,
      }),
    });
    const payload = (await response.json()) as ApiResponse<Booking>;

    assert.equal(response.status, 200);
    assert.equal(payload.data.onsiteServiceMode, "pickup_return");
    assert.equal(payload.data.valetRequested, true);
    assert.equal(payload.data.executionNotes, "Owner approved handover at lobby concierge.");
    assert.ok(payload.data.technicianCheckedInAt);

    const checkoutResponse = await fetch(`${baseUrl}/v1/bookings/${booking.id}/execution`, {
      method: "PATCH",
      headers: {
        ...partnerHeaders,
        "content-type": "application/json",
      },
      body: JSON.stringify({ technicianCheckedOut: true }),
    });
    const checkoutPayload = (await checkoutResponse.json()) as ApiResponse<Booking>;

    assert.equal(checkoutResponse.status, 200);
    assert.ok(checkoutPayload.data.technicianCheckedOutAt);
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

    const duplicateResponse = await fetch(`${baseUrl}/v1/vehicles`, {
      method: "POST",
      headers,
      body: JSON.stringify({ plateNumber: "garage2", make: "BMW", model: "i4" }),
    });
    assert.equal(duplicateResponse.status, 409);

    const duplicateUpdateResponse = await fetch(`${baseUrl}/v1/vehicles/${firstPayload.data.id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ plateNumber: "GARAGE2" }),
    });
    assert.equal(duplicateUpdateResponse.status, 409);

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
          "access-control-request-headers": "x-prima-user-id,x-prima-role,x-prima-organization-id,x-prima-property-id,x-prima-permissions",
        },
      });

      assert.equal(response.status, 204);
      assert.equal(response.headers.get("access-control-allow-origin"), origin);
      assert.match(response.headers.get("access-control-allow-headers") ?? "", /x-prima-user-id/);
      assert.match(response.headers.get("access-control-allow-headers") ?? "", /x-prima-permissions/);
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

  it("persists booking communication threads between partners and vehicle owners", async () => {
    const vehicle = await createVehicle("CHAT123");
    const booking = await createBooking(vehicle.id, "wash_basic");
    const createResponse = await fetch(`${baseUrl}/v1/communication/threads`, {
      method: "POST",
      headers: customerHeaders,
      body: JSON.stringify({
        type: "partner_to_owner",
        resourceType: "booking",
        resourceId: booking.id,
        subject: "Arrival note",
        initialMessage: "I will arrive 10 minutes early.",
      }),
    });
    const createPayload = (await createResponse.json()) as ApiResponse<CommunicationThreadWithMessages>;
    const replyResponse = await fetch(`${baseUrl}/v1/communication/threads/${createPayload.data.thread.id}/messages`, {
      method: "POST",
      headers: {
        ...partnerHeaders,
        "content-type": "application/json",
      },
      body: JSON.stringify({ body: "Noted. Please park near the visitor entrance." }),
    });
    const readResponse = await fetch(`${baseUrl}/v1/communication/threads/${createPayload.data.thread.id}`, {
      headers: customerHeaders,
    });
    const readPayload = (await readResponse.json()) as ApiResponse<CommunicationThreadWithMessages>;
    const auditResponse = await fetch(`${baseUrl}/v1/audit-events?limit=3`, {
      headers: internalHeaders,
    });
    const auditPayload = (await auditResponse.json()) as ApiResponse<Array<{ action: string; metadata: Record<string, unknown> }>>;

    assert.equal(createResponse.status, 201);
    assert.equal(replyResponse.status, 201);
    assert.equal(readResponse.status, 200);
    assert.deepEqual(readPayload.data.messages.map((message) => message.senderRole), ["customer", "partner"]);
    assert.equal(auditResponse.status, 200);
    assert.equal(auditPayload.data[0]?.action, "communication.message_created");
    assert.equal(auditPayload.data[0]?.metadata.type, "partner_to_owner");
    assert.equal(auditPayload.data[0]?.metadata.subject, "Arrival note");
    assert.equal(auditPayload.data[0]?.metadata.senderRole, "partner");
    assert.equal(typeof auditPayload.data[0]?.metadata.messageId, "string");
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
    assert.equal(queueItem?.vehicle?.plateNumber, "DASH999");
    assert.equal(queueItem?.vehicle?.make, "Tesla");
    assert.equal(queueItem?.vehicle?.model, "Model 3");
    assert.equal(queueItem?.partnerLocation?.name, "Prima Wash Central");
    assert.equal(queueItem?.partnerLocation?.addressLine1, "100 Central Street");
    assert.equal(queueItem?.actionHint, "Customer has not created a payment hold yet");
  });

  it("blocks partners from reading competitor dashboard locations", async () => {
    const response = await fetch(`${baseUrl}/v1/partner/dashboard?partnerLocationId=loc_harbour_001`, {
      headers: partnerHeaders,
    });
    const payload = (await response.json()) as ApiErrorResponse;

    assert.equal(response.status, 403);
    assert.equal(payload.code, "partner_location_forbidden");
  });

  it("hydrates partner scope from stored membership instead of trusting spoofed headers", async () => {
    const response = await fetch(`${baseUrl}/v1/partner/dashboard?partnerLocationId=loc_harbour_001`, {
      headers: {
        ...partnerHeaders,
        "x-prima-organization-id": "org_partner_002",
      },
    });
    const payload = (await response.json()) as ApiErrorResponse;

    assert.equal(response.status, 403);
    assert.equal(payload.code, "partner_location_forbidden");
  });

  it("rejects partner actors without an active membership", async () => {
    const response = await fetch(`${baseUrl}/v1/partner/dashboard`, {
      headers: {
        "x-prima-user-id": "partner_unknown_001",
        "x-prima-role": "partner",
        "x-prima-organization-id": "org_partner_001",
      },
    });
    const payload = (await response.json()) as ApiErrorResponse;

    assert.equal(response.status, 401);
    assert.equal(payload.code, "authentication_required");
  });

  it("exposes cross-location operations only to internal users with operations permission", async () => {
    const allowedResponse = await fetch(`${baseUrl}/v1/internal/operations-dashboard`, {
      headers: { ...internalHeaders, "x-prima-permissions": "operations_read" },
    });
    const allowedPayload = (await allowedResponse.json()) as ApiResponse<PartnerDashboardResponse>;
    const deniedResponse = await fetch(`${baseUrl}/v1/internal/operations-dashboard`, {
      headers: { ...internalHeaders, "x-prima-permissions": "finance_read" },
    });
    const deniedPayload = (await deniedResponse.json()) as ApiErrorResponse;

    assert.equal(allowedResponse.status, 200);
    assert.equal(allowedPayload.data.partnerLocationId, "all_locations");
    assert.equal(deniedResponse.status, 403);
    assert.equal(deniedPayload.code, "internal_permission_required");
  });

  it("surfaces authorized payment readiness in the partner dashboard", async () => {
    const slot = await createAvailabilitySlot({
      startsAt: new Date(Date.UTC(2026, 6, 1, 6, 0, 0)).toISOString(),
      endsAt: new Date(Date.UTC(2026, 6, 1, 7, 0, 0)).toISOString(),
      capacity: 1,
      serviceCodes: ["wash_basic"],
    });
    const vehicle = await createVehicle("DASHREADY");
    const booking = await createBooking(vehicle.id, "wash_basic", slot.id);
    await authorizeBookingPayment(booking.id);

    const response = await fetch(`${baseUrl}/v1/partner/dashboard`, {
      headers: partnerHeaders,
    });
    const payload = (await response.json()) as ApiResponse<PartnerDashboardResponse>;
    const queueItem = payload.data.queue.find((item) => item.bookingId === booking.id);

    assert.equal(response.status, 200);
    assert.ok(queueItem?.paymentIntentId);
    assert.equal(queueItem?.paymentStatus, "authorized");
    assert.deepEqual(queueItem?.paymentAmount, { amountMinor: 2500, currency: "USD" });
    assert.equal(queueItem?.status, "confirmed");
    assert.equal(queueItem?.onsiteServiceMode, "partner_location");
    assert.equal(queueItem?.actionHint, "Customer expected; check in when vehicle arrives");
    assert.ok(payload.data.metrics.some((metric) => metric.label === "Authorized revenue"));
  });

  it("lets partners accept an authorized booking from the operational queue", async () => {
    const vehicle = await createVehicle("ACCEPT1");
    const booking = await createBooking(vehicle.id, "wash_basic");
    const payment = await createPaymentIntent(booking.id);
    await repositories.payments.authorize(payment.id);

    const response = await fetch(`${baseUrl}/v1/bookings/${booking.id}/partner-decision`, {
      method: "POST",
      headers: { ...partnerHeaders, "content-type": "application/json" },
      body: JSON.stringify({ decision: "accept" }),
    });
    const payload = (await response.json()) as ApiResponse<{ booking: Booking }>;

    assert.equal(response.status, 200);
    assert.equal(payload.data.booking.status, "confirmed");

    const auditResponse = await fetch(`${baseUrl}/v1/audit-events?limit=2`, { headers: internalHeaders });
    const auditPayload = (await auditResponse.json()) as ApiResponse<Array<{ action: string; metadata: Record<string, unknown> }>>;

    assert.equal(auditPayload.data[0]?.action, "booking.partner_decision");
    assert.equal(auditPayload.data[0]?.metadata.decision, "accept");
  });

  it("lets partners request clarification from the owner before accepting", async () => {
    const vehicle = await createVehicle("CLARIFY1");
    const booking = await createBooking(vehicle.id, "wash_basic");
    const response = await fetch(`${baseUrl}/v1/bookings/${booking.id}/partner-decision`, {
      method: "POST",
      headers: { ...partnerHeaders, "content-type": "application/json" },
      body: JSON.stringify({
        decision: "request_clarification",
        message: "Please confirm basement access and handover contact.",
      }),
    });
    const payload = (await response.json()) as ApiResponse<{ booking: Booking; thread: CommunicationThread }>;
    const readResponse = await fetch(`${baseUrl}/v1/communication/threads/${payload.data.thread.id}`, {
      headers: customerHeaders,
    });
    const readPayload = (await readResponse.json()) as ApiResponse<CommunicationThreadWithMessages>;

    assert.equal(response.status, 200);
    assert.equal(payload.data.booking.status, "pending_payment");
    assert.equal(payload.data.thread.type, "partner_to_owner");
    assert.equal(readResponse.status, 200);
    assert.equal(readPayload.data.messages.at(-1)?.body, "Please confirm basement access and handover contact.");
  });

  it("lets partners reject an unsupported service mode and notify the owner", async () => {
    const vehicle = await createVehicle("REJECT1");
    const booking = await createBooking(vehicle.id, "wash_basic");
    const payment = await createPaymentIntent(booking.id);
    await repositories.payments.authorize(payment.id);

    const response = await fetch(`${baseUrl}/v1/bookings/${booking.id}/partner-decision`, {
      method: "POST",
      headers: { ...partnerHeaders, "content-type": "application/json" },
      body: JSON.stringify({
        decision: "reject_mode",
        message: "Pickup and return is unavailable for this appointment window.",
      }),
    });
    const payload = (await response.json()) as ApiResponse<{ booking: Booking; thread: CommunicationThread }>;
    const voidedPayment = await repositories.payments.get(payment.id);

    assert.equal(response.status, 200);
    assert.equal(payload.data.booking.status, "cancelled");
    assert.equal(payload.data.thread.type, "partner_to_owner");
    assert.equal(voidedPayment?.status, "voided");
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

  it("reconciles Stripe payment authorization webhooks idempotently", async () => {
    const vehicle = await createVehicle("PAYHOOK1");
    const booking = await createBooking(vehicle.id, "wash_basic");
    const providerReference = `pi_${booking.id.slice(-12)}`;
    const payment = await repositories.payments.createForBooking(booking, {
      provider: "stripe",
      operation: "create",
      providerReference,
      status: "succeeded",
      processedAt: new Date().toISOString(),
      clientSecret: `pi_secret_${booking.id.slice(-8)}`,
    });
    const event = {
      id: `evt_${booking.id.slice(-12)}`,
      type: "payment_intent.amount_capturable_updated",
      data: {
        object: {
          object: "payment_intent",
          id: providerReference,
          status: "requires_capture",
        },
      },
    };

    const response = await postStripeWebhook(event);
    const payload = (await response.json()) as ApiResponse<{
      readonly outcome: string;
      readonly paymentIntentId: string;
      readonly paymentStatus: string;
    }>;

    assert.equal(response.status, 200);
    assert.equal(payload.data.outcome, "reconciled");
    assert.equal(payload.data.paymentIntentId, payment.id);
    assert.equal(payload.data.paymentStatus, "authorized");

    const paymentResponse = await fetch(`${baseUrl}/v1/payments?bookingId=${booking.id}`, {
      headers: customerHeaders,
    });
    const paymentPayload = (await paymentResponse.json()) as ApiResponse<PaymentIntent>;
    const bookingResponse = await fetch(`${baseUrl}/v1/bookings/${booking.id}`, {
      headers: customerHeaders,
    });
    const bookingPayload = (await bookingResponse.json()) as ApiResponse<Booking>;

    assert.equal(paymentPayload.data.status, "authorized");
    assert.equal(bookingPayload.data.status, "confirmed");

    const duplicateResponse = await postStripeWebhook(event);
    const duplicatePayload = (await duplicateResponse.json()) as ApiResponse<{ readonly outcome: string }>;

    assert.equal(duplicateResponse.status, 200);
    assert.equal(duplicatePayload.data.outcome, "duplicate");
  });

  it("rejects Stripe webhooks with an invalid signature", async () => {
    const response = await fetch(`${baseUrl}/v1/webhooks/stripe`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "stripe-signature": "t=123,v1=not-a-valid-signature",
      },
      body: JSON.stringify({ id: "evt_invalid", type: "payment_intent.succeeded", data: { object: {} } }),
    });
    const payload = (await response.json()) as ApiErrorResponse;

    assert.equal(response.status, 400);
    assert.equal(payload.code, "stripe_signature_invalid");
  });

  it("creates and authorizes customer-scoped payment intents", async () => {
    const vehicle = await createVehicle("PAYAUTH1");
    const booking = await createBooking(vehicle.id, "wash_premium");

    const createOperationCount = paymentProviderOperations.length;
    const payment = await createPaymentIntent(booking.id);
    const operationCount = paymentProviderOperations.length;
    const authorizedPayment = await authorizePayment(payment.id);

    assert.equal(payment.status, "requires_authorization");
    assert.equal(payment.bookingId, booking.id);
    assert.equal(payment.amount.amountMinor, booking.acceptedPrice.amountMinor);
    assert.equal(payment.provider, "recording");
    assert.equal(payment.providerReference, `recording_create_${createOperationCount + 1}`);
    assert.equal(authorizedPayment.status, "authorized");
    assert.deepEqual(paymentProviderOperations.slice(createOperationCount, operationCount), ["create"]);
    assert.deepEqual(paymentProviderOperations.slice(operationCount), ["authorize"]);

    const bookingResponse = await fetch(`${baseUrl}/v1/bookings/${booking.id}`, {
      headers: customerHeaders,
    });
    const bookingPayload = (await bookingResponse.json()) as ApiResponse<Booking>;

    assert.equal(bookingResponse.status, 200);
    assert.equal(bookingPayload.data.status, "confirmed");

    const confirmed = await updateBookingStatus(booking.id, "confirmed");
    assert.equal(confirmed.status, "confirmed");
  });

  it("captures authorized payment when booking completes", async () => {
    const vehicle = await createVehicle("PAYCAP1");
    const booking = await createBooking(vehicle.id, "wash_basic");
    const payment = await authorizeBookingPayment(booking.id);
    const operationCount = paymentProviderOperations.length;

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
    assert.deepEqual(paymentProviderOperations.slice(operationCount), ["capture"]);
  });

  it("refunds captured payments from internal operations and exposes customer payment history", async () => {
    const vehicle = await createVehicle("PAYREF1");
    const booking = await createBooking(vehicle.id, "wash_basic");
    const payment = await authorizeBookingPayment(booking.id);

    await updateBookingStatus(booking.id, "confirmed");
    await updateBookingStatus(booking.id, "checked_in");
    await updateBookingStatus(booking.id, "in_service");
    await updateBookingStatus(booking.id, "completed");

    const operationCount = paymentProviderOperations.length;
    const refundResponse = await fetch(`${baseUrl}/v1/payments/${payment.id}/refund`, {
      method: "POST",
      headers: internalHeaders,
    });
    const refundPayload = (await refundResponse.json()) as ApiResponse<PaymentIntent>;

    assert.equal(refundResponse.status, 200);
    assert.equal(refundPayload.data.status, "refunded");
    assert.ok(refundPayload.data.refundedAt);
    assert.deepEqual(paymentProviderOperations.slice(operationCount), ["refund"]);

    const historyResponse = await fetch(`${baseUrl}/v1/payments/history`, {
      headers: customerHeaders,
    });
    const historyPayload = (await historyResponse.json()) as ApiResponse<readonly PaymentHistoryItem[]>;
    const historyItem = historyPayload.data.find((item) => item.paymentIntentId === payment.id);

    assert.equal(historyResponse.status, 200);
    assert.equal(historyItem?.status, "refunded");
    assert.equal(historyItem?.bookingId, booking.id);
    assert.equal(historyItem?.amount.amountMinor, booking.acceptedPrice.amountMinor);
    assert.ok(historyItem?.capturedAt);
    assert.ok(historyItem?.refundedAt);
  });

  it("rejects refund attempts before payment capture", async () => {
    const vehicle = await createVehicle("PAYREF2");
    const booking = await createBooking(vehicle.id, "wash_basic");
    const payment = await authorizeBookingPayment(booking.id);

    const response = await fetch(`${baseUrl}/v1/payments/${payment.id}/refund`, {
      method: "POST",
      headers: internalHeaders,
    });
    const payload = (await response.json()) as ApiErrorResponse;

    assert.equal(response.status, 409);
    assert.equal(payload.code, "invalid_payment_status_transition");
  });

  it("voids authorized payment when customer cancels before service starts", async () => {
    const vehicle = await createVehicle("PAYVOID1");
    const booking = await createBooking(vehicle.id, "wash_basic");
    await authorizeBookingPayment(booking.id);
    const operationCount = paymentProviderOperations.length;

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
    assert.deepEqual(paymentProviderOperations.slice(operationCount), ["void"]);
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

  async function createVehicle(plateNumber: string, headers: Record<string, string> = customerHeaders): Promise<Vehicle> {
    const response = await fetch(`${baseUrl}/v1/vehicles`, {
      method: "POST",
      headers,
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

  function authHeaders(session: AuthSession): Record<string, string> {
    return {
      authorization: `Bearer ${session.accessToken}`,
      "content-type": "application/json",
    };
  }

  async function createBooking(
    vehicleId: string,
    serviceCode: string,
    availabilitySlotId = "slot_demo_1100",
    headers: Record<string, string> = customerHeaders,
  ): Promise<Booking> {
    const response = await fetch(`${baseUrl}/v1/bookings`, {
      method: "POST",
      headers,
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

  async function createPaymentIntent(
    bookingId: string,
    headers: Record<string, string> = customerHeaders,
  ): Promise<PaymentIntent> {
    const response = await fetch(`${baseUrl}/v1/payments/intents`, {
      method: "POST",
      headers,
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

  async function postStripeWebhook(event: unknown): Promise<Response> {
    const body = JSON.stringify(event);
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = createHmac("sha256", stripeWebhookSecret).update(`${timestamp}.${body}`).digest("hex");

    return fetch(`${baseUrl}/v1/webhooks/stripe`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "stripe-signature": `t=${timestamp},v1=${signature}`,
      },
      body,
    });
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

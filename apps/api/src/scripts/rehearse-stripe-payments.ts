import {
  type ApiErrorResponse,
  type AuthSession,
  type AvailabilitySlot,
  type Booking,
  type BookingEvidence,
  type BookingHandover,
  type BookingStatus,
  type CreateAvailabilitySlotRequest,
  type PaymentIntent,
  type PartnerDashboardResponse,
  type RequestAuthCodeResponse,
  type Vehicle,
} from "@prima-wash/contracts";

interface ApiResponse<T> {
  readonly data: T;
}

interface StripePaymentIntentResponse {
  readonly id: string;
  readonly status: string;
  readonly capture_method?: string;
}

const apiBase = process.env.STRIPE_REHEARSAL_API_BASE ?? "http://127.0.0.1:3001";
const mailpitBase = process.env.STRIPE_REHEARSAL_MAILPIT_BASE ?? "http://127.0.0.1:8025";
const customerIdentifier =
  process.env.STRIPE_REHEARSAL_CUSTOMER_IDENTIFIER ?? `stripe.owner.${Date.now()}@example.com`;
const partnerIdentifier = process.env.STRIPE_REHEARSAL_PARTNER_IDENTIFIER ?? "partner.demo@primawash.local";
const adminIdentifier = process.env.STRIPE_REHEARSAL_ADMIN_IDENTIFIER ?? "finance@primawash.local";
const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const stripePaymentMethod = process.env.STRIPE_REHEARSAL_PAYMENT_METHOD ?? "pm_card_visa";
const partnerLocationId = process.env.STRIPE_REHEARSAL_PARTNER_LOCATION_ID ?? "loc_demo_001";

await main();

async function main(): Promise<void> {
  if (!stripeSecretKey) {
    throw new Error("STRIPE_SECRET_KEY is required for the Stripe payment rehearsal");
  }

  await assertReachable(`${apiBase}/health`, "API");
  await assertReachable(`${mailpitBase}/api/v1/messages`, "Mailpit");

  const customerSession = await requestCodeAndVerify(customerIdentifier, "customer");
  const partnerSession = await requestCodeAndVerify(partnerIdentifier, "partner");
  const adminSession = await requestCodeAndVerify(adminIdentifier, "internal");

  const captured = await rehearseCaptureAndRefund({
    customerToken: customerSession.accessToken,
    partnerToken: partnerSession.accessToken,
    adminToken: adminSession.accessToken,
  });
  const voided = await rehearseVoid({
    customerToken: customerSession.accessToken,
    partnerToken: partnerSession.accessToken,
  });

  console.log(
    JSON.stringify(
      {
        event: "stripe_payment_rehearsal_passed",
        provider: "stripe",
        customer: customerSession.user.identifier,
        captureRefundBookingId: captured.booking.id,
        captureRefundPaymentId: captured.refunded.id,
        captureRefundProviderReference: captured.refunded.providerReference,
        voidBookingId: voided.booking.id,
        voidPaymentId: voided.voided.id,
        voidProviderReference: voided.voided.providerReference,
      },
      null,
      2,
    ),
  );
}

async function rehearseCaptureAndRefund(tokens: {
  readonly customerToken: string;
  readonly partnerToken: string;
  readonly adminToken: string;
}): Promise<{ readonly booking: Booking; readonly refunded: PaymentIntent }> {
  const booking = await createAuthorizedBooking(tokens.customerToken, tokens.partnerToken, "CAP", 1);

  await patchJson<Booking>(
    `/v1/bookings/${booking.id}/status`,
    { status: "checked_in" satisfies BookingStatus },
    authHeaders(tokens.partnerToken),
  );
  await patchJson<Booking>(
    `/v1/bookings/${booking.id}/status`,
    { status: "in_service" satisfies BookingStatus },
    authHeaders(tokens.partnerToken),
  );
  await patchJson<Booking>(
    `/v1/bookings/${booking.id}/execution`,
    {
      assignedTechnicianName: "Stripe Rehearsal Technician",
      completionNotes: "Stripe rehearsal service completed, vehicle checked, and handover area cleared.",
      technicianCheckedOut: true,
    },
    authHeaders(tokens.partnerToken),
  );
  await addEvidence(booking.id, "before", tokens.partnerToken);
  await addEvidence(booking.id, "after", tokens.partnerToken);
  await addHandover(booking.id, "pickup", tokens.partnerToken);
  await addHandover(booking.id, "return", tokens.partnerToken);
  await addHandover(booking.id, "onsite_receipt", tokens.partnerToken);
  await addHandover(booking.id, "onsite_release", tokens.partnerToken);

  await patchJson<Booking>(
    `/v1/bookings/${booking.id}/status`,
    { status: "completed" satisfies BookingStatus },
    authHeaders(tokens.partnerToken),
  );

  const captured = await getJson<PaymentIntent>(`/v1/payments?bookingId=${encodeURIComponent(booking.id)}`, {
    authorization: `Bearer ${tokens.customerToken}`,
  });

  if (captured.status !== "captured") {
    throw new Error(`payment_not_captured:${captured.id}:${captured.status}`);
  }

  const refunded = await postJson<PaymentIntent>(
    `/v1/payments/${captured.id}/refund`,
    {},
    {
      ...authHeaders(tokens.adminToken),
      "idempotency-key": `stripe-rehearsal-refund-${captured.id}`,
    },
  );

  if (refunded.status !== "refunded") {
    throw new Error(`payment_not_refunded:${refunded.id}:${refunded.status}`);
  }

  return { booking, refunded };
}

async function rehearseVoid(tokens: {
  readonly customerToken: string;
  readonly partnerToken: string;
}): Promise<{ readonly booking: Booking; readonly voided: PaymentIntent }> {
  const booking = await createAuthorizedBooking(tokens.customerToken, tokens.partnerToken, "VOID", 2);

  await postJson<Booking>(
    `/v1/bookings/${booking.id}/cancel`,
    { reason: "Stripe rehearsal authorized-payment void path" },
    {
      ...authHeaders(tokens.customerToken),
      "idempotency-key": `stripe-rehearsal-void-${booking.id}`,
    },
  );

  const voided = await getJson<PaymentIntent>(`/v1/payments?bookingId=${encodeURIComponent(booking.id)}`, {
    authorization: `Bearer ${tokens.customerToken}`,
  });

  if (voided.status !== "voided") {
    throw new Error(`payment_not_voided:${voided.id}:${voided.status}`);
  }

  await assertPartnerQueueScoped(tokens.partnerToken);
  return { booking, voided };
}

async function createAuthorizedBooking(
  customerToken: string,
  partnerToken: string,
  platePrefix: string,
  slotOffsetHours: number,
): Promise<Booking> {
  const vehicle = await postJson<Vehicle>(
    "/v1/vehicles",
    {
      plateNumber: `STR${platePrefix}${Date.now().toString().slice(-6)}`,
      make: "Tesla",
      model: "Model 3",
      isPrimary: false,
    },
    authHeaders(customerToken),
  );
  const slot = await createAvailabilitySlot(partnerToken, slotOffsetHours);
  const booking = await postJson<Booking>(
    "/v1/bookings",
    {
      vehicleId: vehicle.id,
      availabilitySlotId: slot.id,
      serviceCode: "wash_basic",
      onsiteServiceMode: "partner_location",
      executionNotes: "Stripe test-mode rehearsal booking.",
    },
    authHeaders(customerToken),
  );
  const payment = await postJson<PaymentIntent>(
    "/v1/payments/intents",
    { bookingId: booking.id },
    {
      ...authHeaders(customerToken),
      "idempotency-key": `stripe-rehearsal-create-${booking.id}`,
    },
  );

  assertStripePayment(payment);
  await confirmStripePayment(payment.providerReference);

  const authorized = await postJson<PaymentIntent>(
    `/v1/payments/${payment.id}/authorize`,
    {},
    {
      ...authHeaders(customerToken),
      "idempotency-key": `stripe-rehearsal-authorize-${payment.id}`,
    },
  );

  if (authorized.status !== "authorized") {
    throw new Error(`payment_not_authorized:${authorized.id}:${authorized.status}`);
  }

  return booking;
}

async function createAvailabilitySlot(partnerToken: string, slotOffsetHours: number): Promise<AvailabilitySlot> {
  const startsAt = new Date(Date.now() + (24 + slotOffsetHours) * 60 * 60 * 1000);
  startsAt.setUTCMinutes(0, 0, 0);
  const endsAt = new Date(startsAt.getTime() + 45 * 60 * 1000);
  const body: CreateAvailabilitySlotRequest = {
    partnerLocationId,
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
    capacity: 2,
    serviceCodes: ["wash_basic"],
  };

  return postJson<AvailabilitySlot>("/v1/partner/availability", body, {
    authorization: `Bearer ${partnerToken}`,
  });
}

async function addEvidence(
  bookingId: string,
  evidenceType: "before" | "after",
  partnerToken: string,
): Promise<BookingEvidence> {
  return postJson<BookingEvidence>(
    `/v1/bookings/${bookingId}/evidence`,
    {
      evidenceType,
      url: `evidence://${bookingId}/stripe-rehearsal-${evidenceType}`,
      notes: `Stripe rehearsal ${evidenceType} evidence.`,
    },
    authHeaders(partnerToken),
  );
}

async function addHandover(
  bookingId: string,
  handoverType: "pickup" | "return" | "onsite_receipt" | "onsite_release",
  partnerToken: string,
): Promise<BookingHandover> {
  return postJson<BookingHandover>(
    `/v1/bookings/${bookingId}/handovers`,
    {
      handoverType,
      contactName: "Stripe Rehearsal Contact",
      locationNotes: "Prima Wash Central rehearsal bay",
      keyHandoverMethod: "No physical key transfer",
      conditionNotes: "No visible issues during rehearsal handover.",
      acknowledgedBy: "Stripe Rehearsal Contact",
    },
    authHeaders(partnerToken),
  );
}

async function assertPartnerQueueScoped(partnerToken: string): Promise<void> {
  const dashboard = await getJson<PartnerDashboardResponse>(
    `/v1/partner/dashboard?partnerLocationId=${encodeURIComponent(partnerLocationId)}`,
    { authorization: `Bearer ${partnerToken}` },
  );

  if (dashboard.partnerLocationId !== partnerLocationId) {
    throw new Error(`partner_queue_scope_failed:${dashboard.partnerLocationId}`);
  }
}

async function confirmStripePayment(providerReference: string | undefined): Promise<void> {
  if (!providerReference) {
    throw new Error("stripe_provider_reference_missing");
  }

  const body = new URLSearchParams({
    payment_method: stripePaymentMethod,
    return_url: "https://example.com/prima-wash/stripe-rehearsal",
  });
  const response = await fetch(`https://api.stripe.com/v1/payment_intents/${encodeURIComponent(providerReference)}/confirm`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${stripeSecretKey}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const payload = (await response.json()) as StripePaymentIntentResponse | { readonly error?: { readonly message?: string } };

  if (!response.ok) {
    const message = "error" in payload ? payload.error?.message : response.statusText;
    throw new Error(`stripe_confirm_failed:${providerReference}:${message ?? response.status}`);
  }

  if (!("status" in payload) || !["requires_capture", "succeeded"].includes(payload.status)) {
    throw new Error(`stripe_unexpected_confirm_status:${providerReference}:${"status" in payload ? payload.status : "unknown"}`);
  }
}

function assertStripePayment(payment: PaymentIntent): void {
  if (payment.provider !== "stripe") {
    throw new Error(`payment_provider_not_stripe:${payment.provider ?? "missing"}`);
  }

  if (!payment.providerReference?.startsWith("pi_")) {
    throw new Error(`stripe_payment_reference_invalid:${payment.providerReference ?? "missing"}`);
  }

  if (!payment.clientSecret) {
    throw new Error(`stripe_client_secret_missing:${payment.id}`);
  }
}

async function requestCodeAndVerify(identifier: string, expectedRole: AuthSession["user"]["role"]): Promise<AuthSession> {
  const requestPayload = await postJson<RequestAuthCodeResponse>("/v1/auth/code/request", { identifier });

  if ("devCode" in requestPayload) {
    throw new Error(`dev_code_exposed:${identifier}`);
  }

  const code = await waitForMailpitCode(identifier);
  const session = await postJson<AuthSession>("/v1/auth/code/verify", {
    challengeId: requestPayload.challengeId,
    code,
  });

  if (session.user.role !== expectedRole) {
    throw new Error(`unexpected_role:${identifier}:${session.user.role}`);
  }

  return session;
}

async function getJson<T>(path: string, headers: Record<string, string> = {}): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, { headers });
  return readApiResponse<T>(response, path);
}

async function postJson<T>(
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });

  return readApiResponse<T>(response, path);
}

async function patchJson<T>(
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });

  return readApiResponse<T>(response, path);
}

async function readApiResponse<T>(response: Response, path: string): Promise<T> {
  const payload = (await response.json()) as ApiResponse<T> | ApiErrorResponse;

  if (!response.ok) {
    throw new Error(`api_request_failed:${path}:${"message" in payload ? payload.message : response.statusText}`);
  }

  return (payload as ApiResponse<T>).data;
}

async function waitForMailpitCode(identifier: string): Promise<string> {
  const deadline = Date.now() + 30_000;

  while (Date.now() < deadline) {
    const code = await findMailpitCode(identifier);

    if (code) {
      return code;
    }

    await sleep(500);
  }

  throw new Error(`mailpit_code_not_found:${identifier}`);
}

async function findMailpitCode(identifier: string): Promise<string | undefined> {
  const response = await fetch(`${mailpitBase}/api/v1/messages`);

  if (!response.ok) {
    throw new Error(`mailpit_list_failed:${response.status}`);
  }

  const payload = await response.json();
  const messages = readArray(readRecord(payload).messages);

  for (const message of messages) {
    const record = readRecord(message);
    const summary = JSON.stringify(record).toLowerCase();

    if (!summary.includes(identifier.toLowerCase())) {
      continue;
    }

    const inlineCode = extractCode(JSON.stringify(record));

    if (inlineCode) {
      return inlineCode;
    }

    const id = readOptionalString(record.ID) ?? readOptionalString(record.Id) ?? readOptionalString(record.id);

    if (!id) {
      continue;
    }

    const detail = await fetch(`${mailpitBase}/api/v1/message/${encodeURIComponent(id)}`);

    if (!detail.ok) {
      continue;
    }

    const detailText = await detail.text();
    const code = extractCode(detailText);

    if (code) {
      return code;
    }
  }

  return undefined;
}

async function assertReachable(url: string, label: string): Promise<void> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`${label.toLowerCase()}_not_ready:${response.status}`);
  }
}

function authHeaders(accessToken: string): Record<string, string> {
  return { authorization: `Bearer ${accessToken}` };
}

function extractCode(text: string): string | undefined {
  return text.match(/\b\d{6}\b/)?.[0];
}

function readRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("unexpected_response_shape");
  }

  return value as Record<string, unknown>;
}

function readArray(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

import {
  type AcceptAccessInvitationResponse,
  type AccessInvitation,
  type ApiErrorResponse,
  type AuthSession,
  type RequestAuthCodeResponse,
} from "@prima-wash/contracts";

interface ApiResponse<T> {
  readonly data: T;
}

const apiBase = process.env.AUTH_REHEARSAL_API_BASE ?? "http://127.0.0.1:3001";
const mailpitBase = process.env.AUTH_REHEARSAL_MAILPIT_BASE ?? "http://127.0.0.1:8025";
const customerIdentifier =
  process.env.AUTH_REHEARSAL_CUSTOMER_IDENTIFIER ?? `pilot.owner.${Date.now()}@example.com`;
const adminIdentifier = process.env.AUTH_REHEARSAL_ADMIN_IDENTIFIER ?? "internal.demo@primawash.local";
const partnerInviteIdentifier =
  process.env.AUTH_REHEARSAL_PARTNER_IDENTIFIER ?? `pilot.partner.${Date.now()}@example.com`;

await main();

async function main(): Promise<void> {
  await assertReachable(`${apiBase}/health`, "API");
  await assertReachable(`${mailpitBase}/api/v1/messages`, "Mailpit");

  const customerSession = await requestCodeAndVerify(customerIdentifier, "customer");
  const adminSession = await requestCodeAndVerify(adminIdentifier, "internal");
  const partnerSession = await createAndAcceptPartnerInvitation(adminSession.accessToken);

  console.log(
    JSON.stringify(
      {
        event: "auth_delivery_rehearsal_passed",
        customer: customerSession.user.identifier,
        admin: adminSession.user.identifier,
        invitedPartner: partnerSession.user.identifier,
      },
      null,
      2,
    ),
  );
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

async function createAndAcceptPartnerInvitation(adminAccessToken: string): Promise<AuthSession> {
  const invitation = await postJson<AccessInvitation>(
    "/v1/internal/access-invitations",
    {
      identifier: partnerInviteIdentifier,
      displayName: "Pilot Partner Rehearsal",
      role: "partner",
      organizationId: "org_partner_001",
      partnerLocationId: "loc_demo_001",
    },
    { authorization: `Bearer ${adminAccessToken}` },
  );

  if ("devCode" in invitation) {
    throw new Error(`invitation_dev_code_exposed:${partnerInviteIdentifier}`);
  }

  const code = await waitForMailpitCode(partnerInviteIdentifier);
  const accepted = await postJson<AcceptAccessInvitationResponse>("/v1/access-invitations/accept", {
    invitationId: invitation.id,
    code,
  });

  if (accepted.session.user.role !== "partner") {
    throw new Error(`unexpected_invited_role:${accepted.session.user.role}`);
  }

  return accepted.session;
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

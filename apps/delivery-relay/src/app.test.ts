import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type http from "node:http";
import type { AddressInfo } from "node:net";
import { createDeliveryRelayServer, type AuthCodeDeliveryPayload } from "./app.js";

describe("delivery relay", () => {
  let server: http.Server;
  let baseUrl = "";
  const deliveredEmails: AuthCodeDeliveryPayload[] = [];
  const deliveredSms: AuthCodeDeliveryPayload[] = [];

  before(async () => {
    server = createDeliveryRelayServer({
      webhookSecret: "relay-secret",
      sendEmail: async (payload) => {
        deliveredEmails.push(payload);
      },
      sendSms: async (payload) => {
        deliveredSms.push(payload);
      },
    });

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });
    const address = server.address();
    assert.equal(typeof address, "object");
    assert.notEqual(address, null);
    baseUrl = `http://127.0.0.1:${(address as AddressInfo).port}`;
  });

  after(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  it("reports health", async () => {
    const response = await fetch(`${baseUrl}/healthz`);
    const payload = (await response.json()) as { ok: boolean };

    assert.equal(response.status, 200);
    assert.equal(payload.ok, true);
  });

  it("rejects unauthorized delivery requests", async () => {
    const response = await fetch(`${baseUrl}/auth-code`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(validPayload({ channel: "email" })),
    });

    assert.equal(response.status, 401);
  });

  it("accepts email delivery payloads", async () => {
    const payload = validPayload({ channel: "email", identifier: "pilot@example.com" });
    const response = await postDelivery(payload);
    const responsePayload = (await response.json()) as { accepted: boolean; deliveryId: string };

    assert.equal(response.status, 202);
    assert.equal(responsePayload.accepted, true);
    assert.equal(responsePayload.deliveryId, payload.deliveryId);
    assert.equal(deliveredEmails.at(-1)?.identifier, "pilot@example.com");
  });

  it("accepts sms delivery payloads", async () => {
    const payload = validPayload({ channel: "sms", identifier: "+6590001111" });
    const response = await postDelivery(payload);

    assert.equal(response.status, 202);
    assert.equal(deliveredSms.at(-1)?.identifier, "+6590001111");
  });

  it("rejects invalid delivery payloads", async () => {
    const response = await postDelivery({
      ...validPayload({ channel: "email" }),
      code: "123",
    });
    const payload = (await response.json()) as { error: string };

    assert.equal(response.status, 400);
    assert.equal(payload.error, "validation_failed:code");
  });

  async function postDelivery(payload: unknown): Promise<Response> {
    return fetch(`${baseUrl}/auth-code`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer relay-secret",
      },
      body: JSON.stringify(payload),
    });
  }
});

function validPayload(input: { readonly channel: "email" | "sms"; readonly identifier?: string }): AuthCodeDeliveryPayload {
  return {
    type: "auth_code",
    deliveryId: "delivery_123",
    channel: input.channel,
    identifier: input.identifier ?? "owner@example.com",
    deliveryHint: "ow***@example.com",
    code: "123456",
    expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  };
}

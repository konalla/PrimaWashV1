import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { AuthService } from "./service.js";
import { createAuthCodeDeliveryProvider } from "./delivery.js";

describe("auth code delivery", () => {
  it("exposes development codes only when the local provider is configured to do so", async () => {
    const provider = createAuthCodeDeliveryProvider("local", {
      developmentCode: "654321",
      exposeDevelopmentCode: true,
    });
    const service = new AuthService("test-secret", provider);
    const challenge = await service.requestCode("local@example.com", "127.0.0.1");

    assert.equal(challenge.devCode, "654321");
    await service.verifyCode(challenge.challengeId, "654321");
  });

  it("delivers generated codes through the webhook provider without exposing them to the client", async () => {
    let deliveredCode = "";
    let deliveredBody: unknown;
    let authorization = "";
    let deliveryId = "";
    let deliveryAttempt = "";
    const fetchImpl: typeof fetch = async (_url, init) => {
      const headers = new Headers(init?.headers);
      authorization = headers.get("authorization") ?? "";
      deliveryId = headers.get("x-prima-wash-delivery-id") ?? "";
      deliveryAttempt = headers.get("x-prima-wash-delivery-attempt") ?? "";
      deliveredBody = JSON.parse(String(init?.body));
      deliveredCode = (deliveredBody as { code: string }).code;
      return new Response(null, { status: 202 });
    };
    const provider = createAuthCodeDeliveryProvider("webhook", {
      webhookUrl: "https://delivery.example.com/auth-code",
      webhookSecret: "delivery-secret",
      fetchImpl,
    });
    const service = new AuthService("test-secret", provider);
    const challenge = await service.requestCode("webhook@example.com", "127.0.0.1");

    assert.equal(challenge.devCode, undefined);
    assert.equal(authorization, "Bearer delivery-secret");
    assert.match(deliveryId, /^[0-9a-f-]{36}$/);
    assert.equal(deliveryAttempt, "1");
    assert.match(deliveredCode, /^\d{6}$/);
    assert.deepEqual(
      {
        ...(deliveredBody as Record<string, unknown>),
        deliveryId: "<redacted>",
        code: "<redacted>",
        expiresAt: "<redacted>",
      },
      {
        type: "auth_code",
        deliveryId: "<redacted>",
        channel: "email",
        identifier: "webhook@example.com",
        deliveryHint: "we***@example.com",
        code: "<redacted>",
        expiresAt: "<redacted>",
      },
    );

    await service.verifyCode(challenge.challengeId, deliveredCode);
  });

  it("retries transient webhook delivery failures with the same delivery id and code", async () => {
    const attempts: Array<{ readonly attempt: string; readonly deliveryId: string; readonly code: string }> = [];
    const fetchImpl: typeof fetch = async (_url, init) => {
      const headers = new Headers(init?.headers);
      const body = JSON.parse(String(init?.body)) as { code: string };
      attempts.push({
        attempt: headers.get("x-prima-wash-delivery-attempt") ?? "",
        deliveryId: headers.get("x-prima-wash-delivery-id") ?? "",
        code: body.code,
      });

      return new Response(null, { status: attempts.length === 1 ? 503 : 202 });
    };
    const provider = createAuthCodeDeliveryProvider("webhook", {
      webhookUrl: "https://delivery.example.com/auth-code",
      webhookMaxAttempts: 2,
      webhookRetryDelayMs: 0,
      fetchImpl,
    });
    const service = new AuthService("test-secret", provider);
    const challenge = await service.requestCode("+6590001111", "127.0.0.1");

    assert.equal(challenge.devCode, undefined);
    assert.equal(attempts.length, 2);
    assert.deepEqual(attempts.map((attempt) => attempt.attempt), ["1", "2"]);
    assert.equal(attempts[0]?.deliveryId, attempts[1]?.deliveryId);
    assert.equal(attempts[0]?.code, attempts[1]?.code);
  });

  it("does not retry permanent webhook delivery failures", async () => {
    let attempts = 0;
    const provider = createAuthCodeDeliveryProvider("webhook", {
      webhookUrl: "https://delivery.example.com/auth-code",
      webhookMaxAttempts: 3,
      webhookRetryDelayMs: 0,
      fetchImpl: async () => {
        attempts += 1;
        return new Response(null, { status: 400 });
      },
    });
    const service = new AuthService("test-secret", provider);

    await assert.rejects(
      () => service.requestCode("bad-delivery@example.com", "127.0.0.1"),
      /auth_code_delivery_failed/,
    );
    assert.equal(attempts, 1);
  });

  it("fails code requests when webhook delivery fails", async () => {
    const provider = createAuthCodeDeliveryProvider("webhook", {
      webhookUrl: "https://delivery.example.com/auth-code",
      webhookMaxAttempts: 1,
      fetchImpl: async () => new Response(null, { status: 503 }),
    });
    const service = new AuthService("test-secret", provider);

    await assert.rejects(
      () => service.requestCode("failed-delivery@example.com", "127.0.0.1"),
      /auth_code_delivery_failed/,
    );
  });
});

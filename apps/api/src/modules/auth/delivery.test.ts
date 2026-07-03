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
    const fetchImpl: typeof fetch = async (_url, init) => {
      authorization = new Headers(init?.headers).get("authorization") ?? "";
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
    assert.match(deliveredCode, /^\d{6}$/);
    assert.deepEqual(
      {
        ...(deliveredBody as Record<string, unknown>),
        code: "<redacted>",
        expiresAt: "<redacted>",
      },
      {
        type: "auth_code",
        identifier: "webhook@example.com",
        deliveryHint: "we***@example.com",
        code: "<redacted>",
        expiresAt: "<redacted>",
      },
    );

    await service.verifyCode(challenge.challengeId, deliveredCode);
  });

  it("fails code requests when webhook delivery fails", async () => {
    const provider = createAuthCodeDeliveryProvider("webhook", {
      webhookUrl: "https://delivery.example.com/auth-code",
      fetchImpl: async () => new Response(null, { status: 503 }),
    });
    const service = new AuthService("test-secret", provider);

    await assert.rejects(
      () => service.requestCode("failed-delivery@example.com", "127.0.0.1"),
      /auth_code_delivery_failed/,
    );
  });
});

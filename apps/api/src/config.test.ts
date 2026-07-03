import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { loadConfig } from "./config.js";

describe("API config", () => {
  it("defaults auth code delivery to local outside production", () => {
    const config = loadConfig({
      NODE_ENV: "test",
      SHOW_DEV_AUTH_CODE: "true",
    });

    assert.equal(config.persistenceMode, "memory");
    assert.equal(config.authCodeDeliveryProvider, "local");
    assert.equal(config.showDevAuthCode, true);
  });

  it("rejects exposed development auth codes in production", () => {
    assert.throws(
      () =>
        loadConfig({
          NODE_ENV: "production",
          PERSISTENCE_MODE: "postgres",
          DATABASE_URL: "postgres://postgres:postgres@127.0.0.1:5432/prima_wash",
          AUTH_SESSION_SECRET: "production-auth-secret-with-enough-length",
          AUTH_CODE_DELIVERY_PROVIDER: "webhook",
          AUTH_CODE_DELIVERY_WEBHOOK_URL: "https://delivery.example.com/auth-code",
          SHOW_DEV_AUTH_CODE: "true",
        }),
      /SHOW_DEV_AUTH_CODE must be disabled in production/,
    );
  });

  it("rejects local auth code delivery in production", () => {
    assert.throws(
      () =>
        loadConfig({
          NODE_ENV: "production",
          PERSISTENCE_MODE: "postgres",
          DATABASE_URL: "postgres://postgres:postgres@127.0.0.1:5432/prima_wash",
          AUTH_SESSION_SECRET: "production-auth-secret-with-enough-length",
          AUTH_CODE_DELIVERY_PROVIDER: "local",
        }),
      /AUTH_CODE_DELIVERY_PROVIDER must not be 'local' in production/,
    );
  });

  it("accepts webhook auth code delivery in production", () => {
    const config = loadConfig({
      NODE_ENV: "production",
      PERSISTENCE_MODE: "postgres",
      DATABASE_URL: "postgres://postgres:postgres@127.0.0.1:5432/prima_wash",
      AUTH_SESSION_SECRET: "production-auth-secret-with-enough-length",
      AUTH_CODE_DELIVERY_PROVIDER: "webhook",
      AUTH_CODE_DELIVERY_WEBHOOK_URL: "https://delivery.example.com/auth-code",
      AUTH_CODE_DELIVERY_WEBHOOK_SECRET: "delivery-secret",
    });

    assert.equal(config.authCodeDeliveryProvider, "webhook");
    assert.equal(config.authCodeDeliveryWebhookUrl, "https://delivery.example.com/auth-code");
    assert.equal(config.authCodeDeliveryWebhookSecret, "delivery-secret");
    assert.equal(config.showDevAuthCode, false);
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadConfig } from "./config.js";

describe("delivery relay config", () => {
  it("parses staging delivery relay settings", () => {
    const config = loadConfig({
      NODE_ENV: "test",
      PORT: "3099",
      PRIMA_DELIVERY_WEBHOOK_SECRET: "relay-secret",
      SMTP_HOST: "smtp.example.com",
      SMTP_PORT: "465",
      SMTP_SECURE: "true",
      SMTP_USER: "smtp-user",
      SMTP_PASSWORD: "smtp-password",
      SMTP_FROM: "Prima Wash <support@primawash.com>",
      SMTP_TIMEOUT_MS: "8000",
      SMS_WEBHOOK_URL: "https://sms.example.com/send",
      SMS_WEBHOOK_SECRET: "sms-secret",
    });

    assert.equal(config.port, 3099);
    assert.equal(config.webhookSecret, "relay-secret");
    assert.equal(config.smtpHost, "smtp.example.com");
    assert.equal(config.smtpPort, 465);
    assert.equal(config.smtpSecure, true);
    assert.equal(config.smtpUser, "smtp-user");
    assert.equal(config.smtpPassword, "smtp-password");
    assert.equal(config.smtpFrom, "Prima Wash <support@primawash.com>");
    assert.equal(config.smtpTimeoutMs, 8000);
    assert.equal(config.smsWebhookUrl, "https://sms.example.com/send");
    assert.equal(config.smsWebhookSecret, "sms-secret");
  });

  it("requires relay secret and SMTP settings in production", () => {
    assert.throws(
      () =>
        loadConfig({
          NODE_ENV: "production",
          SMTP_HOST: "smtp.example.com",
          SMTP_FROM: "Prima Wash <support@primawash.com>",
        }),
      /PRIMA_DELIVERY_WEBHOOK_SECRET is required in production/,
    );

    assert.throws(
      () =>
        loadConfig({
          NODE_ENV: "production",
          PRIMA_DELIVERY_WEBHOOK_SECRET: "relay-secret",
          SMTP_FROM: "Prima Wash <support@primawash.com>",
        }),
      /SMTP_HOST is required in production/,
    );

    assert.throws(
      () =>
        loadConfig({
          NODE_ENV: "production",
          PRIMA_DELIVERY_WEBHOOK_SECRET: "relay-secret",
          SMTP_HOST: "smtp.example.com",
        }),
      /SMTP_FROM is required in production/,
    );
  });
});

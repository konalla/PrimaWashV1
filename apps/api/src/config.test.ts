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
    assert.equal(config.paymentProvider, "local");
    assert.equal(config.showDevAuthCode, true);
    assert.ok(config.corsAllowedOrigins.includes("http://127.0.0.1:3020"));
    assert.ok(config.corsAllowedOrigins.includes("http://localhost:8082"));
  });

  it("parses explicit CORS origins", () => {
    const config = loadConfig({
      NODE_ENV: "test",
      CORS_ALLOWED_ORIGINS: "https://admin.primawash.com, https://app.primawash.com ",
    });

    assert.deepEqual(config.corsAllowedOrigins, ["https://admin.primawash.com", "https://app.primawash.com"]);
  });

  it("requires explicit CORS origins in production", () => {
    assert.throws(
      () =>
        loadConfig({
          NODE_ENV: "production",
          PERSISTENCE_MODE: "postgres",
          DATABASE_URL: "postgres://postgres:postgres@127.0.0.1:5432/prima_wash",
          AUTH_SESSION_SECRET: "production-auth-secret-with-enough-length",
          AUTH_CODE_DELIVERY_PROVIDER: "webhook",
          AUTH_CODE_DELIVERY_WEBHOOK_URL: "https://delivery.example.com/auth-code",
          PAYMENT_PROVIDER: "stripe",
          STRIPE_SECRET_KEY: "sk_test_config",
          STRIPE_WEBHOOK_SECRET: "whsec_config",
          EVIDENCE_STORAGE_PROVIDER: "s3",
          EVIDENCE_S3_ENDPOINT: "https://storage.example.com",
          EVIDENCE_S3_REGION: "ap-southeast-1",
          EVIDENCE_S3_BUCKET: "prima-wash-evidence",
          EVIDENCE_S3_ACCESS_KEY_ID: "evidence-key",
          EVIDENCE_S3_SECRET_ACCESS_KEY: "evidence-secret",
        }),
      /CORS_ALLOWED_ORIGINS is required in production/,
    );
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
          PAYMENT_PROVIDER: "stripe",
          STRIPE_SECRET_KEY: "sk_test_config",
          STRIPE_WEBHOOK_SECRET: "whsec_config",
          CORS_ALLOWED_ORIGINS: "https://admin.primawash.com",
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
          CORS_ALLOWED_ORIGINS: "https://admin.primawash.com",
        }),
      /AUTH_CODE_DELIVERY_PROVIDER must not be 'local' in production/,
    );
  });

  it("rejects local payments in production", () => {
    assert.throws(
      () =>
        loadConfig({
          NODE_ENV: "production",
          PERSISTENCE_MODE: "postgres",
          DATABASE_URL: "postgres://postgres:postgres@127.0.0.1:5432/prima_wash",
          AUTH_SESSION_SECRET: "production-auth-secret-with-enough-length",
          AUTH_CODE_DELIVERY_PROVIDER: "webhook",
          AUTH_CODE_DELIVERY_WEBHOOK_URL: "https://delivery.example.com/auth-code",
          PAYMENT_PROVIDER: "local",
          STRIPE_WEBHOOK_SECRET: "whsec_config",
          CORS_ALLOWED_ORIGINS: "https://admin.primawash.com",
        }),
      /PAYMENT_PROVIDER=stripe is required in production/,
    );
  });

  it("rejects Stripe payments without a Stripe secret key", () => {
    assert.throws(
      () =>
        loadConfig({
          NODE_ENV: "test",
          PAYMENT_PROVIDER: "stripe",
        }),
      /STRIPE_SECRET_KEY is required when PAYMENT_PROVIDER=stripe/,
    );
  });

  it("rejects production without a Stripe webhook secret", () => {
    assert.throws(
      () =>
        loadConfig({
          NODE_ENV: "production",
          PERSISTENCE_MODE: "postgres",
          DATABASE_URL: "postgres://postgres:postgres@127.0.0.1:5432/prima_wash",
          AUTH_SESSION_SECRET: "production-auth-secret-with-enough-length",
          AUTH_CODE_DELIVERY_PROVIDER: "webhook",
          AUTH_CODE_DELIVERY_WEBHOOK_URL: "https://delivery.example.com/auth-code",
          PAYMENT_PROVIDER: "stripe",
          STRIPE_SECRET_KEY: "sk_test_config",
          CORS_ALLOWED_ORIGINS: "https://admin.primawash.com",
        }),
      /STRIPE_WEBHOOK_SECRET is required in production/,
    );
  });

  it("rejects local evidence storage in production", () => {
    assert.throws(
      () =>
        loadConfig({
          NODE_ENV: "production",
          PERSISTENCE_MODE: "postgres",
          DATABASE_URL: "postgres://postgres:postgres@127.0.0.1:5432/prima_wash",
          AUTH_SESSION_SECRET: "production-auth-secret-with-enough-length",
          AUTH_CODE_DELIVERY_PROVIDER: "webhook",
          AUTH_CODE_DELIVERY_WEBHOOK_URL: "https://delivery.example.com/auth-code",
          PAYMENT_PROVIDER: "stripe",
          STRIPE_SECRET_KEY: "sk_test_config",
          STRIPE_WEBHOOK_SECRET: "whsec_config",
          CORS_ALLOWED_ORIGINS: "https://admin.primawash.com",
          EVIDENCE_STORAGE_PROVIDER: "local",
        }),
      /EVIDENCE_STORAGE_PROVIDER=s3 is required in production/,
    );
  });

  it("requires S3-compatible evidence storage settings when selected", () => {
    assert.throws(
      () =>
        loadConfig({
          NODE_ENV: "test",
          EVIDENCE_STORAGE_PROVIDER: "s3",
          EVIDENCE_S3_ENDPOINT: "https://storage.example.com",
        }),
      /EVIDENCE_S3_REGION, EVIDENCE_S3_BUCKET, EVIDENCE_S3_ACCESS_KEY_ID, EVIDENCE_S3_SECRET_ACCESS_KEY required when EVIDENCE_STORAGE_PROVIDER=s3/,
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
      AUTH_CODE_DELIVERY_WEBHOOK_TIMEOUT_MS: "7500",
      AUTH_CODE_DELIVERY_WEBHOOK_MAX_ATTEMPTS: "4",
      PAYMENT_PROVIDER: "stripe",
      STRIPE_SECRET_KEY: "sk_test_config",
      STRIPE_WEBHOOK_SECRET: "whsec_config",
      CORS_ALLOWED_ORIGINS: "https://admin.primawash.com,https://app.primawash.com",
      EVIDENCE_STORAGE_PROVIDER: "s3",
      EVIDENCE_S3_ENDPOINT: "https://storage.example.com",
      EVIDENCE_S3_REGION: "ap-southeast-1",
      EVIDENCE_S3_BUCKET: "prima-wash-evidence",
      EVIDENCE_S3_ACCESS_KEY_ID: "evidence-key",
      EVIDENCE_S3_SECRET_ACCESS_KEY: "evidence-secret",
      EVIDENCE_PUBLIC_BASE_URL: "https://evidence-cdn.example.com",
    });

    assert.equal(config.authCodeDeliveryProvider, "webhook");
    assert.equal(config.authCodeDeliveryWebhookUrl, "https://delivery.example.com/auth-code");
    assert.equal(config.authCodeDeliveryWebhookSecret, "delivery-secret");
    assert.equal(config.authCodeDeliveryWebhookTimeoutMs, 7500);
    assert.equal(config.authCodeDeliveryWebhookMaxAttempts, 4);
    assert.equal(config.paymentProvider, "stripe");
    assert.equal(config.stripeSecretKey, "sk_test_config");
    assert.equal(config.stripeWebhookSecret, "whsec_config");
    assert.equal(config.evidenceStorageProvider, "s3");
    assert.equal(config.evidenceS3Endpoint, "https://storage.example.com");
    assert.equal(config.evidenceS3Region, "ap-southeast-1");
    assert.equal(config.evidenceS3Bucket, "prima-wash-evidence");
    assert.equal(config.evidenceS3AccessKeyId, "evidence-key");
    assert.equal(config.evidenceS3SecretAccessKey, "evidence-secret");
    assert.equal(config.evidencePublicBaseUrl, "https://evidence-cdn.example.com");
    assert.equal(config.showDevAuthCode, false);
    assert.deepEqual(config.corsAllowedOrigins, ["https://admin.primawash.com", "https://app.primawash.com"]);
  });

  it("rejects invalid webhook auth delivery retry settings", () => {
    assert.throws(
      () =>
        loadConfig({
          NODE_ENV: "test",
          AUTH_CODE_DELIVERY_PROVIDER: "webhook",
          AUTH_CODE_DELIVERY_WEBHOOK_URL: "https://delivery.example.com/auth-code",
          AUTH_CODE_DELIVERY_WEBHOOK_TIMEOUT_MS: "0",
        }),
      /AUTH_CODE_DELIVERY_WEBHOOK_TIMEOUT_MS must be a positive integer/,
    );

    assert.throws(
      () =>
        loadConfig({
          NODE_ENV: "test",
          AUTH_CODE_DELIVERY_PROVIDER: "webhook",
          AUTH_CODE_DELIVERY_WEBHOOK_URL: "https://delivery.example.com/auth-code",
          AUTH_CODE_DELIVERY_WEBHOOK_MAX_ATTEMPTS: "-1",
        }),
      /AUTH_CODE_DELIVERY_WEBHOOK_MAX_ATTEMPTS must be a positive integer/,
    );
  });
});

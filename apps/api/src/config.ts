export type PersistenceMode = "memory" | "postgres";
export type PaymentProviderMode = "local" | "stripe";

export interface ApiConfig {
  readonly port: number;
  readonly persistenceMode: PersistenceMode;
  readonly databaseUrl?: string;
  readonly authSessionSecret: string;
  readonly authCodeDeliveryProvider: "local" | "webhook";
  readonly authCodeDeliveryWebhookUrl?: string;
  readonly authCodeDeliveryWebhookSecret?: string;
  readonly showDevAuthCode: boolean;
  readonly paymentProvider: PaymentProviderMode;
  readonly stripeSecretKey?: string;
  readonly stripeWebhookSecret?: string;
  readonly evidenceStorageDirectory: string;
  readonly evidencePublicBaseUrl?: string;
}

const localDatabaseUrl = "postgres://postgres:postgres@127.0.0.1:5432/prima_wash";

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): ApiConfig {
  if (environment.NODE_ENV === "production" && !environment.AUTH_SESSION_SECRET) {
    throw new Error("AUTH_SESSION_SECRET is required in production");
  }

  const persistenceMode = parsePersistenceMode(environment);
  const databaseUrl =
    environment.DATABASE_URL ?? (persistenceMode === "postgres" && environment.NODE_ENV !== "production" ? localDatabaseUrl : undefined);

  if (persistenceMode === "postgres" && !databaseUrl) {
    throw new Error("DATABASE_URL is required when PERSISTENCE_MODE=postgres");
  }

  if (environment.NODE_ENV === "production" && persistenceMode !== "postgres") {
    throw new Error("PERSISTENCE_MODE=postgres is required in production");
  }

  const authSessionSecret =
    environment.AUTH_SESSION_SECRET ?? "prima-wash-development-secret-change-before-production";

  if (environment.NODE_ENV === "production" && authSessionSecret.length < 32) {
    throw new Error("AUTH_SESSION_SECRET must contain at least 32 characters in production");
  }

  const authCodeDeliveryProvider = parseAuthCodeDeliveryProvider(environment);
  const showDevAuthCode = environment.SHOW_DEV_AUTH_CODE === "true";

  if (environment.NODE_ENV === "production" && showDevAuthCode) {
    throw new Error("SHOW_DEV_AUTH_CODE must be disabled in production");
  }

  if (environment.NODE_ENV === "production" && authCodeDeliveryProvider === "local") {
    throw new Error("AUTH_CODE_DELIVERY_PROVIDER must not be 'local' in production");
  }

  if (authCodeDeliveryProvider === "webhook" && !environment.AUTH_CODE_DELIVERY_WEBHOOK_URL) {
    throw new Error("AUTH_CODE_DELIVERY_WEBHOOK_URL is required when AUTH_CODE_DELIVERY_PROVIDER=webhook");
  }

  const paymentProvider = parsePaymentProviderMode(environment);

  if (environment.NODE_ENV === "production" && paymentProvider === "local") {
    throw new Error("PAYMENT_PROVIDER=stripe is required in production");
  }

  if (paymentProvider === "stripe" && !environment.STRIPE_SECRET_KEY) {
    throw new Error("STRIPE_SECRET_KEY is required when PAYMENT_PROVIDER=stripe");
  }

  if (environment.NODE_ENV === "production" && !environment.STRIPE_WEBHOOK_SECRET) {
    throw new Error("STRIPE_WEBHOOK_SECRET is required in production");
  }

  return {
    port: Number.parseInt(environment.PORT ?? "3001", 10),
    persistenceMode,
    authSessionSecret,
    authCodeDeliveryProvider,
    showDevAuthCode,
    ...(environment.AUTH_CODE_DELIVERY_WEBHOOK_URL
      ? { authCodeDeliveryWebhookUrl: environment.AUTH_CODE_DELIVERY_WEBHOOK_URL }
      : {}),
    ...(environment.AUTH_CODE_DELIVERY_WEBHOOK_SECRET
      ? { authCodeDeliveryWebhookSecret: environment.AUTH_CODE_DELIVERY_WEBHOOK_SECRET }
      : {}),
    paymentProvider,
    ...(environment.STRIPE_SECRET_KEY ? { stripeSecretKey: environment.STRIPE_SECRET_KEY } : {}),
    ...(environment.STRIPE_WEBHOOK_SECRET ? { stripeWebhookSecret: environment.STRIPE_WEBHOOK_SECRET } : {}),
    evidenceStorageDirectory: environment.EVIDENCE_STORAGE_DIRECTORY ?? "var/uploads",
    ...(environment.EVIDENCE_PUBLIC_BASE_URL ? { evidencePublicBaseUrl: environment.EVIDENCE_PUBLIC_BASE_URL } : {}),
    ...(databaseUrl ? { databaseUrl } : {}),
  };
}

function parsePersistenceMode(environment: NodeJS.ProcessEnv): PersistenceMode {
  const value = environment.PERSISTENCE_MODE ?? (environment.NODE_ENV === "test" ? "memory" : "postgres");

  if (value === "memory" || value === "postgres") {
    return value;
  }

  throw new Error("PERSISTENCE_MODE must be either 'memory' or 'postgres'");
}

function parseAuthCodeDeliveryProvider(environment: NodeJS.ProcessEnv): "local" | "webhook" {
  const value = environment.AUTH_CODE_DELIVERY_PROVIDER ?? "local";

  if (value === "local" || value === "webhook") {
    return value;
  }

  throw new Error("AUTH_CODE_DELIVERY_PROVIDER must be either 'local' or 'webhook'");
}

function parsePaymentProviderMode(environment: NodeJS.ProcessEnv): PaymentProviderMode {
  const value = environment.PAYMENT_PROVIDER ?? "local";

  if (value === "local" || value === "stripe") {
    return value;
  }

  throw new Error("PAYMENT_PROVIDER must be either 'local' or 'stripe'");
}

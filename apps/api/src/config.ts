export type PersistenceMode = "memory" | "postgres";

export interface ApiConfig {
  readonly port: number;
  readonly persistenceMode: PersistenceMode;
  readonly databaseUrl?: string;
  readonly authSessionSecret: string;
  readonly paymentProvider: string;
  readonly stripeSecretKey?: string;
  readonly stripeWebhookSecret?: string;
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

  return {
    port: Number.parseInt(environment.PORT ?? "3001", 10),
    persistenceMode,
    authSessionSecret,
    paymentProvider: environment.PAYMENT_PROVIDER ?? "local",
    ...(environment.STRIPE_SECRET_KEY ? { stripeSecretKey: environment.STRIPE_SECRET_KEY } : {}),
    ...(environment.STRIPE_WEBHOOK_SECRET ? { stripeWebhookSecret: environment.STRIPE_WEBHOOK_SECRET } : {}),
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

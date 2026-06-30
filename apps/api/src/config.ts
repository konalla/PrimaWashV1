export interface ApiConfig {
  readonly port: number;
  readonly databaseUrl?: string;
  readonly authSessionSecret: string;
  readonly paymentProvider: string;
}

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): ApiConfig {
  if (environment.NODE_ENV === "production" && !environment.AUTH_SESSION_SECRET) {
    throw new Error("AUTH_SESSION_SECRET is required in production");
  }

  const authSessionSecret =
    environment.AUTH_SESSION_SECRET ?? "prima-wash-development-secret-change-before-production";

  if (environment.NODE_ENV === "production" && authSessionSecret.length < 32) {
    throw new Error("AUTH_SESSION_SECRET must contain at least 32 characters in production");
  }

  return {
    port: Number.parseInt(environment.PORT ?? "3001", 10),
    authSessionSecret,
    paymentProvider: environment.PAYMENT_PROVIDER ?? "local",
    ...(environment.DATABASE_URL ? { databaseUrl: environment.DATABASE_URL } : {}),
  };
}

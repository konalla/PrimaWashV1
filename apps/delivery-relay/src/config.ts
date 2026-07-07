export interface DeliveryRelayConfig {
  readonly port: number;
  readonly webhookSecret?: string;
  readonly smtpHost?: string;
  readonly smtpPort: number;
  readonly smtpSecure: boolean;
  readonly smtpUser?: string;
  readonly smtpPassword?: string;
  readonly smtpFrom?: string;
  readonly smtpTimeoutMs: number;
  readonly smsWebhookUrl?: string;
  readonly smsWebhookSecret?: string;
}

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): DeliveryRelayConfig {
  const isProduction = environment.NODE_ENV === "production";
  const webhookSecret = environment.PRIMA_DELIVERY_WEBHOOK_SECRET;
  const smtpHost = environment.SMTP_HOST;
  const smtpFrom = environment.SMTP_FROM;

  if (isProduction && !webhookSecret) {
    throw new Error("PRIMA_DELIVERY_WEBHOOK_SECRET is required in production");
  }

  if (isProduction && !smtpHost) {
    throw new Error("SMTP_HOST is required in production");
  }

  if (isProduction && !smtpFrom) {
    throw new Error("SMTP_FROM is required in production");
  }

  return {
    port: parsePositiveInteger(environment.PORT, 3025, "PORT"),
    ...(webhookSecret ? { webhookSecret } : {}),
    ...(smtpHost ? { smtpHost } : {}),
    smtpPort: parsePositiveInteger(environment.SMTP_PORT, 587, "SMTP_PORT"),
    smtpSecure: environment.SMTP_SECURE === "true",
    ...(environment.SMTP_USER ? { smtpUser: environment.SMTP_USER } : {}),
    ...(environment.SMTP_PASSWORD ? { smtpPassword: environment.SMTP_PASSWORD } : {}),
    ...(smtpFrom ? { smtpFrom } : {}),
    smtpTimeoutMs: parsePositiveInteger(environment.SMTP_TIMEOUT_MS, 10_000, "SMTP_TIMEOUT_MS"),
    ...(environment.SMS_WEBHOOK_URL ? { smsWebhookUrl: environment.SMS_WEBHOOK_URL } : {}),
    ...(environment.SMS_WEBHOOK_SECRET ? { smsWebhookSecret: environment.SMS_WEBHOOK_SECRET } : {}),
  };
}

function parsePositiveInteger(value: string | undefined, fallback: number, name: string): number {
  if (value === undefined || value.trim() === "") {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }

  return parsed;
}

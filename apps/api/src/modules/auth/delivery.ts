import { randomInt, randomUUID } from "node:crypto";

export type AuthCodeDeliveryProviderName = "local" | "webhook";

export interface DeliverAuthCodeInput {
  readonly identifier: string;
  readonly deliveryHint: string;
  readonly expiresAt: string;
  readonly purpose?: "auth_code" | "access_invitation";
}

export interface DeliverAuthCodeResult {
  readonly code: string;
  readonly devCode?: string;
}

export interface AuthCodeDeliveryProvider {
  deliver(input: DeliverAuthCodeInput): Promise<DeliverAuthCodeResult>;
}

export interface CreateAuthCodeDeliveryProviderOptions {
  readonly developmentCode?: string;
  readonly exposeDevelopmentCode?: boolean;
  readonly webhookUrl?: string;
  readonly webhookSecret?: string;
  readonly webhookTimeoutMs?: number;
  readonly webhookMaxAttempts?: number;
  readonly webhookRetryDelayMs?: number;
  readonly fetchImpl?: typeof fetch;
}

export function createAuthCodeDeliveryProvider(
  name: AuthCodeDeliveryProviderName = "local",
  options: CreateAuthCodeDeliveryProviderOptions = {},
): AuthCodeDeliveryProvider {
  if (name === "local") {
    return new LocalAuthCodeDeliveryProvider(options.developmentCode ?? "123456", options.exposeDevelopmentCode ?? false);
  }

  if (name === "webhook") {
    if (!options.webhookUrl) {
      throw new Error("AUTH_CODE_DELIVERY_WEBHOOK_URL is required when AUTH_CODE_DELIVERY_PROVIDER=webhook");
    }

    return new WebhookAuthCodeDeliveryProvider(options.webhookUrl, {
      ...(options.webhookSecret ? { webhookSecret: options.webhookSecret } : {}),
      ...(options.webhookTimeoutMs ? { timeoutMs: options.webhookTimeoutMs } : {}),
      ...(options.webhookMaxAttempts ? { maxAttempts: options.webhookMaxAttempts } : {}),
      ...(options.webhookRetryDelayMs !== undefined ? { retryDelayMs: options.webhookRetryDelayMs } : {}),
      ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
    });
  }

  throw new Error("AUTH_CODE_DELIVERY_PROVIDER must be either 'local' or 'webhook'");
}

class LocalAuthCodeDeliveryProvider implements AuthCodeDeliveryProvider {
  constructor(
    private readonly developmentCode: string,
    private readonly exposeDevelopmentCode: boolean,
  ) {}

  async deliver(): Promise<DeliverAuthCodeResult> {
    return {
      code: this.developmentCode,
      ...(this.exposeDevelopmentCode ? { devCode: this.developmentCode } : {}),
    };
  }
}

class WebhookAuthCodeDeliveryProvider implements AuthCodeDeliveryProvider {
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly maxAttempts: number;
  private readonly retryDelayMs: number;

  constructor(
    private readonly webhookUrl: string,
    private readonly options: {
      readonly webhookSecret?: string;
      readonly timeoutMs?: number;
      readonly maxAttempts?: number;
      readonly retryDelayMs?: number;
      readonly fetchImpl?: typeof fetch;
    } = {},
  ) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = clampPositiveInteger(options.timeoutMs, 5_000);
    this.maxAttempts = clampPositiveInteger(options.maxAttempts, 3);
    this.retryDelayMs = Math.max(0, options.retryDelayMs ?? 250);
  }

  async deliver(input: DeliverAuthCodeInput): Promise<DeliverAuthCodeResult> {
    const code = generateVerificationCode();
    const deliveryId = randomUUID();
    const body = JSON.stringify({
      type: input.purpose ?? "auth_code",
      deliveryId,
      channel: deliveryChannel(input.identifier),
      identifier: input.identifier,
      deliveryHint: input.deliveryHint,
      code,
      expiresAt: input.expiresAt,
    });

    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      try {
        const response = await this.postDelivery(body, deliveryId, attempt);

        if (response.ok) {
          return { code };
        }

        if (!isRetryableDeliveryStatus(response.status)) {
          throw new PermanentDeliveryError();
        }

        if (attempt === this.maxAttempts) {
          throw new Error("auth_code_delivery_failed");
        }
      } catch (error) {
        if (error instanceof PermanentDeliveryError) {
          throw new Error("auth_code_delivery_failed");
        }

        if (attempt === this.maxAttempts) {
          throw new Error("auth_code_delivery_failed");
        }
      }

      await sleep(this.retryDelayMs * attempt);
    }

    throw new Error("auth_code_delivery_failed");
  }

  private async postDelivery(body: string, deliveryId: string, attempt: number): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      return await this.fetchImpl(this.webhookUrl, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "content-type": "application/json",
          "x-prima-wash-delivery-id": deliveryId,
          "x-prima-wash-delivery-attempt": String(attempt),
          ...(this.options.webhookSecret ? { authorization: `Bearer ${this.options.webhookSecret}` } : {}),
        },
        body,
      });
    } finally {
      clearTimeout(timeout);
    }
  }
}

function generateVerificationCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

function deliveryChannel(identifier: string): "email" | "sms" {
  return identifier.includes("@") ? "email" : "sms";
}

function isRetryableDeliveryStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

function clampPositiveInteger(value: number | undefined, fallback: number): number {
  if (value === undefined) {
    return fallback;
  }

  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

class PermanentDeliveryError extends Error {}

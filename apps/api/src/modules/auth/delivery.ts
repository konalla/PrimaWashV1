import { randomInt } from "node:crypto";

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

  constructor(
    private readonly webhookUrl: string,
    private readonly options: { readonly webhookSecret?: string; readonly fetchImpl?: typeof fetch } = {},
  ) {
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async deliver(input: DeliverAuthCodeInput): Promise<DeliverAuthCodeResult> {
    const code = generateVerificationCode();
    const response = await this.fetchImpl(this.webhookUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(this.options.webhookSecret ? { authorization: `Bearer ${this.options.webhookSecret}` } : {}),
      },
      body: JSON.stringify({
        type: input.purpose ?? "auth_code",
        identifier: input.identifier,
        deliveryHint: input.deliveryHint,
        code,
        expiresAt: input.expiresAt,
      }),
    });

    if (!response.ok) {
      throw new Error("auth_code_delivery_failed");
    }

    return { code };
  }
}

function generateVerificationCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

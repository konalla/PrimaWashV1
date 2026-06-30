import type { Booking, PaymentIntent } from "@prima-wash/contracts";

export type PaymentProviderOperation = "create" | "authorize" | "capture" | "refund" | "void";

export interface PaymentProviderResult {
  readonly provider: string;
  readonly operation: PaymentProviderOperation;
  readonly providerReference: string;
  readonly status: "succeeded";
  readonly processedAt: string;
  readonly clientSecret?: string;
}

export interface PaymentProvider {
  createIntent(booking: Booking): Promise<PaymentProviderResult>;
  authorize(payment: PaymentIntent): Promise<PaymentProviderResult>;
  capture(payment: PaymentIntent): Promise<PaymentProviderResult>;
  refund(payment: PaymentIntent): Promise<PaymentProviderResult>;
  void(payment: PaymentIntent): Promise<PaymentProviderResult>;
}

export class LocalPaymentProvider implements PaymentProvider {
  readonly #provider = "local";

  createIntent(booking: Booking): Promise<PaymentProviderResult> {
    return Promise.resolve({
      provider: this.#provider,
      operation: "create",
      providerReference: `local_intent_${booking.id}`,
      status: "succeeded",
      processedAt: new Date().toISOString(),
      clientSecret: `local_secret_${booking.id}`,
    });
  }

  authorize(payment: PaymentIntent): Promise<PaymentProviderResult> {
    return Promise.resolve(this.#result("authorize", payment));
  }

  capture(payment: PaymentIntent): Promise<PaymentProviderResult> {
    return Promise.resolve(this.#result("capture", payment));
  }

  refund(payment: PaymentIntent): Promise<PaymentProviderResult> {
    return Promise.resolve(this.#result("refund", payment));
  }

  void(payment: PaymentIntent): Promise<PaymentProviderResult> {
    return Promise.resolve(this.#result("void", payment));
  }

  #result(operation: PaymentProviderOperation, payment: PaymentIntent): PaymentProviderResult {
    return {
      provider: this.#provider,
      operation,
      providerReference: `${this.#provider}_${operation}_${payment.id}`,
      status: "succeeded",
      processedAt: new Date().toISOString(),
    };
  }
}

export class StripePaymentProvider implements PaymentProvider {
  readonly #apiBaseUrl = "https://api.stripe.com/v1";

  constructor(private readonly secretKey: string) {
    if (!secretKey) {
      throw new Error("STRIPE_SECRET_KEY is required when PAYMENT_PROVIDER=stripe");
    }
  }

  async createIntent(booking: Booking): Promise<PaymentProviderResult> {
    const payload = await this.#request<StripePaymentIntent>("payment_intents", {
      amount: String(booking.acceptedPrice.amountMinor),
      currency: booking.acceptedPrice.currency.toLowerCase(),
      capture_method: "manual",
      "automatic_payment_methods[enabled]": "true",
      "metadata[booking_id]": booking.id,
      "metadata[owner_id]": booking.ownerId,
      "metadata[vehicle_id]": booking.vehicleId,
      "metadata[service_code]": booking.serviceCode,
    });

    return this.#result("create", payload, payload.client_secret);
  }

  async authorize(payment: PaymentIntent): Promise<PaymentProviderResult> {
    const payload = await this.#retrievePaymentIntent(payment);

    if (!["requires_capture", "succeeded"].includes(payload.status)) {
      throw new Error("payment_authorization_incomplete");
    }

    return this.#result("authorize", payload, payload.client_secret);
  }

  async capture(payment: PaymentIntent): Promise<PaymentProviderResult> {
    const payload = await this.#request<StripePaymentIntent>(
      `payment_intents/${encodeURIComponent(this.#providerReference(payment))}/capture`,
    );
    return this.#result("capture", payload, payload.client_secret);
  }

  async refund(payment: PaymentIntent): Promise<PaymentProviderResult> {
    const payload = await this.#request<StripeRefund>("refunds", {
      payment_intent: this.#providerReference(payment),
    });

    return {
      provider: "stripe",
      operation: "refund",
      providerReference: payload.id,
      status: "succeeded",
      processedAt: new Date().toISOString(),
    };
  }

  async void(payment: PaymentIntent): Promise<PaymentProviderResult> {
    const payload = await this.#request<StripePaymentIntent>(
      `payment_intents/${encodeURIComponent(this.#providerReference(payment))}/cancel`,
    );
    return this.#result("void", payload, payload.client_secret);
  }

  async #retrievePaymentIntent(payment: PaymentIntent): Promise<StripePaymentIntent> {
    const response = await fetch(`${this.#apiBaseUrl}/payment_intents/${encodeURIComponent(this.#providerReference(payment))}`, {
      headers: this.#headers(),
    });

    return this.#readResponse<StripePaymentIntent>(response);
  }

  async #request<T>(path: string, body?: Record<string, string>): Promise<T> {
    const response = await fetch(`${this.#apiBaseUrl}/${path}`, {
      method: "POST",
      headers: this.#headers(),
      body: new URLSearchParams(body),
    });

    return this.#readResponse<T>(response);
  }

  async #readResponse<T>(response: Response): Promise<T> {
    const payload = await response.json() as T & { readonly error?: { readonly message?: string } };

    if (!response.ok) {
      throw new Error(payload.error?.message ?? "stripe_request_failed");
    }

    return payload;
  }

  #headers(): Record<string, string> {
    return {
      authorization: `Bearer ${this.secretKey}`,
      "content-type": "application/x-www-form-urlencoded",
    };
  }

  #providerReference(payment: PaymentIntent): string {
    if (!payment.providerReference) {
      throw new Error("payment_provider_reference_missing");
    }

    return payment.providerReference;
  }

  #result(operation: PaymentProviderOperation, payload: StripePaymentIntent, clientSecret?: string): PaymentProviderResult {
    return {
      provider: "stripe",
      operation,
      providerReference: payload.id,
      status: "succeeded",
      processedAt: new Date().toISOString(),
      ...(clientSecret ? { clientSecret } : {}),
    };
  }
}

interface StripePaymentIntent {
  readonly id: string;
  readonly status: string;
  readonly client_secret?: string;
}

interface StripeRefund {
  readonly id: string;
}

export function createPaymentProvider(providerName = "local", input?: { readonly stripeSecretKey?: string }): PaymentProvider {
  if (providerName === "local") {
    return new LocalPaymentProvider();
  }

  if (providerName === "stripe") {
    return new StripePaymentProvider(input?.stripeSecretKey ?? process.env.STRIPE_SECRET_KEY ?? "");
  }

  throw new Error(`Unsupported payment provider: ${providerName}`);
}

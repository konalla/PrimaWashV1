import type { Booking, CustomerProfile, PaymentIntent, PaymentMethodSummary } from "@prima-wash/contracts";

export type PaymentProviderOperation =
  | "create"
  | "authorize"
  | "capture"
  | "refund"
  | "void"
  | "customer"
  | "ephemeral_key"
  | "setup_intent"
  | "list_payment_methods";

export interface PaymentProviderResult {
  readonly provider: string;
  readonly operation: PaymentProviderOperation;
  readonly providerReference: string;
  readonly status: "succeeded";
  readonly processedAt: string;
  readonly clientSecret?: string;
}

export interface PaymentCustomer {
  readonly provider: string;
  readonly providerCustomerId: string;
}

export interface PaymentEphemeralKey {
  readonly provider: string;
  readonly providerCustomerId: string;
  readonly ephemeralKeySecret: string;
}

export interface PaymentSetupIntent {
  readonly provider: string;
  readonly providerReference: string;
  readonly clientSecret: string;
}

export interface PaymentProvider {
  ensureCustomer(profile: CustomerProfile): Promise<PaymentCustomer>;
  createEphemeralKey(customer: PaymentCustomer): Promise<PaymentEphemeralKey>;
  createSetupIntent(customer: PaymentCustomer): Promise<PaymentSetupIntent>;
  listPaymentMethods(customer: PaymentCustomer): Promise<readonly PaymentMethodSummary[]>;
  createIntent(booking: Booking, customer?: PaymentCustomer): Promise<PaymentProviderResult>;
  authorize(payment: PaymentIntent): Promise<PaymentProviderResult>;
  capture(payment: PaymentIntent): Promise<PaymentProviderResult>;
  refund(payment: PaymentIntent): Promise<PaymentProviderResult>;
  void(payment: PaymentIntent): Promise<PaymentProviderResult>;
}

export class LocalPaymentProvider implements PaymentProvider {
  readonly #provider = "local";

  ensureCustomer(profile: CustomerProfile): Promise<PaymentCustomer> {
    return Promise.resolve({
      provider: this.#provider,
      providerCustomerId: `local_customer_${profile.userId}`,
    });
  }

  createEphemeralKey(customer: PaymentCustomer): Promise<PaymentEphemeralKey> {
    return Promise.resolve({
      provider: this.#provider,
      providerCustomerId: customer.providerCustomerId,
      ephemeralKeySecret: `local_ephemeral_key_${customer.providerCustomerId}`,
    });
  }

  createSetupIntent(customer: PaymentCustomer): Promise<PaymentSetupIntent> {
    return Promise.resolve({
      provider: this.#provider,
      providerReference: `local_setup_${customer.providerCustomerId}`,
      clientSecret: `local_setup_secret_${customer.providerCustomerId}`,
    });
  }

  listPaymentMethods(customer: PaymentCustomer): Promise<readonly PaymentMethodSummary[]> {
    return Promise.resolve([
      {
        id: `local_pm_${customer.providerCustomerId}`,
        provider: this.#provider,
        brand: "Visa",
        last4: "4242",
        expMonth: 12,
        expYear: 2029,
        isDefault: true,
      },
    ]);
  }

  createIntent(booking: Booking, customer?: PaymentCustomer): Promise<PaymentProviderResult> {
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
  readonly #apiVersion = "2024-06-20";

  constructor(private readonly secretKey: string) {
    if (!secretKey) {
      throw new Error("STRIPE_SECRET_KEY is required when PAYMENT_PROVIDER=stripe");
    }
  }

  async ensureCustomer(profile: CustomerProfile): Promise<PaymentCustomer> {
    if (profile.billingProfile?.provider === "stripe") {
      return {
        provider: "stripe",
        providerCustomerId: profile.billingProfile.providerCustomerId,
      };
    }

    const payload = await this.#request<StripeCustomer>("customers", {
      name: profile.displayName,
      "metadata[user_id]": profile.userId,
      "metadata[identifier]": profile.identifier,
      ...(profile.email ? { email: profile.email } : {}),
      ...(profile.phoneNumber ? { phone: profile.phoneNumber } : {}),
    });

    return {
      provider: "stripe",
      providerCustomerId: payload.id,
    };
  }

  async createEphemeralKey(customer: PaymentCustomer): Promise<PaymentEphemeralKey> {
    const payload = await this.#request<StripeEphemeralKey>(
      "ephemeral_keys",
      {
        customer: customer.providerCustomerId,
      },
      {
        "stripe-version": this.#apiVersion,
      },
    );

    return {
      provider: "stripe",
      providerCustomerId: customer.providerCustomerId,
      ephemeralKeySecret: payload.secret,
    };
  }

  async createSetupIntent(customer: PaymentCustomer): Promise<PaymentSetupIntent> {
    const payload = await this.#request<StripeSetupIntent>("setup_intents", {
      customer: customer.providerCustomerId,
      "automatic_payment_methods[enabled]": "true",
      "metadata[purpose]": "save_prima_wash_payment_method",
    });

    return {
      provider: "stripe",
      providerReference: payload.id,
      clientSecret: payload.client_secret,
    };
  }

  async listPaymentMethods(customer: PaymentCustomer): Promise<readonly PaymentMethodSummary[]> {
    const payload = await this.#get<StripePaymentMethodList>("payment_methods", {
      customer: customer.providerCustomerId,
      type: "card",
    });

    return payload.data.map((method, index) => ({
      id: method.id,
      provider: "stripe",
      brand: method.card.brand,
      last4: method.card.last4,
      expMonth: method.card.exp_month,
      expYear: method.card.exp_year,
      isDefault: index === 0,
    }));
  }

  async createIntent(booking: Booking, customer?: PaymentCustomer): Promise<PaymentProviderResult> {
    const payload = await this.#request<StripePaymentIntent>("payment_intents", {
      amount: String(booking.acceptedPrice.amountMinor),
      currency: booking.acceptedPrice.currency.toLowerCase(),
      capture_method: "manual",
      "automatic_payment_methods[enabled]": "true",
      setup_future_usage: "off_session",
      "metadata[booking_id]": booking.id,
      "metadata[owner_id]": booking.ownerId,
      "metadata[vehicle_id]": booking.vehicleId,
      "metadata[service_code]": booking.serviceCode,
      ...(customer ? { customer: customer.providerCustomerId } : {}),
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

  async #request<T>(path: string, body?: Record<string, string>, headers?: Record<string, string>): Promise<T> {
    const response = await fetch(`${this.#apiBaseUrl}/${path}`, {
      method: "POST",
      headers: {
        ...this.#headers(),
        ...headers,
      },
      body: new URLSearchParams(body),
    });

    return this.#readResponse<T>(response);
  }

  async #get<T>(path: string, query?: Record<string, string>): Promise<T> {
    const params = new URLSearchParams(query);
    const response = await fetch(`${this.#apiBaseUrl}/${path}${params.size ? `?${params}` : ""}`, {
      headers: this.#headers(),
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

interface StripeCustomer {
  readonly id: string;
}

interface StripeEphemeralKey {
  readonly id: string;
  readonly secret: string;
}

interface StripeSetupIntent {
  readonly id: string;
  readonly client_secret: string;
}

interface StripePaymentMethodList {
  readonly data: readonly StripePaymentMethod[];
}

interface StripePaymentMethod {
  readonly id: string;
  readonly card: {
    readonly brand: string;
    readonly last4: string;
    readonly exp_month: number;
    readonly exp_year: number;
  };
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

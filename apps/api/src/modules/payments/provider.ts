import type { PaymentIntent } from "@prima-wash/contracts";

export type PaymentProviderOperation = "authorize" | "capture" | "refund" | "void";

export interface PaymentProviderResult {
  readonly provider: string;
  readonly operation: PaymentProviderOperation;
  readonly providerReference: string;
  readonly status: "succeeded";
  readonly processedAt: string;
}

export interface PaymentProvider {
  authorize(payment: PaymentIntent): Promise<PaymentProviderResult>;
  capture(payment: PaymentIntent): Promise<PaymentProviderResult>;
  refund(payment: PaymentIntent): Promise<PaymentProviderResult>;
  void(payment: PaymentIntent): Promise<PaymentProviderResult>;
}

export class LocalPaymentProvider implements PaymentProvider {
  readonly #provider = "local";

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

export function createPaymentProvider(providerName = "local"): PaymentProvider {
  if (providerName === "local") {
    return new LocalPaymentProvider();
  }

  throw new Error(`Unsupported payment provider: ${providerName}`);
}

import type { PropsWithChildren } from 'react';

export function StripeProvider({ children }: PropsWithChildren<{ readonly publishableKey: string; readonly merchantIdentifier?: string }>) {
  return children;
}

export function useStripe() {
  return {
    initPaymentSheet: () =>
      Promise.resolve({
        error: {
          message: 'Stripe native checkout is not available in the browser preview. Use an iOS or Android build for Stripe PaymentSheet.',
        },
      }),
    presentPaymentSheet: () =>
      Promise.resolve({
        error: {
          message: 'Stripe native checkout is not available in the browser preview. Use an iOS or Android build for Stripe PaymentSheet.',
        },
      }),
  };
}

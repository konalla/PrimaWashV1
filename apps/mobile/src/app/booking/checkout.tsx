import type { Booking, PaymentIntent } from '@prima-wash/contracts';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppScreen } from '@/components/app-screen';
import { PrimaryButton, SectionHeading, StatusChip, Surface } from '@/components/prima-ui';
import { colors, spacing } from '@/constants/design';
import { useBooking } from '@/context/booking-context';
import { useNotifications } from '@/context/notification-context';
import { primaApi } from '@/lib/api';
import { formatAppointment, formatMoney, formatService } from '@/lib/format';
import { useStripe } from '@/lib/stripe';

export default function CheckoutScreen() {
  const params = useLocalSearchParams<{ bookingId?: string; paymentIntentId?: string }>();
  const bookingId = Array.isArray(params.bookingId) ? params.bookingId[0] : params.bookingId;
  const paymentIntentId = Array.isArray(params.paymentIntentId) ? params.paymentIntentId[0] : params.paymentIntentId;
  const { complete, draft } = useBooking();
  const { scheduleForBooking } = useNotifications();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const [booking, setBooking] = useState<Booking>();
  const [payment, setPayment] = useState<PaymentIntent>();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();

  const load = useCallback(async () => {
    if (!bookingId) {
      setError('Booking reference is missing.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(undefined);

    try {
      const nextBooking = await primaApi.booking(bookingId);
      const nextPayment =
        (paymentIntentId ? await primaApi.paymentForBooking(nextBooking.id) : undefined) ??
        await primaApi.createPaymentIntent({ bookingId: nextBooking.id });
      setBooking(nextBooking);
      setPayment(nextPayment);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Checkout could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [bookingId, paymentIntentId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function confirmPayment() {
    if (!booking || !payment) {
      return;
    }

    setSubmitting(true);
    setError(undefined);

    try {
      if (payment.status !== 'authorized') {
        if (payment.provider === 'stripe') {
          await confirmStripePayment(payment);
        }

        const authorizedPayment = await primaApi.authorizePayment(payment.id);
        await finishCheckout(booking, authorizedPayment);
      } else {
        await finishCheckout(booking, payment);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Payment could not be authorized.');
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmStripePayment(targetPayment: PaymentIntent) {
    if (!process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY) {
      throw new Error('Stripe publishable key is missing. Set EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY for this app build.');
    }

    if (!targetPayment.clientSecret) {
      throw new Error('Stripe client secret is missing for this payment intent.');
    }

    const billingSession = await primaApi.billingSession();

    const initResult = await initPaymentSheet({
      merchantDisplayName: 'Prima Wash',
      paymentIntentClientSecret: targetPayment.clientSecret,
      customerId: billingSession.providerCustomerId,
      customerEphemeralKeySecret: billingSession.ephemeralKeySecret,
      returnURL: 'primawash://stripe-redirect',
    });

    if (initResult.error) {
      throw new Error(initResult.error.message);
    }

    const paymentResult = await presentPaymentSheet();

    if (paymentResult.error) {
      throw new Error(paymentResult.error.message);
    }
  }

  async function finishCheckout(targetBooking: Booking, authorizedPayment: PaymentIntent) {
    await scheduleForBooking({
      booking: targetBooking,
      partnerName: draft.primaWashDay?.propertyName ?? draft.partner?.name ?? 'Prima Wash',
      serviceName: draft.service?.name ?? formatService(targetBooking.serviceCode),
    });
    complete(targetBooking, authorizedPayment);
    router.replace('/booking/confirmed');
  }

  return (
    <AppScreen eyebrow="Secure checkout" title="Authorize payment">
      {loading ? (
        <Surface>
          <Text style={styles.title}>Preparing checkout</Text>
          <Text style={styles.body}>Loading the latest booking and payment authorization state.</Text>
        </Surface>
      ) : null}

      {booking ? (
        <Surface accent>
          <View style={styles.row}>
            <Text style={styles.service}>{formatService(booking.serviceCode)}</Text>
            <StatusChip>{payment?.provider ?? 'local'}</StatusChip>
          </View>
          <Text style={styles.body}>{formatAppointment(booking.scheduledStartAt)}</Text>
          <Text style={styles.price}>{formatMoney(booking.acceptedPrice)}</Text>
          <Text style={styles.reference}>Reference {booking.id.slice(-8).toUpperCase()}</Text>
        </Surface>
      ) : null}

      <Surface>
        <SectionHeading eyebrow="Payment authorization" title={paymentTitle(payment)} />
        <Text style={styles.body}>{paymentBody(payment)}</Text>
        {payment?.providerReference ? <Text style={styles.reference}>Provider ref {payment.providerReference}</Text> : null}
      </Surface>

      <Surface>
        <SectionHeading eyebrow="Protection" title="Captured after completion" />
        <Text style={styles.body}>
          Prima Wash only captures payment when the service is completed. If the booking is cancelled before service starts,
          the authorization is released.
        </Text>
      </Surface>

      {error ? (
        <Surface>
          <Text style={styles.errorTitle}>Checkout needs attention</Text>
          <Text style={styles.body}>{error}</Text>
          <Pressable onPress={() => void load()}>
            <Text style={styles.link}>Reload checkout</Text>
          </Pressable>
        </Surface>
      ) : null}

      <PrimaryButton
        disabled={!booking || !payment}
        label={payment?.status === 'authorized' ? 'Continue' : payment?.provider === 'stripe' ? 'Pay securely with Stripe' : 'Authorize test payment'}
        loading={submitting}
        onPress={() => void confirmPayment()}
      />
    </AppScreen>
  );
}

function paymentTitle(payment?: PaymentIntent) {
  if (!payment) {
    return 'Payment intent pending';
  }

  if (payment.status === 'authorized') {
    return 'Payment already authorized';
  }

  return payment.provider === 'stripe' ? 'Stripe secure payment' : 'Local development payment';
}

function paymentBody(payment?: PaymentIntent) {
  if (!payment) {
    return 'Prima Wash is preparing a payment authorization for this booking.';
  }

  if (payment.status === 'authorized') {
    return 'This booking already has an authorized payment hold.';
  }

  if (payment.provider === 'stripe') {
    return 'Stripe will collect and authorize the payment method securely. Prima Wash does not store card details.';
  }

  return 'Local payment mode authorizes the booking without collecting a real card. Use Stripe mode for production checkout.';
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md },
  title: { color: colors.text, fontSize: 18, fontWeight: '900' },
  service: { flex: 1, color: colors.text, fontSize: 20, fontWeight: '900' },
  body: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  price: { color: colors.text, fontSize: 24, fontWeight: '900' },
  reference: { color: colors.subtle, fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  errorTitle: { color: colors.text, fontSize: 17, fontWeight: '900' },
  link: { color: colors.accent, fontSize: 13, fontWeight: '900', paddingVertical: spacing.sm },
});

import type { PaymentMethodSummary } from '@prima-wash/contracts';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { PrimaryButton, StatusChip, Surface } from '@/components/prima-ui';
import { SettingsScreen } from '@/components/settings-screen';
import { colors, spacing } from '@/constants/design';
import { primaApi } from '@/lib/api';
import { useStripe } from '@/lib/stripe';

export default function PaymentMethodsScreen() {
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const [methods, setMethods] = useState<readonly PaymentMethodSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string>();

  const load = useCallback(async () => {
    setLoading(true);
    setError(undefined);

    try {
      setMethods(await primaApi.paymentMethods());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Payment methods could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function addPaymentMethod() {
    setActionLoading(true);
    setError(undefined);

    try {
      if (!process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY) {
        throw new Error('Stripe publishable key is missing. Set EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY for this app build.');
      }

      const billingSession = await primaApi.billingSession();

      if (!billingSession.setupIntentClientSecret || !billingSession.ephemeralKeySecret) {
        throw new Error('Billing session is missing setup details.');
      }

      const initResult = await initPaymentSheet({
        merchantDisplayName: 'Prima Wash',
        setupIntentClientSecret: billingSession.setupIntentClientSecret,
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

      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Payment method could not be added.');
    } finally {
      setActionLoading(false);
    }
  }

  return (
    <SettingsScreen title="Payment methods">
      {loading ? (
        <Surface>
          <Text style={styles.title}>Loading payment methods</Text>
          <Text style={styles.body}>Refreshing your saved payment methods from the payment provider.</Text>
        </Surface>
      ) : null}

      {error ? (
        <Surface>
          <Text style={styles.title}>Payment methods need attention</Text>
          <Text style={styles.body}>{error}</Text>
          <Pressable onPress={() => void load()}>
            <Text style={styles.link}>Try again</Text>
          </Pressable>
        </Surface>
      ) : null}

      {!loading && methods.length === 0 ? (
        <Surface>
          <Text style={styles.title}>No saved payment method</Text>
          <Text style={styles.body}>Add a card once and Prima Wash can reuse it securely for future bookings.</Text>
        </Surface>
      ) : null}

      {methods.map((method) => (
        <Surface key={method.id} accent={method.isDefault}>
          <View style={styles.row}>
            <View style={styles.cardMark}>
              <Text style={styles.cardMarkText}>{method.brand.slice(0, 4).toUpperCase()}</Text>
            </View>
            <View style={styles.copy}>
              <Text style={styles.title}>•••• {method.last4}</Text>
              <Text style={styles.body}>Expires {String(method.expMonth).padStart(2, '0')}/{method.expYear}</Text>
            </View>
            {method.isDefault ? <StatusChip>Default</StatusChip> : null}
          </View>
        </Surface>
      ))}

      <Surface>
        <Text style={styles.title}>Protected checkout</Text>
        <Text style={styles.body}>
          Prima Wash stores payment methods with the provider only. We authorize when you book and capture after service completion.
        </Text>
      </Surface>

      <PrimaryButton label="Add payment method" loading={actionLoading} onPress={() => void addPaymentMethod()} />
    </SettingsScreen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  cardMark: { width: 52, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent },
  cardMarkText: { color: colors.white, fontSize: 11, fontWeight: '900' },
  copy: { flex: 1 },
  title: { color: colors.text, fontSize: 17, fontWeight: '800' },
  body: { color: colors.muted, fontSize: 13, lineHeight: 20, marginTop: 3 },
  link: { color: colors.accent, fontSize: 13, fontWeight: '900', paddingVertical: spacing.sm },
});

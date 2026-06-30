import type { PaymentHistoryItem } from '@prima-wash/contracts';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { StatusChip, Surface } from '@/components/prima-ui';
import { SettingsScreen } from '@/components/settings-screen';
import { colors, spacing } from '@/constants/design';
import { primaApi } from '@/lib/api';
import { formatAppointment, formatMoney, formatService } from '@/lib/format';

export default function PaymentHistoryScreen() {
  const [items, setItems] = useState<readonly PaymentHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  const load = useCallback(async () => {
    setLoading(true);
    setError(undefined);

    try {
      setItems(await primaApi.paymentHistory());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Payment history could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <SettingsScreen title="Payment history">
      {loading ? (
        <Surface>
          <Text style={styles.title}>Loading payment history</Text>
          <Text style={styles.body}>Refreshing authorization, charge, release, and refund records.</Text>
        </Surface>
      ) : null}

      {error ? (
        <Surface>
          <Text style={styles.title}>Payment history needs attention</Text>
          <Text style={styles.body}>{error}</Text>
          <Pressable onPress={() => void load()}>
            <Text style={styles.link}>Try again</Text>
          </Pressable>
        </Surface>
      ) : null}

      {!loading && items.length === 0 ? (
        <Surface>
          <Text style={styles.title}>No payment records yet</Text>
          <Text style={styles.body}>Completed checkout, releases, and refunds will appear here.</Text>
        </Surface>
      ) : null}

      {items.map((item) => (
        <Surface key={item.paymentIntentId}>
          <View style={styles.row}>
            <Text style={styles.title}>{formatService(item.serviceCode)}</Text>
            <StatusChip tone={paymentTone(item)}>{paymentLabel(item)}</StatusChip>
          </View>
          <Text style={styles.body}>{formatAppointment(item.scheduledStartAt)}</Text>
          <Text style={styles.amount}>{formatMoney(item.amount)}</Text>
          <Text style={styles.body}>{paymentBody(item)}</Text>
          <Text style={styles.reference}>Reference {item.bookingId.slice(-8).toUpperCase()}</Text>
        </Surface>
      ))}
    </SettingsScreen>
  );
}

function paymentLabel(item: PaymentHistoryItem) {
  const labels: Record<PaymentHistoryItem['status'], string> = {
    requires_authorization: 'Needs authorization',
    authorized: 'Authorized hold',
    captured: 'Charged',
    voided: 'Released',
    refunded: 'Refunded',
  };

  return labels[item.status];
}

function paymentBody(item: PaymentHistoryItem) {
  if (item.status === 'authorized') {
    return 'Payment is authorized and will be captured only after completion.';
  }

  if (item.status === 'captured') {
    return `Charged on ${formatAppointment(item.capturedAt ?? item.createdAt)}.`;
  }

  if (item.status === 'voided') {
    return `Authorization released on ${formatAppointment(item.voidedAt ?? item.createdAt)}.`;
  }

  if (item.status === 'refunded') {
    return `Refund issued on ${formatAppointment(item.refundedAt ?? item.createdAt)}.`;
  }

  return 'Checkout has not been authorized yet.';
}

function paymentTone(item: PaymentHistoryItem): 'success' | 'warning' | 'neutral' {
  if (item.status === 'requires_authorization') {
    return 'warning';
  }

  if (item.status === 'refunded' || item.status === 'voided') {
    return 'neutral';
  }

  return 'success';
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md },
  title: { flex: 1, color: colors.text, fontSize: 17, fontWeight: '900' },
  body: { color: colors.muted, fontSize: 13, lineHeight: 20 },
  amount: { color: colors.text, fontSize: 20, fontWeight: '900' },
  reference: { color: colors.subtle, fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  link: { color: colors.accent, fontSize: 13, fontWeight: '900', paddingVertical: spacing.sm },
});

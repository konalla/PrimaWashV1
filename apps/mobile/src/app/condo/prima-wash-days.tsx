import { router, useFocusEffect } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useCallback, useState } from 'react';
import type { CustomerProfile, PrimaWashDay } from '@prima-wash/contracts';

import { AppScreen } from '@/components/app-screen';
import { PrimaryButton, SectionHeading, StatusChip, Surface } from '@/components/prima-ui';
import { colors, radius, spacing } from '@/constants/design';
import { useBooking } from '@/context/booking-context';
import { formatAppointment, formatService } from '@/lib/format';
import { primaApi } from '@/lib/api';

export default function PrimaWashDaysScreen() {
  const { setPrimaWashDay } = useBooking();
  const [profile, setProfile] = useState<CustomerProfile>();
  const [days, setDays] = useState<readonly PrimaWashDay[]>([]);
  const propertyName = profile?.residentialProfile?.propertyName ?? 'Your condo';

  useFocusEffect(
    useCallback(() => {
      let active = true;

      async function loadDays() {
        const profile = await primaApi.profile();

        if (!active) {
          return;
        }

        setProfile(profile);
        const propertyId = profile.residentialProfile?.propertyId;

        if (!propertyId) {
          setDays([]);
          return;
        }

        const days = await primaApi.primaWashDays(propertyId);

        if (active) {
          setDays(days);
        }
      }

      void loadDays().catch(() => {
        if (active) {
          setDays([]);
        }
      });

      return () => {
        active = false;
      };
    }, []),
  );

  return (
    <AppScreen eyebrow="Condo care" title="Prima Wash Days">
      <Surface accent>
        <Text style={styles.cardEyebrow}>PROPERTY</Text>
        <Text style={styles.cardTitle}>{propertyName}</Text>
        <Text style={styles.body}>
          These are management-approved service windows configured for your condo. Nearby care remains available anytime.
        </Text>
      </Surface>

      <SectionHeading eyebrow="Upcoming" title="Service days" />

      {days.length > 0 ? (
        days.map((day) => (
          <Surface key={day.id}>
            <View style={styles.inlineHeader}>
              <Text style={styles.cardEyebrow}>{day.propertyName}</Text>
              <StatusChip>{day.status}</StatusChip>
            </View>
            <Text style={styles.cardTitle}>{formatAppointment(day.startsAt)}</Text>
            <Text style={styles.body}>{day.approvedServiceArea}</Text>
            <View style={styles.metaGrid}>
              <View style={styles.metaCell}>
                <Text style={styles.metaLabel}>Capacity</Text>
                <Text style={styles.metaValue}>{day.capacity} vehicles</Text>
              </View>
              <View style={styles.metaCell}>
                <Text style={styles.metaLabel}>Services</Text>
                <Text style={styles.metaValue}>{day.serviceCodes.map(formatService).join(', ')}</Text>
              </View>
            </View>
            {day.operatingNotes ? <Text style={styles.body}>{day.operatingNotes}</Text> : null}
            <PrimaryButton
              label="Choose this service day"
              onPress={() => {
                setPrimaWashDay(day);
                router.push('/booking/service' as never);
              }}
            />
          </Surface>
        ))
      ) : (
        <Surface>
          <Text style={styles.cardTitle}>No approved days yet.</Text>
          <Text style={styles.body}>
            Your condo interest is still useful. It helps Prima Wash coordinate with management while you continue with nearby care.
          </Text>
        </Surface>
      )}

      <View style={styles.actions}>
        <PrimaryButton label="Find trusted care nearby" onPress={() => router.push('/partners' as never)} />
        <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>
          <Text style={styles.secondaryLabel}>Back</Text>
        </Pressable>
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  cardEyebrow: { color: colors.accent, fontSize: 10, fontWeight: '800', letterSpacing: 1.1 },
  cardTitle: { color: colors.text, fontSize: 18, fontWeight: '800', marginTop: spacing.xs },
  body: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: spacing.xs },
  inlineHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md },
  metaGrid: { flexDirection: 'row', gap: spacing.md },
  metaCell: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md },
  metaLabel: { color: colors.muted, fontSize: 11, fontWeight: '700' },
  metaValue: { color: colors.text, fontSize: 13, fontWeight: '800', marginTop: spacing.xs },
  actions: { gap: spacing.md },
  secondaryButton: {
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  secondaryLabel: { color: colors.text, fontSize: 15, fontWeight: '800' },
  pressed: { opacity: 0.8, transform: [{ scale: 0.99 }] },
});

import { router, useFocusEffect } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useCallback, useState } from 'react';
import type { CustomerProfile, Vehicle } from '@prima-wash/contracts';

import { AppScreen } from '@/components/app-screen';
import { PrimaryButton, SectionHeading, StatusChip, Surface } from '@/components/prima-ui';
import { colors, radius, spacing } from '@/constants/design';
import { useBooking } from '@/context/booking-context';
import { useAuth } from '@/context/auth-context';
import { formatAppointment, formatService } from '@/lib/format';
import { primaApi } from '@/lib/api';

export default function HomeScreen() {
  const { latestBooking } = useBooking();
  const { session } = useAuth();
  const [profileName, setProfileName] = useState(session?.user.displayName ?? 'there');
  const [profile, setProfile] = useState<CustomerProfile>();
  const [vehicle, setVehicle] = useState<Vehicle>();

  useFocusEffect(
    useCallback(() => {
      Promise.all([primaApi.vehicles(), primaApi.profile()])
        .then(([vehicles, profile]) => {
          setVehicle(vehicles.find((item) => item.isPrimary) ?? vehicles[0]);
          setProfileName(profile.displayName);
          setProfile(profile);
        })
        .catch(() => setVehicle(undefined));
    }, []),
  );

  return (
    <AppScreen
      eyebrow="Thursday, 25 June"
      title={`Good morning, ${profileName}.`}
      trailing={
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{profileName.slice(0, 1).toUpperCase()}</Text>
        </View>
      }>
      {!profile?.residentialProfile ? (
        <Surface accent>
          <Text style={styles.cardEyebrow}>RESIDENTIAL SETUP</Text>
          <Text style={styles.cardTitle}>Tell us where you usually park.</Text>
          <Text style={styles.body}>Condo residents unlock Prima Wash Days. HDB and landed-property owners continue with trusted nearby care.</Text>
          <PrimaryButton label="Choose residence type" onPress={() => router.push('/profile/residence' as never)} />
        </Surface>
      ) : null}

      {profile?.residentialProfile ? (
        <Surface>
          <View style={styles.inlineHeader}>
            <Text style={styles.cardEyebrow}>SERVICE CONTEXT</Text>
            <StatusChip tone={profile.residentialProfile.residenceType === 'multi_unit_private' ? 'warning' : 'neutral'}>
              {profile.residentialProfile.localResidenceLabel}
            </StatusChip>
          </View>
          <Text style={styles.cardTitle}>
            {profile.residentialProfile.propertyName ?? profile.residentialProfile.serviceAreaLabel ?? 'Trusted care nearby'}
          </Text>
          <Text style={styles.body}>
            {profile.residentialProfile.residenceType === 'multi_unit_private'
              ? profile.residentialProfile.propertyActivationStatus === 'active'
                ? 'Book approved Prima Wash Days at your condo.'
                : 'Your condo interest is saved. You can still find trusted care nearby.'
              : 'Use the marketplace flow to compare verified partners and appointment times.'}
          </Text>
        </Surface>
      ) : null}

      <Surface accent>
        <View style={styles.vehicleTop}>
          <View>
            <Text style={styles.caption}>Primary vehicle</Text>
            <Text style={styles.vehicleName}>
              {vehicle ? `${vehicle.make ?? ''} ${vehicle.model ?? ''}`.trim() || 'Vehicle' : 'Add your first vehicle'}
            </Text>
            <Text style={styles.plate}>{vehicle?.plateNumber ?? 'GARAGE EMPTY'}</Text>
          </View>
          <View style={styles.vehicleMark}>
            <Text style={styles.vehicleMarkText}>{vehicle?.make?.slice(0, 1).toUpperCase() ?? '+'}</Text>
          </View>
        </View>
        <View style={styles.healthRow}>
          <Text style={styles.health}>{vehicle ? '● Care profile active' : 'Create a reusable vehicle profile'}</Text>
          <Text onPress={() => router.push('/(tabs)/garage')} style={styles.manage}>Manage</Text>
        </View>
      </Surface>

      {latestBooking ? (
        <Pressable onPress={() => router.push('/(tabs)/bookings')}>
          <Surface>
            <View style={styles.inlineHeader}>
              <Text style={styles.cardEyebrow}>UPCOMING CARE</Text>
              <StatusChip>{latestBooking.status.replaceAll('_', ' ')}</StatusChip>
            </View>
            <Text style={styles.cardTitle}>{formatService(latestBooking.serviceCode)}</Text>
            <Text style={styles.body}>{formatAppointment(latestBooking.scheduledStartAt)}</Text>
          </Surface>
        </Pressable>
      ) : null}

      <SectionHeading eyebrow="Trusted care" title="What would you like to do?" />
      <View style={styles.actionGrid}>
        <Pressable onPress={() => router.push('/partners')} style={({ pressed }) => [styles.actionCard, pressed && styles.pressed]}>
          <Text style={styles.actionIcon}>✦</Text>
          <Text style={styles.actionTitle}>Book vehicle care</Text>
          <Text style={styles.actionBody}>Compare trusted services and live times.</Text>
        </Pressable>
        <Pressable onPress={() => router.push('/(tabs)/bookings')} style={({ pressed }) => [styles.actionCard, pressed && styles.pressed]}>
          <Text style={styles.actionIcon}>◷</Text>
          <Text style={styles.actionTitle}>Track a booking</Text>
          <Text style={styles.actionBody}>Follow every stage from arrival to ready.</Text>
        </Pressable>
      </View>

      <Surface>
        <View style={styles.guaranteeRow}>
          <View style={styles.guaranteeIcon}>
            <Text style={styles.guaranteeIconText}>✓</Text>
          </View>
          <View style={styles.guaranteeCopy}>
            <Text style={styles.cardEyebrow}>PRIMA CARE GUARANTEE</Text>
            <Text style={styles.cardTitle}>Quality care. Protected payment.</Text>
            <Text style={styles.body}>Verified partners and support on every appointment.</Text>
          </View>
        </View>
      </Surface>

      <PrimaryButton
        label={profile?.residentialProfile?.residenceType === 'multi_unit_private' ? 'Find trusted care nearby for now' : 'Find trusted care nearby'}
        onPress={() => router.push('/partners')}
      />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  avatar: { width: 44, height: 44, borderRadius: 15, backgroundColor: colors.surfaceStrong, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.accent, fontSize: 17, fontWeight: '800' },
  vehicleTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  caption: { color: colors.muted, fontSize: 12 },
  vehicleName: { color: colors.text, fontSize: 28, fontWeight: '800', letterSpacing: -0.8, marginTop: spacing.xs },
  plate: { color: colors.muted, fontSize: 11, fontWeight: '800', letterSpacing: 1.5, marginTop: spacing.sm },
  vehicleMark: { width: 72, height: 72, borderRadius: radius.lg, backgroundColor: '#214735', alignItems: 'center', justifyContent: 'center' },
  vehicleMarkText: { color: colors.accent, fontSize: 22, fontWeight: '900' },
  healthRow: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md, flexDirection: 'row', justifyContent: 'space-between' },
  health: { color: colors.accent, fontSize: 12, fontWeight: '700' },
  manage: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  actionGrid: { flexDirection: 'row', gap: spacing.md },
  actionCard: { flex: 1, minHeight: 162, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.surface, padding: spacing.lg },
  actionIcon: { color: colors.accent, fontSize: 25, marginBottom: spacing.lg },
  actionTitle: { color: colors.text, fontSize: 16, fontWeight: '800', lineHeight: 21 },
  actionBody: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: spacing.sm },
  pressed: { opacity: 0.8, transform: [{ scale: 0.99 }] },
  guaranteeRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  guaranteeIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: '#3B321F', alignItems: 'center', justifyContent: 'center' },
  guaranteeIconText: { color: colors.warning, fontSize: 22, fontWeight: '900' },
  guaranteeCopy: { flex: 1 },
  cardEyebrow: { color: colors.accent, fontSize: 10, fontWeight: '800', letterSpacing: 1.1 },
  cardTitle: { color: colors.text, fontSize: 17, fontWeight: '800', marginTop: spacing.xs },
  body: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: spacing.xs },
  inlineHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});

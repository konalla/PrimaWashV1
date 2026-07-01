import type { BookingOnsiteServiceMode, PartnerLocation } from '@prima-wash/contracts';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppScreen } from '@/components/app-screen';
import { PrimaryButton, SectionHeading, StatusChip, Surface } from '@/components/prima-ui';
import { colors, radius, spacing } from '@/constants/design';
import { useBooking } from '@/context/booking-context';
import { useLocationPreference } from '@/context/location-context';
import { primaApi } from '@/lib/api';
import { formatService } from '@/lib/format';
import { distanceKilometers, openDirections } from '@/lib/location';

export default function PartnerDetailScreen() {
  const params = useLocalSearchParams<{ partnerId?: string | string[] }>();
  const { draft, setPartner } = useBooking();
  const { area } = useLocationPreference();
  const partnerId = useMemo(() => {
    const rawValue = Array.isArray(params.partnerId) ? params.partnerId[0] : params.partnerId;
    const decodedValue = rawValue ? decodeURIComponent(rawValue) : draft.partner?.id;

    if (!decodedValue || decodedValue === '[partnerId]' || decodedValue.includes('[')) {
      return draft.partner?.id;
    }

    return decodedValue;
  }, [draft.partner?.id, params.partnerId]);
  const cachedPartner = draft.partner?.id === partnerId ? draft.partner : undefined;
  const serviceMode = draft.onsiteServiceMode ?? 'partner_location';
  const [partner, setPartnerData] = useState<PartnerLocation | undefined>(cachedPartner);
  const [loading, setLoading] = useState(!cachedPartner);
  const [error, setError] = useState<string>();

  const loadPartner = useCallback(async () => {
    if (!partnerId) {
      setError('This partner link is incomplete. Return to the marketplace and choose the partner again.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(undefined);
    try {
      let nextPartner: PartnerLocation;

      try {
        nextPartner = await primaApi.partner(partnerId);
      } catch (detailError) {
        const marketplacePartners = await primaApi.partners();
        const marketplaceMatch = marketplacePartners.find((item) => item.id === partnerId);

        if (!marketplaceMatch) {
          throw detailError;
        }

        nextPartner = marketplaceMatch;
      }

      setPartnerData(nextPartner);
      setPartner(nextPartner);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Partner details could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [partnerId, setPartner]);

  useEffect(() => {
    const timeoutId = setTimeout(() => void loadPartner(), 0);
    return () => clearTimeout(timeoutId);
  }, [loadPartner]);

  if (!partner && loading) {
    return (
      <AppScreen eyebrow="Verified partner" title="Opening partner">
        <PartnerSkeleton />
      </AppScreen>
    );
  }

  if (!partner) {
    return (
      <AppScreen eyebrow="Verified partner" title="Partner unavailable">
        <Surface>
          <Text style={styles.errorTitle}>We could not open this partner.</Text>
          <Text style={styles.body}>{error ?? 'Please try again.'}</Text>
          <PrimaryButton label="Try again" onPress={() => void loadPartner()} />
          <Pressable onPress={() => router.replace('/partners')}>
            <Text style={styles.marketplace}>Return to partner search</Text>
          </Pressable>
        </Surface>
      </AppScreen>
    );
  }

  function choosePartner() {
    setPartner(partner!);
    router.push('/booking/service');
  }

  const distanceKm = area
    ? distanceKilometers(area, { latitude: partner.latitude, longitude: partner.longitude })
    : partner.distanceKm;

  return (
    <AppScreen eyebrow="Verified partner" title={partner.name}>
      {error ? (
        <Pressable onPress={() => void loadPartner()} style={styles.inlineWarning}>
          <Text style={styles.inlineWarningText}>Details may be out of date. Tap to retry.</Text>
        </Pressable>
      ) : null}
      <Surface accent>
        <View style={styles.heroTop}>
          <View style={styles.mark}><Text style={styles.markText}>{partner.name.slice(0, 2).toUpperCase()}</Text></View>
          <View style={styles.heroCopy}>
            <Text style={styles.rating}>★ {partner.rating.toFixed(1)} · {partner.reviewCount} reviews</Text>
            <Text style={styles.distance}>{distanceKm.toFixed(1)} km away · Open {partner.openingHours}</Text>
          </View>
          <StatusChip>Verified</StatusChip>
        </View>
        <Text style={styles.description}>{partner.shortDescription}</Text>
      </Surface>
      <Surface>
        <SectionHeading eyebrow="Selected care mode" title={formatServiceMode(serviceMode)} />
        <Text style={styles.body}>{serviceModeDescription(serviceMode)}</Text>
      </Surface>
      <Surface>
        <SectionHeading eyebrow="Location" title={partner.addressLine1} />
        <Text style={styles.body}>{partner.city}, {partner.region}</Text>
        <View style={styles.map}>
          <Text style={styles.mapPin}>⌖</Text>
          <Text style={styles.mapText}>{distanceKm.toFixed(1)} km from {area?.label ?? 'your selected area'}</Text>
          <Text style={styles.mapCoordinates}>{partner.latitude.toFixed(3)}, {partner.longitude.toFixed(3)}</Text>
        </View>
        <Pressable
          accessibilityRole="link"
          onPress={() => void openDirections(
            { latitude: partner.latitude, longitude: partner.longitude },
            partner.name,
          )}>
          <Text style={styles.directions}>Open driving directions ↗</Text>
        </Pressable>
      </Surface>
      <SectionHeading eyebrow="Available care" title="Services offered" />
      {partner.serviceCodes.map((code) => (
        <Surface key={code}>
          <Text style={styles.service}>{formatService(code)}</Text>
          <Text style={styles.body}>Upfront pricing · Prima Care Guarantee · Live appointment times</Text>
        </Surface>
      ))}
      <PrimaryButton label={`Continue with ${formatServiceMode(serviceMode).toLowerCase()}`} onPress={choosePartner} />
    </AppScreen>
  );
}

function formatServiceMode(mode: BookingOnsiteServiceMode) {
  if (mode === 'pickup_return') return 'Pickup and return';
  if (mode === 'customer_property') return 'At my residence';
  return 'Drive to partner';
}

function serviceModeDescription(mode: BookingOnsiteServiceMode) {
  if (mode === 'pickup_return') {
    return 'The partner handles pickup, service, and return coordination.';
  }
  if (mode === 'customer_property') {
    return 'The partner comes to your saved residence or approved property area when coverage permits.';
  }
  return 'You drive to this partner location for your appointment.';
}

function PartnerSkeleton() {
  return (
    <View style={styles.skeletonWrap}>
      <ActivityIndicator color={colors.accent} size="large" />
      <Surface>
        <View style={styles.skeletonLineWide} />
        <View style={styles.skeletonLine} />
        <View style={styles.skeletonBlock} />
      </Surface>
      <Text style={styles.loadingText}>Loading verified details…</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  mark: { width: 58, height: 58, borderRadius: 18, backgroundColor: colors.surfaceStrong, alignItems: 'center', justifyContent: 'center' },
  markText: { color: colors.accent, fontSize: 18, fontWeight: '900' },
  heroCopy: { flex: 1 },
  rating: { color: colors.warning, fontSize: 13, fontWeight: '800' },
  distance: { color: colors.muted, fontSize: 11, marginTop: 5 },
  description: { color: colors.text, fontSize: 15, lineHeight: 22, fontWeight: '700' },
  body: { color: colors.muted, fontSize: 13, lineHeight: 20 },
  map: { minHeight: 110, borderRadius: 18, backgroundColor: colors.canvasRaised, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  mapPin: { color: colors.accent, fontSize: 28 },
  mapText: { color: colors.muted, fontSize: 11 },
  mapCoordinates: { color: colors.subtle, fontSize: 10 },
  directions: { color: colors.accent, fontSize: 13, fontWeight: '800', textAlign: 'center', paddingVertical: spacing.sm },
  service: { color: colors.text, fontSize: 17, fontWeight: '800' },
  errorTitle: { color: colors.text, fontSize: 18, fontWeight: '800' },
  marketplace: { color: colors.accent, fontSize: 13, fontWeight: '800', textAlign: 'center', padding: spacing.sm },
  skeletonWrap: { gap: spacing.lg, alignItems: 'stretch', paddingTop: spacing.xxl },
  skeletonLineWide: { width: '72%', height: 18, borderRadius: radius.sm, backgroundColor: colors.surfaceStrong },
  skeletonLine: { width: '44%', height: 12, borderRadius: radius.sm, backgroundColor: colors.surfaceStrong },
  skeletonBlock: { height: 110, borderRadius: radius.md, backgroundColor: colors.canvasRaised },
  loadingText: { color: colors.muted, fontSize: 13, textAlign: 'center' },
  inlineWarning: { borderWidth: 1, borderColor: '#E0C987', borderRadius: radius.md, backgroundColor: '#FBF2DE', padding: spacing.md },
  inlineWarningText: { color: colors.warning, fontSize: 12, fontWeight: '700', textAlign: 'center' },
});

import type { PartnerLocation } from '@prima-wash/contracts';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { AppScreen } from '@/components/app-screen';
import { PrimaryButton, StatusChip, Surface } from '@/components/prima-ui';
import { colors, radius, spacing } from '@/constants/design';
import { useLocationPreference } from '@/context/location-context';
import { primaApi } from '@/lib/api';
import { formatService } from '@/lib/format';
import { useBooking } from '@/context/booking-context';
import { distanceKilometers, manualServiceAreas } from '@/lib/location';

export default function PartnerDiscoveryScreen() {
  const { setPartner } = useBooking();
  const {
    area,
    clearArea,
    error: locationError,
    requestCurrentLocation,
    selectManualArea,
    state: locationState,
  } = useLocationPreference();
  const [partners, setPartners] = useState<readonly PartnerLocation[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  const loadPartners = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      setPartners(await primaApi.partners());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Partners could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeoutId = setTimeout(() => void loadPartners(), 0);
    return () => clearTimeout(timeoutId);
  }, [loadPartners]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return partners
      .filter((partner) =>
        !normalized ||
        [partner.name, partner.city, partner.shortDescription, ...partner.serviceCodes.map(formatService)]
          .join(' ')
          .toLowerCase()
          .includes(normalized),
      )
      .map((partner) => ({
        partner,
        distanceKm: area
          ? distanceKilometers(area, { latitude: partner.latitude, longitude: partner.longitude })
          : partner.distanceKm,
      }))
      .sort((left, right) => left.distanceKm - right.distanceKm || right.partner.rating - left.partner.rating);
  }, [area, partners, query]);

  return (
    <AppScreen eyebrow="Verified marketplace" title="Care near you">
      <Text style={styles.intro}>Compare trusted partners, specialties, ratings, and live availability.</Text>
      <Surface accent>
        <View style={styles.locationHeader}>
          <View style={styles.locationCopy}>
            <Text style={styles.locationEyebrow}>SERVICE AREA</Text>
            <Text style={styles.locationTitle}>{area?.label ?? 'Choose where to search'}</Text>
            <Text style={styles.locationBody}>
              {area ? 'Saved on this device. Distances are calculated locally.' : 'Use your location or select an area manually.'}
            </Text>
          </View>
          {area ? <StatusChip>{area.source === 'device' ? 'Live' : 'Saved'}</StatusChip> : null}
        </View>
        <PrimaryButton
          label={locationState === 'requesting' ? 'Finding your location…' : 'Use my current location'}
          loading={locationState === 'requesting'}
          onPress={() => void requestCurrentLocation()}
        />
        <View style={styles.areaRow}>
          {manualServiceAreas.map((manualArea) => (
            <Pressable
              key={manualArea.label}
              onPress={() => void selectManualArea(manualArea)}
              style={[styles.areaChip, area?.label === manualArea.label && styles.areaChipSelected]}>
              <Text style={[styles.areaChipText, area?.label === manualArea.label && styles.areaChipTextSelected]}>
                {manualArea.label}
              </Text>
            </Pressable>
          ))}
        </View>
        {locationError ? <Text style={styles.locationWarning}>{locationError}</Text> : null}
        {area ? <Pressable onPress={() => void clearArea()}><Text style={styles.clearArea}>Clear saved area</Text></Pressable> : null}
      </Surface>
      <TextInput
        accessibilityLabel="Search partners"
        onChangeText={setQuery}
        placeholder="Search partner or service"
        placeholderTextColor={colors.subtle}
        style={styles.search}
        value={query}
      />
      <View style={styles.summary}>
        <Text style={styles.summaryStrong}>{loading ? 'Finding trusted care…' : `${filtered.length} verified partners`}</Text>
        <Text style={styles.summaryText}>{area ? `Nearest to ${area.label}` : 'Demo distance until area selected'}</Text>
      </View>
      {loading ? <ActivityIndicator color={colors.accent} size="large" /> : null}
      {error ? (
        <Surface>
          <Text style={styles.errorTitle}>Partner search is temporarily unavailable</Text>
          <Text style={styles.description}>{error}</Text>
          <Pressable onPress={() => void loadPartners()}><Text style={styles.retry}>Try again</Text></Pressable>
        </Surface>
      ) : null}
      {!loading && !error && filtered.length === 0 ? (
        <Surface>
          <Text style={styles.errorTitle}>{query ? 'No partners match your search' : 'No partners nearby yet'}</Text>
          <Text style={styles.description}>{query ? 'Try a partner name, location, or service.' : 'Please check again shortly.'}</Text>
        </Surface>
      ) : null}
      {filtered.map(({ partner, distanceKm }) => (
        <Pressable
          accessibilityHint={`View ${partner.name}`}
          accessibilityRole="button"
          key={partner.id}
          onPress={() => {
            setPartner(partner);
            router.push({
              pathname: '/partners/detail',
              params: { partnerId: partner.id },
            });
          }}
          style={({ pressed }) => pressed && styles.pressed}>
          <Surface>
            <View style={styles.partnerTop}>
              <View style={styles.partnerMark}><Text style={styles.partnerMarkText}>{partner.name.slice(0, 2).toUpperCase()}</Text></View>
              <View style={styles.partnerCopy}>
                <View style={styles.nameRow}>
                  <Text style={styles.name}>{partner.name}</Text>
                  {partner.verified ? <StatusChip>Verified</StatusChip> : null}
                </View>
                <Text style={styles.rating}>★ {partner.rating.toFixed(1)} ({partner.reviewCount}) · {distanceKm.toFixed(1)} km</Text>
              </View>
            </View>
            <Text style={styles.description}>{partner.shortDescription}</Text>
            <View style={styles.serviceRow}>
              {partner.serviceCodes.slice(0, 3).map((code) => <Text key={code} style={styles.service}>{formatService(code)}</Text>)}
            </View>
            <View style={styles.footer}>
              <Text style={styles.hours}>Open {partner.openingHours}</Text>
              <Text style={styles.view}>View partner ›</Text>
            </View>
          </Surface>
        </Pressable>
      ))}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  intro: { color: colors.muted, fontSize: 14, lineHeight: 21, marginTop: -spacing.sm },
  locationHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  locationCopy: { flex: 1 },
  locationEyebrow: { color: colors.accent, fontSize: 10, fontWeight: '800', letterSpacing: 1.1 },
  locationTitle: { color: colors.text, fontSize: 18, fontWeight: '800', marginTop: 4 },
  locationBody: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 4 },
  areaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  areaChip: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: 11, paddingVertical: 8 },
  areaChipSelected: { borderColor: colors.accent, backgroundColor: colors.surfaceStrong },
  areaChipText: { color: colors.muted, fontSize: 11, fontWeight: '700' },
  areaChipTextSelected: { color: colors.accent },
  locationWarning: { color: colors.warning, fontSize: 12, lineHeight: 18 },
  clearArea: { color: colors.muted, fontSize: 12, fontWeight: '700', textAlign: 'center', paddingVertical: spacing.xs },
  search: { minHeight: 52, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface, color: colors.text, paddingHorizontal: spacing.lg, fontSize: 14 },
  summary: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  summaryStrong: { color: colors.text, fontSize: 12, fontWeight: '800' },
  summaryText: { color: colors.subtle, fontSize: 11 },
  partnerTop: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  partnerMark: { width: 52, height: 52, borderRadius: radius.md, backgroundColor: colors.surfaceStrong, alignItems: 'center', justifyContent: 'center' },
  partnerMarkText: { color: colors.accent, fontSize: 16, fontWeight: '900' },
  partnerCopy: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  name: { flex: 1, color: colors.text, fontSize: 18, fontWeight: '800' },
  rating: { color: colors.warning, fontSize: 12, marginTop: 5 },
  description: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  serviceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  service: { color: colors.muted, fontSize: 10, fontWeight: '700', borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 5 },
  footer: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md, flexDirection: 'row', justifyContent: 'space-between' },
  hours: { color: colors.subtle, fontSize: 11 },
  view: { color: colors.accent, fontSize: 12, fontWeight: '800' },
  errorTitle: { color: colors.text, fontSize: 17, fontWeight: '800' },
  retry: { color: colors.accent, fontSize: 13, fontWeight: '800', paddingVertical: spacing.sm },
  pressed: { opacity: 0.72 },
});

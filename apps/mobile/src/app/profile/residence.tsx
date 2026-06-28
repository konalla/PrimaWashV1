import type { Property, ResidenceType, UpdateCustomerResidentialProfileRequest } from '@prima-wash/contracts';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { AppScreen } from '@/components/app-screen';
import { PrimaryButton, StatusChip, Surface } from '@/components/prima-ui';
import { colors, radius, spacing } from '@/constants/design';
import { primaApi } from '@/lib/api';

interface ResidenceOption {
  readonly residenceType: ResidenceType;
  readonly label: string;
  readonly title: string;
  readonly body: string;
}

const residenceOptions: readonly ResidenceOption[] = [
  {
    residenceType: 'multi_unit_private',
    label: 'Condominium',
    title: 'Book through your condo',
    body: 'Select or add your condo. If it is not active yet, your interest helps us approach management.',
  },
  {
    residenceType: 'public_housing',
    label: 'HDB / public housing',
    title: 'Find trusted care nearby',
    body: 'Use the current marketplace flow to compare verified partners and live appointment times.',
  },
  {
    residenceType: 'landed',
    label: 'Landed property',
    title: 'Find trusted care nearby',
    body: 'Save your area and continue with trusted partner discovery.',
  },
];

export default function ResidenceScreen() {
  const [selectedType, setSelectedType] = useState<ResidenceType>('multi_unit_private');
  const [propertyName, setPropertyName] = useState('');
  const [propertyAddress, setPropertyAddress] = useState('');
  const [selectedProperty, setSelectedProperty] = useState<Property>();
  const [properties, setProperties] = useState<readonly Property[]>([]);
  const [loadingProperties, setLoadingProperties] = useState(false);
  const [serviceAreaLabel, setServiceAreaLabel] = useState('');
  const [parkingNotes, setParkingNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    primaApi.profile()
      .then((profile) => {
        const residence = profile.residentialProfile;

        if (!residence) {
          return;
        }

        setSelectedType(residence.residenceType);
        setPropertyName(residence.propertyName ?? '');
        setPropertyAddress(residence.propertyAddress ?? '');
        setServiceAreaLabel(residence.serviceAreaLabel ?? '');
        setParkingNotes(residence.parkingNotes ?? '');
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (selectedType !== 'multi_unit_private') {
      setProperties([]);
      return;
    }

    let cancelled = false;
    setLoadingProperties(true);

    const timeoutId = setTimeout(() => {
      primaApi.properties({ query: propertyName.trim(), residenceType: 'multi_unit_private' })
        .then((nextProperties) => {
          if (!cancelled) {
            setProperties(nextProperties);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setProperties([]);
          }
        })
        .finally(() => {
          if (!cancelled) {
            setLoadingProperties(false);
          }
        });
    }, 200);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [propertyName, selectedType]);

  const selectedOption = useMemo(
    () => residenceOptions.find((option) => option.residenceType === selectedType) ?? residenceOptions[0],
    [selectedType],
  );
  const isCondo = selectedType === 'multi_unit_private';
  const canSave = isCondo ? propertyName.trim().length >= 2 : serviceAreaLabel.trim().length >= 2;

  async function saveResidence() {
    if (!selectedOption) {
      return;
    }

    setSaving(true);
    try {
      const residentialProfile: UpdateCustomerResidentialProfileRequest = {
        residenceType: selectedOption.residenceType,
        localResidenceLabel: selectedOption.label,
        ...(isCondo
          ? {
              propertyName: propertyName.trim(),
              propertyAddress: propertyAddress.trim() || undefined,
              parkingNotes: parkingNotes.trim() || undefined,
            }
          : {
              serviceAreaLabel: serviceAreaLabel.trim(),
              parkingNotes: parkingNotes.trim() || undefined,
            }),
      };

      if (isCondo) {
        await primaApi.createPropertyInterest({
          ...(selectedProperty ? { propertyId: selectedProperty.id } : { propertyName: propertyName.trim() }),
          propertyAddress: propertyAddress.trim() || undefined,
          requestedServiceCodes: ['wash_basic', 'wash_premium', 'detail_interior'],
          preferredTimeWindows: [],
          parkingNotes: parkingNotes.trim() || undefined,
        });
      } else {
        await primaApi.updateProfile({ residentialProfile });
      }
      router.replace('/(tabs)/home');
    } catch (error) {
      Alert.alert('Residence could not be saved', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppScreen eyebrow="Residential setup" title="Where do you usually park?">
      <Surface accent>
        <Text style={styles.lead}>Prima Wash adapts your home screen based on how your vehicle can be served.</Text>
      </Surface>

      <View style={styles.optionList}>
        {residenceOptions.map((option) => {
          const selected = option.residenceType === selectedType;

          return (
            <Pressable
              accessibilityRole="button"
              key={option.residenceType}
              onPress={() => setSelectedType(option.residenceType)}
              style={({ pressed }) => [styles.option, selected && styles.optionSelected, pressed && styles.pressed]}>
              <View style={styles.optionHeader}>
                <Text style={styles.optionLabel}>{option.label}</Text>
                {selected ? <StatusChip>Selected</StatusChip> : null}
              </View>
              <Text style={styles.optionTitle}>{option.title}</Text>
              <Text style={styles.optionBody}>{option.body}</Text>
            </Pressable>
          );
        })}
      </View>

      <Surface>
        {isCondo ? (
          <>
            <Field label="Condo name" value={propertyName} onChangeText={setPropertyName} placeholder="Example Residences" />
            <View style={styles.suggestions}>
              <View style={styles.suggestionsHeader}>
                <Text style={styles.suggestionsTitle}>{loadingProperties ? 'Searching condos...' : 'Known condos'}</Text>
                {selectedProperty ? <StatusChip tone="neutral">Selected</StatusChip> : null}
              </View>
              {properties.slice(0, 4).map((property) => {
                const selected = selectedProperty?.id === property.id;

                return (
                  <Pressable
                    accessibilityRole="button"
                    key={property.id}
                    onPress={() => {
                      setSelectedProperty(property);
                      setPropertyName(property.name);
                      setPropertyAddress(property.addressLine1 ?? '');
                    }}
                    style={({ pressed }) => [styles.propertyRow, selected && styles.propertyRowSelected, pressed && styles.pressed]}>
                    <View style={styles.propertyCopy}>
                      <Text style={styles.propertyName}>{property.name}</Text>
                      <Text style={styles.propertyMeta}>
                        {property.addressLine1 ?? property.region} · {property.interestCount} interested
                      </Text>
                    </View>
                    <StatusChip tone={property.activationStatus === 'active' ? 'success' : 'warning'}>
                      {property.activationStatus.replaceAll('_', ' ')}
                    </StatusChip>
                  </Pressable>
                );
              })}
              {!loadingProperties && properties.length === 0 ? (
                <Text style={styles.emptySuggestion}>No match yet. Add your condo and we will track resident demand.</Text>
              ) : null}
            </View>
            <Field label="Condo address" value={propertyAddress} onChangeText={setPropertyAddress} placeholder="Street address" />
            <Field
              label="Parking or access notes"
              value={parkingNotes}
              onChangeText={setParkingNotes}
              placeholder="Visitor lots, basement level, tower, or lobby"
              multiline
            />
          </>
        ) : (
          <>
            <Field
              label="Service area"
              value={serviceAreaLabel}
              onChangeText={setServiceAreaLabel}
              placeholder={selectedType === 'public_housing' ? 'Tampines, Toa Payoh, Jurong...' : 'Bukit Timah, Katong, Sentosa...'}
            />
            <Field
              label="Parking or access notes"
              value={parkingNotes}
              onChangeText={setParkingNotes}
              placeholder="Optional notes for future bookings"
              multiline
            />
          </>
        )}
        <PrimaryButton disabled={!canSave} label="Save and continue" loading={saving} onPress={saveResidence} />
      </Surface>
    </AppScreen>
  );
}

function Field({ label, ...props }: { readonly label: string } & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput placeholderTextColor={colors.subtle} style={styles.input} {...props} />
    </View>
  );
}

const styles = StyleSheet.create({
  lead: { color: colors.text, fontSize: 15, fontWeight: '700', lineHeight: 22 },
  optionList: { gap: spacing.md },
  option: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  optionSelected: { borderColor: colors.accent, backgroundColor: colors.surfaceStrong },
  optionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  optionLabel: { color: colors.accent, fontSize: 11, fontWeight: '900', letterSpacing: 1.1, textTransform: 'uppercase' },
  optionTitle: { color: colors.text, fontSize: 17, fontWeight: '800' },
  optionBody: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  suggestions: { gap: spacing.sm },
  suggestionsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  suggestionsTitle: { color: colors.muted, fontSize: 12, fontWeight: '800' },
  propertyRow: {
    minHeight: 70,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.canvasRaised,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  propertyRowSelected: { borderColor: colors.accent, backgroundColor: colors.surfaceStrong },
  propertyCopy: { flex: 1 },
  propertyName: { color: colors.text, fontSize: 14, fontWeight: '800' },
  propertyMeta: { color: colors.subtle, fontSize: 11, marginTop: 4 },
  emptySuggestion: { color: colors.subtle, fontSize: 12, lineHeight: 18 },
  pressed: { opacity: 0.82 },
  field: { gap: spacing.sm },
  fieldLabel: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  input: {
    minHeight: 50,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.canvasRaised,
    color: colors.text,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: 15,
  },
});

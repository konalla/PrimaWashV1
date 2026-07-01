import type { BookingOnsiteServiceMode } from '@prima-wash/contracts';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { AppScreen } from '@/components/app-screen';
import { PrimaryButton, SectionHeading, Surface } from '@/components/prima-ui';
import { colors, radius, spacing } from '@/constants/design';
import { useBooking } from '@/context/booking-context';

export default function ServiceDetailsScreen() {
  const { draft, setExecutionNotes } = useBooking();
  const mode: BookingOnsiteServiceMode = draft.primaWashDay ? 'customer_property' : draft.onsiteServiceMode ?? 'partner_location';
  const config = detailConfig(mode, Boolean(draft.primaWashDay));
  const existing = useMemo(() => parseExecutionNotes(draft.executionNotes), [draft.executionNotes]);
  const [primary, setPrimary] = useState(existing.primary);
  const [secondary, setSecondary] = useState(existing.secondary);
  const [contact, setContact] = useState(existing.contact);
  const [notes, setNotes] = useState(existing.notes);

  function continueFlow() {
    setExecutionNotes(formatExecutionNotes(config.title, [
      [config.primaryLabel, primary],
      [config.secondaryLabel, secondary],
      [config.contactLabel, contact],
      ['Additional notes', notes],
    ]));
    router.push(draft.primaWashDay ? '/booking/review' : '/booking/time');
  }

  return (
    <AppScreen eyebrow="Step 2 of 4" title={config.title}>
      <Surface accent>
        <SectionHeading eyebrow={config.eyebrow} title={config.heading} />
        <Text style={styles.body}>{config.body}</Text>
      </Surface>

      <View style={styles.field}>
        <Text style={styles.label}>{config.primaryLabel}</Text>
        <TextInput
          multiline
          onChangeText={setPrimary}
          placeholder={config.primaryPlaceholder}
          placeholderTextColor={colors.subtle}
          style={[styles.input, styles.textArea]}
          value={primary}
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>{config.secondaryLabel}</Text>
        <TextInput
          multiline
          onChangeText={setSecondary}
          placeholder={config.secondaryPlaceholder}
          placeholderTextColor={colors.subtle}
          style={[styles.input, styles.textArea]}
          value={secondary}
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>{config.contactLabel}</Text>
        <TextInput
          onChangeText={setContact}
          placeholder={config.contactPlaceholder}
          placeholderTextColor={colors.subtle}
          style={styles.input}
          value={contact}
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Additional notes</Text>
        <TextInput
          multiline
          onChangeText={setNotes}
          placeholder={config.notesPlaceholder}
          placeholderTextColor={colors.subtle}
          style={[styles.input, styles.textArea]}
          value={notes}
        />
      </View>

      <PrimaryButton label={draft.primaWashDay ? 'Review booking' : 'Choose appointment time'} onPress={continueFlow} />
    </AppScreen>
  );
}

function detailConfig(mode: BookingOnsiteServiceMode, primaWashDay: boolean) {
  if (primaWashDay) {
    return {
      title: 'Condo service instructions',
      eyebrow: 'Approved property service',
      heading: 'Help the team find and serve your vehicle',
      body: 'These notes help the technician operate inside the approved condo window and service area.',
      primaryLabel: 'Parking bay or vehicle location',
      primaryPlaceholder: 'Basement B2, lot 183, near lift lobby B',
      secondaryLabel: 'Access or condo instructions',
      secondaryPlaceholder: 'Guardhouse instructions, lift lobby, visitor lot details',
      contactLabel: 'Preferred contact',
      contactPlaceholder: 'Mobile number or in-app message preferred',
      notesPlaceholder: 'Anything the technician or Prima Wash team should know',
    };
  }

  if (mode === 'pickup_return') {
    return {
      title: 'Pickup and return details',
      eyebrow: 'Vehicle handover',
      heading: 'Tell the partner where to collect and return the car',
      body: 'Pickup and return needs clear handover notes before the appointment is confirmed.',
      primaryLabel: 'Pickup location',
      primaryPlaceholder: 'Tower lobby, driveway, office car park, or exact address',
      secondaryLabel: 'Return location',
      secondaryPlaceholder: 'Same as pickup, concierge, basement lot, or another address',
      contactLabel: 'Handover contact',
      contactPlaceholder: 'Name and mobile number',
      notesPlaceholder: 'Key handover, access timing, parking rules, or security desk notes',
    };
  }

  if (mode === 'customer_property') {
    return {
      title: 'At-property service details',
      eyebrow: 'Residence service',
      heading: 'Share access and parking instructions',
      body: 'These details help the partner confirm whether mobile service can be completed at your property.',
      primaryLabel: 'Service address or vehicle location',
      primaryPlaceholder: 'Driveway, garage, landed home address, HDB/MSCP level and lot',
      secondaryLabel: 'Site constraints',
      secondaryPlaceholder: 'Water policy, no hose access, covered area, visitor parking rules',
      contactLabel: 'Preferred contact',
      contactPlaceholder: 'Name and mobile number',
      notesPlaceholder: 'Gate access, pets, guardhouse, or timing constraints',
    };
  }

  return {
    title: 'Arrival details',
    eyebrow: 'Partner location',
    heading: 'Prepare for your visit',
    body: 'You will drive to the selected partner. Add anything useful before choosing an appointment time.',
    primaryLabel: 'Arrival notes',
    primaryPlaceholder: 'Preferred arrival window, vehicle condition, or bay request',
    secondaryLabel: 'Special instructions',
    secondaryPlaceholder: 'Low clearance, EV care notes, interior access, child seat notes',
    contactLabel: 'Preferred contact',
    contactPlaceholder: 'Name and mobile number',
    notesPlaceholder: 'Anything else the partner should know before you arrive',
  };
}

function formatExecutionNotes(title: string, values: readonly (readonly [string, string])[]) {
  const lines = values
    .map(([label, value]) => [label, value.trim()] as const)
    .filter(([, value]) => value.length > 0)
    .map(([label, value]) => `${label}: ${value}`);

  return lines.length > 0 ? [title, ...lines].join('\n').slice(0, 2000) : '';
}

function parseExecutionNotes(value?: string) {
  const parsed = { primary: '', secondary: '', contact: '', notes: '' };

  if (!value) {
    return parsed;
  }

  const lines = value.split('\n').slice(1);
  for (const line of lines) {
    const [label, ...rest] = line.split(':');
    const text = rest.join(':').trim();
    if (!text) continue;
    if (label?.includes('contact') || label?.includes('Contact')) parsed.contact = text;
    else if (!parsed.primary) parsed.primary = text;
    else if (!parsed.secondary) parsed.secondary = text;
    else parsed.notes = text;
  }

  return parsed;
}

const styles = StyleSheet.create({
  body: { color: colors.muted, fontSize: 13, lineHeight: 20 },
  field: { gap: spacing.sm },
  label: { color: colors.text, fontSize: 13, fontWeight: '800' },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: 14,
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
  },
  textArea: { minHeight: 88, textAlignVertical: 'top' },
});

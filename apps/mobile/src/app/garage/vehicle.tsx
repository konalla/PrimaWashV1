import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native';
import type { Vehicle } from '@prima-wash/contracts';

import { AppScreen } from '@/components/app-screen';
import { PrimaryButton } from '@/components/prima-ui';
import { colors, radius, spacing } from '@/constants/design';
import { primaApi } from '@/lib/api';

export default function VehicleEditorScreen() {
  const { vehicleId } = useLocalSearchParams<{ vehicleId?: string }>();
  const [vehicle, setVehicle] = useState<Vehicle>();
  const [plateNumber, setPlateNumber] = useState('');
  const [nickname, setNickname] = useState('');
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!vehicleId) return;
    primaApi.vehicles().then((vehicles) => {
      const match = vehicles.find((item) => item.id === vehicleId);
      if (!match) return;
      setVehicle(match);
      setPlateNumber(match.plateNumber);
      setNickname(match.nickname ?? '');
      setMake(match.make ?? '');
      setModel(match.model ?? '');
      setYear(match.year ? String(match.year) : '');
    });
  }, [vehicleId]);

  async function save() {
    setSaving(true);
    try {
      const input = {
        plateNumber,
        nickname,
        make,
        model,
        ...(year ? { year: Number(year) } : {}),
        ...(!vehicle ? { isPrimary: true } : {}),
      };
      if (vehicle) {
        await primaApi.updateVehicle(vehicle.id, input);
      } else {
        await primaApi.createVehicle(input);
      }
      router.back();
    } catch (error) {
      Alert.alert('Vehicle could not be saved', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppScreen eyebrow={vehicle ? 'Edit vehicle' : 'New vehicle'} title={vehicle ? 'Update your vehicle' : 'Add to your garage'}>
      <Field label="Plate number" value={plateNumber} onChangeText={setPlateNumber} autoCapitalize="characters" />
      <Field label="Nickname" value={nickname} onChangeText={setNickname} placeholder="Daily driver" />
      <View style={styles.row}>
        <View style={styles.half}><Field label="Make" value={make} onChangeText={setMake} placeholder="Tesla" /></View>
        <View style={styles.half}><Field label="Model" value={model} onChangeText={setModel} placeholder="Model 3" /></View>
      </View>
      <Field label="Year" value={year} onChangeText={setYear} keyboardType="number-pad" placeholder="2026" />
      <PrimaryButton disabled={plateNumber.trim().length < 2} label={vehicle ? 'Save changes' : 'Add vehicle'} loading={saving} onPress={save} />
    </AppScreen>
  );
}

function Field({ label, ...props }: { readonly label: string } & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput placeholderTextColor={colors.subtle} style={styles.input} {...props} />
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: spacing.sm },
  label: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  input: { minHeight: 52, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.canvasRaised, color: colors.text, paddingHorizontal: spacing.lg, fontSize: 15 },
  row: { flexDirection: 'row', gap: spacing.md },
  half: { flex: 1 },
});

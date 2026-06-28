import type { ServiceRecord, Vehicle } from '@prima-wash/contracts';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppScreen } from '@/components/app-screen';
import { PrimaryButton, SectionHeading, StatusChip, Surface } from '@/components/prima-ui';
import { colors, spacing } from '@/constants/design';
import { primaApi } from '@/lib/api';
import { formatAppointment, formatService } from '@/lib/format';

export default function GarageScreen() {
  const [vehicles, setVehicles] = useState<readonly Vehicle[]>([]);
  const [records, setRecords] = useState<readonly ServiceRecord[]>([]);

  const load = useCallback(async () => {
    try {
      const [nextVehicles, nextRecords] = await Promise.all([primaApi.vehicles(), primaApi.serviceRecords()]);
      setVehicles(nextVehicles);
      setRecords(nextRecords);
    } catch (error) {
      Alert.alert('Garage unavailable', error instanceof Error ? error.message : 'Please try again.');
    }
  }, []);

  useFocusEffect(useCallback(() => void load(), [load]));

  async function makePrimary(vehicle: Vehicle) {
    await primaApi.updateVehicle(vehicle.id, { isPrimary: true });
    await load();
  }

  function removeVehicle(vehicle: Vehicle) {
    Alert.alert('Remove this vehicle?', 'Vehicles with booking history remain protected and cannot be deleted.', [
      { text: 'Keep vehicle', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await primaApi.deleteVehicle(vehicle.id);
            await load();
          } catch (error) {
            Alert.alert('Vehicle could not be removed', error instanceof Error ? error.message : 'Please try again.');
          }
        },
      },
    ]);
  }

  return (
    <AppScreen eyebrow="Ownership" title="My garage">
      {vehicles.map((vehicle) => (
        <Surface key={vehicle.id} accent={vehicle.isPrimary}>
          <View style={styles.vehicleTop}>
            <View style={styles.vehicleCopy}>
              <Text style={styles.caption}>{vehicle.nickname || (vehicle.isPrimary ? 'Primary vehicle' : 'Saved vehicle')}</Text>
              <Text style={styles.vehicleName}>{`${vehicle.make ?? ''} ${vehicle.model ?? ''}`.trim() || 'Vehicle'}</Text>
              <Text style={styles.plate}>{vehicle.plateNumber}</Text>
            </View>
            {vehicle.isPrimary ? <StatusChip>Primary</StatusChip> : null}
          </View>
          <View style={styles.actions}>
            <Pressable onPress={() => router.push({ pathname: '/garage/vehicle', params: { vehicleId: vehicle.id } })}>
              <Text style={styles.action}>Edit</Text>
            </Pressable>
            {!vehicle.isPrimary ? (
              <Pressable onPress={() => void makePrimary(vehicle)}><Text style={styles.action}>Make primary</Text></Pressable>
            ) : null}
            <Pressable onPress={() => removeVehicle(vehicle)}><Text style={styles.remove}>Remove</Text></Pressable>
          </View>
        </Surface>
      ))}

      {vehicles.length === 0 ? (
        <Surface>
          <Text style={styles.recordTitle}>Add your first vehicle</Text>
          <Text style={styles.recordBody}>Save a vehicle once, then reuse it across every booking.</Text>
        </Surface>
      ) : null}

      <PrimaryButton label="+ Add vehicle" onPress={() => router.push('/garage/vehicle')} />

      <SectionHeading eyebrow="Trusted history" title="Service records" />
      {records.length === 0 ? (
        <Surface>
          <Text style={styles.recordTitle}>Your care history starts here</Text>
          <Text style={styles.recordBody}>Completed Prima Wash bookings create verified records for your vehicle.</Text>
        </Surface>
      ) : (
        records.map((record) => (
          <Surface key={record.id}>
            <Text style={styles.recordTitle}>{formatService(record.serviceCode)}</Text>
            <Text style={styles.recordBody}>{formatAppointment(record.completedAt)}</Text>
            <Text style={styles.verified}>✓ Verified service record</Text>
          </Surface>
        ))
      )}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  vehicleTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.md },
  vehicleCopy: { flex: 1 },
  caption: { color: colors.muted, fontSize: 12 },
  vehicleName: { color: colors.text, fontSize: 24, fontWeight: '800', letterSpacing: -0.7, marginTop: 5 },
  plate: { color: colors.muted, fontSize: 11, fontWeight: '800', letterSpacing: 1.4, marginTop: spacing.sm },
  actions: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md, flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xl },
  action: { color: colors.accent, fontSize: 12, fontWeight: '800' },
  remove: { color: colors.danger, fontSize: 12, fontWeight: '800' },
  recordTitle: { color: colors.text, fontSize: 17, fontWeight: '800' },
  recordBody: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  verified: { color: colors.accent, fontSize: 12, fontWeight: '700' },
});

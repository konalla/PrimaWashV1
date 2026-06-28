import { Linking, Platform } from 'react-native';

export interface Coordinates {
  readonly latitude: number;
  readonly longitude: number;
}

export const manualServiceAreas = [
  { label: 'Central Singapore', latitude: 1.29027, longitude: 103.851959 },
  { label: 'Harbourfront', latitude: 1.26442, longitude: 103.82228 },
  { label: 'Orchard', latitude: 1.30483, longitude: 103.83183 },
] as const;

export function distanceKilometers(from: Coordinates, to: Coordinates): number {
  const earthRadiusKm = 6371;
  const latitudeDelta = degreesToRadians(to.latitude - from.latitude);
  const longitudeDelta = degreesToRadians(to.longitude - from.longitude);
  const fromLatitude = degreesToRadians(from.latitude);
  const toLatitude = degreesToRadians(to.latitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(fromLatitude) * Math.cos(toLatitude) * Math.sin(longitudeDelta / 2) ** 2;

  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

export async function openDirections(destination: Coordinates, label: string): Promise<void> {
  const encodedLabel = encodeURIComponent(label);
  const coordinates = `${destination.latitude},${destination.longitude}`;
  const url =
    Platform.OS === 'ios'
      ? `http://maps.apple.com/?daddr=${coordinates}&q=${encodedLabel}`
      : `https://www.google.com/maps/dir/?api=1&destination=${coordinates}&travelmode=driving&dir_action=navigate`;

  await Linking.openURL(url);
}

function degreesToRadians(value: number): number {
  return value * (Math.PI / 180);
}

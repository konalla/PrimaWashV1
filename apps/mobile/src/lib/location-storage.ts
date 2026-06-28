import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

export interface SavedServiceArea {
  readonly label: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly source: 'device' | 'manual';
}

const serviceAreaKey = 'prima-wash.service-area';

export async function readStoredServiceArea(): Promise<SavedServiceArea | undefined> {
  const value =
    Platform.OS === 'web'
      ? globalThis.localStorage?.getItem(serviceAreaKey)
      : await SecureStore.getItemAsync(serviceAreaKey);

  if (!value) return undefined;

  try {
    return JSON.parse(value) as SavedServiceArea;
  } catch {
    await clearStoredServiceArea();
    return undefined;
  }
}

export async function writeStoredServiceArea(area: SavedServiceArea): Promise<void> {
  const value = JSON.stringify(area);

  if (Platform.OS === 'web') {
    globalThis.localStorage?.setItem(serviceAreaKey, value);
    return;
  }

  await SecureStore.setItemAsync(serviceAreaKey, value, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export async function clearStoredServiceArea(): Promise<void> {
  if (Platform.OS === 'web') {
    globalThis.localStorage?.removeItem(serviceAreaKey);
    return;
  }

  await SecureStore.deleteItemAsync(serviceAreaKey);
}

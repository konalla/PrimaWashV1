import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const sessionKey = 'prima-wash.auth-session';

export async function readStoredSession(): Promise<string | null> {
  if (Platform.OS === 'web') {
    return globalThis.localStorage?.getItem(sessionKey) ?? null;
  }

  return SecureStore.getItemAsync(sessionKey);
}

export async function writeStoredSession(value: string): Promise<void> {
  if (Platform.OS === 'web') {
    globalThis.localStorage?.setItem(sessionKey, value);
    return;
  }

  await SecureStore.setItemAsync(sessionKey, value, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export async function clearStoredSession(): Promise<void> {
  if (Platform.OS === 'web') {
    globalThis.localStorage?.removeItem(sessionKey);
    return;
  }

  await SecureStore.deleteItemAsync(sessionKey);
}

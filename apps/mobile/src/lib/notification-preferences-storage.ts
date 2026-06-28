import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const preferencesKey = 'prima-wash.notification-preferences';

export interface NotificationPreferences {
  readonly bookingUpdates: boolean;
  readonly appointmentReminders: boolean;
  readonly partnerUpdates: boolean;
  readonly offers: boolean;
  readonly emailReceipts: boolean;
}

export const defaultNotificationPreferences: NotificationPreferences = {
  bookingUpdates: true,
  appointmentReminders: true,
  partnerUpdates: true,
  offers: false,
  emailReceipts: true,
};

export async function readNotificationPreferences(): Promise<NotificationPreferences> {
  const raw = Platform.OS === 'web'
    ? globalThis.localStorage?.getItem(preferencesKey)
    : await SecureStore.getItemAsync(preferencesKey);

  if (!raw) {
    return defaultNotificationPreferences;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<NotificationPreferences>;

    return {
      ...defaultNotificationPreferences,
      ...parsed,
    };
  } catch {
    return defaultNotificationPreferences;
  }
}

export async function writeNotificationPreferences(preferences: NotificationPreferences): Promise<void> {
  const value = JSON.stringify(preferences);

  if (Platform.OS === 'web') {
    globalThis.localStorage?.setItem(preferencesKey, value);
    return;
  }

  await SecureStore.setItemAsync(preferencesKey, value, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

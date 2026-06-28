import type { Booking } from '@prima-wash/contracts';
import { createContext, type PropsWithChildren, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import {
  defaultNotificationPreferences,
  type NotificationPreferences,
  readNotificationPreferences,
  writeNotificationPreferences,
} from '@/lib/notification-preferences-storage';
import {
  cancelScheduledBookingNotifications,
  configureNotificationPresentation,
  getNotificationPermissionState,
  type BookingNotificationScheduleResult,
  requestNotificationPermission,
  scheduleBookingNotifications,
  supportsLocalNotifications,
} from '@/lib/notifications';

type NotificationPreferenceKey = keyof NotificationPreferences;

interface NotificationContextValue {
  readonly preferences: NotificationPreferences;
  readonly loading: boolean;
  readonly supported: boolean;
  readonly permission: BookingNotificationScheduleResult['permission'];
  readonly lastScheduleResult?: BookingNotificationScheduleResult;
  setPreference(key: NotificationPreferenceKey, value: boolean): Promise<void>;
  refreshPermission(): Promise<void>;
  requestPermission(): Promise<BookingNotificationScheduleResult['permission']>;
  scheduleForBooking(input: {
    readonly booking: Booking;
    readonly partnerName?: string;
    readonly serviceName: string;
  }): Promise<BookingNotificationScheduleResult>;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

export function NotificationProvider({ children }: PropsWithChildren) {
  const [preferences, setPreferences] = useState<NotificationPreferences>(defaultNotificationPreferences);
  const [loading, setLoading] = useState(true);
  const [permission, setPermission] = useState<BookingNotificationScheduleResult['permission']>('undetermined');
  const [lastScheduleResult, setLastScheduleResult] = useState<BookingNotificationScheduleResult>();
  const supported = supportsLocalNotifications();

  useEffect(() => {
    let alive = true;

    configureNotificationPresentation();

    async function restore() {
      const [storedPreferences, nextPermission] = await Promise.all([
        readNotificationPreferences(),
        getNotificationPermissionState(),
      ]);

      if (!alive) {
        return;
      }

      setPreferences(storedPreferences);
      setPermission(nextPermission);
      setLoading(false);
    }

    void restore();

    return () => {
      alive = false;
    };
  }, []);

  const refreshPermission = useCallback(async () => {
    setPermission(await getNotificationPermissionState());
  }, []);

  const requestPermission = useCallback(async () => {
    const nextPermission = await requestNotificationPermission();
    setPermission(nextPermission);
    return nextPermission;
  }, []);

  const setPreference = useCallback(
    async (key: NotificationPreferenceKey, value: boolean) => {
      const next = { ...preferences, [key]: value };
      setPreferences(next);
      await writeNotificationPreferences(next);

      if (value && ['bookingUpdates', 'appointmentReminders', 'partnerUpdates', 'offers'].includes(key)) {
        await requestPermission();
      }

      if (!value && key === 'appointmentReminders') {
        await cancelScheduledBookingNotifications('appointmentReminders');
      }

      if (!value && key === 'bookingUpdates') {
        await cancelScheduledBookingNotifications('bookingUpdates');
      }
    },
    [preferences, requestPermission],
  );

  const scheduleForBooking = useCallback(
    async ({
      booking,
      partnerName,
      serviceName,
    }: {
      readonly booking: Booking;
      readonly partnerName?: string;
      readonly serviceName: string;
    }) => {
      const result = await scheduleBookingNotifications({
        booking,
        partnerName,
        serviceName,
        preferences,
      });

      setPermission(result.permission);
      setLastScheduleResult(result);

      return result;
    },
    [preferences],
  );

  const value = useMemo<NotificationContextValue>(
    () => ({
      preferences,
      loading,
      supported,
      permission,
      lastScheduleResult,
      setPreference,
      refreshPermission,
      requestPermission,
      scheduleForBooking,
    }),
    [
      preferences,
      loading,
      supported,
      permission,
      lastScheduleResult,
      setPreference,
      refreshPermission,
      requestPermission,
      scheduleForBooking,
    ],
  );

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

export function useNotifications() {
  const context = useContext(NotificationContext);

  if (!context) {
    throw new Error('useNotifications must be used inside NotificationProvider');
  }

  return context;
}

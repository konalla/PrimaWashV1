import type { Booking } from '@prima-wash/contracts';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import type { NotificationPreferences } from '@/lib/notification-preferences-storage';

const notificationPrefix = 'prima-wash';
const confirmationPrefix = `${notificationPrefix}-booking-confirmation`;
const reminderPrefix = `${notificationPrefix}-booking-reminder`;
const androidChannelId = 'booking-reminders';

let handlerConfigured = false;

export interface BookingReminderInput {
  readonly booking: Booking;
  readonly partnerName?: string;
  readonly serviceName: string;
  readonly preferences: NotificationPreferences;
}

export interface BookingNotificationScheduleResult {
  readonly supported: boolean;
  readonly permission: 'granted' | 'denied' | 'undetermined';
  readonly confirmationId?: string;
  readonly reminderId?: string;
  readonly reminderAt?: string;
  readonly message: string;
}

export function supportsLocalNotifications() {
  return Platform.OS !== 'web';
}

export function configureNotificationPresentation() {
  if (handlerConfigured || !supportsLocalNotifications()) {
    return;
  }

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: false,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });

  handlerConfigured = true;
}

export async function getNotificationPermissionState(): Promise<BookingNotificationScheduleResult['permission']> {
  if (!supportsLocalNotifications()) {
    return 'denied';
  }

  try {
    const permission = await Notifications.getPermissionsAsync();

    if (permission.granted) {
      return 'granted';
    }

    return permission.canAskAgain ? 'undetermined' : 'denied';
  } catch {
    return 'denied';
  }
}

export async function requestNotificationPermission(): Promise<BookingNotificationScheduleResult['permission']> {
  if (!supportsLocalNotifications()) {
    return 'denied';
  }

  try {
    const permission = await Notifications.requestPermissionsAsync();

    return permission.granted ? 'granted' : permission.canAskAgain ? 'undetermined' : 'denied';
  } catch {
    return 'denied';
  }
}

export async function scheduleBookingNotifications({
  booking,
  partnerName,
  serviceName,
  preferences,
}: BookingReminderInput): Promise<BookingNotificationScheduleResult> {
  if (!supportsLocalNotifications()) {
    return {
      supported: false,
      permission: 'denied',
      message: 'Local reminders are available on iOS and Android builds. Web preview cannot schedule device notifications.',
    };
  }

  configureNotificationPresentation();
  await ensureAndroidChannel();

  let permission = await getNotificationPermissionState();
  if (permission !== 'granted' && (preferences.bookingUpdates || preferences.appointmentReminders || preferences.partnerUpdates)) {
    permission = await requestNotificationPermission();
  }

  if (permission !== 'granted') {
    return {
      supported: true,
      permission,
      message: 'Booking created. Reminders are off until notification permission is allowed.',
    };
  }

  const confirmationId = preferences.bookingUpdates
    ? await scheduleConfirmation({ booking, partnerName, serviceName })
    : undefined;
  const reminder = preferences.appointmentReminders
    ? await scheduleAppointmentReminder({ booking, partnerName, serviceName })
    : undefined;

  if (confirmationId && reminder) {
    return {
      supported: true,
      permission,
      confirmationId,
      reminderId: reminder.id,
      reminderAt: reminder.at.toISOString(),
      message: `Confirmation sent. Appointment reminder scheduled for ${formatReminderTime(reminder.at)}.`,
    };
  }

  if (confirmationId) {
    return {
      supported: true,
      permission,
      confirmationId,
      message: 'Confirmation sent. Appointment reminder was skipped because the appointment is too soon or reminders are off.',
    };
  }

  if (reminder) {
    return {
      supported: true,
      permission,
      reminderId: reminder.id,
      reminderAt: reminder.at.toISOString(),
      message: `Appointment reminder scheduled for ${formatReminderTime(reminder.at)}.`,
    };
  }

  return {
    supported: true,
    permission,
    message: 'Booking created. Notification preferences are off for this booking.',
  };
}

export async function cancelScheduledBookingNotifications(kind: 'bookingUpdates' | 'appointmentReminders' | 'all') {
  if (!supportsLocalNotifications()) {
    return;
  }

  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const prefixes = {
    bookingUpdates: [confirmationPrefix],
    appointmentReminders: [reminderPrefix],
    all: [confirmationPrefix, reminderPrefix],
  }[kind];

  await Promise.all(
    scheduled
      .filter((notification) => prefixes.some((prefix) => notification.identifier.startsWith(prefix)))
      .map((notification) => Notifications.cancelScheduledNotificationAsync(notification.identifier)),
  );
}

async function ensureAndroidChannel() {
  if (Platform.OS !== 'android') {
    return;
  }

  await Notifications.setNotificationChannelAsync(androidChannelId, {
    name: 'Booking reminders',
    importance: Notifications.AndroidImportance.DEFAULT,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#66F5A0',
  });
}

async function scheduleConfirmation({
  booking,
  partnerName,
  serviceName,
}: Omit<BookingReminderInput, 'preferences'>): Promise<string> {
  return Notifications.scheduleNotificationAsync({
    identifier: `${confirmationPrefix}-${booking.id}`,
    content: {
      title: 'Prima Wash booking confirmed',
      body: `${serviceName} at ${partnerName ?? 'your selected partner'} is secured.`,
      data: { bookingId: booking.id, type: 'booking_confirmation' },
    },
    trigger: Platform.OS === 'android' ? { channelId: androidChannelId } : null,
  });
}

async function scheduleAppointmentReminder({
  booking,
  partnerName,
  serviceName,
}: Omit<BookingReminderInput, 'preferences'>): Promise<{ readonly id: string; readonly at: Date } | undefined> {
  const reminderAt = getReminderDate(booking.scheduledStartAt);

  if (!reminderAt) {
    return undefined;
  }

  const id = await Notifications.scheduleNotificationAsync({
    identifier: `${reminderPrefix}-${booking.id}`,
    content: {
      title: 'Vehicle care starts soon',
      body: `${serviceName} at ${partnerName ?? 'your selected partner'} is coming up.`,
      data: { bookingId: booking.id, type: 'appointment_reminder' },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: reminderAt,
      ...(Platform.OS === 'android' ? { channelId: androidChannelId } : {}),
    },
  });

  return { id, at: reminderAt };
}

function getReminderDate(scheduledStartAt: string) {
  const start = new Date(scheduledStartAt).getTime();
  const now = Date.now();

  if (!Number.isFinite(start) || start <= now) {
    return undefined;
  }

  const twoHoursBefore = start - 2 * 60 * 60 * 1000;
  if (twoHoursBefore > now + 60 * 1000) {
    return new Date(twoHoursBefore);
  }

  const fifteenMinutesBefore = start - 15 * 60 * 1000;
  if (fifteenMinutesBefore > now + 60 * 1000) {
    return new Date(fifteenMinutesBefore);
  }

  return undefined;
}

function formatReminderTime(date: Date) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

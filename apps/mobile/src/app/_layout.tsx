import { DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { colors } from '@/constants/design';
import { AuthProvider, useAuth } from '@/context/auth-context';
import { BookingProvider } from '@/context/booking-context';
import { LocationProvider } from '@/context/location-context';
import { NotificationProvider } from '@/context/notification-context';

const primaTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: colors.canvas,
    card: colors.canvas,
    border: colors.border,
    primary: colors.accent,
    text: colors.text,
  },
};

export default function RootLayout() {
  return (
    <ThemeProvider value={primaTheme}>
      <AuthProvider>
        <LocationProvider>
          <NotificationProvider>
            <BookingProvider>
              <StatusBar style="dark" />
              <Navigation />
            </BookingProvider>
          </NotificationProvider>
        </LocationProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

function Navigation() {
  const { loading, session } = useAuth();

  if (loading) {
    return null;
  }

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.canvas } }}>
      <Stack.Protected guard={!session}>
        <Stack.Screen name="auth/login" />
        <Stack.Screen name="auth/verify" />
      </Stack.Protected>
      <Stack.Protected guard={Boolean(session)}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="booking/service" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="booking/time" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="booking/review" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="booking/confirmed" options={{ animation: 'fade' }} />
        <Stack.Screen name="booking/detail" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="condo/prima-wash-days" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="garage/vehicle" options={{ animation: 'slide_from_bottom', presentation: 'modal' }} />
        <Stack.Screen name="profile/payment-methods" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="profile/notifications" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="profile/help" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="profile/privacy" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="profile/residence" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="partners/index" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="partners/detail" options={{ animation: 'slide_from_right' }} />
      </Stack.Protected>
    </Stack>
  );
}

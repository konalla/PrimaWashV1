import { Tabs } from 'expo-router';
import { type ColorValue, Text } from 'react-native';

import { colors } from '@/constants/design';

function TabGlyph({ glyph, color }: { readonly glyph: string; readonly color: ColorValue }) {
  return <Text style={{ color, fontSize: 20, fontWeight: '700' }}>{glyph}</Text>;
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.subtle,
        tabBarStyle: {
          height: 76,
          paddingTop: 8,
          paddingBottom: 10,
          borderTopColor: colors.border,
          backgroundColor: colors.canvasRaised,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700' },
      }}>
      <Tabs.Screen name="home" options={{ title: 'Home', tabBarIcon: ({ color }) => <TabGlyph color={color} glyph="⌂" /> }} />
      <Tabs.Screen name="bookings" options={{ title: 'Bookings', tabBarIcon: ({ color }) => <TabGlyph color={color} glyph="◷" /> }} />
      <Tabs.Screen name="garage" options={{ title: 'Garage', tabBarIcon: ({ color }) => <TabGlyph color={color} glyph="◇" /> }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: ({ color }) => <TabGlyph color={color} glyph="○" /> }} />
    </Tabs>
  );
}

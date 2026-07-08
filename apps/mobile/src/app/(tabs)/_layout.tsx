import { Tabs } from 'expo-router';
import { type ColorValue, Text, View } from 'react-native';

import { colors } from '@/constants/design';

function TabGlyph({ glyph, color, focused }: { readonly glyph: string; readonly color: ColorValue; readonly focused: boolean }) {
  return (
    <View
      style={{
        width: 42,
        height: 30,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 999,
        backgroundColor: focused ? colors.surfaceStrong : 'transparent',
      }}>
      <Text style={{ color, fontSize: 15, fontWeight: '900' }}>{glyph}</Text>
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.subtle,
        tabBarStyle: {
          position: 'absolute',
          right: 18,
          bottom: 18,
          left: 18,
          height: 72,
          paddingTop: 9,
          paddingBottom: 10,
          borderWidth: 1,
          borderTopWidth: 1,
          borderColor: colors.border,
          borderRadius: 26,
          backgroundColor: colors.canvasRaised,
          shadowColor: colors.black,
          shadowOpacity: 0.12,
          shadowRadius: 20,
          shadowOffset: { width: 0, height: 10 },
          elevation: 8,
        },
        tabBarLabelStyle: { fontSize: 10, fontWeight: '900' },
      }}>
      <Tabs.Screen name="home" options={{ title: 'Home', tabBarIcon: ({ color, focused }) => <TabGlyph color={color} focused={focused} glyph="H" /> }} />
      <Tabs.Screen name="bookings" options={{ title: 'Bookings', tabBarIcon: ({ color, focused }) => <TabGlyph color={color} focused={focused} glyph="B" /> }} />
      <Tabs.Screen name="garage" options={{ title: 'Garage', tabBarIcon: ({ color, focused }) => <TabGlyph color={color} focused={focused} glyph="G" /> }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: ({ color, focused }) => <TabGlyph color={color} focused={focused} glyph="P" /> }} />
    </Tabs>
  );
}

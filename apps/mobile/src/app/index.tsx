import { Redirect } from 'expo-router';

import { useAuth } from '@/context/auth-context';

export default function IndexScreen() {
  const { session } = useAuth();
  return <Redirect href={session ? '/(tabs)/home' : '/auth/login'} />;
}

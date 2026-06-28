import * as Location from 'expo-location';
import { createContext, type PropsWithChildren, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import type { SavedServiceArea } from '@/lib/location-storage';
import { clearStoredServiceArea, readStoredServiceArea, writeStoredServiceArea } from '@/lib/location-storage';

type LocationState = 'restoring' | 'idle' | 'requesting' | 'ready' | 'denied' | 'unavailable';

interface LocationContextValue {
  readonly area?: SavedServiceArea;
  readonly error?: string;
  readonly state: LocationState;
  requestCurrentLocation(): Promise<void>;
  selectManualArea(area: Omit<SavedServiceArea, 'source'>): Promise<void>;
  clearArea(): Promise<void>;
}

const LocationContext = createContext<LocationContextValue | null>(null);

export function LocationProvider({ children }: PropsWithChildren) {
  const [area, setArea] = useState<SavedServiceArea>();
  const [state, setState] = useState<LocationState>('restoring');
  const [error, setError] = useState<string>();

  useEffect(() => {
    void readStoredServiceArea().then((stored) => {
      setArea(stored);
      setState(stored ? 'ready' : 'idle');
    });
  }, []);

  const requestCurrentLocation = useCallback(async () => {
    setState('requesting');
    setError(undefined);

    try {
      const servicesEnabled = await Location.hasServicesEnabledAsync();
      if (!servicesEnabled) {
        setState('unavailable');
        setError('Location services are switched off. Enable them or choose an area manually.');
        return;
      }

      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        setState('denied');
        setError('Location permission was not granted. You can still choose an area manually.');
        return;
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const nextArea: SavedServiceArea = {
        label: 'Current location',
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        source: 'device',
      };
      setArea(nextArea);
      setState('ready');
      await writeStoredServiceArea(nextArea);
    } catch (caught) {
      setState('unavailable');
      setError(caught instanceof Error ? caught.message : 'Your location could not be determined.');
    }
  }, []);

  const selectManualArea = useCallback(async (next: Omit<SavedServiceArea, 'source'>) => {
    const nextArea: SavedServiceArea = { ...next, source: 'manual' };
    setArea(nextArea);
    setError(undefined);
    setState('ready');
    await writeStoredServiceArea(nextArea);
  }, []);

  const clearArea = useCallback(async () => {
    setArea(undefined);
    setError(undefined);
    setState('idle');
    await clearStoredServiceArea();
  }, []);

  const value = useMemo(
    () => ({ area, state, error, requestCurrentLocation, selectManualArea, clearArea }),
    [area, clearArea, error, requestCurrentLocation, selectManualArea, state],
  );

  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>;
}

export function useLocationPreference() {
  const context = useContext(LocationContext);
  if (!context) throw new Error('useLocationPreference must be used inside LocationProvider');
  return context;
}

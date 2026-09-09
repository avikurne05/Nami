import AsyncStorage from '@react-native-async-storage/async-storage';

export interface UserPreferences {
  // Navigation & Map
  voiceGuidance: boolean;
  autoRecenterMap: boolean;
  keepScreenAwake: boolean;
  distanceUnits: 'km' | 'mi';
  compassMode: 'heading' | 'north';

  // Ride Lifecycle & Automation
  autoResumeActiveRide: boolean;
  shareLiveLocationDefault: boolean;
  autoSaveRideHistory: boolean;

  // Notifications & Safety
  notifyHazardAlerts: boolean;
  notifyGroupUpdates: boolean;
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  voiceGuidance: true,
  autoRecenterMap: true,
  keepScreenAwake: true,
  distanceUnits: 'km',
  compassMode: 'heading',

  autoResumeActiveRide: true,
  shareLiveLocationDefault: true,
  autoSaveRideHistory: true,

  notifyHazardAlerts: true,
  notifyGroupUpdates: true,
};

const STORAGE_KEY = '@nami_user_preferences_v2';
const LEGACY_STORAGE_KEY = '@biker_radar_user_preferences_v2';

type Listener = (prefs: UserPreferences) => void;
const listeners: Set<Listener> = new Set();

export const SettingsService = {
  async getPreferences(): Promise<UserPreferences> {
    try {
      let json = await AsyncStorage.getItem(STORAGE_KEY);
      if (!json) {
        json = await AsyncStorage.getItem(LEGACY_STORAGE_KEY);
      }
      if (json) {
        return { ...DEFAULT_PREFERENCES, ...JSON.parse(json) };
      }
    } catch (e) {
      console.warn('Failed to load user preferences:', e);
    }
    return DEFAULT_PREFERENCES;
  },

  async savePreferences(prefs: Partial<UserPreferences>): Promise<UserPreferences> {
    try {
      const current = await this.getPreferences();
      const updated = { ...current, ...prefs };
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      listeners.forEach((fn) => fn(updated));
      return updated;
    } catch (e) {
      console.warn('Failed to save user preferences:', e);
      return DEFAULT_PREFERENCES;
    }
  },

  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

/**
 * Global Unit Conversion Helpers
 */
export function formatDistance(distanceKm: number, unit: 'km' | 'mi'): string {
  if (isNaN(distanceKm) || distanceKm < 0) distanceKm = 0;
  if (unit === 'mi') {
    const mi = distanceKm * 0.621371;
    return `${mi < 10 ? mi.toFixed(1) : Math.round(mi)} mi`;
  }
  return `${distanceKm < 10 ? distanceKm.toFixed(1) : Math.round(distanceKm)} km`;
}

export function formatSpeed(speedKmH: number, unit: 'km' | 'mi'): string {
  if (isNaN(speedKmH) || speedKmH < 0) speedKmH = 0;
  if (unit === 'mi') {
    const mph = Math.round(speedKmH * 0.621371);
    return `${mph} mph`;
  }
  return `${Math.round(speedKmH)} km/h`;
}

export default SettingsService;

import { useState, useEffect } from 'react';
import SettingsService, { UserPreferences, DEFAULT_PREFERENCES } from '../services/SettingsService';

export function useSettings() {
  const [preferences, setPreferences] = useState<UserPreferences>(DEFAULT_PREFERENCES);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    SettingsService.getPreferences().then((prefs) => {
      if (isMounted) {
        setPreferences(prefs);
        setLoading(false);
      }
    });

    const unsubscribe = SettingsService.subscribe((updated) => {
      if (isMounted) {
        setPreferences(updated);
      }
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  const updatePreference = async <K extends keyof UserPreferences>(
    key: K,
    value: UserPreferences[K]
  ) => {
    const updated = await SettingsService.savePreferences({ [key]: value });
    setPreferences(updated);
  };

  return {
    preferences,
    loading,
    updatePreference,
  };
}

export default useSettings;

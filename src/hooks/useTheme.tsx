import React, { createContext, useContext, useState, useEffect } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DarkColors, LightColors } from '../constants/Colors';

export type ThemeMode = 'light' | 'dark' | 'system';
export type ColorPalette = typeof DarkColors;

interface ThemeContextType {
  themeMode: ThemeMode;
  colors: ColorPalette;
  isDark: boolean;
  setThemeMode: (mode: ThemeMode) => Promise<void>;
}

const THEME_STORAGE_KEY = 'bikerradar_theme_mode';

const ThemeContext = createContext<ThemeContextType>({
  themeMode: 'light',
  colors: LightColors,
  isDark: false,
  setThemeMode: async () => {},
});

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const systemScheme = useColorScheme(); // 'light' | 'dark' | null
  const [themeMode, setThemeModeState] = useState<ThemeMode>('light');

  // Load persisted theme on mount (default to 'light' if not stored)
  useEffect(() => {
    try {
      if (AsyncStorage && typeof AsyncStorage.getItem === 'function') {
        AsyncStorage.getItem(THEME_STORAGE_KEY)
          .then((stored) => {
            if (stored === 'light' || stored === 'dark' || stored === 'system') {
              setThemeModeState(stored);
            } else {
              setThemeModeState('light');
            }
          })
          .catch(() => {});
      }
    } catch (e) {
      // ignore
    }
  }, []);

  const setThemeMode = async (mode: ThemeMode) => {
    setThemeModeState(mode);
    try {
      if (AsyncStorage && typeof AsyncStorage.setItem === 'function') {
        await AsyncStorage.setItem(THEME_STORAGE_KEY, mode);
      }
    } catch (e) {
      console.warn('Failed to persist theme:', e);
    }
  };

  // Resolve actual dark/light based on mode (default is light)
  const isDark =
    themeMode === 'dark' ||
    (themeMode === 'system' && systemScheme === 'dark');

  const colors = isDark ? DarkColors : LightColors;

  return (
    <ThemeContext.Provider value={{ themeMode, colors, isDark, setThemeMode }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
export default ThemeProvider;

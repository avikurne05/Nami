import * as SecureStore from 'expo-secure-store';
import { UserProfile } from '../types';

const USER_PROFILE_KEY = 'nami_secure_user_profile';
const LEGACY_USER_PROFILE_KEY = 'biker_radar_secure_user_profile';
const SESSION_TIMESTAMP_KEY = 'nami_session_timestamp';
const LEGACY_SESSION_TIMESTAMP_KEY = 'biker_radar_session_timestamp';

export const SecureStorageService = {
  /**
   * Securely store user profile in device KeyStore / Keychain
   */
  async saveUserProfile(profile: UserProfile): Promise<void> {
    try {
      const json = JSON.stringify(profile);
      await SecureStore.setItemAsync(USER_PROFILE_KEY, json);
      await SecureStore.setItemAsync(SESSION_TIMESTAMP_KEY, Date.now().toString());
    } catch (error) {
      console.warn('SecureStorageService: Failed to save user profile:', error);
    }
  },

  /**
   * Retrieve securely stored user profile
   */
  async getUserProfile(): Promise<UserProfile | null> {
    try {
      let json = await SecureStore.getItemAsync(USER_PROFILE_KEY);
      if (!json) {
        json = await SecureStore.getItemAsync(LEGACY_USER_PROFILE_KEY);
      }
      if (!json) return null;
      return JSON.parse(json) as UserProfile;
    } catch (error) {
      console.warn('SecureStorageService: Failed to read user profile:', error);
      return null;
    }
  },

  /**
   * Clear all securely stored auth data
   */
  async clearAuthData(): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(USER_PROFILE_KEY).catch(() => {});
      await SecureStore.deleteItemAsync(SESSION_TIMESTAMP_KEY).catch(() => {});
      await SecureStore.deleteItemAsync(LEGACY_USER_PROFILE_KEY).catch(() => {});
      await SecureStore.deleteItemAsync(LEGACY_SESSION_TIMESTAMP_KEY).catch(() => {});
    } catch (error) {
      console.warn('SecureStorageService: Failed to clear auth data:', error);
    }
  },

  /**
   * Generic secure item getter
   */
  async getItem(key: string): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync(key);
    } catch (error) {
      console.warn(`SecureStorageService: Failed to get item ${key}:`, error);
      return null;
    }
  },

  /**
   * Generic secure item setter
   */
  async setItem(key: string, value: string): Promise<void> {
    try {
      await SecureStore.setItemAsync(key, value);
    } catch (error) {
      console.warn(`SecureStorageService: Failed to set item ${key}:`, error);
    }
  },

  /**
   * Generic secure item remover
   */
  async removeItem(key: string): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(key);
    } catch (error) {
      console.warn(`SecureStorageService: Failed to remove item ${key}:`, error);
    }
  },
};

export default SecureStorageService;

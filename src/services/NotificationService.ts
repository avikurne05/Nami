import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// Configure how notifications are handled when the app is in the foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// Set up Android notification channel safely at module load
if (Platform.OS === 'android') {
  Notifications.setNotificationChannelAsync('default', {
    name: 'Nami Alerts',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#3B82F6',
  }).catch((e) => console.warn('Failed to set notification channel (non-fatal):', e));
}

export const NotificationService = {
  /**
   * Request notification permissions only.
   * Push token registration is intentionally skipped in standalone APK builds
   * because getExpoPushTokenAsync() requires an Expo projectId and will crash without it.
   */
  async registerForPushNotifications(): Promise<string | null> {
    if (Platform.OS === 'web') return null;

    try {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        console.warn('Notification permission not granted.');
        return null;
      }

      // NOTE: getExpoPushTokenAsync() requires Constants.expoConfig.extra.eas.projectId
      // which is NOT available in locally-compiled APKs without EAS build.
      // We skip it here to prevent a hard crash. Local notifications still work fine.
      return null;
    } catch (e) {
      console.warn('registerForPushNotifications failed (non-fatal):', e);
      return null;
    }
  },

  /**
   * Trigger a local notification instantly (e.g., when a rider gets too far behind).
   * Wrapped in try-catch so notification errors are never fatal.
   */
  async sendLocalNotification(title: string, body: string): Promise<string> {
    try {
      return await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          sound: true,
          priority: Notifications.AndroidNotificationPriority.HIGH,
        },
        trigger: null, // Send immediately
      });
    } catch (e) {
      console.warn('sendLocalNotification failed (non-fatal):', e);
      return '';
    }
  },
};

export default NotificationService;

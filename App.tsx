import React from 'react';
import LocationService from './src/services/LocationService';
import NotificationService from './src/services/NotificationService';
import { AuthProvider } from './src/hooks/useAuth';
import AppNavigator from './src/navigation/AppNavigator';

export default function App() {
  React.useEffect(() => {
    async function initPermissions() {
      try {
        await LocationService.requestPermissions();
        await NotificationService.registerForPushNotifications();
      } catch (e) {
        console.warn('Failed to initialize app permissions:', e);
      }
    }
    initPermissions();
  }, []);

  return (
    <AuthProvider>
      <AppNavigator />
    </AuthProvider>
  );
}

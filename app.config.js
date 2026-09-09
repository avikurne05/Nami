import 'dotenv/config';

export default {
  expo: {
    name: 'Nami',
    slug: 'bike-radar',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'light',
    ios: {
      supportsTablet: true,
    },
    android: {
      adaptiveIcon: {
        backgroundColor: '#E6F4FE',
        foregroundImage: './assets/android-icon-foreground.png',
        backgroundImage: './assets/android-icon-background.png',
        monochromeImage: './assets/android-icon-monochrome.png',
      },
      predictiveBackGestureEnabled: false,
      package: 'com.avinash.bikerradar',
      config: {
        googleMaps: {
          apiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '',
        },
      },
      permissions: [
        'ACCESS_FINE_LOCATION',
        'ACCESS_COARSE_LOCATION',
        'FOREGROUND_SERVICE',
        'POST_NOTIFICATIONS',
        'VIBRATE',
      ],
    },
    plugins: [
      [
        'expo-location',
        {
          'locationAlwaysAndWhenInUsePermission': 'Allow Nami to access your location to track your squad distance.',
          isAndroidForegroundServiceEnabled: true,
        },
      ],
      'expo-secure-store',
    ],
    web: {
      favicon: './assets/favicon.png',
    },
    extra: {
      eas: {
        projectId: '7a40b7f4-238d-4fa4-ba16-acb489f99ae4',
      },
    },
  },
};

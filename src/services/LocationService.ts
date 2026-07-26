import * as Location from 'expo-location';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { RiderLocation } from '../types';
import * as Battery from 'expo-battery';

export const BACKGROUND_LOCATION_TASK = 'BACKGROUND_LOCATION_TASK';

export const LocationService = {
  /**
   * Request foreground location permission.
   */
  async requestPermissions(): Promise<boolean> {
    try {
      const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
      if (foregroundStatus !== 'granted') {
        console.warn('Foreground location permission denied');
        return false;
      }
      return true;
    } catch (e) {
      console.warn('Error requesting location permissions:', e);
      return false;
    }
  },

  /**
   * Get current one-time location
   */
  async getCurrentLocation(): Promise<Location.LocationObject | null> {
    try {
      return await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
    } catch (e) {
      console.warn('getCurrentLocation failed:', e);
      return null;
    }
  },

  /**
   * Reverse geocode latitude and longitude to city name
   */
  async getCityName(latitude: number, longitude: number): Promise<string | null> {
    try {
      const places = await Location.reverseGeocodeAsync({ latitude, longitude });
      if (places && places.length > 0) {
        const p = places[0];
        return p.city || p.subregion || p.district || p.region || null;
      }
    } catch (e) {
      console.warn('reverseGeocodeAsync failed:', e);
    }
    return null;
  },

  /**
   * Watch location in the foreground
   */
  watchForegroundLocation(callback: (location: Location.LocationObject) => void) {
    return Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.High,
        timeInterval: 1000,
        distanceInterval: 1,
      },
      callback
    );
  },

  /**
   * Safe no-op for background tracking
   */
  async startBackgroundTracking(): Promise<void> {
    return;
  },

  /**
   * Safe no-op for stopping background tracking
   */
  async stopBackgroundTracking(): Promise<void> {
    return;
  },

  /**
   * Upload location details to Firestore
   */
  async uploadLocation(
    rideId: string,
    userId: string,
    userName: string,
    location: Location.LocationObject,
    networkStatus: 'online' | 'offline' = 'online',
    riderStatus?: 'riding' | 'stopped' | 'break' | 'sos'
  ): Promise<void> {
    if (!rideId || !userId || !location?.coords) return;
    const { latitude, longitude, heading, speed } = location.coords;
    const currentSpeed = speed ? Math.round(speed * 3.6) : 0;
    const autoStatus = riderStatus || (currentSpeed > 3 ? 'riding' : 'stopped');
    
    // Fetch live battery level during location upload cycle
    let liveBattery: number | undefined = undefined;
    try {
      const isAvailable = await Battery.isAvailableAsync();
      if (isAvailable) {
        const level = await Battery.getBatteryLevelAsync();
        if (typeof level === 'number' && level >= 0 && level <= 1) {
          liveBattery = Math.round(level * 100);
        }
      }
    } catch (e) {
      liveBattery = undefined;
    }
    
    const locationData: any = {
      userId,
      userName,
      latitude,
      longitude,
      speed: currentSpeed,
      heading: heading || 0,
      timestamp: (location.timestamp && location.timestamp > 0) ? location.timestamp : Date.now(),
      network: networkStatus,
      riderStatus: autoStatus,
    };

    if (typeof liveBattery === 'number') {
      locationData.battery = liveBattery;
    }

    const locationRef = doc(db, 'rides', rideId, 'locations', userId);
    await setDoc(locationRef, locationData, { merge: true });
  },

  /**
   * Broadcasts an emergency SOS status to Firestore with automatic retries.
   */
  async broadcastEmergencySOS(
    rideId: string,
    userId: string,
    userName: string
  ): Promise<boolean> {
    if (!rideId || !userId) return false;

    let lastError: any = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const locationObj = await this.getCurrentLocation();
        const currentLoc = locationObj
          ? locationObj
          : ({ coords: { latitude: 0, longitude: 0, heading: 0, speed: 0, accuracy: 0, altitude: null, altitudeAccuracy: null }, timestamp: Date.now() } as any);

        await this.uploadLocation(rideId, userId, userName, currentLoc, 'online', 'sos');

        // Also record in ride document emergency alert list
        const rideRef = doc(db, 'rides', rideId);
        await setDoc(
          rideRef,
          {
            lastEmergencyAt: Date.now(),
            lastEmergencyUser: userName,
          },
          { merge: true }
        );

        return true;
      } catch (e) {
        lastError = e;
        console.warn(`SOS broadcast attempt ${attempt} failed:`, e);
        await new Promise((resolve) => setTimeout(resolve, 800));
      }
    }
    throw lastError || new Error('Failed to broadcast Emergency SOS. Please check your network connection.');
  },
};

export default LocationService;

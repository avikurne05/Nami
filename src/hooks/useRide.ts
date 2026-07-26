import { useState, useEffect } from 'react';
import { collection, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import RideService from '../services/RideService';
import LocationService from '../services/LocationService';
import NavigationService, { RouteMetrics } from '../services/NavigationService';
import NotificationService from '../services/NotificationService';
import { RideSession, RiderLocation, UserProfile, BroadcastMessage } from '../types';
import { haversineDistance } from '../utils';

import HazardService, { HazardReport } from '../services/HazardService';

export function useRide(rideId: string, currentUser: UserProfile | null) {
  const [ride, setRide] = useState<RideSession | null>(null);
  const [locations, setLocations] = useState<{ [userId: string]: RiderLocation }>({});
  const [hazards, setHazards] = useState<HazardReport[]>([]);
  const [route, setRoute] = useState<RouteMetrics | null>(null);
  const [metrics, setMetrics] = useState({
    distanceRemaining: 0, // meters
    durationRemaining: 0, // seconds
    currentSpeed: 0, // km/h
  });
  const [safetyStatus, setSafetyStatus] = useState<'SAFE' | 'WARNING' | 'CRITICAL'>('SAFE');
  const [safetyAlert, setSafetyAlert] = useState<string | null>(null);
  const [sosAlert, setSosAlert] = useState<{ userName: string; link: string } | null>(null);
  const [broadcastAlert, setBroadcastAlert] = useState<BroadcastMessage | null>(null);

  // Subscribe to Ride Document updates
  useEffect(() => {
    if (!rideId) return;

    const unsubscribe = RideService.subscribeToRide(rideId, (rideData) => {
      setRide(rideData);
    });

    return unsubscribe;
  }, [rideId]);

  // Subscribe to Location subcollection updates (robust sync logic)
  useEffect(() => {
    if (!rideId) return;

    const locationsRef = collection(db, 'rides', rideId, 'locations');
    const unsubscribe = onSnapshot(locationsRef, (snapshot) => {
      const newLocations: { [userId: string]: RiderLocation } = {};
      const now = Date.now();
      snapshot.forEach((docSnap) => {
        const loc = docSnap.data() as RiderLocation;
        if (
          loc &&
          loc.userId &&
          loc.latitude != null &&
          loc.longitude != null &&
          !isNaN(loc.latitude) &&
          !isNaN(loc.longitude)
        ) {
          const ts = loc.timestamp && loc.timestamp > 0 ? loc.timestamp : now;
          // Keep active riders (seen within last 15 minutes) or online riders
          if (loc.network !== 'offline' || Math.abs(now - ts) < 900000) {
            newLocations[loc.userId] = {
              ...loc,
              timestamp: ts,
            };
          }
        }
      });
      setLocations(newLocations);
    });

    return unsubscribe;
  }, [rideId]);

  // Subscribe to Emergency/SOS subcollection updates
  useEffect(() => {
    if (!rideId) return;

    const sosRef = collection(db, 'rides', rideId, 'emergencies');
    const unsubscribe = onSnapshot(sosRef, (snapshot) => {
      if (snapshot.empty) return;
      
      // Get the latest SOS
      const docList = snapshot.docs.map((d) => d.data());
      docList.sort((a, b) => b.timestamp - a.timestamp);
      const latestSos = docList[0];
      
      // Avoid showing alert if it is older than 5 minutes
      if (Date.now() - latestSos.timestamp < 300000) {
        setSosAlert({
          userName: latestSos.userName,
          link: latestSos.googleMapsLink,
        });
      }
    });

    return unsubscribe;
  }, [rideId]);

  // Track current user location, upload it, and update metrics
  // Start tracking as soon as ride is 'created' OR 'active' so GPS uploads
  // begin immediately when RideScreen mounts (avoids crash window between
  // navigation.replace() and Firestore status becoming 'active').
  useEffect(() => {
    if (!rideId || !currentUser || !ride || (ride.status !== 'active' && ride.status !== 'lobby')) return;

    let locationSubscription: any;
    let isMounted = true;

    const startTracking = async () => {
      try {
        // 1. Start foreground tracking
        locationSubscription = await LocationService.watchForegroundLocation((loc) => {
          if (!isMounted) return;
          LocationService.uploadLocation(
            rideId,
            currentUser.uid,
            currentUser.name,
            loc,
            'online'
          ).catch((e) => console.warn('Location upload failed:', e));

          // Update local speed metric
          setMetrics((prev) => ({
            ...prev,
            currentSpeed: loc.coords.speed ? Math.round(loc.coords.speed * 3.6) : 0,
          }));
        });

        // 2. Start background tracking
        try {
          await LocationService.startBackgroundTracking();
        } catch (e) {
          console.warn('Failed to start background location tracking:', e);
        }
      } catch (e) {
        console.warn('startTracking failed:', e);
      }
    };

    startTracking();

    return () => {
      isMounted = false;
      if (locationSubscription && typeof locationSubscription.remove === 'function') {
        try {
          locationSubscription.remove();
        } catch (e) {
          // ignore
        }
      }
    };
  }, [rideId, currentUser?.uid, ride?.status]);

  // Update Route Polyline and metrics from NavigationService
  useEffect(() => {
    if (!rideId || !currentUser || !ride) return;

    const updateRoute = async () => {
      let startLat = locations[currentUser.uid]?.latitude;
      let startLon = locations[currentUser.uid]?.longitude;

      // Fallback 1: Get current device location directly if not in locations state yet
      if (!startLat || !startLon) {
        try {
          const devLoc = await LocationService.getCurrentLocation();
          if (devLoc) {
            startLat = devLoc.coords.latitude;
            startLon = devLoc.coords.longitude;
          }
        } catch (e) {
          // ignore
        }
      }

      // Fallback 2: Use ride startLocation
      if (!startLat || !startLon) {
        if (ride.startLocation) {
          startLat = ride.startLocation.latitude;
          startLon = ride.startLocation.longitude;
        }
      }

      if (!startLat || !startLon) return;

      if (!ride.destination || ride.destination.latitude == null || ride.destination.longitude == null) return;

      const start = { latitude: startLat, longitude: startLon };
      const end = {
        latitude: ride.destination.latitude,
        longitude: ride.destination.longitude,
      };

      try {
        const routeData = await NavigationService.getRoute(start, end);
        setRoute(routeData);
        setMetrics((prev) => ({
          ...prev,
          distanceRemaining: routeData.distance,
          durationRemaining: routeData.duration,
        }));
      } catch (err) {
        console.error('Failed to update route:', err);
      }
    };

    // Trigger route update immediately
    updateRoute();

    const interval = setInterval(updateRoute, 15000); // Recalculate route every 15 seconds
    return () => clearInterval(interval);
  }, [rideId, currentUser?.uid, ride?.id, ride?.destination?.latitude, ride?.destination?.longitude, !!locations[currentUser?.uid || '']]);

  // Distance & Safety Monitoring
  useEffect(() => {
    if (!ride || ride.status !== 'active' || !currentUser) return;

    const leaderId = ride.leaderId;
    const leaderLoc = locations[leaderId];
    if (!leaderLoc) return;

    let overallStatus: 'SAFE' | 'WARNING' | 'CRITICAL' = 'SAFE';
    let worstAlert: string | null = null;

    // Check each rider against the leader
    for (const rider of Object.values(locations)) {
      if (rider.userId === leaderId) continue; // Skip leader

      const dist = haversineDistance(
        leaderLoc.latitude,
        leaderLoc.longitude,
        rider.latitude,
        rider.longitude
      );

      // Warning states
      if (dist > 1000) {
        overallStatus = 'CRITICAL';
        worstAlert = `${rider.userName} is ${(dist / 1000).toFixed(1)} km behind`;
      } else if (dist > 500 && overallStatus !== 'CRITICAL') {
        overallStatus = 'WARNING';
        worstAlert = `${rider.userName} is ${Math.round(dist)}m behind`;
      }
    }

    if (overallStatus !== safetyStatus) {
      if (overallStatus === 'WARNING' || overallStatus === 'CRITICAL') {
        NotificationService.sendLocalNotification(
          `Ride Alert: ${overallStatus}`,
          worstAlert || 'A rider is falling behind!'
        );
      }
      setSafetyStatus(overallStatus);
    }

    setSafetyAlert(worstAlert);
  }, [locations, ride, currentUser, safetyStatus]);

  /**
   * Triggers an SOS emergency alert, publishing to Firestore.
   */
  const triggerSOS = async () => {
    if (!currentUser || !ride) return false;
    const myLoc = locations[currentUser.uid];
    if (!myLoc) return false;

    const gmapsLink = `https://www.google.com/maps/search/?api=1&query=${myLoc.latitude},${myLoc.longitude}`;
    
    const sosRef = doc(collection(db, 'rides', ride.id, 'emergencies'));
    await setDoc(sosRef, {
      userId: currentUser.uid,
      userName: currentUser.name,
      latitude: myLoc.latitude,
      longitude: myLoc.longitude,
      googleMapsLink: gmapsLink,
      timestamp: Date.now(),
    });

    return true;
  };

  // Subscribe to Broadcasts subcollection updates
  useEffect(() => {
    if (!rideId) return;
    const broadcastsRef = collection(db, 'rides', rideId, 'broadcasts');
    const unsubscribe = onSnapshot(broadcastsRef, (snapshot) => {
      if (snapshot.empty) return;
      const docList = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as BroadcastMessage));
      docList.sort((a, b) => b.timestamp - a.timestamp);
      const latestBroadcast = docList[0];
      if (latestBroadcast && Date.now() - latestBroadcast.timestamp < 180000) {
        setBroadcastAlert(latestBroadcast);
      }
    });
    return unsubscribe;
  }, [rideId]);

  const sendBroadcast = async (type: 'quick' | 'custom', text: string, commandKey?: string) => {
    if (!currentUser || !rideId) return false;
    try {
      const broadcastsRef = collection(db, 'rides', rideId, 'broadcasts');
      const newDocRef = doc(broadcastsRef);
      const msg: BroadcastMessage = {
        id: newDocRef.id,
        senderId: currentUser.uid,
        senderName: currentUser.name,
        type,
        commandKey,
        text,
        timestamp: Date.now(),
      };
      await setDoc(newDocRef, msg);
      return true;
    } catch (e) {
      console.error('Failed to send broadcast:', e);
      return false;
    }
  };

  return {
    ride,
    locations,
    hazards,
    route,
    metrics,
    safetyStatus,
    safetyAlert,
    sosAlert,
    setSosAlert,
    triggerSOS,
    broadcastAlert,
    setBroadcastAlert,
    sendBroadcast,
  };
}
export default useRide;

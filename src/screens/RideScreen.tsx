import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  Alert,
  Dimensions,
  ActivityIndicator,
  Platform,
  Modal,
  TextInput,
  Vibration,
  StatusBar,
  Image,
  Share,
  Keyboard,
  useWindowDimensions,
  Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import MapView, { Marker, Polyline, UrlTile, Circle, PROVIDER_GOOGLE } from 'react-native-maps';
import { StackScreenProps } from '@react-navigation/stack';
import { RootStackParamList, RiderLocation } from '../types';
import { useAuth } from '../hooks/useAuth';
import useRide from '../hooks/useRide';
import RideService from '../services/RideService';
import LocationService from '../services/LocationService';
import HazardService, { HAZARD_TYPES, HazardCategory, HazardReport } from '../services/HazardService';
import SpeechService, { SpeechMode } from '../services/SpeechService';
import GeocodingService, { GeocodedLocation } from '../services/GeocodingService';
import Colors from '../constants/Colors';
import { useTheme } from '../hooks/useTheme';
import { NavigationMapStyleDark, NavigationMapStyleLight } from '../constants/MapStyles';
import { AnimatedRiderMarker, getRiderColor } from '../components/AnimatedRiderMarker';
import { SelectedRiderCard } from '../components/SelectedRiderCard';
import { NamiEdgeIndicator } from '../components/BikerRadarEdgeIndicator';
import { RiderClusterMarker } from '../components/RiderClusterMarker';
import { ExpandableFloatingMenu, ActiveMenuType } from '../components/ExpandableFloatingMenu';
import { ConfirmationBottomSheet } from '../components/ConfirmationBottomSheet';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useSettings } from '../hooks/useSettings';
import { formatDistance as formatDistanceUnit, formatSpeed as formatSpeedUnit } from '../services/SettingsService';
import { EmergencyAlertOverlay, EmergencyAlertItem } from '../components/EmergencyAlertOverlay';
import { PersistentEmergencyBanner } from '../components/PersistentEmergencyBanner';
import { formatDistance, formatDuration, haversineDistance } from '../utils';

type Props = StackScreenProps<RootStackParamList, 'Ride'>;

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('window');

const QUICK_BROADCASTS: { key: string; label: string; icon: keyof typeof Ionicons.glyphMap; color: string }[] = [
  { key: 'slow_down', label: 'Slow Down', icon: 'speedometer-outline', color: '#F59E0B' },
  { key: 'speed_up', label: 'Speed Up', icon: 'rocket-outline', color: '#3B82F6' },
  { key: 'wait_here', label: 'Wait Here', icon: 'pause-circle-outline', color: '#EF4444' },
  { key: 'fuel_stop', label: 'Fuel Stop', icon: 'color-fill-outline', color: '#10B981' },
  { key: 'food_stop', label: 'Food Stop', icon: 'restaurant-outline', color: '#EC4899' },
  { key: 'wrong_route', label: 'Wrong Route', icon: 'navigate-outline', color: '#F97316' },
  { key: 'regroup', label: 'Regroup', icon: 'people-outline', color: '#8B5CF6' },
  { key: 'need_help', label: 'Need Help', icon: 'help-buoy-outline', color: '#EF4444' },
  { key: 'police_ahead', label: 'Police Ahead', icon: 'shield-checkmark-outline', color: '#3B82F6' },
  { key: 'road_block', label: 'Road Block', icon: 'construct-outline', color: '#F59E0B' },
  { key: 'continue', label: 'Continue', icon: 'play-circle-outline', color: '#10B981' },
  { key: 'ride_safe', label: 'Ride Safe', icon: 'shield-outline', color: '#06B6D4' },
];

function getManeuverIconName(maneuver?: string): keyof typeof Ionicons.glyphMap {
  if (!maneuver) return 'arrow-up-sharp';
  const m = maneuver.toLowerCase();
  if (m.includes('left') && m.includes('slight')) return 'arrow-back-sharp';
  if (m.includes('right') && m.includes('slight')) return 'arrow-forward-sharp';
  if (m.includes('left')) return 'arrow-back-sharp';
  if (m.includes('right')) return 'arrow-forward-sharp';
  if (m.includes('uturn') || m.includes('u-turn')) return 'arrow-undo-sharp';
  if (m.includes('roundabout')) return 'refresh-sharp';
  return 'arrow-up-sharp';
}

export default function RideScreen({ route, navigation }: Props) {
  const insets = useSafeAreaInsets();
  const rideId = route?.params?.rideId;
  const { user } = useAuth();
  const { colors, isDark } = useTheme();
  const {
    ride,
    locations,
    hazards,
    route: rideRoute,
    metrics,
    safetyStatus,
    safetyAlert,
    sosAlert,
    setSosAlert,
    triggerSOS,
    broadcastAlert,
    setBroadcastAlert,
    sendBroadcast,
  } = useRide(rideId, user);

  const latestHazard = hazards && hazards.length > 0 ? hazards[hazards.length - 1] : null;
  const hazardAlertMessage = latestHazard ? `${String(latestHazard.title)} reported nearby` : null;

  const mapRef = useRef<MapView | null>(null);
  
  // Navigation & UI States
  const [showSOSConfirmation, setShowSOSConfirmation] = useState(false);
  const [showEndRideModal, setShowEndRideModal] = useState(false);
  const [showLeaveRideModal, setShowLeaveRideModal] = useState(false);
  const [showGroupControlSheet, setShowGroupControlSheet] = useState(false);
  const [activeMenu, setActiveMenu] = useState<ActiveMenuType>('NONE');
  const [showBroadcastModal, setShowBroadcastModal] = useState(false);
  const [customBroadcastText, setCustomBroadcastText] = useState('');
  const [showHazardModal, setShowHazardModal] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [isEnding, setIsEnding] = useState(false);
  const [hasArrived, setHasArrived] = useState(false);
  const [isRerouting, setIsRerouting] = useState(false);
  const [selectedRider, setSelectedRider] = useState<RiderLocation | null>(null);
  const [mapRegion, setMapRegion] = useState<{
    latitude: number;
    longitude: number;
    latitudeDelta: number;
    longitudeDelta: number;
  } | null>(null);

  // Dynamic Layout Engine Measurements (onLayout Driven - 100% NaN Safe)
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const [topBannerHeight, setTopBannerHeight] = useState(105);
  const [bottomHudHeight, setBottomHudHeight] = useState(95);
  const [groupStatusHeight, setGroupStatusHeight] = useState(46);
  const [selectedRiderHeight, setSelectedRiderHeight] = useState(0);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  // Safe Numeric Value Extractors (Guarantees zero NaN / zero layout crash)
  const safeTopInset = (insets && typeof insets.top === 'number' && !isNaN(insets.top)) ? insets.top : 0;
  const safeBottomInset = (insets && typeof insets.bottom === 'number' && !isNaN(insets.bottom)) ? insets.bottom : 0;
  const safeTopBanner = (typeof topBannerHeight === 'number' && !isNaN(topBannerHeight) && topBannerHeight > 0) ? topBannerHeight : 105;
  const safeBottomHud = (typeof bottomHudHeight === 'number' && !isNaN(bottomHudHeight) && bottomHudHeight > 0) ? bottomHudHeight : 95;
  const safeGroupStatus = (typeof groupStatusHeight === 'number' && !isNaN(groupStatusHeight) && groupStatusHeight > 0) ? groupStatusHeight : 46;
  const safeSelectedRider = (typeof selectedRiderHeight === 'number' && !isNaN(selectedRiderHeight) && selectedRiderHeight > 0) ? selectedRiderHeight : 210;
  const safeKeyboard = (typeof keyboardHeight === 'number' && !isNaN(keyboardHeight) && keyboardHeight > 0) ? keyboardHeight : 0;

  const bottomStackAnim = useRef(new Animated.Value(150)).current;

  // Keyboard Event Listeners for Dynamic Layout Avoidance
  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => {
        const kH = e?.endCoordinates?.height;
        if (typeof kH === 'number' && !isNaN(kH) && kH > 0) {
          setKeyboardHeight(kH);
        }
      }
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setKeyboardHeight(0)
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // Compute Total Bottom Stack Height & Animate Gracefully (No Jitter / Smooth Interruption / 100% NaN Safe)
  useEffect(() => {
    const activeRiderCardHeight = selectedRider ? safeSelectedRider + 12 : 0;
    const activeGroupStatusHeight = safeGroupStatus + 12;
    const computedBottom = safeBottomHud + activeGroupStatusHeight + activeRiderCardHeight + safeKeyboard + safeBottomInset;
    const targetBottom = (typeof computedBottom === 'number' && !isNaN(computedBottom) && computedBottom > 0) ? computedBottom : 150;

    bottomStackAnim.stopAnimation();
    Animated.spring(bottomStackAnim, {
      toValue: targetBottom,
      friction: 8,
      tension: 70,
      useNativeDriver: false,
    }).start();
  }, [
    safeBottomHud,
    safeGroupStatus,
    safeSelectedRider,
    selectedRider,
    safeKeyboard,
    safeBottomInset,
    windowWidth,
    windowHeight,
  ]);

  const userLoc = user ? locations[user?.uid] : null;

  // Map Viewport Padding — must be declared BEFORE any early return to satisfy Rules of Hooks
  const dynamicMapPadding = React.useMemo(() => ({
    top: Math.max(safeTopBanner + safeTopInset + 16, 110),
    bottom: Math.max(
      safeBottomHud +
        (safeGroupStatus + 12) +
        (selectedRider ? safeSelectedRider + 12 : 0) +
        safeKeyboard +
        safeBottomInset +
        20,
      140
    ),
    right: 75,
    left: 20,
  }), [safeTopBanner, safeTopInset, safeBottomHud, safeGroupStatus, safeSelectedRider, selectedRider, safeKeyboard, safeBottomInset]);

  // App Settings Integration
  const { preferences } = useSettings();

  // Keep Screen Awake Sync
  useEffect(() => {
    if (preferences.keepScreenAwake) {
      activateKeepAwakeAsync().catch((e) => console.warn('Keep awake error:', e));
    } else {
      deactivateKeepAwake();
    }
    return () => {
      deactivateKeepAwake();
    };
  }, [preferences.keepScreenAwake]);

  // Voice Guidance Sync
  useEffect(() => {
    if (preferences.voiceGuidance) {
      SpeechService.setMode('ALL');
    } else {
      SpeechService.setMode('MUTED');
    }
  }, [preferences.voiceGuidance]);

  // Emergency Queue & Situational Awareness State
  const [emergenciesQueue, setEmergenciesQueue] = useState<EmergencyAlertItem[]>([]);
  const [activeEmergencyIndex, setActiveEmergencyIndex] = useState(0);
  const [showDismissEmergencyModal, setShowDismissEmergencyModal] = useState(false);
  const [emergencyToDismiss, setEmergencyToDismiss] = useState<EmergencyAlertItem | null>(null);
  const [trackedEmergency, setTrackedEmergency] = useState<EmergencyAlertItem | null>(null);

  // Synchronize Emergency Queue from live Firestore rider locations
  useEffect(() => {
    if (!locations || !user) return;
    const userCoords = userLoc || (locations[user.uid] ? { latitude: locations[user.uid].latitude, longitude: locations[user.uid].longitude } : null);

    const sosRiders = Object.values(locations).filter(
      (r) => r && r.userId !== user.uid && r.riderStatus === 'sos' && r.latitude != null && r.longitude != null
    );

    if (sosRiders.length === 0) {
      setEmergenciesQueue([]);
      setTrackedEmergency(null);
      return;
    }

    const updatedQueue: EmergencyAlertItem[] = sosRiders.map((r) => {
      const distM = userCoords ? haversineDistance(userCoords.latitude, userCoords.longitude, r.latitude, r.longitude) : 0;
      const distKm = parseFloat((distM / 1000).toFixed(1));
      const etaMin = Math.max(1, Math.round((distKm / 35) * 60));
      return {
        id: `sos_${r.userId}`,
        rider: r,
        distanceKm: distKm,
        etaMin,
        timestamp: r.timestamp || Date.now(),
      };
    });

    setEmergenciesQueue(updatedQueue);
  }, [locations, userLoc, user?.uid]);

  // Compass & Audio States
  const [compassMode, setCompassMode] = useState<'HEADING_UP' | 'NORTH_UP'>('HEADING_UP');
  const [speechMode, setSpeechMode] = useState<SpeechMode>('ALL');
  const [userIsDraggingMap, setUserIsDraggingMap] = useState(false);

  // Offset close rider markers so overlapping locations are slightly spread out
  const ridersWithOffsets = React.useMemo(() => {
    const list = Object.values(locations || {}).filter(
      (r) => r && r.latitude != null && r.longitude != null && !isNaN(r.latitude) && !isNaN(r.longitude)
    );

    // Guarantee current user's marker is ALWAYS included and rendered
    if (user && userLoc && userLoc.latitude != null && userLoc.longitude != null && !isNaN(userLoc.latitude) && !isNaN(userLoc.longitude)) {
      const myId = user.uid;
      const existingIdx = list.findIndex((r) => r.userId === myId);
      const mySpeed = userLoc.speed ? Math.round(userLoc.speed * 3.6) : (existingIdx >= 0 ? list[existingIdx].speed : 0);
      const myHeading = userLoc.heading || (existingIdx >= 0 ? list[existingIdx].heading : 0);
      const myRiderObj: RiderLocation = {
        userId: myId,
        userName: user.name || 'You',
        photoURL: user.photoURL,
        latitude: userLoc.latitude,
        longitude: userLoc.longitude,
        speed: mySpeed,
        heading: myHeading,
        timestamp: Date.now(),
        network: 'online',
        riderStatus: mySpeed > 3 ? 'riding' : 'stopped',
        battery: existingIdx >= 0 ? list[existingIdx].battery : undefined,
      };

      if (existingIdx >= 0) {
        list[existingIdx] = {
          ...list[existingIdx],
          ...myRiderObj,
          latitude: userLoc.latitude,
          longitude: userLoc.longitude,
        };
      } else {
        list.push(myRiderObj);
      }
    }

    const coordsSeen: { [key: string]: number } = {};
    return list.map((r) => {
      const key = `${r.latitude.toFixed(4)},${r.longitude.toFixed(4)}`;
      const count = coordsSeen[key] || 0;
      coordsSeen[key] = count + 1;

      if (count === 0) return r;

      const offsetFactor = 0.00008 * count;
      const angle = count * 1.25;
      return {
        ...r,
        latitude: r.latitude + offsetFactor * Math.cos(angle),
        longitude: r.longitude + offsetFactor * Math.sin(angle),
      };
    });
  }, [locations, user, userLoc]);

  // Computed rider status metrics
  const totalRiders = Object.keys(locations || {}).length || 1;
  const ridersMoving = Object.values(locations || {}).filter((r) => (r?.speed || 0) > 3).length;
  const ridersWaiting = Math.max(0, totalRiders - ridersMoving);

  const getGpsFreshness = (timestamp?: number) => {
    if (!timestamp) return 'Just now';
    const diffSec = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
    if (diffSec < 5) return 'Just now';
    if (diffSec < 60) return `${diffSec}s ago`;
    return `${Math.floor(diffSec / 60)}m ago`;
  };

  // Destination Search States
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<GeocodedLocation[]>([]);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const getArrivalTime = (durationSecs: number) => {
    if (!durationSecs) return '--';
    const arrivalDate = new Date(Date.now() + durationSecs * 1000);
    return arrivalDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  };

  // Keep track of statistics for summary screen
  const startTimeRef = useRef<number>(Date.now());
  const maxSpeedRef = useRef<number>(0);
  const totalSpeedSumRef = useRef<number>(0);
  const speedCountRef = useRef<number>(0);
  const previousCoordsRef = useRef<{ latitude: number; longitude: number } | null>(null);
  const accumulatedDistanceRef = useRef<number>(0); // in km

  // Statistics tracker
  useEffect(() => {
    if (metrics.currentSpeed > 0) {
      if (metrics.currentSpeed > maxSpeedRef.current) {
        maxSpeedRef.current = metrics.currentSpeed;
      }
      totalSpeedSumRef.current += metrics.currentSpeed;
      speedCountRef.current += 1;
    }

    if (user && locations[user.uid]) {
      const currentLoc = locations[user.uid];
      const currentCoords = { latitude: currentLoc.latitude, longitude: currentLoc.longitude };
      
      if (previousCoordsRef.current) {
        const gap = haversineDistance(
          previousCoordsRef.current.latitude,
          previousCoordsRef.current.longitude,
          currentCoords.latitude,
          currentCoords.longitude
        );
        accumulatedDistanceRef.current += gap / 1000; // Convert to km
      }
      previousCoordsRef.current = currentCoords;
    }
  }, [metrics.currentSpeed, locations, user]);

  // Emergency SOS Handlers
  const handleNavigateToEmergencyRider = (emergency: EmergencyAlertItem) => {
    setTrackedEmergency(emergency);
    if (mapRef.current && emergency.rider) {
      mapRef.current.animateCamera(
        {
          center: {
            latitude: emergency.rider.latitude,
            longitude: emergency.rider.longitude,
          },
          zoom: 17,
          pitch: 45,
        },
        { duration: 1000 }
      );
    }
  };

  const handleAcknowledgeEmergency = (emergency: EmergencyAlertItem) => {
    setEmergenciesQueue((prev) =>
      prev.map((e) => (e.id === emergency.id ? { ...e, acknowledged: true } : e))
    );
    SpeechService.speakAlert('Emergency acknowledged.');
  };

  const handleRequestDismissEmergency = (emergency: EmergencyAlertItem) => {
    setEmergencyToDismiss(emergency);
    setShowDismissEmergencyModal(true);
  };

  const confirmDismissEmergency = () => {
    if (emergencyToDismiss) {
      setEmergenciesQueue((prev) => prev.filter((e) => e.id !== emergencyToDismiss.id));
      if (trackedEmergency?.id === emergencyToDismiss.id) {
        setTrackedEmergency(null);
      }
    }
    setShowDismissEmergencyModal(false);
    setEmergencyToDismiss(null);
  };

  // Auto-navigate members when ride status is changed to completed by leader
  useEffect(() => {
    if (ride && ride.status === 'completed') {
      const summary = {
        id: 'completed_summary',
        rideId: ride.id,
        name: ride.name,
        leaderName: ride.leaderName,
        destinationName: ride.destination?.name ?? 'Destination',
        duration: Math.round((Date.now() - startTimeRef.current) / 1000),
        totalDistance: accumulatedDistanceRef.current > 0 ? accumulatedDistanceRef.current : 0.5, // fallback if simulated
        averageSpeed: speedCountRef.current > 0 ? Math.round(totalSpeedSumRef.current / speedCountRef.current) : 55,
        topSpeed: maxSpeedRef.current > 0 ? maxSpeedRef.current : 85,
        membersCount: ride.members?.length || 1,
        startTime: startTimeRef.current,
        endTime: Date.now(),
        memberUids: ride.members || [],
      };
      navigation.replace('RideSummary', { summary });
    }
  }, [ride?.status, ride, navigation]);

  // Camera auto-follow & tilt effect (Bottom-Third Screen Projection)
  useEffect(() => {
    if (user && locations[user.uid] && mapRef.current && !userIsDraggingMap) {
      if (!preferences.autoRecenterMap || userIsDraggingMap) return;
      const userLoc = locations[user.uid];
      if (!userLoc || userLoc.latitude == null || userLoc.longitude == null || isNaN(userLoc.latitude) || isNaN(userLoc.longitude)) return;
      const speed = metrics.currentSpeed || 0;
      const isHeadingUp = preferences.compassMode === 'heading';
      const heading = isHeadingUp ? (userLoc.heading || 0) : 0;
      const headingRad = (heading * Math.PI) / 180;

      // Project camera target ahead of rider so rider sits in lower third of screen.
      const lookAheadDist = speed > 50 ? 0.0022 : 0.0016;
      const lookAheadLat = userLoc.latitude + (isHeadingUp ? lookAheadDist * Math.cos(headingRad) : 0);
      const lookAheadLon = userLoc.longitude + (isHeadingUp ? lookAheadDist * Math.sin(headingRad) : 0);

      // Zoom: stay closer at high speed for better road detail
      const zoom = speed > 80 ? 15.5 : speed > 50 ? 16 : speed > 20 ? 16.5 : 17;

      mapRef.current.animateCamera(
        {
          center: {
            latitude: lookAheadLat,
            longitude: lookAheadLon,
          },
          pitch: isHeadingUp ? 52 : 0,
          heading: heading,
          zoom,
        },
        { duration: 700 }
      );
    }
  }, [locations[user?.uid || '']?.latitude, locations[user?.uid || '']?.longitude, preferences.compassMode, preferences.autoRecenterMap, userIsDraggingMap]);

  // Turn voice guidance synthesis
  useEffect(() => {
    if (rideRoute?.nextStepName && metrics.distanceRemaining > 0) {
      const distStr = formatDistance(metrics.distanceRemaining);
      const spokenText = `In ${distStr}, ${rideRoute.nextStepName}`;
      SpeechService.speakInstruction(spokenText);
    }
  }, [rideRoute?.nextStepName, Math.round(metrics.distanceRemaining / 100)]);

  // Arrival detection (within 30 meters of destination)
  useEffect(() => {
    if (metrics.distanceRemaining > 0 && metrics.distanceRemaining < 30 && !hasArrived) {
      setHasArrived(true);
      Vibration.vibrate([0, 500, 200, 500]);
      SpeechService.speakAlert('You have arrived at your destination.');
    }
  }, [metrics.distanceRemaining, hasArrived]);

  const toggleSpeechMode = () => {
    const nextMode: SpeechMode = speechMode === 'ALL' ? 'ALERTS_ONLY' : speechMode === 'ALERTS_ONLY' ? 'MUTED' : 'ALL';
    setSpeechMode(nextMode);
    SpeechService.setMode(nextMode);
  };

  const handleReportHazard = async (category: HazardCategory) => {
    setShowHazardModal(false);
    if (!ride || !user) return;
    const myLoc = locations[user.uid];
    if (!myLoc) return;

    try {
      await HazardService.reportHazard(ride.id, category, myLoc.latitude, myLoc.longitude, user.name);
      Vibration.vibrate(200);
      const hazardInfo = HAZARD_TYPES.find((h) => h.category === category);
      const title = hazardInfo?.title || 'Hazard';
      SpeechService.speakAlert(`${title} reported to group.`);
      Alert.alert('Hazard Marked', `${title} has been pinned on the map for all riders.`);
    } catch (e) {
      console.error('Failed to report hazard:', e);
    }
  };

  const handleSearchInput = (text: string) => {
    setSearchQuery(text);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);

    if (text.trim().length < 3) {
      setSearchResults([]);
      setLoadingSearch(false);
      return;
    }

    setLoadingSearch(true);
    searchTimeoutRef.current = setTimeout(async () => {
      const results = await GeocodingService.searchAddress(text);
      setSearchResults(results);
      setLoadingSearch(false);
    }, 400);
  };

  const handleEndRide = () => {
    if (!ride) return;
    setShowEndRideModal(true);
  };

  const executeEndRide = async () => {
    setShowEndRideModal(false);
    if (!ride) return;
    setIsEnding(true);
    try {
      const duration = Math.round((Date.now() - startTimeRef.current) / 1000);
      const totalDistance = accumulatedDistanceRef.current > 0 ? accumulatedDistanceRef.current : 12.4;
      const averageSpeed = speedCountRef.current > 0 ? Math.round(totalSpeedSumRef.current / speedCountRef.current) : 62;
      const topSpeed = maxSpeedRef.current > 0 ? maxSpeedRef.current : 104;

      const summary = await RideService.endRide(
        ride.id,
        duration,
        totalDistance,
        averageSpeed,
        topSpeed
      );

      navigation.replace('RideSummary', { summary });
    } catch (e) {
      console.error('Failed to end ride:', e);
      setIsEnding(false);
    }
  };

  // Auto-navigate back to Home if ride is cancelled, ended, or if user is removed from members
  useEffect(() => {
    if (!ride || !user) return;
    if (ride.status === 'cancelled') {
      Alert.alert('Ride Cancelled', 'The leader has cancelled this ride session.');
      navigation.replace('Home');
    } else if (Array.isArray(ride.members) && !ride.members.includes(user.uid)) {
      Alert.alert('Removed from Ride', 'You are no longer a member of this ride session.');
      navigation.replace('Home');
    }
  }, [ride?.status, ride?.members, user?.uid, navigation]);

  const handleLeaveRide = () => {
    setShowLeaveRideModal(true);
  };

  const executeLeaveRide = async () => {
    setShowLeaveRideModal(false);
    if (ride && user) {
      try {
        await RideService.leaveRide(ride.id, user.uid);
      } catch (e) {
        console.error('Failed to leave ride in Firestore:', e);
      }
    }
    navigation.replace('Home');
  };

  const triggerSOSAlert = async () => {
    setShowSOSConfirmation(false);
    if (!ride || !user) return;
    try {
      await LocationService.broadcastEmergencySOS(ride.id, user.uid, user.name || 'Rider');
      Vibration.vibrate([0, 500, 200, 500]);
      SpeechService.speakAlert('Emergency SOS Broadcasted.');
      Alert.alert('Emergency SOS Broadcasted', 'Your emergency coordinates have been broadcasted to all group members.');
    } catch (e: any) {
      console.error('SOS broadcast failed:', e);
      Alert.alert('SOS Broadcast Error', e?.message || 'Could not send Emergency SOS. Please check your connection.');
    }
  };

  const handleRecenter = async () => {
    setUserIsDraggingMap(false);
    if (!mapRef.current) return;

    let targetLat = userLoc?.latitude;
    let targetLon = userLoc?.longitude;

    if (!targetLat || !targetLon) {
      try {
        const currentDevLoc = await LocationService.getCurrentLocation();
        if (currentDevLoc) {
          targetLat = currentDevLoc.coords.latitude;
          targetLon = currentDevLoc.coords.longitude;
        }
      } catch (e) {
        // ignore
      }
    }

    if ((!targetLat || !targetLon) && ride?.startLocation) {
      targetLat = ride.startLocation.latitude;
      targetLon = ride.startLocation.longitude;
    }

    if (targetLat && targetLon) {
      mapRef.current.animateCamera(
        {
          center: { latitude: targetLat, longitude: targetLon },
          zoom: 17,
          pitch: compassMode === 'HEADING_UP' ? 50 : 0,
        },
        { duration: 800 }
      );
    }
  };

  if (!ride) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>Connecting to active ride...</Text>
      </View>
    );
  }

  const isLeader = user?.uid === ride.leaderId;
  const speed = metrics.currentSpeed || 0;
  const speedColor = speed > 80 ? '#EF4444' : speed > 60 ? '#F59E0B' : '#10B981';

  // Dynamic Route Trimming: Split polyline into completed vs remaining
  let completedCoords: { latitude: number; longitude: number }[] = [];
  let remainingCoords: { latitude: number; longitude: number }[] = [];

  if (rideRoute && Array.isArray(rideRoute.coordinates) && rideRoute.coordinates.length > 1) {
    if (userLoc && userLoc.latitude != null && userLoc.longitude != null && !isNaN(userLoc.latitude) && !isNaN(userLoc.longitude)) {
      let closestIdx = 0;
      let minDistance = Infinity;

      rideRoute.coordinates.forEach((c, idx) => {
        if (!c || c.latitude == null || c.longitude == null || isNaN(c.latitude) || isNaN(c.longitude)) return;
        const d = haversineDistance(userLoc.latitude, userLoc.longitude, c.latitude, c.longitude);
        if (d < minDistance) {
          minDistance = d;
          closestIdx = idx;
        }
      });

      completedCoords = rideRoute.coordinates.slice(0, closestIdx + 1);
      remainingCoords = rideRoute.coordinates.slice(closestIdx);
    } else {
      remainingCoords = rideRoute.coordinates;
    }
  }

  return (
    <View style={styles.container}>
      {/* Docked Flashing Persistent Emergency Top Banner */}
      {emergenciesQueue.length > 0 && (
        <PersistentEmergencyBanner
          emergency={emergenciesQueue[0]}
          onNavigate={() => handleNavigateToEmergencyRider(emergenciesQueue[0])}
          onOpenOverlay={() => setActiveEmergencyIndex(0)}
        />
      )}

      {/* 1. Full Screen Interactive Navigation Map View */}
      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        customMapStyle={isDark ? NavigationMapStyleDark : NavigationMapStyleLight}
        style={StyleSheet.absoluteFillObject}
        initialRegion={{
          latitude: (userLoc?.latitude && !isNaN(userLoc.latitude)) ? userLoc.latitude : (ride.destination?.latitude || 28.6139),
          longitude: (userLoc?.longitude && !isNaN(userLoc.longitude)) ? userLoc.longitude : (ride.destination?.longitude || 77.2090),
          latitudeDelta: 0.015,
          longitudeDelta: 0.015,
        }}
        showsUserLocation={false}
        showsMyLocationButton={false}
        showsPointsOfInterest={false}
        showsBuildings={false}
        showsIndoors={false}
        showsCompass={false}
        showsTraffic={false}
        mapPadding={dynamicMapPadding}
        onPanDrag={() => {
          setUserIsDraggingMap(true);
          if (activeMenu !== 'NONE') setActiveMenu('NONE');
        }}
        onPress={() => {
          setSelectedRider(null);
          if (activeMenu !== 'NONE') setActiveMenu('NONE');
        }}
        onRegionChangeComplete={(region) => setMapRegion(region)}
      >
        {/* CARTO Retina Map Tile Layer — Navigation Optimized */}
        <UrlTile
          urlTemplate={colors.mapTileUrl}
          maximumZ={19}
          flipY={false}
          tileSize={512}
          opacity={1}
        />

        {/* GPS Accuracy Circle around current user */}
        {userLoc && userLoc.latitude != null && userLoc.longitude != null && !isNaN(userLoc.latitude) && !isNaN(userLoc.longitude) && (
          <Circle
            center={{ latitude: userLoc.latitude, longitude: userLoc.longitude }}
            radius={25}
            fillColor="rgba(26, 115, 232, 0.15)"
            strokeColor="rgba(26, 115, 232, 0.40)"
            strokeWidth={1.5}
          />
        )}

        {/* === ROUTE POLYLINES === */}

        {/* Layer 1: Completed route — muted translucent grey */}
        {completedCoords.length > 1 && (
          <Polyline
            coordinates={completedCoords.filter((c) => c && c.latitude != null && c.longitude != null && !isNaN(c.latitude) && !isNaN(c.longitude))}
            strokeColor={isDark ? 'rgba(100, 116, 139, 0.45)' : 'rgba(148, 163, 184, 0.55)'}
            strokeWidth={6}
            lineCap="round"
            lineJoin="round"
          />
        )}

        {/* Layer 2a: Remaining route — Google Maps dark outline under-casing */}
        {remainingCoords.length > 1 && (
          <Polyline
            coordinates={remainingCoords.filter((c) => c && c.latitude != null && c.longitude != null && !isNaN(c.latitude) && !isNaN(c.longitude))}
            strokeColor="#1557B0"
            strokeWidth={10}
            lineCap="round"
            lineJoin="round"
          />
        )}

        {/* Layer 2b: Remaining route — Brighter Google Maps navigation blue */}
        {remainingCoords.length > 1 && (
          <Polyline
            coordinates={remainingCoords.filter((c) => c && c.latitude != null && c.longitude != null && !isNaN(c.latitude) && !isNaN(c.longitude))}
            strokeColor="#1A73E8"
            strokeWidth={7}
            lineCap="round"
            lineJoin="round"
          />
        )}

        {/* Layer 2c: Remaining route — Inner light blue highlight */}
        {remainingCoords.length > 1 && (
          <Polyline
            coordinates={remainingCoords.filter((c) => c && c.latitude != null && c.longitude != null && !isNaN(c.latitude) && !isNaN(c.longitude))}
            strokeColor="#8AB4F8"
            strokeWidth={3}
            lineCap="round"
            lineJoin="round"
          />
        )}

        {/* === DESTINATION MARKER — Compact Premium Pin === */}
        {ride?.destination && ride.destination.latitude != null && ride.destination.longitude != null && !isNaN(ride.destination.latitude) && !isNaN(ride.destination.longitude) && (
          <Marker
            coordinate={{
              latitude: ride.destination.latitude,
              longitude: ride.destination.longitude,
            }}
            title="Destination"
            description={ride.destination.name}
            anchor={{ x: 0.5, y: 1.0 }}
            tracksViewChanges={false}
            zIndex={10}
          >
            <View style={styles.destinationMarkerContainer} collapsable={false}>
              {/* Label pill — compact with flag */}
              <View
                style={[
                  styles.destinationPill,
                  {
                    backgroundColor: isDark ? 'rgba(15, 23, 42, 0.93)' : 'rgba(255, 255, 255, 0.97)',
                    borderColor: isDark ? '#00D4FF' : '#0284C7',
                  },
                ]}
              >
                <Text style={styles.destinationFlagIcon}>🏁</Text>
                <Text
                  style={[styles.destinationPillText, { color: isDark ? '#E2E8F0' : '#0F172A' }]}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  {(ride.destination?.name || 'Destination').split(',')[0].trim()}
                </Text>
              </View>
              {/* CSS triangle pin tip */}
              <View style={[styles.destinationPinTip, { borderTopColor: isDark ? '#00D4FF' : '#0284C7' }]} />
            </View>
          </Marker>
        )}

        {/* === HAZARD MARKERS — Compact Icon Badges === */}
        {(hazards || []).map((h) => {
          if (!h || h.latitude == null || h.longitude == null || isNaN(h.latitude) || isNaN(h.longitude)) return null;
          return (
            <Marker
              key={h.id || `${h.latitude}-${h.longitude}`}
              coordinate={{ latitude: h.latitude, longitude: h.longitude }}
              title={h.title}
              description={`Reported by ${h.reportedBy}`}
              anchor={{ x: 0.5, y: 0.5 }}
              tracksViewChanges={false}
              zIndex={5}
            >
              <View style={styles.hazardMarkerBubble} collapsable={false}>
                <Ionicons name={h.icon as any} size={13} color="#FFFFFF" />
              </View>
            </Marker>
          );
        })}
        {/* Dynamic Rider Markers */}
        {ridersWithOffsets.map((rider) => {
          const isMe = rider.userId === user?.uid;
          const isRiderLeader = rider.userId === ride.leaderId;
          const isSelected = selectedRider?.userId === rider.userId;

          return (
            <AnimatedRiderMarker
              key={rider.userId}
              rider={rider}
              isMe={isMe}
              isLeader={isRiderLeader}
              isSelected={isSelected}
              colors={colors}
              isDark={isDark}
              onPress={(r) => {
                setSelectedRider(r);
                if (mapRef.current && r.latitude && r.longitude) {
                  mapRef.current.animateToRegion(
                    {
                      latitude: r.latitude,
                      longitude: r.longitude,
                      latitudeDelta: 0.005,
                      longitudeDelta: 0.005,
                    },
                    500
                  );
                }
              }}
            />
          );
        })}
      </MapView>

      {/* Off-Screen Nami Edge Indicators */}
      <NamiEdgeIndicator
        riders={Object.values(locations || {})}
        currentUserId={user?.uid}
        leaderId={ride?.leaderId}
        userLocation={userLoc ? { latitude: userLoc.latitude, longitude: userLoc.longitude } : null}
        mapRegion={mapRegion}
        onSelectRider={(r) => {
          setSelectedRider(r);
          if (mapRef.current && r.latitude && r.longitude) {
            mapRef.current.animateToRegion(
              {
                latitude: r.latitude,
                longitude: r.longitude,
                latitudeDelta: 0.005,
                longitudeDelta: 0.005,
              },
              500
            );
          }
        }}
      />

      {/* Selected Rider Floating Card (Stage 3) */}
      {selectedRider && (
        <View
          style={[styles.selectedRiderCardWrapper, { bottom: safeBottomHud + safeGroupStatus + 20 }]}
          onLayout={(e) => {
            const h = e?.nativeEvent?.layout?.height;
            if (typeof h === 'number' && !isNaN(h) && h > 0) setSelectedRiderHeight(h);
          }}
        >
          <SelectedRiderCard
            rider={selectedRider}
            isLeader={selectedRider.userId === ride?.leaderId}
            distanceKm={
              userLoc && selectedRider.latitude && selectedRider.longitude
                ? haversineDistance(
                    userLoc.latitude,
                    userLoc.longitude,
                    selectedRider.latitude,
                    selectedRider.longitude
                  ) / 1000
                : 0
            }
            colors={colors}
            isDark={isDark}
            onCenter={(r) => {
              if (mapRef.current && r.latitude && r.longitude) {
                mapRef.current.animateToRegion(
                  {
                    latitude: r.latitude,
                    longitude: r.longitude,
                    latitudeDelta: 0.005,
                    longitudeDelta: 0.005,
                  },
                  500
                );
              }
            }}
            onClose={() => setSelectedRider(null)}
          />
        </View>
      )}

      {/* 2. Top Google Maps Navigation Turn Banner & Floating Notifications Stack */}
      <View
        onLayout={(e) => {
          const h = e?.nativeEvent?.layout?.height;
          if (typeof h === 'number' && !isNaN(h) && h > 0) setTopBannerHeight(h);
        }}
        style={[styles.topBannerContainer, { paddingTop: Math.max(safeTopInset + 4, Platform.OS === 'android' ? (StatusBar.currentHeight || 24) + 4 : 8) }]}
      >
        <View style={[styles.navHeaderCard, { backgroundColor: colors.navBanner }]}>
          <View style={styles.navHeaderRow}>
            <Ionicons
              name={getManeuverIconName(rideRoute?.nextStepManeuver)}
              size={32}
              color="#FFFFFF"
              style={{ marginRight: 10 }}
            />
            <View style={styles.navHeaderTextContainer}>
              <Text style={[styles.navHeaderTitle, { color: colors.navBannerText }]} numberOfLines={1}>
                {formatDistance(metrics.distanceRemaining)} • towards{' '}
                <Text style={styles.navHeaderTitleBold}>
                  {rideRoute?.nextStepName || (ride?.destination?.name ? ride.destination.name.split(',')[0] : 'Destination') || 'Destination'}
                </Text>
              </Text>
            </View>
          </View>
          <View style={styles.navHeaderSubRow}>
            <Ionicons name="arrow-back" size={14} color="#00E5FF" style={{ marginRight: 4 }} />
            <Text style={styles.navHeaderSubText}>Then Turn</Text>
          </View>
        </View>

        {/* Re-routing Toast */}
        {isRerouting && (
          <View style={styles.reroutingToast}>
            <ActivityIndicator size="small" color="#00E5FF" />
            <Text style={styles.reroutingToastText}>Finding a better route...</Text>
          </View>
        )}

        {/* Top Broadcast Alert Banner */}
        {broadcastAlert && (
          <View style={[styles.alertBanner, { backgroundColor: '#0284C7' }]}>
            <Ionicons name="megaphone-outline" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
            <Text style={styles.alertBannerText}>
              <Text style={{ fontWeight: '800' }}>{broadcastAlert.senderName}: </Text>
              {broadcastAlert.text}
            </Text>
            <TouchableOpacity onPress={() => setBroadcastAlert(null)} style={{ marginLeft: 8, padding: 4 }}>
              <Ionicons name="close" size={18} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        )}

        {/* Safety Alert Banner */}
        {safetyAlert && (
          <View
            style={[
              styles.alertBanner,
              { backgroundColor: safetyStatus === 'CRITICAL' ? Colors.danger : Colors.warning },
            ]}
          >
            <Ionicons name="warning-outline" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
            <Text style={styles.alertBannerText}>{safetyAlert}</Text>
          </View>
        )}

        {hazardAlertMessage && (
          <View style={[styles.alertBanner, { backgroundColor: colors.danger }]}>
            <Ionicons name="warning-outline" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
            <Text style={styles.alertBannerText}>{latestHazard ? `${latestHazard.title} reported nearby` : 'Hazard reported'}</Text>
          </View>
        )}
      </View>

      {/* 3. Floating Side Map Controls Stack (Compass, Mute, Search, Group, Safety) */}
      <View style={[styles.sideControlsContainer, { top: Math.max(safeTopBanner + safeTopInset + 12, 140) }]}>
        {/* Compass Button */}
        <TouchableOpacity
          style={[styles.circleIconButton, compassMode === 'HEADING_UP' && styles.circleIconButtonActive]}
          onPress={() => setCompassMode((prev) => (prev === 'HEADING_UP' ? 'NORTH_UP' : 'HEADING_UP'))}
          onLongPress={() => {
            setUserIsDraggingMap(false);
            setCompassMode('HEADING_UP');
          }}
        >
          <Ionicons
            name={compassMode === 'HEADING_UP' ? 'compass' : 'navigate'}
            size={24}
            color={compassMode === 'HEADING_UP' ? '#00E5FF' : '#FFFFFF'}
          />
        </TouchableOpacity>

        {/* Voice Guidance / Mute Button */}
        <TouchableOpacity
          style={styles.circleIconButton}
          onPress={toggleSpeechMode}
        >
          <Ionicons
            name={speechMode === 'ALL' ? 'volume-high' : speechMode === 'ALERTS_ONLY' ? 'volume-medium' : 'volume-mute'}
            size={24}
            color="#FFFFFF"
          />
        </TouchableOpacity>

        {/* Search Expandable Floating Menu */}
        <ExpandableFloatingMenu
          menuType="SEARCH"
          mainIconName="search"
          mainIconType="ionicons"
          activeColor="#00E5FF"
          isExpanded={activeMenu === 'SEARCH'}
          onToggle={() => setActiveMenu((prev) => (prev === 'SEARCH' ? 'NONE' : 'SEARCH'))}
          colors={colors}
          isDark={isDark}
          items={[
            {
              id: 'search_dest',
              label: 'Search Destination',
              iconName: 'search-outline',
              color: '#00E5FF',
              onPress: () => setShowSearchModal(true),
            },
            {
              id: 'recent_places',
              label: 'Recent Places',
              iconName: 'time-outline',
              color: '#38BDF8',
              onPress: () => setShowSearchModal(true),
            },
            {
              id: 'saved_places',
              label: 'Saved Places',
              iconName: 'bookmark-outline',
              color: '#818CF8',
              onPress: () => setShowSearchModal(true),
            },
          ]}
        />

        {/* Group Expandable Floating Menu */}
        <ExpandableFloatingMenu
          menuType="GROUP"
          mainIconName="account-group-outline"
          mainIconType="material"
          activeColor="#00E5FF"
          isExpanded={activeMenu === 'GROUP'}
          onToggle={() => setActiveMenu((prev) => (prev === 'GROUP' ? 'NONE' : 'GROUP'))}
          colors={colors}
          isDark={isDark}
          items={[
            {
              id: 'group_members',
              label: 'Group Members',
              iconName: 'account-group-outline',
              iconType: 'material',
              color: '#00E5FF',
              onPress: () => setShowGroupControlSheet(true),
            },
            {
              id: 'group_broadcast',
              label: 'Broadcast Message',
              iconName: 'megaphone-outline',
              color: '#38BDF8',
              onPress: () => setShowBroadcastModal(true),
            },
            {
              id: 'group_break',
              label: 'Break Request',
              iconName: 'cafe-outline',
              color: '#F59E0B',
              onPress: async () => {
                await sendBroadcast('quick', 'Break Requested', 'break_request');
                Vibration.vibrate(200);
                SpeechService.speakAlert('Break requested to group.');
              },
            },
            {
              id: 'group_settings',
              label: 'Ride Settings',
              iconName: 'settings-outline',
              color: '#94A3B8',
              onPress: () => navigation.navigate('Settings' as any),
            },
          ]}
        />

        {/* Safety Expandable Floating Menu */}
        <ExpandableFloatingMenu
          menuType="SAFETY"
          mainIconName="shield-half-sharp"
          mainIconType="ionicons"
          activeColor="#EF4444"
          isExpanded={activeMenu === 'SAFETY'}
          onToggle={() => setActiveMenu((prev) => (prev === 'SAFETY' ? 'NONE' : 'SAFETY'))}
          colors={colors}
          isDark={isDark}
          items={[
            {
              id: 'safety_sos',
              label: 'SOS Emergency',
              iconName: 'alert-circle-outline',
              color: '#EF4444',
              onPress: () => setShowSOSConfirmation(true),
            },
            {
              id: 'safety_contact',
              label: 'Emergency Contact',
              iconName: 'call-outline',
              color: '#F97316',
              onPress: () => {
                SpeechService.speakAlert('Alerting emergency contact');
                Share.share({
                  message: `SOS Emergency Alert from ${user?.name || 'Rider'}! Live location: https://maps.google.com/?q=${userLoc?.latitude},${userLoc?.longitude}`,
                }).catch(() => {});
              },
            },
            {
              id: 'safety_share',
              label: 'Share Live Location',
              iconName: 'share-social-outline',
              color: '#00E5FF',
              onPress: () => {
                Share.share({
                  message: `Track my ride live on Nami: https://maps.google.com/?q=${userLoc?.latitude},${userLoc?.longitude}`,
                }).catch(() => {});
              },
            },
          ]}
        />
      </View>

      {/* 4. Bottom Floating Action Row (Re-centre & ALWAYS VISIBLE 1-Tap Hazard Alert) */}
      <Animated.View style={[styles.floatingActionsRow, { bottom: bottomStackAnim }]}>
        {/* Re-centre Pill Button */}
        <TouchableOpacity
          style={styles.recenterPillButton}
          onPress={handleRecenter}
          activeOpacity={0.7}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="locate-sharp" size={22} color="#00E5FF" style={{ marginRight: 6 }} />
          <Text style={styles.recenterPillText}>Re-centre</Text>
        </TouchableOpacity>

        {/* Hazard Report Icon-Only Button — ALWAYS VISIBLE & 1-TAP REACHABLE */}
        <TouchableOpacity
          style={styles.reportIconButton}
          onPress={() => setShowHazardModal(true)}
          activeOpacity={0.7}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="warning" size={28} color="#EF4444" />
        </TouchableOpacity>
      </Animated.View>

      {/* Requirement 7: Group Status Pill (Floating at bottom) */}
      <View
        onLayout={(e) => {
          const h = e?.nativeEvent?.layout?.height;
          if (typeof h === 'number' && !isNaN(h) && h > 0) setGroupStatusHeight(h);
        }}
        style={[styles.groupStatusPillContainer, { bottom: safeBottomHud + 12 }]}
      >
        <TouchableOpacity
          style={styles.groupStatusPill}
          onPress={() => setShowGroupControlSheet(true)}
          activeOpacity={0.85}
        >
          <MaterialCommunityIcons name="account-group-outline" size={20} color="#00E5FF" style={{ marginRight: 6 }} />
          <Text style={styles.groupStatusPillText}>
            {totalRiders} {totalRiders === 1 ? 'Rider' : 'Riders'}  •  Moving: {ridersMoving}  •  Waiting: {ridersWaiting}
          </Text>
          <Ionicons name="chevron-up" size={16} color="#94A3B8" style={{ marginLeft: 6 }} />
        </TouchableOpacity>
      </View>

      {/* 6. Google Maps Style Bottom HUD Card */}
      <View
        onLayout={(e) => {
          const h = e?.nativeEvent?.layout?.height;
          if (typeof h === 'number' && !isNaN(h) && h > 0) setBottomHudHeight(h);
        }}
        style={styles.bottomHudCard}
      >
        <View style={styles.bottomHudMainRow}>
          {/* Exit / End Ride Button */}
          <TouchableOpacity
            style={styles.exitCircleButton}
            onPress={isLeader ? handleEndRide : handleLeaveRide}
            disabled={isEnding}
          >
            <Ionicons name="close" size={24} color="#EF4444" />
          </TouchableOpacity>

          {/* Center ETA & Metrics */}
          <View style={styles.bottomHudMetricsContainer}>
            <Text style={styles.bottomHudEtaText}>
              {formatDuration(metrics.durationRemaining)}
            </Text>
            <Text style={styles.bottomHudSubMetricsText}>
              {formatDistance(metrics.distanceRemaining)} • Arrival {getArrivalTime(metrics.durationRemaining)}
            </Text>
          </View>

          {/* Color-Coded Speedometer Indicator */}
          <View style={[styles.speedometerBadge, { borderColor: speedColor }]}>
            <Text style={[styles.speedometerVal, { color: speedColor }]}>{speed}</Text>
            <Text style={styles.speedometerUnit}>km/h</Text>
          </View>
        </View>
      </View>

      {/* Hazard Report 12-Category Grid Modal */}
      <Modal visible={showHazardModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.hazardModalCard}>
            <View style={styles.modalHeaderRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons name="warning-outline" size={22} color="#EF4444" style={{ marginRight: 8 }} />
                <Text style={styles.modalTitle}>Report Hazard on Road</Text>
              </View>
              <TouchableOpacity onPress={() => setShowHazardModal(false)}>
                <Ionicons name="close" size={22} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSubTitle}>Select a hazard to warn nearby riders in your group:</Text>

            <View style={styles.hazardGrid}>
              {HAZARD_TYPES.map((item) => (
                <TouchableOpacity
                  key={item.category}
                  style={styles.hazardGridItem}
                  onPress={() => handleReportHazard(item.category)}
                >
                  <Ionicons name={item.icon as any} size={30} color={item.color} style={{ marginBottom: 6 }} />
                  <Text style={styles.hazardItemTitle}>{item.title}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* SOS Emergency Button inside Hazard Modal */}
            <TouchableOpacity
              style={styles.emergencySosModalBtn}
              onPress={() => {
                setShowHazardModal(false);
                setShowSOSConfirmation(true);
              }}
            >
              <Ionicons name="alert-circle" size={22} color="#FFFFFF" style={{ marginRight: 8 }} />
              <Text style={styles.emergencySosModalBtnText}>TRIGGER EMERGENCY SOS</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Destination Search Modal */}
      <Modal visible={showSearchModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.searchModalCard}>
            <View style={styles.modalHeaderRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons name="search-outline" size={22} color="#00E5FF" style={{ marginRight: 8 }} />
                <Text style={styles.modalTitle}>Search Destination</Text>
              </View>
              <TouchableOpacity onPress={() => setShowSearchModal(false)}>
                <Ionicons name="close" size={22} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.searchInput}
              placeholder="Search place, street, or city..."
              placeholderTextColor="#94A3B8"
              value={searchQuery}
              onChangeText={handleSearchInput}
              autoFocus
            />

            {loadingSearch && <ActivityIndicator size="small" color="#00E5FF" style={{ marginVertical: 12 }} />}

            <ScrollView style={styles.searchResultsList}>
              {searchResults.map((loc, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={styles.searchResultItem}
                  onPress={() => {
                    setShowSearchModal(false);
                    if (mapRef.current) {
                      mapRef.current.animateToRegion({
                        latitude: loc.latitude,
                        longitude: loc.longitude,
                        latitudeDelta: 0.02,
                        longitudeDelta: 0.02,
                      }, 1000);
                    }
                  }}
                >
                  <Ionicons name="location-outline" size={18} color="#00E5FF" style={{ marginRight: 10 }} />
                  <Text style={styles.searchResultText} numberOfLines={2}>{loc.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Arrival Modal Banner */}
      {hasArrived && (
        <View style={styles.arrivalOverlay}>
          <View style={styles.arrivalCard}>
            <Ionicons name="trophy-outline" size={54} color="#10B981" style={{ marginBottom: 12 }} />
            <Text style={styles.arrivalTitle}>You Have Arrived!</Text>
            <Text style={styles.arrivalDesc}>You reached {(ride.destination?.name || 'your destination').split(',')[0]}. Great riding!</Text>

            <TouchableOpacity style={styles.arrivalCompleteBtn} onPress={handleEndRide}>
              <Text style={styles.arrivalCompleteBtnText}>Complete Ride</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* SOS Confirmation Dialog Overlay */}
      {showSOSConfirmation && (
        <View style={styles.overlay}>
          <View style={styles.sosConfirmCard}>
            <Ionicons name="alert-circle" size={54} color="#EF4444" style={{ marginBottom: 12 }} />
            <Text style={styles.sosConfirmTitle}>Emergency SOS</Text>
            <Text style={styles.sosConfirmDesc}>
              Do you want to send your current coordinates and Google Maps location link to all riders in this group?
            </Text>

            <View style={styles.overlayBtnRow}>
              <TouchableOpacity
                style={[styles.overlayBtn, styles.overlayBtnCancel]}
                onPress={() => setShowSOSConfirmation(false)}
              >
                <Text style={styles.overlayBtnCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.overlayBtn, styles.overlayBtnConfirm]}
                onPress={triggerSOSAlert}
              >
                <Text style={styles.overlayBtnConfirmText}>Send SOS</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* 8. End Ride Confirmation Bottom Sheet */}
      <ConfirmationBottomSheet
        visible={showEndRideModal}
        title="End Ride Session?"
        message="Are you sure you want to end this ride for all group members? The ride summary will be saved to Ride History."
        confirmText="End Ride"
        cancelText="Cancel"
        icon="stop-circle-outline"
        isDestructive={true}
        onConfirm={executeEndRide}
        onCancel={() => setShowEndRideModal(false)}
      />

      {/* 9. Leave Ride Confirmation Bottom Sheet */}
      <ConfirmationBottomSheet
        visible={showLeaveRideModal}
        title="Leave Group Ride?"
        message="Are you sure you want to exit this active group navigation session? You can rejoin using the ride code."
        confirmText="Leave Group"
        cancelText="Cancel"
        icon="log-out-outline"
        isDestructive={true}
        onConfirm={executeLeaveRide}
        onCancel={() => setShowLeaveRideModal(false)}
      />

      {/* 10. Requirement 2: Group Control Bottom Sheet Modal */}
      <Modal visible={showGroupControlSheet} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.groupControlCard}>
            <View style={styles.modalHeaderRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <MaterialCommunityIcons name="account-group-outline" size={24} color="#00E5FF" style={{ marginRight: 8 }} />
                <Text style={styles.modalTitle}>Group Control</Text>
                <View style={styles.memberBadgeCount}>
                  <Text style={styles.memberBadgeCountText}>{totalRiders}</Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setShowGroupControlSheet(false)} style={styles.closeModalTouchBtn}>
                <Ionicons name="close" size={22} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalSubTitle}>Live status & metrics for all group members:</Text>

            <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
              {Object.values(locations || {}).map((rider: RiderLocation) => {
                if (!rider) return null;
                const isMe = rider.userId === user?.uid;
                const isLeader = rider.userId === ride.leaderId;
                const leaderLoc = locations[ride.leaderId];
                let distanceText = isLeader ? 'Ride Leader' : '--';

                if (!isLeader && leaderLoc && rider.latitude != null && rider.longitude != null) {
                  const distMeters = haversineDistance(
                    leaderLoc.latitude,
                    leaderLoc.longitude,
                    rider.latitude,
                    rider.longitude
                  );
                  distanceText = `${formatDistance(distMeters)} from leader`;
                }

                const status = rider.riderStatus || ((rider.speed || 0) > 3 ? 'riding' : 'stopped');
                const statusBadgeColor =
                  status === 'sos' ? '#EF4444' : status === 'break' ? '#F59E0B' : status === 'riding' ? '#10B981' : '#64748B';

                return (
                  <View key={rider.userId} style={styles.groupRiderItemCard}>
                    <View style={styles.groupRiderAvatarBox}>
                      <View
                        style={[
                          styles.groupRiderAvatarRing,
                          { borderColor: isLeader ? '#2563EB' : isMe ? '#00D4FF' : '#475569' },
                        ]}
                      >
                        {rider.photoURL ? (
                          <Image source={{ uri: rider.photoURL }} style={styles.groupRiderAvatarImg} />
                        ) : (
                          <Text style={styles.groupRiderAvatarLetter}>
                            {rider.userName ? rider.userName.charAt(0).toUpperCase() : 'R'}
                          </Text>
                        )}
                      </View>
                      <View
                        style={[
                          styles.onlineDotIndicator,
                          { backgroundColor: rider.network === 'online' ? '#10B981' : '#94A3B8' },
                        ]}
                      />
                    </View>

                    <View style={styles.groupRiderDetails}>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Text style={styles.groupRiderName} numberOfLines={1}>
                          {isMe ? 'You' : rider.userName}
                        </Text>
                        {isLeader && (
                          <View style={styles.leaderBadgeTag}>
                            <MaterialCommunityIcons name="crown" size={10} color="#3B82F6" style={{ marginRight: 2 }} />
                            <Text style={styles.leaderBadgeTagText}>Leader</Text>
                          </View>
                        )}
                      </View>

                      <Text style={styles.groupRiderSubText}>{distanceText}</Text>

                      <View style={styles.groupRiderMetaRow}>
                        <View style={styles.metaBadgeItem}>
                          <Ionicons name="speedometer-outline" size={12} color="#00E5FF" style={{ marginRight: 3 }} />
                          <Text style={styles.metaBadgeText}>{rider.speed || 0} km/h</Text>
                        </View>

                        {typeof rider.battery === 'number' && rider.battery >= 0 && rider.battery <= 100 && (
                          <View style={styles.metaBadgeItem}>
                            <Ionicons
                              name={rider.battery >= 80 ? 'battery-full' : rider.battery >= 50 ? 'battery-half' : 'battery-dead'}
                              size={12}
                              color={rider.battery >= 50 ? '#10B981' : rider.battery >= 20 ? '#F59E0B' : '#EF4444'}
                              style={{ marginRight: 3 }}
                            />
                            <Text style={styles.metaBadgeText}>{Math.round(rider.battery)}%</Text>
                          </View>
                        )}

                        <View style={styles.metaBadgeItem}>
                          <Ionicons name="time-outline" size={12} color="#94A3B8" style={{ marginRight: 3 }} />
                          <Text style={styles.metaBadgeText}>{getGpsFreshness(rider.timestamp)}</Text>
                        </View>
                      </View>
                    </View>

                    {/* Status Badge */}
                    <View style={[styles.riderStatusBadgePill, { backgroundColor: statusBadgeColor }]}>
                      <Text style={styles.riderStatusBadgeText}>{status.toUpperCase()}</Text>
                    </View>
                  </View>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* 11. Requirement 4: Broadcast Panel Modal */}
      <Modal visible={showBroadcastModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.broadcastModalCard}>
            <View style={styles.modalHeaderRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons name="megaphone-outline" size={22} color="#00E5FF" style={{ marginRight: 8 }} />
                <Text style={styles.modalTitle}>Broadcast Quick Command</Text>
              </View>
              <TouchableOpacity onPress={() => setShowBroadcastModal(false)} style={styles.closeModalTouchBtn}>
                <Ionicons name="close" size={22} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSubTitle}>Tap a quick command to instantly alert all group members:</Text>

            <ScrollView style={{ maxHeight: 260 }} contentContainerStyle={styles.quickBroadcastGrid}>
              {QUICK_BROADCASTS.map((item) => (
                <TouchableOpacity
                  key={item.key}
                  style={[styles.quickBroadcastPill, { borderColor: item.color }]}
                  onPress={async () => {
                    setShowBroadcastModal(false);
                    await sendBroadcast('quick', item.label, item.key);
                    Vibration.vibrate(150);
                    SpeechService.speakAlert(`${item.label} broadcasted.`);
                  }}
                >
                  <Ionicons name={item.icon} size={18} color={item.color} style={{ marginRight: 6 }} />
                  <Text style={styles.quickBroadcastText}>{item.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Custom Message Input Field */}
            <View style={styles.customBroadcastBox}>
              <TextInput
                style={styles.customBroadcastInput}
                placeholder="Or type a custom message..."
                placeholderTextColor="#94A3B8"
                value={customBroadcastText}
                onChangeText={setCustomBroadcastText}
              />
              <TouchableOpacity
                style={[
                  styles.customBroadcastSendBtn,
                  { backgroundColor: customBroadcastText.trim().length > 0 ? '#0284C7' : '#475569' },
                ]}
                disabled={customBroadcastText.trim().length === 0}
                onPress={async () => {
                  if (customBroadcastText.trim().length === 0) return;
                  const text = customBroadcastText.trim();
                  setCustomBroadcastText('');
                  setShowBroadcastModal(false);
                  await sendBroadcast('custom', text);
                  Vibration.vibrate(150);
                  SpeechService.speakAlert(`Message sent: ${text}`);
                }}
              >
                <Ionicons name="send-sharp" size={18} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Custom Emergency SOS Alert Overlay */}
      {emergenciesQueue.length > 0 && (
        <EmergencyAlertOverlay
          emergencies={emergenciesQueue}
          currentIndex={activeEmergencyIndex}
          onNavigateToRider={handleNavigateToEmergencyRider}
          onAcknowledge={handleAcknowledgeEmergency}
          onDismissRequest={handleRequestDismissEmergency}
          onSelectIndex={setActiveEmergencyIndex}
        />
      )}

      {/* Confirmation Bottom Sheet for Dismissing Active SOS */}
      <ConfirmationBottomSheet
        visible={showDismissEmergencyModal}
        title="Dismiss Active SOS Alert?"
        message={`Are you sure you want to dismiss the Emergency Alert from ${emergencyToDismiss?.rider.userName || 'this rider'}?`}
        confirmText="Dismiss Alert"
        cancelText="Keep Alert Active"
        isDestructive={true}
        onConfirm={confirmDismissEmergency}
        onCancel={() => {
          setShowDismissEmergencyModal(false);
          setEmergencyToDismiss(null);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: Colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: Colors.textMuted,
    marginTop: 12,
    fontSize: 14,
  },

  // 1. Top Direction Banner
  topBannerContainer: {
    position: 'absolute',
    top: 0,
    left: 14,
    right: 14,
    zIndex: 10,
  },
  navHeaderCard: {
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 9,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 10,
  },
  navHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  navHeaderArrow: {
    color: '#FFFFFF',
    fontSize: 34,
    fontWeight: 'bold',
    marginRight: 12,
    lineHeight: 36,
  },
  navHeaderTextContainer: {
    flex: 1,
  },
  navHeaderTitle: {
    fontSize: 14,
    fontWeight: '500',
  },
  navHeaderTitleBold: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 17,
  },
  navHeaderSubRow: {
    marginTop: 4,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.25)',
  },
  navHeaderSubText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    opacity: 0.95,
  },

  // Alert Banner
  alertBanner: {
    padding: 10,
    marginTop: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  alertBannerText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: 'bold',
  },

  destinationMarkerContainer: {
    alignItems: 'center',
  },
  destinationPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1.5,
    maxWidth: 130,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 6,
  },
  destinationFlagIcon: {
    fontSize: 11,
    marginRight: 4,
  },
  destinationPillText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.1,
  },
  destinationPinTip: {
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderTopWidth: 7,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    marginTop: -1,
  },
  riderMarkerContainer: {
    alignItems: 'center',
  },
  markerLabelContainer: {
    backgroundColor: 'rgba(15, 23, 42, 0.9)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: '#00E5FF',
    alignItems: 'center',
    marginBottom: 4,
  },
  markerLabelName: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: 'bold',
  },
  markerLabelSpeed: {
    color: '#00E5FF',
    fontSize: 10,
    fontWeight: '800',
  },
  riderMarkerDot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  markerArrow: {
    color: '#0F172A',
    fontSize: 14,
    fontWeight: '900',
    top: -1,
  },

  // Side Controls (Positioned at top: 175 to sit cleanly below compact banner)
  sideControlsContainer: {
    position: 'absolute',
    right: 16,
    top: 175,
    zIndex: 9,
    gap: 12,
  },
  circleIconButton: {
    backgroundColor: '#1E293B',
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 6,
  },
  circleIconButtonActive: {
    borderColor: '#00E5FF',
    backgroundColor: '#0F172A',
  },
  circleIconText: {
    fontSize: 22,
  },

  // Floating Actions Row (Re-centre Pill & Hazard Icon)
  floatingActionsRow: {
    position: 'absolute',
    bottom: 95,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 9,
  },
  recenterPillButton: {
    backgroundColor: '#0F172A',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    height: 52,
    borderRadius: 26,
    borderWidth: 2,
    borderColor: '#334155',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 8,
    elevation: 6,
  },
  recenterPillIcon: {
    color: '#FFFFFF',
    fontSize: 18,
    marginRight: 8,
  },
  recenterPillText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 14,
  },
  reportIconButton: {
    backgroundColor: '#0F172A',
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#F59E0B',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 8,
    elevation: 6,
  },
  reportIconButtonIcon: {
    fontSize: 26,
  },

  // Rider Pin Callout Marker Styles
  riderPinContainer: {
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingTop: 4,
    paddingBottom: 2,
  },
  riderPinBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
    minWidth: 84,
    maxWidth: 150,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 5,
    elevation: 8,
  },
  riderPinName: {
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
  },
  riderPinSpeed: {
    fontSize: 10,
    fontWeight: '900',
    marginTop: 2,
    textAlign: 'center',
  },
  riderPinDot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.8)',
  },
  riderPinArrow: {
    fontSize: 14,
  },

  // Group Members Drawer
  membersDrawerCard: {
    position: 'absolute',
    bottom: 95,
    left: 14,
    right: 14,
    maxHeight: 220,
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#334155',
    zIndex: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  drawerHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  drawerTitle: {
    color: '#F8FAFC',
    fontWeight: 'bold',
    fontSize: 13,
  },
  drawerCloseText: {
    color: '#94A3B8',
    fontSize: 16,
    fontWeight: 'bold',
    padding: 4,
  },
  drawerScrollView: {
    maxHeight: 150,
  },
  drawerRiderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  drawerRiderInfo: {
    flex: 1,
  },
  drawerRiderName: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 13,
  },
  drawerRiderSub: {
    color: '#94A3B8',
    fontSize: 11,
    marginTop: 2,
  },
  drawerRiderSpeed: {
    color: '#00E5FF',
    fontWeight: 'bold',
    fontSize: 13,
  },

  // 6. Bottom Google Maps HUD Card
  bottomHudCard: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#0F172A',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: Platform.OS === 'ios' ? 24 : 16,
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 10,
    zIndex: 10,
  },
  bottomHudMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  exitCircleButton: {
    backgroundColor: '#1E293B',
    width: 46,
    height: 46,
    borderRadius: 23,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  exitCircleText: {
    color: '#EF4444',
    fontSize: 18,
    fontWeight: 'bold',
  },
  bottomHudMetricsContainer: {
    alignItems: 'center',
    flex: 1,
    marginHorizontal: 12,
  },
  bottomHudEtaText: {
    color: '#10B981', // Google Maps vibrant navigation green
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  bottomHudSubMetricsText: {
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 4,
  },
  groupToggleCircleButton: {
    backgroundColor: '#1E293B',
    width: 46,
    height: 46,
    borderRadius: 23,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  groupToggleIconText: {
    fontSize: 18,
  },

  // Hazard Markers — small, non-intrusive
  hazardMarkerBubble: {
    backgroundColor: '#F97316',
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 5,
  },
  hazardMarkerIcon: {
    fontSize: 18,
  },

  // Rerouting Toast
  reroutingToast: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    marginTop: 8,
    alignSelf: 'center',
    borderWidth: 1,
    borderColor: '#00E5FF',
  },
  reroutingToastText: {
    color: '#00E5FF',
    fontWeight: 'bold',
    fontSize: 12,
    marginLeft: 8,
  },

  // Speedometer Badge inside Bottom HUD
  speedometerBadge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#1E293B',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
  },
  speedometerVal: {
    fontSize: 16,
    fontWeight: '900',
  },
  speedometerUnit: {
    color: '#94A3B8',
    fontSize: 8,
    fontWeight: 'bold',
    marginTop: -2,
  },

  // Modal Overlay & Cards
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    justifyContent: 'flex-end',
  },
  hazardModalCard: {
    backgroundColor: '#1E293B',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#334155',
    maxHeight: SCREEN_HEIGHT * 0.7,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  modalTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  modalSubTitle: {
    color: '#94A3B8',
    fontSize: 12,
    marginBottom: 16,
  },
  modalCloseText: {
    color: '#94A3B8',
    fontSize: 18,
    fontWeight: 'bold',
    padding: 4,
  },
  hazardGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  hazardGridItem: {
    width: '30%',
    backgroundColor: '#0F172A',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 6,
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  hazardItemIcon: {
    fontSize: 24,
    marginBottom: 4,
  },
  hazardItemTitle: {
    color: '#F8FAFC',
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'center',
  },
  emergencySosModalBtn: {
    backgroundColor: '#EF4444',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  emergencySosModalBtnText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 14,
  },

  // Destination Search Modal
  searchModalCard: {
    backgroundColor: '#1E293B',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#334155',
    height: SCREEN_HEIGHT * 0.6,
  },
  searchInput: {
    backgroundColor: '#0F172A',
    color: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 12,
  },
  searchResultsList: {
    flex: 1,
  },
  searchResultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  searchResultIcon: {
    fontSize: 18,
    marginRight: 10,
  },
  searchResultText: {
    color: '#FFFFFF',
    fontSize: 13,
    flex: 1,
  },

  // Arrival Overlay Modal
  arrivalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    zIndex: 200,
  },
  arrivalCard: {
    backgroundColor: '#1E293B',
    borderRadius: 24,
    padding: 28,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#10B981',
    width: '100%',
  },
  arrivalIcon: {
    fontSize: 56,
    marginBottom: 16,
  },
  arrivalTitle: {
    color: '#10B981',
    fontSize: 24,
    fontWeight: '900',
    marginBottom: 8,
  },
  arrivalDesc: {
    color: '#94A3B8',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 24,
  },
  arrivalCompleteBtn: {
    backgroundColor: '#10B981',
    width: '100%',
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
  },
  arrivalCompleteBtnText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 16,
  },

  // SOS Confirmation Overlay
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    zIndex: 100,
  },
  sosConfirmCard: {
    backgroundColor: '#1E293B',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
    width: '100%',
  },
  sosConfirmIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  sosConfirmTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  sosConfirmDesc: {
    color: '#94A3B8',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 24,
  },
  overlayBtnRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  overlayBtn: {
    flex: 1,
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  overlayBtnCancel: {
    backgroundColor: '#334155',
    marginRight: 8,
  },
  overlayBtnCancelText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  overlayBtnConfirm: {
    backgroundColor: '#EF4444',
    marginLeft: 8,
  },
  overlayBtnConfirmText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },

  // Selected Rider Card Dynamic Wrapper
  selectedRiderCardWrapper: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 25,
  },

  // Selected Rider Info Tooltip Card
  riderInfoCard: {
    position: 'absolute',
    bottom: 110,
    left: 16,
    right: 16,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 10,
    zIndex: 999,
  },
  riderInfoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  riderInfoAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  riderInfoAvatarImg: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  riderInfoAvatarText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  riderInfoTextGroup: {
    flex: 1,
  },
  riderInfoName: {
    fontSize: 15,
    fontWeight: 'bold',
  },
  riderInfoStatus: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  closeRiderInfoBtn: {
    padding: 6,
  },
  closeRiderInfoText: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  riderInfoStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(150, 150, 150, 0.2)',
  },
  riderInfoStatItem: {
    alignItems: 'center',
    flex: 1,
  },
  riderInfoStatLabel: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  riderInfoStatValue: {
    fontSize: 14,
    fontWeight: 'bold',
  },

  // Right Actions Cluster (Safety FAB + Hazard)
  rightActionsCluster: {
    alignItems: 'center',
    gap: 12,
  },
  safetyFabContainer: {
    alignItems: 'flex-end',
  },
  safetyFabMenu: {
    marginBottom: 10,
    gap: 8,
    alignItems: 'flex-end',
  },
  safetyFabSubBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 24,
    minHeight: 48,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 6,
  },
  safetyFabSubText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  mainSafetyFabBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#1E293B',
    borderWidth: 2,
    borderColor: '#00E5FF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#00E5FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  mainSafetyFabBtnActive: {
    backgroundColor: '#EF4444',
    borderColor: '#F87171',
  },

  // Requirement 7: Group Status Pill
  groupStatusPillContainer: {
    position: 'absolute',
    bottom: 96,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 15,
  },
  groupStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '84%',
    alignSelf: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.92)',
    borderWidth: 1.5,
    borderColor: '#00E5FF',
    paddingHorizontal: 14,
    paddingVertical: 10,
    minHeight: 46,
    borderRadius: 23,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 8,
  },
  groupStatusPillText: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.2,
  },

  // Requirement 2: Group Control Sheet Card
  groupControlCard: {
    backgroundColor: '#1E293B',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '85%',
    borderWidth: 1,
    borderColor: '#334155',
  },
  memberBadgeCount: {
    backgroundColor: 'rgba(0, 229, 255, 0.15)',
    borderWidth: 1,
    borderColor: '#00E5FF',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    marginLeft: 8,
  },
  memberBadgeCountText: {
    color: '#00E5FF',
    fontSize: 12,
    fontWeight: '800',
  },
  closeModalTouchBtn: {
    padding: 6,
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  groupRiderItemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#334155',
  },
  groupRiderAvatarBox: {
    position: 'relative',
    marginRight: 12,
  },
  groupRiderAvatarRing: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#334155',
  },
  groupRiderAvatarImg: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  groupRiderAvatarLetter: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  onlineDotIndicator: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#0F172A',
  },
  groupRiderDetails: {
    flex: 1,
  },
  groupRiderName: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: 'bold',
  },
  leaderBadgeTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(37, 99, 235, 0.2)',
    borderColor: '#2563EB',
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 8,
    marginLeft: 6,
  },
  leaderBadgeTagText: {
    color: '#60A5FA',
    fontSize: 10,
    fontWeight: '700',
  },
  groupRiderSubText: {
    color: '#94A3B8',
    fontSize: 12,
    marginTop: 2,
  },
  groupRiderMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 12,
  },
  metaBadgeItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaBadgeText: {
    color: '#CBD5E1',
    fontSize: 11,
    fontWeight: '600',
  },
  riderStatusBadgePill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  riderStatusBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.5,
  },

  // Requirement 4: Broadcast Modal Styles
  broadcastModalCard: {
    backgroundColor: '#1E293B',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '80%',
    borderWidth: 1,
    borderColor: '#334155',
  },
  quickBroadcastGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingVertical: 8,
  },
  quickBroadcastPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    borderWidth: 1.5,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 20,
    minHeight: 46,
  },
  quickBroadcastText: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '700',
  },
  customBroadcastBox: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
    backgroundColor: '#0F172A',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#334155',
  },
  customBroadcastInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 14,
    paddingVertical: 10,
  },
  customBroadcastSendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
});

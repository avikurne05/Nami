import React, { useEffect, useRef, useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Share,
  Animated,
  Modal,
  Dimensions,
} from 'react-native';
import MapView, { Marker, Polyline, UrlTile, PROVIDER_GOOGLE } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { StackScreenProps } from '@react-navigation/stack';
import { RootStackParamList } from '../types';
import { formatDuration } from '../utils';
import { useTheme } from '../hooks/useTheme';
import { useSettings } from '../hooks/useSettings';
import { formatDistance, formatSpeed } from '../services/SettingsService';
import SafeScreenWrapper from '../components/SafeScreenWrapper';
import { TopAppBar } from '../components/TopAppBar';
import { NavigationMapStyleDark, NavigationMapStyleLight } from '../constants/MapStyles';

type Props = StackScreenProps<RootStackParamList, 'RideSummary'>;

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function RideSummaryScreen({ route, navigation }: Props) {
  const summary = route?.params?.summary;
  const { colors, isDark } = useTheme();
  const { preferences } = useSettings();

  // Full Screen Interactive Map Modal State
  const [showFullMapModal, setShowFullMapModal] = useState(false);

  // Map References
  const miniMapRef = useRef<MapView | null>(null);
  const fullMapRef = useRef<MapView | null>(null);

  // Entrance Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(24)).current;
  const mapOpacityAnim = useRef(new Animated.Value(0)).current;
  const markerOpacityAnim = useRef(new Animated.Value(0)).current;

  // Route Coordinates & Validation (No fake fallback coordinates)
  const rawRouteCoords = summary?.routeCoordinates || [];
  const validRouteCoords = Array.isArray(rawRouteCoords)
    ? rawRouteCoords.filter(
        (c) => c && typeof c.latitude === 'number' && typeof c.longitude === 'number' && !isNaN(c.latitude) && !isNaN(c.longitude)
      )
    : [];

  const hasValidRoute = validRouteCoords.length >= 2;

  // Progressive Route Drawing State
  const [animatedCoords, setAnimatedCoords] = useState<{ latitude: number; longitude: number }[]>([]);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 400,
        useNativeDriver: true,
      }),
      Animated.timing(mapOpacityAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
    ]).start();

    if (hasValidRoute) {
      // Animate drawing the route over 1.2 seconds
      setAnimatedCoords([validRouteCoords[0]]);
      const totalPoints = validRouteCoords.length;
      const stepDuration = Math.max(15, Math.floor(1200 / totalPoints));
      let currentIndex = 1;

      const interval = setInterval(() => {
        if (currentIndex < totalPoints) {
          const nextBatchIndex = Math.min(currentIndex + Math.max(1, Math.floor(totalPoints / 40)), totalPoints);
          setAnimatedCoords(validRouteCoords.slice(0, nextBatchIndex));
          currentIndex = nextBatchIndex;
        } else {
          clearInterval(interval);
          // Fade in start/finish markers once route drawing completes
          Animated.timing(markerOpacityAnim, {
            toValue: 1,
            duration: 350,
            useNativeDriver: true,
          }).start();
        }
      }, stepDuration);

      return () => clearInterval(interval);
    }
  }, [fadeAnim, slideAnim, mapOpacityAnim, hasValidRoute]);

  // Formatted Timestamps
  const formattedStartTime = summary?.startTime
    ? new Date(summary.startTime).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
      })
    : '10:00 AM';

  const formattedEndTime = summary?.endTime
    ? new Date(summary.endTime).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
      })
    : '11:15 AM';

  // Calculate Region for Map Camera
  const startLat = hasValidRoute ? validRouteCoords[0].latitude : 28.6139;
  const startLng = hasValidRoute ? validRouteCoords[0].longitude : 77.2090;
  const finishLat = hasValidRoute ? validRouteCoords[validRouteCoords.length - 1].latitude : startLat;
  const finishLng = hasValidRoute ? validRouteCoords[validRouteCoords.length - 1].longitude : startLng;

  const latDelta = hasValidRoute ? Math.max(Math.abs(finishLat - startLat) * 1.5, 0.015) : 0.02;
  const lngDelta = hasValidRoute ? Math.max(Math.abs(finishLng - startLng) * 1.5, 0.015) : 0.02;

  const initialRegion = {
    latitude: (startLat + finishLat) / 2,
    longitude: (startLng + finishLng) / 2,
    latitudeDelta: latDelta,
    longitudeDelta: lngDelta,
  };

  const fitMapToRoute = (ref: MapView | null) => {
    if (ref && hasValidRoute) {
      ref.fitToCoordinates(validRouteCoords, {
        edgePadding: { top: 60, right: 60, bottom: 60, left: 60 },
        animated: true,
      });
    }
  };

  const handleShareSummary = async () => {
    try {
      const distance = (summary?.totalDistance ?? 0).toFixed(1);
      const duration = formatDuration(summary?.duration ?? 0);
      const dest = summary?.destinationName || 'Destination';

      await Share.share({
        message: `Ride Completed on BikeRadar!\n\nDestination: ${dest}\nDistance: ${distance} km\nDuration: ${duration}\nAvg Speed: ${Math.round(summary?.averageSpeed ?? 0)} km/h\n\nRide together with BikeRadar!`,
      });
    } catch (e) {
      console.error('Failed to share ride summary:', e);
    }
  };

  const hasGroup = (summary?.membersCount ?? 1) > 1;
  const startLocName = summary?.startLocationName ? summary.startLocationName.split(',')[0].trim() : 'Start';
  const destLocName = summary?.destinationName ? summary.destinationName.split(',')[0].trim() : 'Finish';

  return (
    <SafeScreenWrapper style={[styles.container, { backgroundColor: colors.background }]}>
      <TopAppBar title="Ride Summary" onBack={() => navigation.replace('Home')} />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
          {/* 1. Refined Completion Badge & Header */}
          <View style={styles.completionHeader}>
            <View style={[styles.successBadgeOuter, { backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : 'rgba(16, 185, 129, 0.1)' }]}>
              <View style={styles.successBadgeInner}>
                <Ionicons name="checkmark-circle" size={54} color="#10B981" />
              </View>
            </View>

            <Text style={[styles.completionTitle, { color: colors.text }]}>Ride Completed!</Text>
            <Text style={[styles.rideTitle, { color: colors.primary }]}>{summary?.name || 'Group Ride'}</Text>
            <Text style={[styles.rideDestination, { color: colors.textMuted }]}>
              To {destLocName}
            </Text>
          </View>

          {/* 2. Premium Route Preview Map Card or Empty State */}
          {hasValidRoute ? (
            <TouchableOpacity
              activeOpacity={0.92}
              onPress={() => setShowFullMapModal(true)}
              style={[styles.mapCardContainer, { borderColor: colors.border, backgroundColor: colors.card }]}
            >
              {/* Top-Right Expand Icon Hint */}
              <View style={styles.tapExpandHint}>
                <Ionicons name="expand-outline" size={16} color="#FFFFFF" />
              </View>

              <Animated.View style={{ flex: 1, opacity: mapOpacityAnim }}>
                <MapView
                  ref={miniMapRef}
                  style={styles.miniMap}
                  provider={PROVIDER_GOOGLE}
                  customMapStyle={isDark ? NavigationMapStyleDark : NavigationMapStyleLight}
                  initialRegion={initialRegion}
                  onMapReady={() => fitMapToRoute(miniMapRef.current)}
                  scrollEnabled={false}
                  zoomEnabled={false}
                  rotateEnabled={false}
                  pitchEnabled={false}
                  showsUserLocation={false}
                  showsCompass={false}
                  showsScale={false}
                  showsBuildings={false}
                  showsTraffic={false}
                  showsIndoors={false}
                  showsPointsOfInterest={false}
                >
                  <UrlTile
                    urlTemplate={colors.mapTileUrl}
                    maximumZ={19}
                    flipY={false}
                    tileSize={512}
                  />

                  {/* Route Polyline — Anti-Aliased Premium Blue */}
                  <Polyline
                    coordinates={animatedCoords}
                    strokeColor={isDark ? '#00D4FF' : '#0284C7'}
                    strokeWidth={6}
                    lineCap="round"
                    lineJoin="round"
                  />

                  {/* Start Marker */}
                  <Marker coordinate={validRouteCoords[0]} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
                    <Animated.View style={[styles.startBadgeOuter, { opacity: markerOpacityAnim }]}>
                      <View style={styles.startBadgeInner} />
                    </Animated.View>
                  </Marker>

                  {/* Finish Marker */}
                  <Marker coordinate={validRouteCoords[validRouteCoords.length - 1]} anchor={{ x: 0.5, y: 1.0 }} tracksViewChanges={false}>
                    <Animated.View style={[styles.finishMarkerContainer, { opacity: markerOpacityAnim }]}>
                      <Ionicons name="location-sharp" size={30} color="#EF4444" />
                    </Animated.View>
                  </Marker>
                </MapView>
              </Animated.View>

              {/* Floating Semi-Transparent Compact Info Card */}
              <View style={[styles.floatingInfoCard, { backgroundColor: isDark ? 'rgba(15, 23, 42, 0.88)' : 'rgba(255, 255, 255, 0.92)' }]}>
                <View style={styles.floatingInfoLocRow}>
                  <Text style={[styles.floatingLocText, { color: colors.text }]} numberOfLines={1}>
                    {startLocName}
                  </Text>
                  <Text style={styles.floatingArrow}> → </Text>
                  <Text style={[styles.floatingLocText, { color: colors.primary }]} numberOfLines={1}>
                    {destLocName}
                  </Text>
                </View>
                <Text style={[styles.floatingStatsText, { color: colors.textMuted }]}>
                  {formatDistance(summary?.totalDistance ?? 0, preferences.distanceUnits)} • {formatDuration(summary?.duration ?? 0)}
                </Text>
              </View>
            </TouchableOpacity>
          ) : (
            /* Empty State Placeholder Card */
            <View style={[styles.emptyMapCardContainer, { borderColor: colors.border, backgroundColor: colors.card }]}>
              <View style={[styles.emptyIconCircle, { backgroundColor: isDark ? 'rgba(51, 65, 85, 0.4)' : 'rgba(241, 245, 249, 0.9)' }]}>
                <Ionicons name="map-outline" size={36} color={colors.textMuted} />
              </View>
              <Text style={[styles.emptyStateTitle, { color: colors.text }]}>Route preview unavailable</Text>
              <Text style={[styles.emptyStateSub, { color: colors.textMuted }]}>
                GPS route coordinates were not captured for this ride session.
              </Text>
            </View>
          )}

          {/* 3. Hero Distance Metric Card */}
          <View style={[styles.heroMetricCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.heroMetricTop}>
              <Ionicons name="navigate-outline" size={26} color={colors.primary} style={{ marginRight: 8 }} />
              <Text style={[styles.heroMetricLabel, { color: colors.textMuted }]}>TOTAL DISTANCE</Text>
            </View>
            <View style={styles.heroMetricValueRow}>
              <Text style={[styles.heroMetricValue, { color: colors.text }]}>
                {formatDistance(summary?.totalDistance ?? 0, preferences.distanceUnits)}
              </Text>
            </View>
          </View>

          {/* 4. Secondary Metrics Grid */}
          <View style={styles.metricsGrid}>
            <View style={[styles.metricBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Ionicons name="time-outline" size={22} color="#3B82F6" style={{ marginBottom: 6 }} />
              <Text style={[styles.metricBoxLabel, { color: colors.textMuted }]}>DURATION</Text>
              <Text style={[styles.metricBoxValue, { color: colors.text }]}>
                {formatDuration(summary?.duration ?? 0)}
              </Text>
            </View>

            <View style={[styles.metricBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Ionicons name="speedometer-outline" size={22} color="#F59E0B" style={{ marginBottom: 6 }} />
              <Text style={[styles.metricBoxLabel, { color: colors.textMuted }]}>AVG SPEED</Text>
              <Text style={[styles.metricBoxValue, { color: colors.text }]}>
                {formatSpeed(summary?.averageSpeed ?? 0, preferences.distanceUnits)}
              </Text>
            </View>

            <View style={[styles.metricBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Ionicons name="flash-outline" size={22} color="#EF4444" style={{ marginBottom: 6 }} />
              <Text style={[styles.metricBoxLabel, { color: colors.textMuted }]}>TOP SPEED</Text>
              <Text style={[styles.metricBoxValue, { color: colors.text }]}>
                {formatSpeed(summary?.topSpeed ?? 0, preferences.distanceUnits)}
              </Text>
            </View>
          </View>

          {/* 5. Clean Route Timeline */}
          <View style={[styles.timelineCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.timelineHeader, { color: colors.textMuted }]}>ROUTE TIMELINE</Text>

            <View style={styles.timelineRow}>
              <View style={styles.nodeCol}>
                <Ionicons name="ellipse" size={14} color="#10B981" />
                <View style={[styles.timelineConnector, { backgroundColor: colors.border }]} />
              </View>

              <View style={styles.timelineContent}>
                <Text style={[styles.timelineTime, { color: colors.textMuted }]}>DEPARTED • {formattedStartTime}</Text>
                <Text style={[styles.timelineLocation, { color: colors.text }]} numberOfLines={1}>
                  {summary?.startLocationName || 'Origin Location'}
                </Text>
              </View>
            </View>

            <View style={styles.timelineRow}>
              <View style={styles.nodeCol}>
                <Ionicons name="location" size={18} color="#EF4444" />
              </View>

              <View style={styles.timelineContent}>
                <Text style={[styles.timelineTime, { color: colors.textMuted }]}>ARRIVED • {formattedEndTime}</Text>
                <Text style={[styles.timelineLocation, { color: colors.text }]} numberOfLines={1}>
                  {summary?.destinationName || 'Destination'}
                </Text>
              </View>
            </View>
          </View>

          {/* 6. Group Members Section (ONLY if riding with group) */}
          {hasGroup && (
            <View style={[styles.groupSectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.groupHeaderRow}>
                <Ionicons name="people-outline" size={20} color={colors.text} style={{ marginRight: 8 }} />
                <Text style={[styles.groupTitle, { color: colors.text }]}>
                  Riders Completed ({summary?.membersCount})
                </Text>
              </View>

              <View style={styles.membersList}>
                <View style={styles.memberRow}>
                  <View style={[styles.memberAvatar, { backgroundColor: colors.primary }]}>
                    <Text style={styles.memberAvatarText}>R</Text>
                  </View>
                  <View style={styles.memberInfo}>
                    <Text style={[styles.memberName, { color: colors.text }]}>Group Members</Text>
                    <Text style={[styles.memberRole, { color: colors.textMuted }]}>Completed together</Text>
                  </View>
                  <View style={styles.statusBadge}>
                    <Ionicons name="checkmark-circle" size={14} color="#10B981" style={{ marginRight: 4 }} />
                    <Text style={styles.statusBadgeText}>Finished</Text>
                  </View>
                </View>
              </View>
            </View>
          )}

          {/* 7. Action Buttons */}
          <View style={styles.actionsContainer}>
            <TouchableOpacity
              style={[styles.primaryButton, { backgroundColor: colors.primary }]}
              onPress={() => navigation.replace('Home')}
            >
              <Ionicons name="checkmark-sharp" size={20} color="#FFFFFF" style={{ marginRight: 8 }} />
              <Text style={styles.primaryButtonText}>Done</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.secondaryButton, { borderColor: colors.border, backgroundColor: colors.card }]}
              onPress={handleShareSummary}
            >
              <Ionicons name="share-outline" size={20} color={colors.primary} style={{ marginRight: 8 }} />
              <Text style={[styles.secondaryButtonText, { color: colors.text }]}>Share Ride Summary</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </ScrollView>

      {/* 8. Full-Screen Interactive Route Modal */}
      {hasValidRoute && (
        <Modal visible={showFullMapModal} animationType="slide" onRequestClose={() => setShowFullMapModal(false)}>
          <View style={[styles.fullMapContainer, { backgroundColor: colors.background }]}>
            <TopAppBar title="Full Route Summary" onBack={() => setShowFullMapModal(false)} />

            <MapView
              ref={fullMapRef}
              style={styles.fullMap}
              provider={PROVIDER_GOOGLE}
              customMapStyle={isDark ? NavigationMapStyleDark : NavigationMapStyleLight}
              initialRegion={initialRegion}
              onMapReady={() => fitMapToRoute(fullMapRef.current)}
              scrollEnabled={true}
              zoomEnabled={true}
              rotateEnabled={true}
            >
              <UrlTile
                urlTemplate={colors.mapTileUrl}
                maximumZ={19}
                flipY={false}
                tileSize={512}
              />

              <Polyline
                coordinates={validRouteCoords}
                strokeColor={isDark ? '#00D4FF' : '#0284C7'}
                strokeWidth={7}
                lineCap="round"
                lineJoin="round"
              />

              <Marker coordinate={validRouteCoords[0]} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
                <View style={styles.startBadgeOuter}>
                  <View style={styles.startBadgeInner} />
                </View>
              </Marker>

              <Marker coordinate={validRouteCoords[validRouteCoords.length - 1]} anchor={{ x: 0.5, y: 1.0 }} tracksViewChanges={false}>
                <Ionicons name="location-sharp" size={36} color="#EF4444" />
              </Marker>
            </MapView>

            {/* Re-center Route Button */}
            <TouchableOpacity
              style={[styles.reCenterBtn, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderColor: colors.border }]}
              onPress={() => fitMapToRoute(fullMapRef.current)}
            >
              <Ionicons name="locate-outline" size={20} color={colors.primary} />
            </TouchableOpacity>

            {/* Floating Close Button */}
            <TouchableOpacity
              style={[styles.fullMapCloseBtn, { backgroundColor: colors.primary }]}
              onPress={() => setShowFullMapModal(false)}
            >
              <Ionicons name="close" size={22} color="#FFFFFF" style={{ marginRight: 6 }} />
              <Text style={styles.fullMapCloseText}>Close Preview</Text>
            </TouchableOpacity>
          </View>
        </Modal>
      )}
    </SafeScreenWrapper>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  completionHeader: {
    alignItems: 'center',
    marginBottom: 20,
  },
  successBadgeOuter: {
    width: 84,
    height: 84,
    borderRadius: 42,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  successBadgeInner: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  completionTitle: {
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  rideTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginTop: 4,
  },
  rideDestination: {
    fontSize: 13,
    marginTop: 2,
  },
  mapCardContainer: {
    height: 230,
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: 1,
    marginBottom: 16,
    position: 'relative',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 4,
  },
  emptyMapCardContainer: {
    height: 190,
    borderRadius: 22,
    borderWidth: 1,
    marginBottom: 16,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  emptyIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  emptyStateTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  emptyStateSub: {
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 17,
  },
  tapExpandHint: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  miniMap: {
    width: '100%',
    height: '100%',
  },
  startBadgeOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  startBadgeInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#10B981',
  },
  finishMarkerContainer: {
    alignItems: 'center',
  },
  floatingInfoCard: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    right: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    zIndex: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 5,
  },
  floatingInfoLocRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  floatingLocText: {
    fontSize: 13,
    fontWeight: '800',
    maxWidth: SCREEN_WIDTH * 0.35,
  },
  floatingArrow: {
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: 'bold',
  },
  floatingStatsText: {
    fontSize: 11,
    fontWeight: '700',
  },
  heroMetricCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  heroMetricTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  heroMetricLabel: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  heroMetricValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: 8,
  },
  heroMetricValue: {
    fontSize: 38,
    fontWeight: '900',
    letterSpacing: -1,
  },
  heroMetricUnit: {
    fontSize: 18,
    fontWeight: '800',
    marginLeft: 6,
  },
  metricsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14,
    gap: 10,
  },
  metricBox: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  metricBoxLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 4,
  },
  metricBoxValue: {
    fontSize: 18,
    fontWeight: '900',
  },
  unitText: {
    fontSize: 11,
    fontWeight: '600',
  },
  timelineCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 18,
    marginBottom: 16,
  },
  timelineHeader: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginBottom: 14,
  },
  timelineRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    minHeight: 48,
  },
  nodeCol: {
    alignItems: 'center',
    width: 24,
    marginRight: 12,
  },
  timelineConnector: {
    width: 2,
    flex: 1,
    marginVertical: 4,
  },
  timelineContent: {
    flex: 1,
  },
  timelineTime: {
    fontSize: 11,
    fontWeight: '700',
  },
  timelineLocation: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 2,
  },
  groupSectionCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 18,
    marginBottom: 16,
  },
  groupHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  groupTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  membersList: {
    gap: 10,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  memberAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  memberAvatarText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 14,
  },
  memberInfo: {
    flex: 1,
  },
  memberName: {
    fontSize: 14,
    fontWeight: '600',
  },
  memberRole: {
    fontSize: 12,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusBadgeText: {
    color: '#10B981',
    fontSize: 12,
    fontWeight: '700',
  },
  actionsContainer: {
    gap: 12,
    marginTop: 10,
  },
  primaryButton: {
    height: 52,
    borderRadius: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  secondaryButton: {
    height: 52,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  secondaryButtonText: {
    fontSize: 15,
    fontWeight: '700',
  },
  fullMapContainer: {
    flex: 1,
  },
  fullMap: {
    flex: 1,
  },
  reCenterBtn: {
    position: 'absolute',
    top: 100,
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 5,
  },
  fullMapCloseBtn: {
    position: 'absolute',
    bottom: 34,
    alignSelf: 'center',
    height: 50,
    paddingHorizontal: 24,
    borderRadius: 25,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  fullMapCloseText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: 'bold',
  },
});

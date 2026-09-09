import React from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Image, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { RiderLocation } from '../types';
import { haversineDistance } from '../utils';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface MapRegion {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}

interface Props {
  riders: RiderLocation[];
  currentUserId?: string;
  leaderId?: string;
  userLocation: { latitude: number; longitude: number } | null;
  mapRegion: MapRegion | null;
  onSelectRider: (rider: RiderLocation) => void;
}

interface OffScreenRider {
  rider: RiderLocation;
  edgeX: number;
  edgeY: number;
  angleRad: number;
  distanceMeters: number;
  arrowIcon: string;
}

export const BikerRadarEdgeIndicator: React.FC<Props> = ({
  riders,
  currentUserId,
  leaderId,
  userLocation,
  mapRegion,
  onSelectRider,
}) => {
  if (!mapRegion || !userLocation || !riders || riders.length === 0) {
    return null;
  }

  // Calculate visible bounds
  const minLat = mapRegion.latitude - mapRegion.latitudeDelta * 0.45;
  const maxLat = mapRegion.latitude + mapRegion.latitudeDelta * 0.45;
  const minLng = mapRegion.longitude - mapRegion.longitudeDelta * 0.45;
  const maxLng = mapRegion.longitude + mapRegion.longitudeDelta * 0.45;

  const offScreenRiders: OffScreenRider[] = [];

  riders.forEach((r) => {
    if (r.userId === currentUserId) return;
    if (r.latitude == null || r.longitude == null || isNaN(r.latitude) || isNaN(r.longitude)) return;

    const isOffScreen =
      r.latitude < minLat ||
      r.latitude > maxLat ||
      r.longitude < minLng ||
      r.longitude > maxLng;

    if (!isOffScreen) return;

    // Calculate relative offset from center
    const dLat = r.latitude - mapRegion.latitude;
    const dLng = r.longitude - mapRegion.longitude;
    const angleRad = Math.atan2(dLat, dLng); // -PI to +PI

    // Distance calculation
    const distanceMeters = haversineDistance(
      userLocation.latitude,
      userLocation.longitude,
      r.latitude,
      r.longitude
    );

    // Screen bounds margin
    const topMargin = 160;
    const bottomMargin = SCREEN_HEIGHT - 200;
    const leftMargin = 16;
    const rightMargin = SCREEN_WIDTH - 130;

    // Clamp coordinates onto edge box
    const centerX = SCREEN_WIDTH / 2;
    const centerY = SCREEN_HEIGHT / 2;
    const halfW = (SCREEN_WIDTH - 80) / 2;
    const halfH = (SCREEN_HEIGHT - 360) / 2;

    const scaleX = Math.cos(angleRad);
    const scaleY = Math.sin(angleRad);

    let edgeX = centerX + scaleX * halfW;
    let edgeY = centerY - scaleY * halfH; // Y axis is inverted in screen space

    edgeX = Math.max(leftMargin, Math.min(rightMargin, edgeX));
    edgeY = Math.max(topMargin, Math.min(bottomMargin, edgeY));

    // Direction arrow determination based on angle
    const angleDeg = ((angleRad * 180) / Math.PI + 360) % 360;
    let arrowIcon = 'arrow-up';
    if (angleDeg >= 22.5 && angleDeg < 67.5) arrowIcon = 'arrow-up-right';
    else if (angleDeg >= 67.5 && angleDeg < 112.5) arrowIcon = 'arrow-up';
    else if (angleDeg >= 112.5 && angleDeg < 157.5) arrowIcon = 'arrow-up-left';
    else if (angleDeg >= 157.5 && angleDeg < 202.5) arrowIcon = 'arrow-left';
    else if (angleDeg >= 202.5 && angleDeg < 247.5) arrowIcon = 'arrow-down-left';
    else if (angleDeg >= 247.5 && angleDeg < 292.5) arrowIcon = 'arrow-down';
    else if (angleDeg >= 292.5 && angleDeg < 337.5) arrowIcon = 'arrow-down-right';
    else arrowIcon = 'arrow-right';

    offScreenRiders.push({
      rider: r,
      edgeX,
      edgeY,
      angleRad,
      distanceMeters,
      arrowIcon,
    });
  });

  if (offScreenRiders.length === 0) return null;

  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="box-none">
      {offScreenRiders.map(({ rider, edgeX, edgeY, distanceMeters, arrowIcon }) => {
        const initial = rider.userName ? rider.userName.trim().charAt(0).toUpperCase() : 'R';
        const isLeader = rider.userId === leaderId;
        const distStr =
          distanceMeters < 1000
            ? `${Math.round(distanceMeters)} m`
            : `${(distanceMeters / 1000).toFixed(1)} km`;

        const badgeColor =
          rider.riderStatus === 'sos'
            ? '#EF4444'
            : isLeader
            ? '#2563EB'
            : rider.riderStatus === 'break'
            ? '#F59E0B'
            : '#10B981';

        return (
          <TouchableOpacity
            key={`edge-radar-${rider.userId}`}
            activeOpacity={0.8}
            onPress={() => onSelectRider(rider)}
            style={[
              styles.frostedGlassPill,
              {
                left: edgeX,
                top: edgeY,
                borderColor: isLeader ? '#2563EB' : 'rgba(51, 65, 85, 0.8)',
              },
            ]}
          >
            {/* Initial Circle or Avatar */}
            <View style={[styles.avatarCircle, { borderColor: badgeColor }]}>
              {rider.photoURL ? (
                <Image source={{ uri: rider.photoURL }} style={styles.avatarImg} />
              ) : (
                <Text style={styles.avatarInitial}>{initial}</Text>
              )}
            </View>

            {/* Direction Arrow & Distance */}
            <View style={styles.infoCol}>
              <Text style={styles.riderName} numberOfLines={1}>
                {rider.userName}
              </Text>
              <View style={styles.arrowRow}>
                <Ionicons name={arrowIcon as any} size={12} color="#00E5FF" style={{ marginRight: 3 }} />
                <Text style={styles.distanceText}>{distStr}</Text>
              </View>
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

export const NamiEdgeIndicator = BikerRadarEdgeIndicator;

const styles = StyleSheet.create({
  frostedGlassPill: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.88)',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1.5,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 8,
    maxWidth: 125,
    zIndex: 99,
  },
  avatarCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 6,
  },
  avatarImg: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  avatarInitial: {
    color: '#0F172A',
    fontSize: 13,
    fontWeight: '900',
  },
  infoCol: {
    justifyContent: 'center',
    flex: 1,
  },
  riderName: {
    color: '#F8FAFC',
    fontSize: 11,
    fontWeight: '800',
  },
  arrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 1,
  },
  distanceText: {
    color: '#00E5FF',
    fontSize: 10,
    fontWeight: '700',
  },
});

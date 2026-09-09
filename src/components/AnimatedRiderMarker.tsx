import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, Text, Image } from 'react-native';
import { Marker, AnimatedRegion } from 'react-native-maps';
import { RiderLocation } from '../types';
import { ColorPalette } from '../hooks/useTheme';
import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';

interface Props {
  rider: RiderLocation;
  isMe: boolean;
  isLeader: boolean;
  isSelected?: boolean;
  showSpeedBadge?: boolean;
  showNameLabel?: boolean;
  colors: ColorPalette;
  isDark: boolean;
  onPress?: (rider: RiderLocation) => void;
}

export function getRiderColor(userId: string, isMe: boolean, isLeader: boolean, riderStatus?: string): string {
  if (riderStatus === 'sos') return '#EF4444';
  if (isMe) return '#2563EB'; // Vibrant Blue for current user
  if (isLeader) return '#3B82F6'; // Blue for Leader
  if (riderStatus === 'break' || riderStatus === 'stopped') return '#F59E0B'; // Amber for Stopped/Break
  return '#10B981'; // Emerald Green for Riding
}

export const AnimatedRiderMarker: React.FC<Props> = React.memo(
  ({
    rider,
    isMe,
    isLeader,
    isSelected = false,
    showSpeedBadge = true,
    showNameLabel = true,
    colors,
    isDark,
    onPress,
  }) => {
    const safeLat = rider.latitude != null && !isNaN(rider.latitude) ? rider.latitude : 28.6139;
    const safeLng = rider.longitude != null && !isNaN(rider.longitude) ? rider.longitude : 77.209;

    const animatedRegionRef = useRef<AnimatedRegion>(
      new AnimatedRegion({
        latitude: safeLat,
        longitude: safeLng,
        latitudeDelta: 0,
        longitudeDelta: 0,
      })
    );

    // Dynamic track changes state to ensure crisp native render on Android without performance hit
    const [tracksViewChanges, setTracksViewChanges] = useState(true);

    useEffect(() => {
      setTracksViewChanges(true);
      const timer = setTimeout(() => {
        setTracksViewChanges(false);
      }, 600);
      return () => clearTimeout(timer);
    }, [rider.photoURL, rider.heading, rider.speed, rider.network, isSelected, isMe, isLeader]);

    useEffect(() => {
      if (
        rider.latitude != null &&
        rider.longitude != null &&
        !isNaN(rider.latitude) &&
        !isNaN(rider.longitude)
      ) {
        animatedRegionRef.current
          .timing({
            latitude: rider.latitude,
            longitude: rider.longitude,
            latitudeDelta: 0,
            longitudeDelta: 0,
            duration: 800,
            useNativeDriver: false,
          } as any)
          .start();
      }
    }, [rider.latitude, rider.longitude]);

    const badgeColor = getRiderColor(rider.userId, isMe, isLeader, rider.riderStatus);
    const isOnline = rider.network === 'online';
    const initialLetter = rider.userName ? rider.userName.trim().charAt(0).toUpperCase() : 'R';
    const headingAngle = rider.heading != null && !isNaN(rider.heading) ? rider.heading : 0;

    // Size dimensions
    const avatarOuterSize = isMe ? 52 : 44;
    const avatarImgSize = isMe ? 44 : 36;
    const avatarRadius = avatarImgSize / 2;

    return (
      <Marker.Animated
        coordinate={animatedRegionRef.current as any}
        anchor={{ x: 0.5, y: 0.5 }}
        tracksViewChanges={tracksViewChanges}
        zIndex={isMe ? 999 : isSelected ? 80 : isLeader ? 60 : 40}
        onPress={() => onPress && onPress(rider)}
      >
        <View style={styles.rootContainer} collapsable={false}>
          {/* Direction Heading Triangle (Rotates around center) */}
          {headingAngle !== 0 && (
            <View
              style={[
                styles.headingContainer,
                { transform: [{ rotate: `${headingAngle}deg` }] },
              ]}
            >
              <View style={[styles.headingPointer, { borderBottomColor: badgeColor }]} />
            </View>
          )}

          {/* Outer Pulsing Aura Ring for "Me" or Leader */}
          {(isMe || isLeader || isSelected) && (
            <View
              style={[
                styles.outerGlowRing,
                {
                  width: avatarOuterSize + 12,
                  height: avatarOuterSize + 12,
                  borderRadius: (avatarOuterSize + 12) / 2,
                  borderColor: isMe ? 'rgba(37, 99, 235, 0.4)' : isSelected ? 'rgba(59, 130, 246, 0.4)' : 'rgba(37, 99, 235, 0.3)',
                  backgroundColor: isMe ? 'rgba(37, 99, 235, 0.12)' : 'rgba(59, 130, 246, 0.1)',
                },
              ]}
            />
          )}

          {/* Main Circular Puck */}
          <View
            style={[
              styles.avatarPuck,
              {
                width: avatarOuterSize,
                height: avatarOuterSize,
                borderRadius: avatarOuterSize / 2,
                borderColor: badgeColor,
                borderWidth: isMe ? 3.5 : 2.5,
                backgroundColor: isDark ? '#0F172A' : '#FFFFFF',
              },
            ]}
          >
            {rider.photoURL ? (
              <Image
                source={{ uri: rider.photoURL }}
                style={{
                  width: avatarImgSize,
                  height: avatarImgSize,
                  borderRadius: avatarRadius,
                }}
                resizeMode="cover"
              />
            ) : (
              <View
                style={[
                  styles.avatarFallback,
                  {
                    width: avatarImgSize,
                    height: avatarImgSize,
                    borderRadius: avatarRadius,
                    backgroundColor: isMe ? '#2563EB' : isDark ? '#1E293B' : '#E2E8F0',
                  },
                ]}
              >
                <Text
                  style={[
                    styles.avatarLetter,
                    {
                      color: isMe ? '#FFFFFF' : isDark ? '#F8FAFC' : '#0F172A',
                      fontSize: isMe ? 18 : 15,
                    },
                  ]}
                >
                  {initialLetter}
                </Text>
              </View>
            )}

            {/* Online / Battery Status Dot */}
            <View
              style={[
                styles.statusDot,
                {
                  backgroundColor: isOnline ? '#10B981' : '#94A3B8',
                  borderColor: isDark ? '#0F172A' : '#FFFFFF',
                },
              ]}
            />
          </View>

          {/* Floating Name & Speed Pill Label */}
          {(showNameLabel || showSpeedBadge || isSelected) && (
            <View
              style={[
                styles.labelPill,
                {
                  backgroundColor: isDark ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.95)',
                  borderColor: isMe ? '#2563EB' : isSelected ? '#3B82F6' : colors.border,
                },
              ]}
            >
              <View style={styles.labelRow}>
                {isLeader && (
                  <MaterialCommunityIcons
                    name="crown"
                    size={11}
                    color="#F59E0B"
                    style={{ marginRight: 3 }}
                  />
                )}
                <Text
                  style={[
                    styles.nameLabel,
                    {
                      color: isMe ? '#2563EB' : isDark ? '#F8FAFC' : '#0F172A',
                      fontWeight: isMe ? '900' : '700',
                    },
                  ]}
                  numberOfLines={1}
                >
                  {isMe ? 'You' : rider.userName || 'Rider'}
                </Text>
                {showSpeedBadge && (
                  <Text style={[styles.speedLabel, { color: badgeColor }]}>
                    {' '}{rider.speed || 0} km/h
                  </Text>
                )}
              </View>
            </View>
          )}
        </View>
      </Marker.Animated>
    );
  }
);

const styles = StyleSheet.create({
  rootContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 100,
    height: 100,
    backgroundColor: 'transparent',
  },
  headingContainer: {
    position: 'absolute',
    top: 6,
    alignItems: 'center',
    justifyContent: 'center',
    width: 24,
    height: 24,
    zIndex: 10,
  },
  headingPointer: {
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderBottomWidth: 10,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  outerGlowRing: {
    position: 'absolute',
    borderWidth: 2,
  },
  avatarPuck: {
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 5,
  },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: {
    fontWeight: '900',
  },
  statusDot: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    width: 13,
    height: 13,
    borderRadius: 6.5,
    borderWidth: 2.5,
  },
  labelPill: {
    position: 'absolute',
    bottom: 2,
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 12,
    borderWidth: 1,
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nameLabel: {
    fontSize: 11,
  },
  speedLabel: {
    fontSize: 10,
    fontWeight: '800',
  },
});

export default AnimatedRiderMarker;

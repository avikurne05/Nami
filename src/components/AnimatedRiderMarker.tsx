import React, { useEffect, useRef } from 'react';
import { StyleSheet, View, Text, Image, TouchableOpacity } from 'react-native';
import { Marker, AnimatedRegion } from 'react-native-maps';
import { RiderLocation } from '../types';
import { ColorPalette } from '../hooks/useTheme';

import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Animated, Easing } from 'react-native';

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
  if (isLeader) return '#2563EB'; // Blue = Leader
  if (riderStatus === 'break' || riderStatus === 'stopped') return '#F59E0B'; // Yellow = Waiting/Break
  return '#10B981'; // Green = Riding
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

    // Pulsating blue glow animation for Leader
    const glowAnim = useRef(new Animated.Value(0.4)).current;

    useEffect(() => {
      if (isLeader) {
        const animation = Animated.loop(
          Animated.sequence([
            Animated.timing(glowAnim, {
              toValue: 1.0,
              duration: 1000,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: true,
            }),
            Animated.timing(glowAnim, {
              toValue: 0.4,
              duration: 1000,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: true,
            }),
          ])
        );
        animation.start();
        return () => animation.stop();
      }
    }, [isLeader, glowAnim]);

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
            duration: 850,
            useNativeDriver: false,
          } as any)
          .start();
      }
    }, [rider.latitude, rider.longitude]);

    const badgeColor = getRiderColor(rider.userId, isMe, isLeader, rider.riderStatus);
    const onlineDotColor = rider.network === 'online' ? '#10B981' : '#94A3B8';
    const initialLetter = rider.userName ? rider.userName.trim().charAt(0).toUpperCase() : 'R';
    const headingAngle = rider.heading != null && !isNaN(rider.heading) ? rider.heading : 0;

    return (
      <Marker.Animated
        coordinate={animatedRegionRef.current as any}
        anchor={isMe ? { x: 0.5, y: 1.15 } : { x: 0.5, y: 0.5 }}
        tracksViewChanges={false}
        zIndex={isMe ? 100 : isSelected ? 80 : isLeader ? 60 : 40}
        onPress={() => onPress && onPress(rider)}
      >
        <View
          style={[
            styles.markerContainer,
            isSelected && { transform: [{ scale: 1.15 }] },
          ]}
          collapsable={false}
        >
          {/* Outer Badge Wrapper */}
          <View style={styles.badgeWrapper}>
            {/* Leader Animated Blue Glow Ring */}
            {isLeader && (
              <Animated.View
                style={[
                  styles.leaderGlowRing,
                  {
                    opacity: glowAnim,
                    transform: [
                      {
                        scale: glowAnim.interpolate({
                          inputRange: [0.4, 1.0],
                          outputRange: [1.0, 1.35],
                        }),
                      },
                    ],
                  },
                ]}
              />
            )}

            {/* Selected Glowing Ring */}
            {isSelected && <View style={styles.selectedGlowRing} />}

            {/* Circular Avatar Container (White background + Soft Shadow + 2.5dp status ring) */}
            <View
              style={[
                styles.avatarRing,
                {
                  borderColor: badgeColor,
                  borderWidth: isSelected ? 3.5 : 2.5,
                  shadowColor: isSelected ? '#3B82F6' : badgeColor,
                },
              ]}
            >
              <View style={styles.innerWhiteCircle}>
                {rider.photoURL ? (
                  <Image source={{ uri: rider.photoURL }} style={styles.avatarImage} />
                ) : (
                  <Text style={styles.avatarLetter}>{initialLetter}</Text>
                )}
              </View>

              {/* Status Dot */}
              <View style={[styles.statusDot, { backgroundColor: onlineDotColor }]} />
            </View>

            {/* Heading Direction Arrow Indicator (Rotating triangle around marker) */}
            {headingAngle !== 0 && (
              <View
                style={[
                  styles.headingIndicator,
                  { transform: [{ rotate: `${headingAngle}deg` }] },
                ]}
              >
                <View style={[styles.headingArrow, { borderBottomColor: badgeColor }]} />
              </View>
            )}
          </View>

          {/* Small Pointer Triangle Below Circle */}
          <View style={[styles.pointerTriangle, { borderTopColor: badgeColor }]} />

          {/* Floating Speed Badge & Name Label (rendered based on zoom depth & selection) */}
          {(showNameLabel || showSpeedBadge || isSelected) && (
            <View
              style={[
                styles.labelCard,
                {
                  backgroundColor: isDark ? 'rgba(15, 23, 42, 0.92)' : 'rgba(255, 255, 255, 0.95)',
                  borderColor: isSelected ? '#3B82F6' : isLeader ? '#2563EB' : colors.border,
                },
              ]}
            >
              {(showNameLabel || isSelected) && (
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
                  {isLeader && (
                    <MaterialCommunityIcons name="crown" size={12} color="#3B82F6" style={{ marginRight: 3 }} />
                  )}
                  <Text
                    style={[styles.nameText, { color: isDark ? '#F8FAFC' : '#0F172A' }]}
                    numberOfLines={1}
                    ellipsizeMode="tail"
                  >
                    {isMe ? 'You' : rider.userName}
                  </Text>
                </View>
              )}
              {(showSpeedBadge || isSelected) && (
                <Text style={[styles.speedText, { color: badgeColor }]}>
                  {rider.speed || 0} km/h
                </Text>
              )}
            </View>
          )}
        </View>
      </Marker.Animated>
    );
  }
);

const styles = StyleSheet.create({
  markerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  leaderGlowRing: {
    position: 'absolute',
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: 'rgba(37, 99, 235, 0.45)',
    borderWidth: 2,
    borderColor: '#3B82F6',
  },
  selectedGlowRing: {
    position: 'absolute',
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(59, 130, 246, 0.25)',
    borderWidth: 2,
    borderColor: '#3B82F6',
  },
  avatarRing: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 5,
    elevation: 8,
  },
  innerWhiteCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: 38,
    height: 38,
    borderRadius: 19,
  },
  avatarLetter: {
    color: '#0F172A',
    fontSize: 17,
    fontWeight: '900',
  },
  statusDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#0F172A',
  },
  headingIndicator: {
    position: 'absolute',
    top: -8,
    alignItems: 'center',
  },
  headingArrow: {
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderBottomWidth: 10,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  pointerTriangle: {
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    marginTop: -2,
  },
  labelCard: {
    marginTop: 3,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 54,
    maxWidth: 110,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  nameText: {
    fontSize: 11,
    fontWeight: 'bold',
  },
  speedText: {
    fontSize: 10,
    fontWeight: '700',
    marginTop: 1,
  },
});

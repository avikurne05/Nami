import React from 'react';
import { StyleSheet, View, Animated } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

interface Props {
  size?: number;
  showRings?: boolean;
  animatedScale?: Animated.AnimatedInterpolation<number> | Animated.Value;
  primaryColor?: string;
  accentColor?: string;
}

export const BikerRadarLogo: React.FC<Props> = ({
  size = 120,
  showRings = true,
  animatedScale,
  primaryColor = '#1A73E8',
  accentColor = '#00E5FF',
}) => {
  const badgeSize = Math.round(size * 0.58);
  const iconSize = Math.round(badgeSize * 0.54);
  const ring1Size = size;
  const ring2Size = Math.round(size * 0.78);

  const logoContent = (
    <View style={[styles.container, { width: size, height: size }]}>
      {/* Outer Radar Grid Ring */}
      {showRings && (
        <View
          style={[
            styles.radarRing,
            {
              width: ring1Size,
              height: ring1Size,
              borderRadius: ring1Size / 2,
              borderColor: 'rgba(0, 229, 255, 0.18)',
              borderWidth: 1.5,
            },
          ]}
        >
          {/* Radar Cardinal Ticks */}
          <View style={[styles.tick, styles.tickTop, { backgroundColor: accentColor }]} />
          <View style={[styles.tick, styles.tickBottom, { backgroundColor: accentColor }]} />
          <View style={[styles.tick, styles.tickLeft, { backgroundColor: accentColor }]} />
          <View style={[styles.tick, styles.tickRight, { backgroundColor: accentColor }]} />

          {/* Group Rider Radar Dots */}
          <View style={[styles.riderDot, styles.dot1, { backgroundColor: accentColor }]} />
          <View style={[styles.riderDot, styles.dot2, { backgroundColor: primaryColor }]} />
        </View>
      )}

      {/* Middle Concentric Radar Line */}
      {showRings && (
        <View
          style={[
            styles.radarRing,
            {
              width: ring2Size,
              height: ring2Size,
              borderRadius: ring2Size / 2,
              borderColor: 'rgba(26, 115, 232, 0.25)',
              borderWidth: 1,
              borderStyle: 'dashed',
            },
          ]}
        />
      )}

      {/* Center Shield Emblem */}
      <View
        style={[
          styles.badge,
          {
            width: badgeSize,
            height: badgeSize,
            borderRadius: badgeSize * 0.3,
            borderColor: accentColor,
            borderWidth: 2,
            shadowColor: accentColor,
          },
        ]}
      >
        {/* Dual Layer Core Icon (Helmet / Compass + Navigation Pin) */}
        <View style={styles.iconWrapper}>
          <MaterialCommunityIcons
            name="motorbike"
            size={iconSize * 0.85}
            color="#FFFFFF"
            style={styles.mainIcon}
          />
          <View style={styles.accentPin}>
            <Ionicons name="navigate" size={iconSize * 0.45} color={accentColor} />
          </View>
        </View>
      </View>
    </View>
  );

  if (animatedScale) {
    return (
      <Animated.View style={{ transform: [{ scale: animatedScale }] }}>
        {logoContent}
      </Animated.View>
    );
  }

  return logoContent;
};

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  radarRing: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
  },
  tick: {
    position: 'absolute',
    borderRadius: 1,
    opacity: 0.6,
  },
  tickTop: {
    top: 2,
    width: 2,
    height: 6,
  },
  tickBottom: {
    bottom: 2,
    width: 2,
    height: 6,
  },
  tickLeft: {
    left: 2,
    width: 6,
    height: 2,
  },
  tickRight: {
    right: 2,
    width: 6,
    height: 2,
  },
  riderDot: {
    position: 'absolute',
    width: 6,
    height: 6,
    borderRadius: 3,
    shadowColor: '#00E5FF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
    elevation: 4,
  },
  dot1: {
    top: '22%',
    right: '25%',
  },
  dot2: {
    bottom: '26%',
    left: '22%',
  },
  badge: {
    backgroundColor: '#0F172A',
    justifyContent: 'center',
    alignItems: 'center',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 10,
  },
  iconWrapper: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  mainIcon: {
    marginTop: 2,
  },
  accentPin: {
    position: 'absolute',
    top: -4,
    right: -6,
    transform: [{ rotate: '45deg' }],
  },
});

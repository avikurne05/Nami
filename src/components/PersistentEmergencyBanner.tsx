import React, { useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { EmergencyAlertItem } from './EmergencyAlertOverlay';

interface Props {
  emergency: EmergencyAlertItem;
  onNavigate: () => void;
  onOpenOverlay: () => void;
}

export function PersistentEmergencyBanner({
  emergency,
  onNavigate,
  onOpenOverlay,
}: Props) {
  const flashAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(flashAnim, {
          toValue: 0.65,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(flashAnim, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [flashAnim]);

  return (
    <Animated.View style={[styles.bannerContainer, { opacity: flashAnim }]}>
      <TouchableOpacity
        style={styles.bannerInner}
        onPress={onOpenOverlay}
        activeOpacity={0.85}
      >
        <View style={styles.badgeCol}>
          <Ionicons name="warning" size={20} color="#FFFFFF" />
        </View>

        <View style={styles.textCol}>
          <Text style={styles.titleText} numberOfLines={1}>
            🚨 EMERGENCY: {emergency.rider.userName || 'Rider'}
          </Text>
          <Text style={styles.subText}>
            {emergency.distanceKm.toFixed(1)} km away • ETA ~{emergency.etaMin} min
          </Text>
        </View>

        <TouchableOpacity
          style={styles.navBtn}
          onPress={onNavigate}
          activeOpacity={0.8}
        >
          <Ionicons name="navigate" size={14} color="#EF4444" style={{ marginRight: 4 }} />
          <Text style={styles.navBtnText}>TRACK</Text>
        </TouchableOpacity>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bannerContainer: {
    width: '100%',
    backgroundColor: '#EF4444',
    paddingHorizontal: 16,
    paddingVertical: 10,
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  bannerInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  badgeCol: {
    marginRight: 10,
  },
  textCol: {
    flex: 1,
  },
  titleText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.2,
  },
  subText: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 1,
  },
  navBtn: {
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    marginLeft: 10,
  },
  navBtnText: {
    color: '#EF4444',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
});

export default PersistentEmergencyBanner;

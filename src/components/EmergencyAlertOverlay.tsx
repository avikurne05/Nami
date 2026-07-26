import React, { useEffect, useRef, useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Animated,
  Image,
  Linking,
  Vibration,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { RiderLocation } from '../types';
import { useTheme } from '../hooks/useTheme';
import SpeechService from '../services/SpeechService';

export interface EmergencyAlertItem {
  id: string;
  rider: RiderLocation;
  distanceKm: number;
  etaMin: number;
  timestamp: number;
  emergencyContactPhone?: string;
  acknowledged?: boolean;
}

interface Props {
  emergencies: EmergencyAlertItem[];
  currentIndex: number;
  onNavigateToRider: (emergency: EmergencyAlertItem) => void;
  onAcknowledge: (emergency: EmergencyAlertItem) => void;
  onDismissRequest: (emergency: EmergencyAlertItem) => void;
  onSelectIndex: (index: number) => void;
}

export function EmergencyAlertOverlay({
  emergencies,
  currentIndex,
  onNavigateToRider,
  onAcknowledge,
  onDismissRequest,
  onSelectIndex,
}: Props) {
  const { colors, isDark } = useTheme();

  // Red Pulse Ring & Entrance Slide Animation
  const pulseScale = useRef(new Animated.Value(1)).current;
  const pulseOpacity = useRef(new Animated.Value(0.8)).current;
  const slideAnim = useRef(new Animated.Value(100)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const currentEmergency = emergencies[currentIndex] || emergencies[0];

  useEffect(() => {
    if (!currentEmergency) return;

    // 1. Entrance animation
    Animated.parallel([
      Animated.spring(slideAnim, {
        toValue: 0,
        friction: 7,
        tension: 80,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();

    // 2. Red Pulse Loop
    const pulseLoop = Animated.loop(
      Animated.parallel([
        Animated.timing(pulseScale, {
          toValue: 1.8,
          duration: 1200,
          useNativeDriver: true,
        }),
        Animated.timing(pulseOpacity, {
          toValue: 0,
          duration: 1200,
          useNativeDriver: true,
        }),
      ])
    );
    pulseLoop.start();

    // 3. Balanced Audio & Vibration (S.O.S pattern + Speech)
    Vibration.vibrate([0, 400, 180, 400, 180, 400]);
    SpeechService.speakAlert(`Emergency alert received from ${currentEmergency.rider.userName || 'a rider'}.`);

    return () => {
      pulseLoop.stop();
    };
  }, [currentEmergency?.id]);

  if (!currentEmergency) return null;

  const rider = currentEmergency.rider;
  const distanceText = `${currentEmergency.distanceKm.toFixed(1)} km away`;
  const etaText = `ETA ~${Math.max(1, currentEmergency.etaMin)} min`;

  // Time elapsed text
  const elapsedSec = Math.max(0, Math.floor((Date.now() - currentEmergency.timestamp) / 1000));
  const timeText =
    elapsedSec < 30 ? 'Just now' : elapsedSec < 60 ? `${elapsedSec}s ago` : `${Math.floor(elapsedSec / 60)}m ago`;

  const handleCallContact = () => {
    const phone = currentEmergency.emergencyContactPhone || '';
    if (phone) {
      Linking.openURL(`tel:${phone}`).catch(() => console.warn('Could not make call'));
    } else {
      Linking.openURL('tel:911').catch(() => console.warn('Could not make emergency call'));
    }
  };

  return (
    <Animated.View
      style={[
        styles.overlayContainer,
        {
          opacity: fadeAnim,
          transform: [{ translateY: slideAnim }],
        },
      ]}
    >
      <View style={[styles.card, { backgroundColor: isDark ? '#1E1B4B' : '#FEF2F2', borderColor: '#EF4444' }]}>
        {/* Multi-Emergency Queue Counter Banner */}
        {emergencies.length > 1 && (
          <View style={styles.queueHeader}>
            <TouchableOpacity
              disabled={currentIndex === 0}
              onPress={() => onSelectIndex(currentIndex - 1)}
              style={[styles.queueArrow, currentIndex === 0 && { opacity: 0.3 }]}
            >
              <Ionicons name="chevron-back" size={18} color="#EF4444" />
            </TouchableOpacity>

            <View style={styles.queueBadge}>
              <Ionicons name="warning" size={14} color="#EF4444" style={{ marginRight: 4 }} />
              <Text style={styles.queueBadgeText}>
                {currentIndex + 1} of {emergencies.length} Active Alerts
              </Text>
            </View>

            <TouchableOpacity
              disabled={currentIndex === emergencies.length - 1}
              onPress={() => onSelectIndex(currentIndex + 1)}
              style={[styles.queueArrow, currentIndex === emergencies.length - 1 && { opacity: 0.3 }]}
            >
              <Ionicons name="chevron-forward" size={18} color="#EF4444" />
            </TouchableOpacity>
          </View>
        )}

        {/* SOS Header & Pulse Icon */}
        <View style={styles.sosHeaderRow}>
          <View style={styles.sosPulseWrapper}>
            <Animated.View
              style={[
                styles.sosPulseRing,
                {
                  transform: [{ scale: pulseScale }],
                  opacity: pulseOpacity,
                },
              ]}
            />
            <View style={styles.sosCircle}>
              <Ionicons name="alert" size={28} color="#FFFFFF" />
            </View>
          </View>

          <View style={styles.sosTitleCol}>
            <Text style={styles.sosBadgeText}>🚨 EMERGENCY ALERT</Text>
            <Text style={[styles.riderNameText, { color: colors.text }]}>{rider.userName || 'Rider'}</Text>
            <Text style={styles.sosStatusText}>Needs immediate assistance</Text>
          </View>
        </View>

        {/* Situation Awareness Details Panel */}
        <View style={[styles.situationalPanel, { backgroundColor: isDark ? 'rgba(15, 23, 42, 0.6)' : '#FFFFFF' }]}>
          <View style={styles.sitCol}>
            <Ionicons name="location-sharp" size={16} color="#EF4444" style={{ marginBottom: 2 }} />
            <Text style={styles.sitLabel}>DISTANCE</Text>
            <Text style={[styles.sitVal, { color: colors.text }]}>{distanceText}</Text>
          </View>

          <View style={styles.sitDivider} />

          <View style={styles.sitCol}>
            <Ionicons name="time" size={16} color="#F59E0B" style={{ marginBottom: 2 }} />
            <Text style={styles.sitLabel}>ESTIMATED ETA</Text>
            <Text style={[styles.sitVal, { color: colors.text }]}>{etaText}</Text>
          </View>

          <View style={styles.sitDivider} />

          <View style={styles.sitCol}>
            <Ionicons name="pulse" size={16} color="#10B981" style={{ marginBottom: 2 }} />
            <Text style={styles.sitLabel}>LAST UPDATED</Text>
            <Text style={[styles.sitVal, { color: colors.text }]}>{timeText}</Text>
          </View>
        </View>

        {/* Glove-Friendly Large Action Buttons */}
        <View style={styles.actionGrid}>
          {/* Primary Action: Navigate to Rider */}
          <TouchableOpacity
            style={styles.btnNavigate}
            onPress={() => onNavigateToRider(currentEmergency)}
            activeOpacity={0.85}
          >
            <Ionicons name="navigate" size={20} color="#FFFFFF" style={{ marginRight: 8 }} />
            <Text style={styles.btnNavigateText}>Navigate to Rider</Text>
          </TouchableOpacity>

          {/* Secondary Actions Row */}
          <View style={styles.secondaryRow}>
            <TouchableOpacity
              style={[styles.btnSecondary, { borderColor: '#EF4444' }]}
              onPress={handleCallContact}
              activeOpacity={0.8}
            >
              <Ionicons name="call" size={16} color="#EF4444" style={{ marginRight: 6 }} />
              <Text style={[styles.btnSecondaryText, { color: '#EF4444' }]}>Call Contact</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.btnSecondary, { borderColor: '#10B981' }]}
              onPress={() => onAcknowledge(currentEmergency)}
              activeOpacity={0.8}
            >
              <Ionicons name="checkmark-done" size={16} color="#10B981" style={{ marginRight: 6 }} />
              <Text style={[styles.btnSecondaryText, { color: '#10B981' }]}>
                {currentEmergency.acknowledged ? 'Acknowledged' : 'Acknowledge'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.btnIconDismiss, { borderColor: colors.border }]}
              onPress={() => onDismissRequest(currentEmergency)}
              activeOpacity={0.7}
            >
              <Ionicons name="close" size={20} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlayContainer: {
    position: 'absolute',
    bottom: 24,
    left: 16,
    right: 16,
    zIndex: 9999,
  },
  card: {
    borderRadius: 24,
    borderWidth: 2,
    padding: 18,
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 18,
    elevation: 12,
  },
  queueHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(239, 68, 68, 0.2)',
  },
  queueArrow: {
    padding: 4,
  },
  queueBadge: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  queueBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#EF4444',
    letterSpacing: 0.5,
  },
  sosHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  sosPulseWrapper: {
    width: 52,
    height: 52,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  sosPulseRing: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(239, 68, 68, 0.4)',
    borderWidth: 1,
    borderColor: '#EF4444',
  },
  sosCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#EF4444',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
  },
  sosTitleCol: {
    flex: 1,
  },
  sosBadgeText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#EF4444',
    letterSpacing: 1.5,
  },
  riderNameText: {
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: -0.3,
  },
  sosStatusText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#EF4444',
  },
  situationalPanel: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 16,
  },
  sitCol: {
    flex: 1,
    alignItems: 'center',
  },
  sitLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  sitVal: {
    fontSize: 13,
    fontWeight: '800',
  },
  sitDivider: {
    width: 1,
    height: 28,
    backgroundColor: 'rgba(100, 116, 139, 0.2)',
  },
  actionGrid: {
    gap: 10,
  },
  btnNavigate: {
    backgroundColor: '#EF4444',
    height: 52,
    borderRadius: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 6,
  },
  btnNavigateText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  secondaryRow: {
    flexDirection: 'row',
    gap: 8,
  },
  btnSecondary: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    borderWidth: 1.5,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnSecondaryText: {
    fontSize: 13,
    fontWeight: '700',
  },
  btnIconDismiss: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default EmergencyAlertOverlay;

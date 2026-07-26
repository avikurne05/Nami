import React from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { RideSession } from '../types';
import { useTheme } from '../hooks/useTheme';

interface ActiveRideBannerProps {
  ride: RideSession;
  userUid?: string;
  onResume: () => void;
  onEndRide?: () => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

export default function ActiveRideBanner({
  ride,
  userUid,
  onResume,
  onEndRide,
  isCollapsed,
  onToggleCollapse,
}: ActiveRideBannerProps) {
  const { colors, isDark } = useTheme();

  const memberCount = Array.isArray(ride.members) ? ride.members.length : 1;
  const isLobby = ride.status === 'lobby';
  const statusLabel = isLobby ? 'Waiting for Members' : 'Navigation Active';
  const statusBadgeColor = isLobby ? '#F59E0B' : '#22C55E';
  const destinationShort = (ride.destination?.name || 'Destination').split(',')[0].trim();

  // Glassmorphism background and colors
  const bgColor = isDark ? 'rgba(15, 23, 42, 0.94)' : 'rgba(255, 255, 255, 0.96)';
  const borderColor = isDark ? 'rgba(0, 229, 255, 0.3)' : 'rgba(2, 132, 199, 0.3)';
  const textColor = isDark ? '#F8FAFC' : '#0F172A';
  const mutedTextColor = isDark ? '#94A3B8' : '#64748B';
  const primaryBlue = colors.primary || '#1A73E8';

  if (isCollapsed) {
    // ── COLLAPSED BANNER STATE ──
    return (
      <TouchableOpacity
        style={[
          styles.container,
          styles.collapsedContainer,
          { backgroundColor: bgColor, borderColor },
        ]}
        onPress={onToggleCollapse}
        activeOpacity={0.88}
        accessibilityRole="button"
        accessibilityLabel={`Active ride ${ride.name}, collapsed. Tap to expand.`}
      >
        <View style={styles.collapsedLeft}>
          <View style={styles.statusDotRow}>
            <View style={[styles.statusPulseDot, { backgroundColor: statusBadgeColor }]} />
            <Text style={[styles.statusBadgeText, { color: statusBadgeColor }]}>{statusLabel}</Text>
          </View>

          <Text style={[styles.collapsedTitle, { color: textColor }]} numberOfLines={1}>
            {ride.name || 'Group Ride'}
          </Text>

          <Text style={[styles.collapsedSub, { color: mutedTextColor }]} numberOfLines={1}>
            To: {destinationShort} • {memberCount} {memberCount === 1 ? 'Rider' : 'Riders'}
          </Text>
        </View>

        <View style={styles.collapsedRightActions}>
          <TouchableOpacity
            style={[styles.collapsedResumeBtn, { backgroundColor: primaryBlue }]}
            onPress={onResume}
            activeOpacity={0.8}
          >
            <Text style={styles.collapsedResumeText}>Resume</Text>
            <Ionicons name="arrow-forward" size={13} color="#FFFFFF" style={{ marginLeft: 3 }} />
          </TouchableOpacity>

          <View style={styles.expandIconBox}>
            <Ionicons name="chevron-down" size={20} color={mutedTextColor} />
          </View>
        </View>
      </TouchableOpacity>
    );
  }

  // ── EXPANDED BANNER STATE ──
  return (
    <TouchableOpacity
      style={[
        styles.container,
        styles.expandedContainer,
        { backgroundColor: bgColor, borderColor },
      ]}
      onPress={onToggleCollapse}
      activeOpacity={0.95}
      accessibilityRole="button"
      accessibilityLabel={`Active ride ${ride.name}, expanded. Tap to collapse.`}
    >
      {/* Top Status Header */}
      <View style={styles.expandedHeader}>
        <View style={styles.statusDotRow}>
          <View style={[styles.statusPulseDot, { backgroundColor: statusBadgeColor }]} />
          <Text style={[styles.statusBadgeText, { color: statusBadgeColor }]}>{statusLabel}</Text>
        </View>

        <View style={styles.expandIconBox}>
          <Ionicons name="chevron-up" size={20} color={mutedTextColor} />
        </View>
      </View>

      {/* Details */}
      <View style={styles.expandedDetails}>
        <Text style={[styles.expandedTitle, { color: textColor }]} numberOfLines={1}>
          {ride.name || 'Group Ride'}
        </Text>

        <View style={styles.metaRow}>
          <View style={styles.metaItem}>
            <Ionicons name="location-sharp" size={15} color={primaryBlue} style={{ marginRight: 4 }} />
            <Text style={[styles.metaText, { color: textColor }]} numberOfLines={1}>
              {destinationShort}
            </Text>
          </View>

          <View style={styles.metaDivider} />

          <View style={styles.metaItem}>
            <Ionicons name="people-sharp" size={15} color={primaryBlue} style={{ marginRight: 4 }} />
            <Text style={[styles.metaText, { color: textColor }]}>
              {memberCount} {memberCount === 1 ? 'Rider' : 'Riders'}
            </Text>
          </View>
        </View>

        {isLobby && (
          <Text style={[styles.roomCodeNotice, { color: mutedTextColor }]}>
            Room Code: <Text style={{ color: primaryBlue, fontWeight: '700' }}>{ride.roomCode}</Text>
          </Text>
        )}
      </View>

      {/* Action Buttons Column */}
      <View style={styles.actionButtonsCol}>
        {/* Primary Resume Ride Button */}
        <TouchableOpacity
          style={[styles.primaryResumeBtn, { backgroundColor: primaryBlue }]}
          onPress={onResume}
          activeOpacity={0.85}
        >
          <Ionicons name="navigate" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
          <Text style={styles.primaryResumeBtnText}>Resume Ride</Text>
          <Ionicons name="arrow-forward" size={18} color="#FFFFFF" style={{ marginLeft: 6 }} />
        </TouchableOpacity>

        {/* Secondary End Ride Button (Directly below Resume Ride) */}
        {onEndRide && (
          <TouchableOpacity
            style={[styles.secondaryEndBtn, { borderColor: '#EF4444', backgroundColor: 'rgba(239, 68, 68, 0.08)' }]}
            onPress={onEndRide}
            activeOpacity={0.85}
          >
            <Ionicons name="power-outline" size={18} color="#EF4444" style={{ marginRight: 8 }} />
            <Text style={styles.secondaryEndBtnText}>End Ride</Text>
          </TouchableOpacity>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 20,
    marginBottom: 20,
    borderRadius: 20,
    borderWidth: 1.5,
    shadowColor: '#00E5FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 5,
    overflow: 'hidden',
  },
  collapsedContainer: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  collapsedLeft: {
    flex: 1,
    marginRight: 10,
  },
  statusDotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 3,
  },
  statusPulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.2,
    textTransform: 'uppercase',
  },
  collapsedTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  collapsedSub: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
  },
  collapsedRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  collapsedResumeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
  },
  collapsedResumeText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  expandIconBox: {
    padding: 2,
  },
  expandedContainer: {
    padding: 18,
  },
  expandedHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  expandedDetails: {
    marginBottom: 16,
  },
  expandedTitle: {
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: -0.3,
    marginBottom: 8,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaText: {
    fontSize: 13,
    fontWeight: '600',
  },
  metaDivider: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#9CA3AF',
  },
  roomCodeNotice: {
    fontSize: 12,
    marginTop: 8,
  },
  actionButtonsCol: {
    gap: 10,
  },
  primaryResumeBtn: {
    height: 50,
    borderRadius: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#1A73E8',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  primaryResumeBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  secondaryEndBtn: {
    height: 48,
    borderRadius: 16,
    borderWidth: 1.5,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  secondaryEndBtnText: {
    color: '#EF4444',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
});

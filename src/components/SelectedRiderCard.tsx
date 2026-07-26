import React from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Image } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { RiderLocation } from '../types';
import { ColorPalette } from '../hooks/useTheme';

interface Props {
  rider: RiderLocation;
  isLeader: boolean;
  distanceKm: number;
  colors: ColorPalette;
  isDark: boolean;
  onCenter: (rider: RiderLocation) => void;
  onClose: () => void;
}

export const SelectedRiderCard: React.FC<Props> = ({
  rider,
  isLeader,
  distanceKm,
  colors,
  isDark,
  onCenter,
  onClose,
}) => {
  const initialLetter = rider.userName ? rider.userName.trim().charAt(0).toUpperCase() : 'R';

  // Status mapping
  const status = rider.riderStatus || (rider.speed > 3 ? 'riding' : 'stopped');
  const statusLabel =
    status === 'sos'
      ? 'EMERGENCY SOS'
      : status === 'break'
      ? 'ON BREAK'
      : status === 'riding'
      ? 'RIDING'
      : 'STOPPED';

  const statusBg =
    status === 'sos'
      ? '#EF4444'
      : status === 'break'
      ? '#F59E0B'
      : status === 'riding'
      ? '#10B981'
      : '#64748B';

  // GPS freshness text
  const getGpsFreshness = () => {
    if (!rider.timestamp) return 'Just now';
    const diffSec = Math.max(0, Math.floor((Date.now() - rider.timestamp) / 1000));
    if (diffSec < 5) return 'Just now';
    if (diffSec < 60) return `${diffSec}s ago`;
    return `${Math.floor(diffSec / 60)}m ago`;
  };

  // Live battery format & strict fallback (hidden completely if missing/invalid)
  const hasValidBattery = typeof rider.battery === 'number' && rider.battery >= 0 && rider.battery <= 100;
  const batteryPct = hasValidBattery ? Math.round(rider.battery!) : 0;
  const batteryColor = batteryPct >= 50 ? '#10B981' : batteryPct >= 20 ? '#F59E0B' : '#EF4444';
  const batteryIcon =
    batteryPct >= 80
      ? 'battery-full'
      : batteryPct >= 50
      ? 'battery-half'
      : batteryPct >= 20
      ? 'battery-dead'
      : 'battery-dead';

  return (
    <View
      style={[
        styles.cardContainer,
        {
          backgroundColor: isDark ? 'rgba(15, 23, 42, 0.96)' : 'rgba(255, 255, 255, 0.98)',
          borderColor: isLeader ? '#2563EB' : colors.border,
        },
      ]}
    >
      {/* Top Header Row */}
      <View style={styles.headerRow}>
        <View style={styles.avatarSection}>
          <View style={[styles.avatarCircle, { borderColor: statusBg }]}>
            {rider.photoURL ? (
              <Image source={{ uri: rider.photoURL }} style={styles.avatarImage} />
            ) : (
              <Text style={styles.avatarInitial}>{initialLetter}</Text>
            )}
          </View>
          <View style={styles.nameBlock}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              {isLeader && (
                <MaterialCommunityIcons name="crown" size={14} color="#3B82F6" style={{ marginRight: 4 }} />
              )}
              <Text style={[styles.riderName, { color: colors.text }]} numberOfLines={1}>
                {rider.userName}
              </Text>
            </View>
            <Text style={[styles.gpsText, { color: colors.textSecondary }]}>
              GPS Updated: {getGpsFreshness()}
            </Text>
          </View>
        </View>

        {/* Close Button */}
        <TouchableOpacity style={styles.closeBtn} onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="close" size={20} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* Metrics Row (Speed, Distance, Status, Battery if shared) */}
      <View style={styles.metricsRow}>
        {/* Speed */}
        <View style={styles.metricChip}>
          <Ionicons name="speedometer-outline" size={15} color="#3B82F6" />
          <Text style={[styles.metricText, { color: colors.text }]}>{rider.speed || 0} km/h</Text>
        </View>

        {/* Distance from me */}
        <View style={styles.metricChip}>
          <Ionicons name="navigate-outline" size={15} color="#10B981" />
          <Text style={[styles.metricText, { color: colors.text }]}>
            {distanceKm < 1 ? `${Math.round(distanceKm * 1000)} m` : `${distanceKm.toFixed(1)} km`}
          </Text>
        </View>

        {/* Status Badge */}
        <View style={[styles.statusBadge, { backgroundColor: statusBg }]}>
          <Text style={styles.statusText}>{statusLabel}</Text>
        </View>

        {/* Live Battery Badge (Only rendered if accurate battery data exists) */}
        {hasValidBattery && (
          <View style={styles.metricChip}>
            <Ionicons name={batteryIcon as any} size={15} color={batteryColor} />
            <Text style={[styles.metricText, { color: batteryColor }]}>{batteryPct}%</Text>
          </View>
        )}
      </View>

      {/* Center on Rider Action Button (Glove-friendly min 56dp target) */}
      <TouchableOpacity
        style={styles.centerBtn}
        onPress={() => onCenter(rider)}
        activeOpacity={0.8}
      >
        <Ionicons name="locate-sharp" size={20} color="#FFFFFF" style={{ marginRight: 8 }} />
        <Text style={styles.centerBtnText}>Center on Rider</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  cardContainer: {
    position: 'absolute',
    bottom: 110,
    left: 16,
    right: 16,
    borderRadius: 20,
    borderWidth: 1.5,
    padding: 16,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 12,
    zIndex: 100,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  avatarSection: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatarCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 2.5,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  avatarInitial: {
    color: '#0F172A',
    fontSize: 20,
    fontWeight: '900',
  },
  nameBlock: {
    flex: 1,
  },
  riderName: {
    fontSize: 16,
    fontWeight: '800',
  },
  gpsText: {
    fontSize: 11,
    marginTop: 2,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(148, 163, 184, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  metricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 14,
    marginBottom: 14,
  },
  metricChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(148, 163, 184, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  metricText: {
    fontSize: 12,
    fontWeight: '700',
    marginLeft: 5,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  statusText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  centerBtn: {
    height: 52,
    backgroundColor: '#2563EB',
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});

import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Share,
  Clipboard,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { Ionicons } from '@expo/vector-icons';
import { RideSession } from '../types';
import { useTheme } from '../hooks/useTheme';
import { generateNamiQRPayload } from '../utils/qrCodeGenerator';

interface Props {
  ride: RideSession;
  joinedCount?: number;
  maxRiders?: number;
  leaderPhotoURL?: string;
  distanceKmText?: string;
  durationText?: string;
  onClose?: () => void;
}

export function RideInviteCard({
  ride,
  joinedCount = 1,
  maxRiders = 8,
  distanceKmText = '45 km',
  durationText = '1h 10m',
  onClose,
}: Props) {
  const { colors, isDark } = useTheme();
  const [copiedToast, setCopiedToast] = useState(false);

  const qrPayloadString =
    ride.qrPayload ||
    generateNamiQRPayload(
      ride.id,
      ride.roomCode,
      ride.leaderId,
      ride.joinToken || 'default'
    );

  const formattedTime = new Date(ride.createdAt || Date.now()).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  const handleCopyCode = () => {
    Clipboard.setString(ride.roomCode);
    setCopiedToast(true);
    setTimeout(() => setCopiedToast(false), 2500);
  };

  const handleShareRide = async () => {
    try {
      const shareMessage = `🏍️ Join my Nami Ride!\n\nRide:\n${ride.name}\n\nLeader:\n${ride.leaderName}\n\nDestination:\n${ride.destination?.name || 'Destination'}\n\nEstimated:\n${distanceKmText} • ${durationText}\n\nRoom Code:\n${ride.roomCode}\n\nScan the QR code inside Nami or enter the 6-character room code to join!`;

      await Share.share({
        message: shareMessage,
        title: `Join ${ride.name} on Nami`,
      });
    } catch (e) {
      console.warn('Share ride error:', e);
    }
  };

  return (
    <View style={[styles.cardContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {/* 1. STATUS BADGES HEADER */}
      <View style={styles.headerRow}>
        <View style={styles.badgeRow}>
          <View style={[styles.statusBadge, { backgroundColor: isDark ? 'rgba(16,185,129,0.15)' : '#D1FAE5' }]}>
            <View style={styles.statusDot} />
            <Text style={[styles.statusBadgeText, { color: '#10B981' }]}>
              {ride.status === 'active' ? 'IN PROGRESS' : 'LOBBY OPEN'}
            </Text>
          </View>

          <View style={[styles.visibilityBadge, { backgroundColor: isDark ? 'rgba(59,130,246,0.15)' : '#DBEAFE' }]}>
            <Ionicons
              name={ride.visibility === 'private' ? 'lock-closed-outline' : 'globe-outline'}
              size={12}
              color={colors.primary}
              style={{ marginRight: 4 }}
            />
            <Text style={[styles.visibilityText, { color: colors.primary }]}>
              {ride.visibility === 'private' ? 'Private Ride' : 'Public Ride'}
            </Text>
          </View>
        </View>

        {onClose && (
          <TouchableOpacity style={styles.closeBtn} onPress={onClose} activeOpacity={0.7}>
            <Ionicons name="close" size={20} color={colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      {/* 2. RIDE TITLE & CREATION INFO */}
      <Text style={[styles.rideTitle, { color: colors.text }]}>{ride.name}</Text>
      <Text style={[styles.createdSub, { color: colors.textMuted }]}>Created today at {formattedTime}</Text>

      {/* 3. LARGE QR CODE (PRIMARY VISUAL FOCUS) */}
      <View style={styles.qrSection}>
        <View style={[styles.qrFrame, { backgroundColor: '#FFFFFF', borderColor: colors.border }]}>
          <QRCode
            value={qrPayloadString}
            size={180}
            color="#0F172A"
            backgroundColor="#FFFFFF"
          />
        </View>
        <Text style={[styles.qrScanHint, { color: colors.textMuted }]}>
          Scan with Nami to join instantly
        </Text>
      </View>

      {/* 5. ROOM CODE SECTION */}
      <View style={[styles.roomCodeBox, { backgroundColor: isDark ? '#1E293B' : '#F1F5F9', borderColor: colors.border }]}>
        <Text style={[styles.roomCodeLabel, { color: colors.textMuted }]}>ROOM CODE</Text>
        <Text style={[styles.roomCodeText, { color: colors.primary }]}>{ride.roomCode}</Text>
      </View>

      {/* Toast Notification */}
      {copiedToast && (
        <View style={styles.toastBanner}>
          <Ionicons name="checkmark-circle" size={16} color="#10B981" style={{ marginRight: 6 }} />
          <Text style={styles.toastBannerText}>Ride code copied to clipboard!</Text>
        </View>
      )}

      {/* 6. ACTION BUTTONS */}
      <View style={styles.actionRow}>
        <TouchableOpacity
          style={[styles.btnSecondary, { backgroundColor: colors.background, borderColor: colors.border }]}
          onPress={handleCopyCode}
          activeOpacity={0.8}
        >
          <Ionicons name="copy-outline" size={18} color={colors.text} style={{ marginRight: 8 }} />
          <Text style={[styles.btnSecondaryText, { color: colors.text }]}>Copy Code</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.btnPrimary, { backgroundColor: colors.primary }]}
          onPress={handleShareRide}
          activeOpacity={0.85}
        >
          <Ionicons name="share-social-outline" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
          <Text style={styles.btnPrimaryText}>Share Ride</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cardContainer: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 20,
    alignItems: 'center',
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 8,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    marginBottom: 12,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
    marginRight: 6,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  visibilityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  visibilityText: {
    fontSize: 10,
    fontWeight: '700',
  },
  closeBtn: {
    padding: 4,
  },
  rideTitle: {
    fontSize: 22,
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  createdSub: {
    fontSize: 12,
    marginTop: 2,
    marginBottom: 14,
    textAlign: 'center',
  },
  qrSection: {
    alignItems: 'center',
    marginBottom: 18,
  },
  qrFrame: {
    padding: 14,
    borderRadius: 20,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 4,
    marginBottom: 8,
  },
  qrScanHint: {
    fontSize: 11,
    fontWeight: '600',
  },
  roomCodeBox: {
    width: '100%',
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 16,
  },
  roomCodeLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  roomCodeText: {
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: 6,
  },
  toastBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16,185,129,0.15)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    marginBottom: 14,
  },
  toastBannerText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#10B981',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  btnSecondary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
  },
  btnSecondaryText: {
    fontSize: 14,
    fontWeight: '700',
  },
  btnPrimary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
    borderRadius: 14,
  },
  btnPrimaryText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
});

export default RideInviteCard;

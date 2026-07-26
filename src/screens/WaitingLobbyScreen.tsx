import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  FlatList,
  ScrollView,
  ActivityIndicator,
  Share,
  Animated,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StackScreenProps } from '@react-navigation/stack';
import { doc, collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/config';
import { RootStackParamList, RideSession, UserProfile } from '../types';
import { useAuth } from '../hooks/useAuth';
import RideService from '../services/RideService';
import { useTheme } from '../hooks/useTheme';
import SafeScreenWrapper from '../components/SafeScreenWrapper';
import { TopAppBar } from '../components/TopAppBar';
import { ConfirmationBottomSheet } from '../components/ConfirmationBottomSheet';
import RideInviteCard from '../components/RideInviteCard';

type Props = StackScreenProps<RootStackParamList, 'WaitingLobby'>;

export default function WaitingLobbyScreen({ route, navigation }: Props) {
  const { rideId } = route.params;
  const { user } = useAuth();
  const { colors, isDark } = useTheme();

  const [ride, setRide] = useState<RideSession | null>(null);
  const [memberProfiles, setMemberProfiles] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showExitLobbyModal, setShowExitLobbyModal] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

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
    ]).start();
  }, [fadeAnim, slideAnim]);

  // Pulse Animation for Start Button when > 1 participant
  useEffect(() => {
    if (memberProfiles.length > 1) {
      const animation = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.03,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
          }),
        ])
      );
      animation.start();
      return () => animation.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [memberProfiles.length, pulseAnim]);

  // Toast Helper
  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 2500);
  };

  // Subscribe to Ride Document
  useEffect(() => {
    if (!rideId) return;

    const unsubscribe = RideService.subscribeToRide(rideId, (rideData) => {
      if (!rideData) return;

      // Auto-exit ONLY if ride was explicitly cancelled, completed, or user was removed
      if (
        rideData.status === 'cancelled' ||
        rideData.status === 'completed' ||
        (user?.uid && Array.isArray(rideData.members) && !rideData.members.includes(user.uid))
      ) {
        navigation.replace('Home');
        return;
      }

      setRide(rideData);
      setLoading(false);

      // Auto-navigate members to Ride Screen when leader starts the ride
      if (rideData && rideData.status === 'active') {
        navigation.replace('Ride', { rideId });
      }
    });

    return unsubscribe;
  }, [rideId, user?.uid, navigation]);

  // Fetch Member Profiles in Real-Time
  useEffect(() => {
    if (!ride || !Array.isArray(ride.members) || ride.members.length === 0) return;

    const usersRef = collection(db, 'users');
    const q = query(usersRef, where('uid', 'in', ride.members));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const profiles: UserProfile[] = [];
      snapshot.forEach((docSnap) => {
        profiles.push(docSnap.data() as UserProfile);
      });

      // Keep leader first, then sort by name safely
      profiles.sort((a, b) => {
        if (a?.uid === ride.leaderId) return -1;
        if (b?.uid === ride.leaderId) return 1;
        const nameA = a?.name || 'Rider';
        const nameB = b?.name || 'Rider';
        return nameA.localeCompare(nameB);
      });

      setMemberProfiles(profiles);
    });

    return unsubscribe;
  }, [ride?.members, ride?.leaderId]);

  const handleShareRoomCode = async () => {
    if (!ride) return;
    try {
      await Share.share({
        message: `Join my group ride "${ride.name}" on Biker Radar!\n\nRoom Code: ${ride.roomCode}\nDestination: ${(ride.destination?.name || 'Destination').split(',')[0]}`,
      });
    } catch (error) {
      console.error('Error sharing room code:', error);
    }
  };

  const handleCopyRoomCode = () => {
    if (!ride) return;
    showToast(`Room code ${ride.roomCode} copied!`);
  };

  const handleStartRide = async () => {
    if (!ride) return;
    try {
      await RideService.startRide(ride.id);
    } catch (e) {
      console.error('Failed to start ride:', e);
    }
  };

  const handleExitLobby = () => {
    if (!ride || !user) return;
    setShowExitLobbyModal(true);
  };

  const confirmExitLobby = async () => {
    setShowExitLobbyModal(false);
    if (!ride || !user) return;
    const isLeader = user.uid === ride.leaderId;
    if (isLeader) {
      try {
        await RideService.cancelRide(ride.id);
      } catch (e) {
        console.error('Failed to cancel ride:', e);
      }
    } else {
      try {
        await RideService.leaveRide(ride.id, user.uid);
      } catch (e) {
        console.error('Failed to leave ride:', e);
      }
    }
    navigation.replace('Home');
  };

  if (loading || !ride) {
    return (
      <SafeScreenWrapper style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.textMuted }]}>Loading Ride Lobby...</Text>
      </SafeScreenWrapper>
    );
  }

  const isLeader = user?.uid === ride.leaderId;

  return (
    <SafeScreenWrapper style={[styles.container, { backgroundColor: colors.background }]}>
      <TopAppBar title="Pre-Ride Lobby" onBack={handleExitLobby} />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>

          {/* 1. Ride Header */}
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
              {ride.name || 'Group Ride'}
            </Text>
            <View style={styles.headerSubRow}>
              <Ionicons name="location-outline" size={14} color={colors.primary} style={{ marginRight: 4 }} />
              <Text style={[styles.destination, { color: colors.textMuted }]} numberOfLines={1}>
                To: {(ride.destination?.name || 'Destination').split(',')[0]}
              </Text>
            </View>
          </View>

          {/* 2. Room Code Invitation Card */}
          <View style={[styles.inviteCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.inviteCardHeader, { color: colors.textMuted }]}>ROOM INVITATION CODE</Text>
            
            <View style={styles.codeRow}>
              <Text style={[styles.codeText, { color: colors.primary }]}>{ride.roomCode}</Text>
            </View>

            <Text style={[styles.inviteSub, { color: colors.textSecondary }]}>
              Share this code or invite riders directly to join your lobby.
            </Text>

            {/* Quick Invitation Action Buttons */}
            <View style={styles.inviteActionsRow}>
              <TouchableOpacity
                style={[styles.inviteBtn, { backgroundColor: colors.primary }]}
                onPress={handleShareRoomCode}
              >
                <Ionicons name="share-outline" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
                <Text style={styles.inviteBtnPrimaryText}>Share Invite</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.inviteBtnSecondary, { backgroundColor: colors.background, borderColor: colors.border }]}
                onPress={handleCopyRoomCode}
              >
                <Ionicons name="copy-outline" size={18} color={colors.text} style={{ marginRight: 6 }} />
                <Text style={[styles.inviteBtnSecondaryText, { color: colors.text }]}>Copy</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.inviteBtnIconOnly, { backgroundColor: colors.background, borderColor: colors.border }]}
                onPress={() => setShowQrModal(true)}
              >
                <Ionicons name="qr-code-outline" size={20} color={colors.text} />
              </TouchableOpacity>
            </View>
          </View>

          {/* 3. Solo Participant Encouragement Card (If only 1 rider) */}
          {memberProfiles.length === 1 && (
            <View style={[styles.soloNoticeCard, { backgroundColor: isDark ? 'rgba(59, 130, 246, 0.12)' : 'rgba(59, 130, 246, 0.08)', borderColor: colors.border }]}>
              <Ionicons name="people-outline" size={24} color={colors.primary} style={{ marginRight: 12 }} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.soloTitle, { color: colors.text }]}>Waiting for riders to join...</Text>
                <Text style={[styles.soloSub, { color: colors.textMuted }]}>
                  Share your room code so friends can locate and join your pre-ride lobby.
                </Text>
              </View>
            </View>
          )}

          {/* 4. Participants Section */}
          <View style={[styles.participantsSection, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.participantsHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={styles.onlineDot} />
                <Text style={[styles.participantsTitle, { color: colors.text }]}>
                  Participants ({memberProfiles.length})
                </Text>
              </View>
              <Text style={[styles.readyBadge, { color: colors.textMuted }]}>
                {memberProfiles.length > 1 ? 'Lobby Ready' : '1 Active'}
              </Text>
            </View>

            <View style={styles.participantsList}>
              {memberProfiles.map((item) => {
                const isLeaderItem = item.uid === ride.leaderId;
                const riderName = item?.name || 'Rider';
                const firstInitial = riderName.charAt(0).toUpperCase();

                return (
                  <View key={item?.uid || Math.random().toString()} style={[styles.participantRow, { borderBottomColor: colors.border }]}>
                    <View style={[styles.avatarCircle, { backgroundColor: colors.primary }]}>
                      <Text style={styles.avatarText}>{firstInitial}</Text>
                    </View>

                    <View style={styles.participantInfo}>
                      <Text style={[styles.participantName, { color: colors.text }]}>{riderName}</Text>
                      <Text style={[styles.participantBike, { color: colors.textMuted }]}>
                        {item?.bikeName || 'Motorcycle'}
                      </Text>
                    </View>

                    {isLeaderItem ? (
                      <View style={[styles.hostBadge, { backgroundColor: 'rgba(0, 229, 255, 0.15)', borderColor: colors.primary }]}>
                        <Ionicons name="shield-checkmark" size={12} color={colors.primary} style={{ marginRight: 4 }} />
                        <Text style={[styles.hostBadgeText, { color: colors.primary }]}>Host</Text>
                      </View>
                    ) : (
                      <View style={styles.readyTag}>
                        <View style={styles.readyDot} />
                        <Text style={styles.readyTagText}>Ready</Text>
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          </View>

          {/* 5. Footer Primary Actions */}
          <View style={styles.footerContainer}>
            {isLeader ? (
              <>
                <Text style={[styles.leaderNotice, { color: colors.textMuted }]}>
                  Ride starts when the leader taps Start Group Ride
                </Text>

                <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
                  <TouchableOpacity
                    style={[styles.primaryStartBtn, { backgroundColor: colors.primary }]}
                    onPress={handleStartRide}
                  >
                    <Ionicons name="play" size={20} color="#FFFFFF" style={{ marginRight: 8 }} />
                    <Text style={styles.primaryStartBtnText}>Start Group Ride</Text>
                  </TouchableOpacity>
                </Animated.View>

                <TouchableOpacity
                  style={[styles.destructiveBtn, { borderColor: colors.danger }]}
                  onPress={handleExitLobby}
                >
                  <Ionicons name="trash-outline" size={18} color={colors.danger} style={{ marginRight: 8 }} />
                  <Text style={[styles.destructiveBtnText, { color: colors.danger }]}>Cancel Ride</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <View style={[styles.waitLeaderBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <ActivityIndicator size="small" color={colors.primary} style={{ marginRight: 10 }} />
                  <Text style={[styles.waitLeaderText, { color: colors.text }]}>
                    Waiting for the ride leader to start...
                  </Text>
                </View>

                <TouchableOpacity
                  style={[styles.destructiveBtn, { borderColor: colors.danger }]}
                  onPress={handleExitLobby}
                >
                  <Ionicons name="log-out-outline" size={18} color={colors.danger} style={{ marginRight: 8 }} />
                  <Text style={[styles.destructiveBtnText, { color: colors.danger }]}>Leave Lobby</Text>
                </TouchableOpacity>
              </>
            )}
          </View>

        </Animated.View>
      </ScrollView>

      {/* Toast Popup Notification */}
      {toastMsg && (
        <View style={styles.toastBox}>
          <Ionicons name="checkmark-circle" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
          <Text style={styles.toastText}>{toastMsg}</Text>
        </View>
      )}

      {/* Premium Ride Invite Modal */}
      <Modal visible={showQrModal} transparent animationType="slide" onRequestClose={() => setShowQrModal(false)}>
        <View style={styles.modalOverlay}>
          <ScrollView
            contentContainerStyle={{ paddingVertical: 40, paddingHorizontal: 20, alignItems: 'center', width: '100%' }}
            showsVerticalScrollIndicator={false}
          >
            {ride && (
              <RideInviteCard
                ride={ride}
                joinedCount={memberProfiles.length}
                maxRiders={8}
                leaderPhotoURL={memberProfiles.find((m) => m.uid === ride.leaderId)?.photoURL}
                onClose={() => setShowQrModal(false)}
              />
            )}
          </ScrollView>
        </View>
      </Modal>

      {/* Exit/Cancel Lobby Bottom Sheet */}
      <ConfirmationBottomSheet
        visible={showExitLobbyModal}
        title={isLeader ? 'Cancel Ride Lobby?' : 'Leave Ride Lobby?'}
        message={
          isLeader
            ? 'Are you sure you want to cancel this group ride for all members? The lobby will be closed.'
            : 'Are you sure you want to exit this ride lobby? You can rejoin using the room code.'
        }
        confirmText={isLeader ? 'Cancel Ride' : 'Leave Lobby'}
        cancelText="Keep Waiting"
        icon={isLeader ? 'trash-outline' : 'log-out-outline'}
        isDestructive={true}
        onConfirm={confirmExitLobby}
        onCancel={() => setShowExitLobbyModal(false)}
      />
    </SafeScreenWrapper>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: '900',
  },
  headerSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  destination: {
    fontSize: 14,
    fontWeight: '600',
  },
  inviteCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  inviteCardHeader: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  codeRow: {
    alignItems: 'center',
    marginVertical: 4,
  },
  codeText: {
    fontSize: 36,
    fontWeight: '900',
    letterSpacing: 6,
  },
  inviteSub: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 16,
  },
  inviteActionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  inviteBtn: {
    flex: 2,
    height: 44,
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  inviteBtnPrimaryText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  inviteBtnSecondary: {
    flex: 1.5,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  inviteBtnSecondaryText: {
    fontSize: 14,
    fontWeight: '700',
  },
  inviteBtnIconOnly: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  soloNoticeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  soloTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  soloSub: {
    fontSize: 12,
    marginTop: 2,
  },
  participantsSection: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 18,
    marginBottom: 20,
  },
  participantsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  onlineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10B981',
    marginRight: 8,
  },
  participantsTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  readyBadge: {
    fontSize: 12,
    fontWeight: '600',
  },
  participantsList: {
    gap: 12,
  },
  participantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  avatarCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  participantInfo: {
    flex: 1,
  },
  participantName: {
    fontSize: 15,
    fontWeight: '700',
  },
  participantBike: {
    fontSize: 12,
    marginTop: 2,
  },
  hostBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  hostBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  readyTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  readyDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
    marginRight: 4,
  },
  readyTagText: {
    color: '#10B981',
    fontSize: 11,
    fontWeight: '700',
  },
  footerContainer: {
    gap: 12,
  },
  leaderNotice: {
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 4,
  },
  primaryStartBtn: {
    height: 54,
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
  primaryStartBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  destructiveBtn: {
    height: 50,
    borderRadius: 16,
    borderWidth: 1.5,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  destructiveBtnText: {
    fontSize: 15,
    fontWeight: '700',
  },
  waitLeaderBox: {
    height: 54,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  waitLeaderText: {
    fontSize: 14,
    fontWeight: '600',
  },
  toastBox: {
    position: 'absolute',
    bottom: 30,
    alignSelf: 'center',
    backgroundColor: '#10B981',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 25,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
    zIndex: 9999,
  },
  toastText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  qrModalCard: {
    width: '100%',
    borderRadius: 24,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
  },
  qrHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    marginBottom: 20,
  },
  qrModalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  qrCodeBox: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  qrCodeText: {
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: 4,
    marginTop: 14,
  },
  qrCodeSub: {
    fontSize: 12,
    marginTop: 4,
  },
  qrCloseBtn: {
    width: '100%',
    height: 48,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 20,
  },
  qrCloseBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: 'bold',
  },
});

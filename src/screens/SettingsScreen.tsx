import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Switch,
  Alert,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StackScreenProps } from '@react-navigation/stack';
import { RootStackParamList } from '../types';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../hooks/useTheme';
import { useSettings } from '../hooks/useSettings';
import SafeScreenWrapper from '../components/SafeScreenWrapper';
import { TopAppBar } from '../components/TopAppBar';
import { ConfirmationBottomSheet } from '../components/ConfirmationBottomSheet';
import RideService from '../services/RideService';

type Props = StackScreenProps<RootStackParamList, 'Settings'>;

export default function SettingsScreen({ navigation }: Props) {
  const { user, signOut } = useAuth();
  const { colors, isDark } = useTheme();
  const { preferences, updatePreference } = useSettings();

  const [showSignOutModal, setShowSignOutModal] = useState(false);
  const [showDeleteHistoryModal, setShowDeleteHistoryModal] = useState(false);

  const handleDeleteHistory = () => setShowDeleteHistoryModal(true);
  const handleSignOut = () => setShowSignOutModal(true);

  const confirmSignOut = async () => {
    setShowSignOutModal(false);
    try {
      await signOut();
      navigation.replace('Login');
    } catch (e) {
      console.error('Sign out error:', e);
    }
  };

  const confirmDeleteHistory = async () => {
    setShowDeleteHistoryModal(false);
    if (!user) return;
    try {
      await RideService.clearAllRideHistory(user.uid);
      Alert.alert('Success', 'Your ride history has been permanently deleted.');
    } catch (e) {
      console.error('Failed to delete ride history:', e);
      Alert.alert('Error', 'Could not delete ride history. Please try again.');
    }
  };

  return (
    <SafeScreenWrapper style={[styles.container, { backgroundColor: colors.background }]}>
      <TopAppBar title="Settings" onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* 1. Rider Profile Card */}
        <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>RIDER PROFILE</Text>
          <View style={styles.profileRow}>
            {user?.photoURL ? (
              <Image source={{ uri: user.photoURL }} style={styles.avatarImage} />
            ) : (
              <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
                <Text style={styles.avatarText}>{user?.name?.charAt(0).toUpperCase() || 'R'}</Text>
              </View>
            )}
            <View style={styles.profileInfo}>
              <Text style={[styles.profileName, { color: colors.text }]}>{user?.name || 'Rider'}</Text>
              <Text style={[styles.profileEmail, { color: colors.textMuted }]}>{user?.email || 'No email set'}</Text>
              {user?.bikeName && (
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                  <Ionicons name="speedometer-outline" size={14} color={colors.textSecondary} style={{ marginRight: 4 }} />
                  <Text style={[styles.bikeName, { color: colors.textSecondary }]}>{user.bikeName}</Text>
                </View>
              )}
            </View>
          </View>

          <TouchableOpacity
            style={[styles.itemRow, { borderTopWidth: 1, borderTopColor: colors.border, marginTop: 14 }]}
            onPress={() => navigation.navigate('Profile')}
            activeOpacity={0.7}
          >
            <View style={styles.itemLeft}>
              <Ionicons name="create-outline" size={20} color={colors.primary} style={{ marginRight: 12 }} />
              <Text style={[styles.itemTitle, { color: colors.text }]}>Edit Profile & Preferences</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        {/* 2. NAVIGATION & MAP */}
        <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>NAVIGATION & MAP</Text>

          {/* Voice Guidance */}
          <View style={styles.toggleRow}>
            <View style={styles.toggleTextCol}>
              <Text style={[styles.toggleLabel, { color: colors.text }]}>Voice Navigation Guidance</Text>
              <Text style={[styles.toggleSub, { color: colors.textMuted }]}>
                {preferences.voiceGuidance ? 'ON — Spoken turn-by-turn alerts enabled' : 'OFF — Spoken navigation muted'}
              </Text>
            </View>
            <Switch
              value={preferences.voiceGuidance}
              onValueChange={(val) => updatePreference('voiceGuidance', val)}
              trackColor={{ false: '#64748B', true: colors.primary }}
            />
          </View>

          {/* Auto Re-center Map */}
          <View style={[styles.toggleRow, styles.rowBorderTop, { borderTopColor: colors.border }]}>
            <View style={styles.toggleTextCol}>
              <Text style={[styles.toggleLabel, { color: colors.text }]}>Auto Re-center Map</Text>
              <Text style={[styles.toggleSub, { color: colors.textMuted }]}>
                {preferences.autoRecenterMap ? 'ON — Map camera follows rider position' : 'OFF — Free map panning mode'}
              </Text>
            </View>
            <Switch
              value={preferences.autoRecenterMap}
              onValueChange={(val) => updatePreference('autoRecenterMap', val)}
              trackColor={{ false: '#64748B', true: colors.primary }}
            />
          </View>

          {/* Keep Screen Awake */}
          <View style={[styles.toggleRow, styles.rowBorderTop, { borderTopColor: colors.border }]}>
            <View style={styles.toggleTextCol}>
              <Text style={[styles.toggleLabel, { color: colors.text }]}>Keep Screen Awake</Text>
              <Text style={[styles.toggleSub, { color: colors.textMuted }]}>
                {preferences.keepScreenAwake ? 'ON — Prevents screen timeout during rides' : 'OFF — Standard system sleep behavior'}
              </Text>
            </View>
            <Switch
              value={preferences.keepScreenAwake}
              onValueChange={(val) => updatePreference('keepScreenAwake', val)}
              trackColor={{ false: '#64748B', true: colors.primary }}
            />
          </View>

          {/* Distance Units */}
          <View style={[styles.selectorRow, styles.rowBorderTop, { borderTopColor: colors.border }]}>
            <Text style={[styles.toggleLabel, { color: colors.text }]}>Distance Units</Text>
            <View style={styles.segmentContainer}>
              <TouchableOpacity
                style={[
                  styles.segmentBtn,
                  preferences.distanceUnits === 'km' && { backgroundColor: colors.primary },
                ]}
                onPress={() => updatePreference('distanceUnits', 'km')}
              >
                <Text style={[styles.segmentText, preferences.distanceUnits === 'km' && { color: '#FFFFFF' }]}>km</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.segmentBtn,
                  preferences.distanceUnits === 'mi' && { backgroundColor: colors.primary },
                ]}
                onPress={() => updatePreference('distanceUnits', 'mi')}
              >
                <Text style={[styles.segmentText, preferences.distanceUnits === 'mi' && { color: '#FFFFFF' }]}>miles</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Compass Mode */}
          <View style={[styles.selectorRow, styles.rowBorderTop, { borderTopColor: colors.border }]}>
            <Text style={[styles.toggleLabel, { color: colors.text }]}>Compass Mode</Text>
            <View style={styles.segmentContainer}>
              <TouchableOpacity
                style={[
                  styles.segmentBtn,
                  preferences.compassMode === 'heading' && { backgroundColor: colors.primary },
                ]}
                onPress={() => updatePreference('compassMode', 'heading')}
              >
                <Text style={[styles.segmentText, preferences.compassMode === 'heading' && { color: '#FFFFFF' }]}>Heading Up</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.segmentBtn,
                  preferences.compassMode === 'north' && { backgroundColor: colors.primary },
                ]}
                onPress={() => updatePreference('compassMode', 'north')}
              >
                <Text style={[styles.segmentText, preferences.compassMode === 'north' && { color: '#FFFFFF' }]}>North Up</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* 3. RIDE LIFECYCLE & AUTOMATION */}
        <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>RIDE LIFECYCLE & PRIVACY</Text>

          {/* Auto Resume Active Ride */}
          <View style={styles.toggleRow}>
            <View style={styles.toggleTextCol}>
              <Text style={[styles.toggleLabel, { color: colors.text }]}>Auto Resume Active Ride</Text>
              <Text style={[styles.toggleSub, { color: colors.textMuted }]}>
                {preferences.autoResumeActiveRide ? 'ON — Opens active ride on app launch' : 'OFF — Displays Home screen card'}
              </Text>
            </View>
            <Switch
              value={preferences.autoResumeActiveRide}
              onValueChange={(val) => updatePreference('autoResumeActiveRide', val)}
              trackColor={{ false: '#64748B', true: colors.primary }}
            />
          </View>

          {/* Share Live Location by Default */}
          <View style={[styles.toggleRow, styles.rowBorderTop, { borderTopColor: colors.border }]}>
            <View style={styles.toggleTextCol}>
              <Text style={[styles.toggleLabel, { color: colors.text }]}>Share Location by Default</Text>
              <Text style={[styles.toggleSub, { color: colors.textMuted }]}>
                {preferences.shareLiveLocationDefault ? 'ON — Shares GPS location when joining rides' : 'OFF — Ask before sharing'}
              </Text>
            </View>
            <Switch
              value={preferences.shareLiveLocationDefault}
              onValueChange={(val) => updatePreference('shareLiveLocationDefault', val)}
              trackColor={{ false: '#64748B', true: colors.primary }}
            />
          </View>

          {/* Automatically Save Ride History */}
          <View style={[styles.toggleRow, styles.rowBorderTop, { borderTopColor: colors.border }]}>
            <View style={styles.toggleTextCol}>
              <Text style={[styles.toggleLabel, { color: colors.text }]}>Automatically Save Ride History</Text>
              <Text style={[styles.toggleSub, { color: colors.textMuted }]}>
                {preferences.autoSaveRideHistory ? 'ON — Saves finished rides automatically' : 'OFF — Ask to save before ending'}
              </Text>
            </View>
            <Switch
              value={preferences.autoSaveRideHistory}
              onValueChange={(val) => updatePreference('autoSaveRideHistory', val)}
              trackColor={{ false: '#64748B', true: colors.primary }}
            />
          </View>
        </View>

        {/* 4. SAFETY ALERTS & NOTIFICATIONS */}
        <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>SAFETY & NOTIFICATIONS</Text>

          <View style={styles.toggleRow}>
            <View style={styles.toggleTextCol}>
              <Text style={[styles.toggleLabel, { color: colors.text }]}>Hazard & Safety Alerts</Text>
              <Text style={[styles.toggleSub, { color: colors.textMuted }]}>Proximity alerts for road hazards and SOS</Text>
            </View>
            <Switch
              value={preferences.notifyHazardAlerts}
              onValueChange={(val) => updatePreference('notifyHazardAlerts', val)}
              trackColor={{ false: '#64748B', true: colors.primary }}
            />
          </View>

          <View style={[styles.toggleRow, styles.rowBorderTop, { borderTopColor: colors.border }]}>
            <View style={styles.toggleTextCol}>
              <Text style={[styles.toggleLabel, { color: colors.text }]}>Group Ride Updates</Text>
              <Text style={[styles.toggleSub, { color: colors.textMuted }]}>Alerts when riders join, leave, or broadcast</Text>
            </View>
            <Switch
              value={preferences.notifyGroupUpdates}
              onValueChange={(val) => updatePreference('notifyGroupUpdates', val)}
              trackColor={{ false: '#64748B', true: colors.primary }}
            />
          </View>
        </View>

        {/* 5. DATA & ACCOUNT */}
        <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>DATA & ACCOUNT</Text>

          <TouchableOpacity style={styles.actionRow} onPress={handleDeleteHistory}>
            <Ionicons name="trash-outline" size={20} color="#EF4444" style={{ marginRight: 12 }} />
            <Text style={[styles.actionText, { color: '#EF4444' }]}>Clear All Ride History</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.actionRow, styles.rowBorderTop, { borderTopColor: colors.border }]} onPress={handleSignOut}>
            <Ionicons name="log-out-outline" size={20} color="#EF4444" style={{ marginRight: 12 }} />
            <Text style={[styles.actionText, { color: '#EF4444' }]}>Sign Out</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Sign Out Confirmation Modal */}
      <ConfirmationBottomSheet
        visible={showSignOutModal}
        title="Sign Out?"
        message="Are you sure you want to sign out of Biker Radar?"
        confirmText="Sign Out"
        cancelText="Cancel"
        isDestructive={true}
        onConfirm={confirmSignOut}
        onCancel={() => setShowSignOutModal(false)}
      />

      {/* Clear History Confirmation Modal */}
      <ConfirmationBottomSheet
        visible={showDeleteHistoryModal}
        title="Delete Ride History?"
        message="This will permanently delete all your local and personal ride history records."
        confirmText="Delete History"
        cancelText="Cancel"
        isDestructive={true}
        onConfirm={confirmDeleteHistory}
        onCancel={() => setShowDeleteHistoryModal(false)}
      />
    </SafeScreenWrapper>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    gap: 16,
    paddingBottom: 40,
  },
  sectionCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 18,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginBottom: 14,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  avatarImage: {
    width: 52,
    height: 52,
    borderRadius: 26,
    marginRight: 14,
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: 'bold',
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    fontSize: 18,
    fontWeight: '800',
  },
  profileEmail: {
    fontSize: 13,
    marginTop: 2,
  },
  bikeName: {
    fontSize: 12,
    fontWeight: '600',
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 14,
  },
  itemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  rowBorderTop: {
    borderTopWidth: 1,
    marginTop: 4,
  },
  toggleTextCol: {
    flex: 1,
    marginRight: 12,
  },
  toggleLabel: {
    fontSize: 14,
    fontWeight: '700',
  },
  toggleSub: {
    fontSize: 12,
    marginTop: 3,
    lineHeight: 16,
  },
  selectorRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  segmentContainer: {
    flexDirection: 'row',
    backgroundColor: 'rgba(100, 116, 139, 0.15)',
    borderRadius: 10,
    padding: 3,
  },
  segmentBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  segmentText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  actionText: {
    fontSize: 14,
    fontWeight: '700',
  },
});

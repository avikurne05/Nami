import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Image,
  Switch,
  ActivityIndicator,
  Alert,
  ActionSheetIOS,
  Platform,
  Modal,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { StackScreenProps } from '@react-navigation/stack';
import { RootStackParamList, UserProfile } from '../types';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../hooks/useTheme';
import SafeScreenWrapper from '../components/SafeScreenWrapper';
import { TopAppBar } from '../components/TopAppBar';

type Props = StackScreenProps<RootStackParamList, 'Profile'>;

const AVATAR_PRESETS = [
  'https://images.unsplash.com/photo-1558981403-c5f9899a28bc?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1568772585407-9361f9bf3a87?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1571607388263-1044f9ea01dd?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&auto=format&fit=crop&q=80',
];

const RIDING_EXPERIENCES: UserProfile['ridingExperience'][] = [
  'Beginner',
  'Intermediate',
  'Advanced',
  'Expert',
];

const RIDING_STYLES: UserProfile['ridingStyle'][] = [
  'Touring',
  'Adventure',
  'City',
  'Sport',
];

export default function ProfileScreen({ navigation }: Props) {
  const { user, updateProfile } = useAuth();
  const { colors, isDark } = useTheme();

  // Form State
  const [name, setName] = useState(user?.name || '');
  const [bikeName, setBikeName] = useState(user?.bikeName || '');
  const [emergencyContact, setEmergencyContact] = useState(user?.emergencyContact || '');
  const [photoURL, setPhotoURL] = useState(user?.photoURL || '');
  const [ridingExperience, setRidingExperience] = useState<UserProfile['ridingExperience']>(
    user?.ridingExperience || 'Intermediate'
  );
  const [ridingStyle, setRidingStyle] = useState<UserProfile['ridingStyle']>(
    user?.ridingStyle || 'Touring'
  );
  const [favoriteBike, setFavoriteBike] = useState(user?.favoriteBike || '');
  const [notificationsEnabled, setNotificationsEnabled] = useState(
    user?.notificationsEnabled ?? true
  );

  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [showPhotoOptionsModal, setShowPhotoOptionsModal] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // ── Take Photo via Camera ──────────────────────────────────────────────────
  const handleTakePhoto = async () => {
    setShowPhotoOptionsModal(false);
    try {
      const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert('Permission Denied', 'Camera access is required to take a profile photo.');
        return;
      }

      setUploadingPhoto(true);
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.6,
        base64: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        const imageUri = asset.base64 ? `data:image/jpeg;base64,${asset.base64}` : asset.uri;
        setPhotoURL(imageUri);
        // Immediately sync to AuthContext so photo updates everywhere
        await updateProfile({ photoURL: imageUri });
        setToastMsg('Profile photo updated successfully!');
        setTimeout(() => setToastMsg(null), 3000);
      }
    } catch (error: any) {
      console.error('Camera error:', error);
      Alert.alert('Error', 'Could not open camera. Please try again.');
    } finally {
      setUploadingPhoto(false);
    }
  };

  // ── Choose from Gallery ────────────────────────────────────────────────────
  const handleChooseFromGallery = async () => {
    setShowPhotoOptionsModal(false);
    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert('Permission Denied', 'Gallery access is required to select a profile photo.');
        return;
      }

      setUploadingPhoto(true);
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.6,
        base64: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        const imageUri = asset.base64 ? `data:image/jpeg;base64,${asset.base64}` : asset.uri;
        setPhotoURL(imageUri);
        // Immediately sync to AuthContext so photo updates everywhere
        await updateProfile({ photoURL: imageUri });
        setToastMsg('Profile photo updated successfully!');
        setTimeout(() => setToastMsg(null), 3000);
      }
    } catch (error: any) {
      console.error('Gallery picker error:', error);
      Alert.alert('Error', 'Could not access photo gallery.');
    } finally {
      setUploadingPhoto(false);
    }
  };

  // ── Remove Current Photo ───────────────────────────────────────────────────
  const handleRemovePhoto = async () => {
    setShowPhotoOptionsModal(false);
    setPhotoURL('');
    try {
      await updateProfile({ photoURL: '' });
      setToastMsg('Profile photo removed.');
      setTimeout(() => setToastMsg(null), 3000);
    } catch (e) {
      // Quiet fallback
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Required Field', 'Please enter your display name.');
      return;
    }

    setSaving(true);
    setToastMsg(null);
    try {
      await updateProfile({
        name: name.trim(),
        bikeName: bikeName.trim() || 'Motorcycle',
        emergencyContact: emergencyContact.trim(),
        photoURL: photoURL.trim(),
        ridingExperience,
        ridingStyle,
        favoriteBike: favoriteBike.trim(),
        notificationsEnabled,
      });

      setToastMsg('Profile updated successfully!');
      setTimeout(() => setToastMsg(null), 3000);
    } catch (e: any) {
      Alert.alert('Save Failed', e?.message || 'Could not update profile.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeScreenWrapper style={[styles.container, { backgroundColor: colors.background }]}>
      <TopAppBar title="Rider Profile" onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Toast Alert */}
        {toastMsg && (
          <View style={[styles.toastBox, { backgroundColor: '#10B98120', borderColor: '#10B981' }]}>
            <Ionicons name="checkmark-circle-outline" size={18} color="#10B981" style={{ marginRight: 8 }} />
            <Text style={[styles.toastText, { color: '#10B981' }]}>{toastMsg}</Text>
          </View>
        )}

        {/* Header Avatar & Name Section */}
        <View style={[styles.profileHeaderCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <TouchableOpacity
            style={styles.avatarWrapper}
            onPress={() => setShowPhotoOptionsModal(true)}
            activeOpacity={0.8}
            disabled={uploadingPhoto}
          >
            {photoURL ? (
              <Image source={{ uri: photoURL }} style={styles.avatarImage} />
            ) : (
              <View style={[styles.avatarPlaceholder, { backgroundColor: `${colors.primary}20` }]}>
                <Ionicons name="person" size={44} color={colors.primary} />
              </View>
            )}
            <View style={[styles.cameraBadge, { backgroundColor: colors.primary }]}>
              {uploadingPhoto ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Ionicons name="camera" size={14} color="#FFFFFF" />
              )}
            </View>
          </TouchableOpacity>

          <Text style={[styles.headerName, { color: colors.text }]}>{user?.name || 'Rider'}</Text>
          <Text style={[styles.headerEmail, { color: colors.textMuted }]}>{user?.email || ''}</Text>

          {/* Quick Change Photo Button */}
          <TouchableOpacity
            style={[styles.changePhotoBtn, { backgroundColor: `${colors.primary}15`, borderColor: colors.border }]}
            onPress={() => setShowPhotoOptionsModal(true)}
          >
            <Ionicons name="image-outline" size={16} color={colors.primary} style={{ marginRight: 6 }} />
            <Text style={[styles.changePhotoBtnText, { color: colors.primary }]}>Change Profile Photo</Text>
          </TouchableOpacity>
        </View>

        {/* 1. BASIC INFORMATION */}
        <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>BASIC INFORMATION</Text>

          <View style={styles.fieldBlock}>
            <Text style={[styles.fieldLabel, { color: colors.text }]}>Display Name *</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
              value={name}
              onChangeText={setName}
              placeholder="e.g. Alex Rider"
              placeholderTextColor={colors.textMuted}
            />
          </View>

          <View style={styles.fieldBlock}>
            <Text style={[styles.fieldLabel, { color: colors.text }]}>Primary Motorcycle</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
              value={bikeName}
              onChangeText={setBikeName}
              placeholder="e.g. Royal Enfield Himalayan 450"
              placeholderTextColor={colors.textMuted}
            />
          </View>

          <View style={styles.fieldBlock}>
            <Text style={[styles.fieldLabel, { color: colors.text }]}>Emergency Contact Number</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
              value={emergencyContact}
              onChangeText={setEmergencyContact}
              placeholder="e.g. +1 (555) 019-2834"
              placeholderTextColor={colors.textMuted}
              keyboardType="phone-pad"
            />
          </View>
        </View>

        {/* 2. RIDING PREFERENCES */}
        <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>RIDING PREFERENCES</Text>

          <View style={styles.fieldBlock}>
            <Text style={[styles.fieldLabel, { color: colors.text }]}>Riding Experience</Text>
            <View style={styles.chipRow}>
              {RIDING_EXPERIENCES.map((exp) => {
                const isSelected = ridingExperience === exp;
                return (
                  <TouchableOpacity
                    key={exp}
                    style={[
                      styles.chip,
                      { borderColor: colors.border, backgroundColor: isSelected ? colors.primary : colors.background },
                    ]}
                    onPress={() => setRidingExperience(exp)}
                  >
                    <Text style={[styles.chipText, { color: isSelected ? '#FFFFFF' : colors.text }]}>{exp}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <View style={styles.fieldBlock}>
            <Text style={[styles.fieldLabel, { color: colors.text }]}>Preferred Riding Style</Text>
            <View style={styles.chipRow}>
              {RIDING_STYLES.map((styleItem) => {
                const isSelected = ridingStyle === styleItem;
                return (
                  <TouchableOpacity
                    key={styleItem}
                    style={[
                      styles.chip,
                      { borderColor: colors.border, backgroundColor: isSelected ? colors.primary : colors.background },
                    ]}
                    onPress={() => setRidingStyle(styleItem)}
                  >
                    <Text style={[styles.chipText, { color: isSelected ? '#FFFFFF' : colors.text }]}>{styleItem}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <View style={styles.fieldBlock}>
            <Text style={[styles.fieldLabel, { color: colors.text }]}>Dream / Favorite Motorcycle</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
              value={favoriteBike}
              onChangeText={setFavoriteBike}
              placeholder="e.g. BMW R 1250 GS Adventure"
              placeholderTextColor={colors.textMuted}
            />
          </View>
        </View>

        {/* 3. NOTIFICATION & APP PREFERENCES */}
        <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>PREFERENCES</Text>
          <View style={styles.toggleRow}>
            <View style={{ flex: 1, marginRight: 12 }}>
              <Text style={[styles.fieldLabel, { color: colors.text }]}>Ride & Safety Notifications</Text>
              <Text style={[styles.helperText, { color: colors.textMuted }]}>
                Receive alerts when riders broadcast messages or trigger SOS
              </Text>
            </View>
            <Switch
              value={notificationsEnabled}
              onValueChange={setNotificationsEnabled}
              trackColor={{ false: '#64748B', true: colors.primary }}
            />
          </View>
        </View>

        {/* Save Button */}
        <TouchableOpacity
          style={[styles.saveBtn, { backgroundColor: colors.primary }, saving && { opacity: 0.6 }]}
          onPress={handleSave}
          disabled={saving}
          activeOpacity={0.85}
        >
          {saving ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <Ionicons name="checkmark" size={20} color="#FFFFFF" style={{ marginRight: 8 }} />
              <Text style={styles.saveBtnText}>Save Profile Changes</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>

      {/* ── PROFILE PHOTO OPTIONS MODAL ── */}
      <Modal
        visible={showPhotoOptionsModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowPhotoOptionsModal(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowPhotoOptionsModal(false)}
        >
          <View style={[styles.modalSheet, { backgroundColor: isDark ? '#0F172A' : '#FFFFFF', borderColor: colors.border }]}>
            <Text style={[styles.modalSheetTitle, { color: colors.text }]}>Profile Photo Options</Text>

            <TouchableOpacity style={styles.modalOptionRow} onPress={handleTakePhoto}>
              <View style={[styles.modalOptionIcon, { backgroundColor: `${colors.primary}20` }]}>
                <Ionicons name="camera-outline" size={22} color={colors.primary} />
              </View>
              <Text style={[styles.modalOptionText, { color: colors.text }]}>Take Photo (Camera)</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.modalOptionRow} onPress={handleChooseFromGallery}>
              <View style={[styles.modalOptionIcon, { backgroundColor: '#00E5FF20' }]}>
                <Ionicons name="images-outline" size={22} color="#00E5FF" />
              </View>
              <Text style={[styles.modalOptionText, { color: colors.text }]}>Choose from Gallery</Text>
            </TouchableOpacity>

            {photoURL ? (
              <TouchableOpacity style={styles.modalOptionRow} onPress={handleRemovePhoto}>
                <View style={[styles.modalOptionIcon, { backgroundColor: 'rgba(239,68,68,0.15)' }]}>
                  <Ionicons name="trash-outline" size={22} color="#EF4444" />
                </View>
                <Text style={[styles.modalOptionText, { color: '#EF4444' }]}>Remove Current Photo</Text>
              </TouchableOpacity>
            ) : null}

            <TouchableOpacity
              style={[styles.modalCancelBtn, { backgroundColor: colors.background, borderColor: colors.border }]}
              onPress={() => setShowPhotoOptionsModal(false)}
            >
              <Text style={[styles.modalCancelText, { color: colors.textMuted }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
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
  toastBox: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  toastText: {
    fontSize: 14,
    fontWeight: '700',
  },
  profileHeaderCard: {
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
  },
  avatarWrapper: {
    position: 'relative',
    marginBottom: 12,
  },
  avatarImage: {
    width: 96,
    height: 96,
    borderRadius: 48,
  },
  avatarPlaceholder: {
    width: 96,
    height: 96,
    borderRadius: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cameraBadge: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#0F172A',
  },
  headerName: {
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -0.3,
  },
  headerEmail: {
    fontSize: 13,
    marginTop: 2,
  },
  changePhotoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 14,
  },
  changePhotoBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  sectionCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 18,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginBottom: 14,
  },
  fieldBlock: {
    marginBottom: 14,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 6,
  },
  input: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontSize: 14,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '700',
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  helperText: {
    fontSize: 12,
    marginTop: 2,
  },
  saveBtn: {
    height: 54,
    borderRadius: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
    shadowColor: '#1A73E8',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },

  // Modal Sheet Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1.5,
    borderBottomWidth: 0,
    padding: 24,
    gap: 12,
  },
  modalSheetTitle: {
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 8,
  },
  modalOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  modalOptionIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  modalOptionText: {
    fontSize: 16,
    fontWeight: '700',
  },
  modalCancelBtn: {
    height: 50,
    borderRadius: 14,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  modalCancelText: {
    fontSize: 15,
    fontWeight: '700',
  },
});

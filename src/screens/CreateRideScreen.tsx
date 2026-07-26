import React, { useState, useRef, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Switch,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StackScreenProps } from '@react-navigation/stack';
import { RootStackParamList } from '../types';
import { useAuth } from '../hooks/useAuth';
import RideService from '../services/RideService';
import GeocodingService, { GeocodedLocation } from '../services/GeocodingService';
import { useTheme } from '../hooks/useTheme';
import SafeScreenWrapper from '../components/SafeScreenWrapper';
import { TopAppBar } from '../components/TopAppBar';

import DestinationRecommendationService, { NearbyRecommendation } from '../services/DestinationRecommendationService';
import LocationService from '../services/LocationService';
import { useSettings } from '../hooks/useSettings';
import { formatDistance } from '../services/SettingsService';

type Props = StackScreenProps<RootStackParamList, 'CreateRide'>;

const RADIUS_OPTIONS = [
  { label: '1 km', val: 250 },
  { label: '2 km', val: 500 },
  { label: '5 km', val: 1000 },
  { label: '10 km', val: 1500 },
];

export default function CreateRideScreen({ navigation }: Props) {
  const { user } = useAuth();
  const { colors, isDark } = useTheme();
  const { preferences } = useSettings();

  // Fields
  const [rideName, setRideName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<GeocodedLocation[]>([]);
  const [selectedDestination, setSelectedDestination] = useState<GeocodedLocation | null>(null);
  const [nearbyRecommendations, setNearbyRecommendations] = useState<NearbyRecommendation[]>([]);
  const [loadingNearby, setLoadingNearby] = useState(false);
  const [maxGap, setMaxGap] = useState(500); // meters
  const [isPrivate, setIsPrivate] = useState(true);

  // States
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [loadingCreate, setLoadingCreate] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isNameFocused, setIsNameFocused] = useState(false);
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isCreatingRef = useRef(false);

  // Fetch real nearby motorcycle destinations based on user GPS location
  useEffect(() => {
    let isMounted = true;
    async function loadNearby() {
      setLoadingNearby(true);
      try {
        const loc = await LocationService.getCurrentLocation();
        if (loc?.coords && isMounted) {
          const recs = await DestinationRecommendationService.getNearbyRecommendations(
            loc.coords.latitude,
            loc.coords.longitude
          );
          if (isMounted) setNearbyRecommendations(recs);
        }
      } catch (e) {
        console.warn('Failed to fetch nearby recommendations:', e);
      } finally {
        if (isMounted) setLoadingNearby(false);
      }
    }
    loadNearby();
    return () => { isMounted = false; };
  }, []);

  const handleSearch = (text: string) => {
    setSearchQuery(text);
    if (selectedDestination && text !== selectedDestination.name) {
      setSelectedDestination(null);
    }

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (text.trim().length < 3) {
      setSearchResults([]);
      setLoadingSearch(false);
      return;
    }

    setLoadingSearch(true);
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const results = await GeocodingService.searchAddress(text);
        setSearchResults(results);
      } catch (e) {
        console.error('Geocoding search error:', e);
      } finally {
        setLoadingSearch(false);
      }
    }, 350);
  };

  const handleSelectDestination = (loc: GeocodedLocation) => {
    setSelectedDestination(loc);
    setSearchQuery(loc.name);
    setSearchResults([]);
  };

  const executeCreateRide = async () => {
    if (isCreatingRef.current || loadingCreate) return;
    isCreatingRef.current = true;
    setErrorMsg(null);

    if (!user) {
      setErrorMsg('You must be logged in to create a ride.');
      return;
    }

    setLoadingCreate(true);
    try {
      const rideId = await RideService.createRide(
        user.uid,
        user.name || 'Rider',
        rideName.trim(),
        selectedDestination!.name,
        selectedDestination!.latitude,
        selectedDestination!.longitude,
        maxGap,
        isPrivate ? 'private' : 'public'
      );
      navigation.replace('WaitingLobby', { rideId });
    } catch (e: any) {
      console.error('Create ride error:', e);
      setErrorMsg(e.message || 'Failed to create ride lobby.');
    } finally {
      setLoadingCreate(false);
      isCreatingRef.current = false;
    }
  };

  const handleCreate = () => {
    if (isCreatingRef.current || loadingCreate) return;
    setErrorMsg(null);

    if (!rideName.trim()) {
      setErrorMsg('Please enter a ride name.');
      return;
    }

    if (!selectedDestination) {
      setErrorMsg('Please select a destination from search results or popular spots.');
      return;
    }

    if (!user) {
      setErrorMsg('You must be logged in to create a ride.');
      return;
    }

    // Share Location by Default setting check
    if (!preferences.shareLiveLocationDefault) {
      Alert.alert(
        'Share Live Location?',
        'Would you like to automatically share your live GPS location with group members during this ride?',
        [
          {
            text: 'Share Location',
            onPress: () => executeCreateRide(),
          },
          {
            text: 'Cancel',
            style: 'cancel',
          },
        ]
      );
    } else {
      executeCreateRide();
    }
  };

  const isFormValid = rideName.trim().length > 0 && selectedDestination !== null;

  return (
    <SafeScreenWrapper style={[styles.container, { backgroundColor: colors.background }]}>
      <TopAppBar title="Create Ride" onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {errorMsg && (
          <View style={styles.errorContainer}>
            <Ionicons name="warning-outline" size={18} color="#EF4444" style={{ marginRight: 8 }} />
            <Text style={styles.errorText}>{errorMsg}</Text>
          </View>
        )}

        {/* 1. Ride Details Section */}
        <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>RIDE DETAILS</Text>

          <View style={styles.fieldBlock}>
            <View style={styles.fieldHeaderRow}>
              <Ionicons name="speedometer-outline" size={16} color={colors.primary} style={{ marginRight: 6 }} />
              <Text style={[styles.fieldLabel, { color: colors.text }]}>Ride Name *</Text>
            </View>

            <TextInput
              style={[
                styles.textInput,
                { backgroundColor: colors.background, borderColor: colors.border, color: colors.text },
                isNameFocused && { borderColor: colors.primary, borderWidth: 1.5 },
              ]}
              placeholder="e.g. Weekend Goa Ride, Sunday Breakfast Ride"
              placeholderTextColor={colors.textMuted}
              value={rideName}
              onChangeText={setRideName}
              onFocus={() => setIsNameFocused(true)}
              onBlur={() => setIsNameFocused(false)}
            />
            <Text style={[styles.helperText, { color: colors.textMuted }]}>
              This name will be visible to all riders joining your group.
            </Text>
          </View>
        </View>

        {/* 2. Destination Section */}
        <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>DESTINATION</Text>

          <View style={styles.fieldBlock}>
            <View style={styles.fieldHeaderRow}>
              <Ionicons name="location-outline" size={16} color={colors.primary} style={{ marginRight: 6 }} />
              <Text style={[styles.fieldLabel, { color: colors.text }]}>Set Finish Point *</Text>
            </View>

            <View style={styles.searchWrapper}>
              <Ionicons name="search-outline" size={18} color={colors.textMuted} style={styles.searchIcon} />
              <TextInput
                style={[
                  styles.textInput,
                  styles.searchInput,
                  { backgroundColor: colors.background, borderColor: colors.border, color: colors.text },
                  isSearchFocused && { borderColor: colors.primary, borderWidth: 1.5 },
                ]}
                placeholder="Search location or choose below..."
                placeholderTextColor={colors.textMuted}
                value={searchQuery}
                onChangeText={handleSearch}
                onFocus={() => setIsSearchFocused(true)}
                onBlur={() => setIsSearchFocused(false)}
              />
              {loadingSearch && (
                <ActivityIndicator size="small" color={colors.primary} style={styles.searchLoader} />
              )}
            </View>

            {/* Autocomplete Dropdown Search Results */}
            {searchResults.length > 0 && (
              <View style={[styles.searchResultsBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
                {searchResults.map((item, idx) => (
                  <TouchableOpacity
                    key={idx}
                    style={[styles.searchResultRow, { borderBottomColor: colors.border }]}
                    onPress={() => handleSelectDestination(item)}
                  >
                    <Ionicons name="location-outline" size={18} color={colors.primary} style={{ marginRight: 10 }} />
                    <Text style={[styles.searchResultName, { color: colors.text }]} numberOfLines={2}>
                      {item.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Nearby Location-Aware Destination Recommendations (≤ 50 km) */}
            {!searchQuery.trim() && (
              <View style={styles.popularContainer}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <Text style={[styles.popularTitle, { color: colors.textSecondary }]}>Nearby Biker Spots (within 50 km)</Text>
                  {loadingNearby && <ActivityIndicator size="small" color={colors.primary} />}
                </View>

                {nearbyRecommendations.length > 0 ? (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.popularScroll}>
                    {nearbyRecommendations.map((item) => (
                      <TouchableOpacity
                        key={item.id}
                        style={[styles.nearbyCard, { backgroundColor: colors.background, borderColor: colors.border }]}
                        onPress={() => handleSelectDestination(item)}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                          <Ionicons name={item.iconName as any} size={15} color={colors.accent || '#00E5FF'} style={{ marginRight: 6 }} />
                          <Text style={[styles.nearbyCategory, { color: colors.accent || '#00E5FF' }]}>{item.category}</Text>
                        </View>
                        <Text style={[styles.popularChipText, { color: colors.text }]} numberOfLines={1}>
                          {item.name.split(',')[0]}
                        </Text>
                        <Text style={[styles.nearbyMetaText, { color: colors.textMuted }]}>
                          {formatDistance(item.distanceKm, preferences.distanceUnits)} • {item.formattedTimeText}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                ) : !loadingNearby ? (
                  <View style={[styles.noNearbyBox, { borderColor: colors.border }]}>
                    <Ionicons name="location-outline" size={16} color={colors.textMuted} style={{ marginRight: 6 }} />
                    <Text style={[styles.noNearbyText, { color: colors.textMuted }]}>
                      Enable location access to discover nearby biker destinations.
                    </Text>
                  </View>
                ) : null}
              </View>
            )}
          </View>
        </View>

        {/* 3. Hazard Alert Radius Section */}
        <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>HAZARD ALERT RADIUS</Text>
          <Text style={[styles.sectionDesc, { color: colors.textSecondary }]}>
            Choose how far hazard alerts and warning pins are shared with your group.
          </Text>

          <View style={styles.segmentedRow}>
            {RADIUS_OPTIONS.map((opt) => {
              const isSelected = maxGap === opt.val;
              return (
                <TouchableOpacity
                  key={opt.val}
                  style={[
                    styles.segmentBtn,
                    { borderColor: colors.border },
                    isSelected && { backgroundColor: colors.primary, borderColor: colors.primary },
                  ]}
                  onPress={() => setMaxGap(opt.val)}
                >
                  <Text style={[styles.segmentText, { color: isSelected ? '#FFFFFF' : colors.text }]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* 4. Privacy Section */}
        <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>PRIVACY & ACCESS</Text>

          <View style={styles.privacyRow}>
            <View style={styles.privacyLeft}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons name="lock-closed-outline" size={18} color={colors.text} style={{ marginRight: 8 }} />
                <Text style={[styles.privacyTitle, { color: colors.text }]}>Private Ride</Text>
                <TouchableOpacity
                  style={{ marginLeft: 6 }}
                  onPress={() => Alert.alert('Private Ride Info', 'Only riders with the unique 6-digit room code can join your ride lobby.')}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="information-circle-outline" size={18} color={colors.primary} />
                </TouchableOpacity>
              </View>
              <Text style={[styles.privacySub, { color: colors.textMuted }]}>
                Only riders with the room code can join.
              </Text>
            </View>

            <Switch
              value={isPrivate}
              onValueChange={setIsPrivate}
              trackColor={{ false: '#64748B', true: colors.primary }}
            />
          </View>
        </View>

        {/* 5. Create Ride Primary Action Button */}
        <TouchableOpacity
          style={[
            styles.submitButton,
            { backgroundColor: colors.primary },
            (!isFormValid || loadingCreate) && { opacity: 0.5 },
          ]}
          onPress={handleCreate}
          disabled={!isFormValid || loadingCreate}
        >
          {loadingCreate ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <Text style={styles.submitButtonText}>Create Ride</Text>
              <Ionicons name="arrow-forward" size={20} color="#FFFFFF" style={{ marginLeft: 8 }} />
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
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
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 1,
    borderColor: '#EF4444',
    borderRadius: 12,
    padding: 14,
    marginBottom: 4,
  },
  errorText: {
    color: '#EF4444',
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  sectionCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginBottom: 12,
  },
  sectionDesc: {
    fontSize: 13,
    marginBottom: 14,
    lineHeight: 18,
  },
  fieldBlock: {
    marginBottom: 4,
  },
  fieldHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  fieldLabel: {
    fontSize: 15,
    fontWeight: '700',
  },
  textInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  helperText: {
    fontSize: 12,
    marginTop: 6,
  },
  searchWrapper: {
    position: 'relative',
    justifyContent: 'center',
  },
  searchIcon: {
    position: 'absolute',
    left: 14,
    zIndex: 1,
  },
  searchInput: {
    paddingLeft: 42,
    paddingRight: 40,
  },
  searchLoader: {
    position: 'absolute',
    right: 14,
    zIndex: 1,
  },
  searchResultsBox: {
    borderWidth: 1,
    borderRadius: 14,
    marginTop: 8,
    maxHeight: 200,
    overflow: 'hidden',
  },
  searchResultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderBottomWidth: 1,
  },
  searchResultName: {
    fontSize: 14,
    flex: 1,
  },
  popularContainer: {
    marginTop: 14,
  },
  popularTitle: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 8,
  },
  popularScroll: {
    gap: 10,
  },
  nearbyCard: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1.5,
    minWidth: 140,
  },
  nearbyCategory: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  nearbyMetaText: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 4,
  },
  noNearbyBox: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  noNearbyText: {
    fontSize: 12,
    fontWeight: '500',
    flex: 1,
  },
  popularChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  popularChipText: {
    fontSize: 13,
    fontWeight: '700',
  },
  segmentedRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  segmentBtn: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  segmentText: {
    fontSize: 14,
    fontWeight: '700',
  },
  privacyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  privacyLeft: {
    flex: 1,
    marginRight: 12,
  },
  privacyTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  privacySub: {
    fontSize: 12,
    marginTop: 2,
  },
  submitButton: {
    height: 54,
    borderRadius: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

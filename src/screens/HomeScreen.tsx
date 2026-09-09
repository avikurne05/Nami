import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Animated,
  Share,
  Modal,
  ScrollView,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StackScreenProps } from '@react-navigation/stack';
import { useFocusEffect } from '@react-navigation/native';
import { RootStackParamList, RideHistoryEntry, RideSession } from '../types';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../hooks/useTheme';
import SafeScreenWrapper from '../components/SafeScreenWrapper';
import { ConfirmationBottomSheet } from '../components/ConfirmationBottomSheet';
import ActiveRideBanner from '../components/ActiveRideBanner';
import RideService from '../services/RideService';
import LocationService from '../services/LocationService';
import WeatherService, { WeatherData } from '../services/WeatherService';
import { formatDuration } from '../utils';
import { useSettings } from '../hooks/useSettings';
import { formatDistance, formatSpeed } from '../services/SettingsService';

type Props = StackScreenProps<RootStackParamList, 'Home'>;

export default function HomeScreen({ navigation }: Props) {
  const { user } = useAuth();
  const { colors, isDark } = useTheme();
  const { preferences } = useSettings();

  // Ride State
  const [history, setHistory] = useState<RideHistoryEntry[]>([]);
  const [activeRide, setActiveRide] = useState<RideSession | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Weather & Location State (Non-blocking async load)
  const [cityName, setCityName] = useState<string>('Location');
  const [weatherData, setWeatherData] = useState<WeatherData | null>(null);

  // Banner collapse state
  const [isBannerCollapsed, setIsBannerCollapsed] = useState(false);

  // Delete & Overflow Menu Modal State
  const [selectedHistoryItem, setSelectedHistoryItem] = useState<RideHistoryEntry | null>(null);
  const [showOverflowModal, setShowOverflowModal] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<RideHistoryEntry | null>(null);
  const [showClearAllModal, setShowClearAllModal] = useState(false);
  const [showEndRideModal, setShowEndRideModal] = useState(false);

  const confirmEndRide = async () => {
    setShowEndRideModal(false);
    if (!activeRide) return;
    try {
      const durationSec = Math.max(0, Math.floor((Date.now() - activeRide.createdAt) / 1000));
      await RideService.endRide(activeRide.id, durationSec, 0, 0, 0);
      setActiveRide(null);
      showToast('Ride ended. Saved to history for all participants.', 'success');
      await fetchActiveRideAndHistory();
    } catch (e: any) {
      showToast(e?.message || 'Could not end ride.', 'error');
    }
  };

  // Entrance Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(15)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 350,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 350,
        useNativeDriver: true,
      }),
    ]).start();
  }, [fadeAnim, slideAnim]);

  // Dynamic Time Greeting
  const greetingText = useMemo(() => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return 'Good Morning';
    if (hour >= 12 && hour < 17) return 'Good Afternoon';
    return 'Good Evening';
  }, []);

  // Async non-blocking location & weather fetch
  useEffect(() => {
    let isMounted = true;
    async function loadWeatherAndLocation() {
      try {
        const hasPermission = await LocationService.requestPermissions();
        if (!hasPermission || !isMounted) return;

        const location = await LocationService.getCurrentLocation();
        if (!location?.coords || !isMounted) return;

        const city = await LocationService.getCityName(location.coords.latitude, location.coords.longitude);
        if (city && isMounted) {
          setCityName(city);
        }

        const weather = await WeatherService.getWeather(
          location.coords.latitude,
          location.coords.longitude,
          city || 'Location'
        );
        if (weather && isMounted) {
          setWeatherData(weather);
        }
      } catch (e) {
        console.warn('Non-blocking weather/location fetch skipped:', e);
      }
    }
    loadWeatherAndLocation();
    return () => { isMounted = false; };
  }, []);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => {
      setToastMessage(null);
    }, 3000);
  };

  const fetchActiveRideAndHistory = useCallback(async () => {
    if (!user?.uid) return;
    try {
      const [historyData, currentActive] = await Promise.all([
        RideService.getRideHistory(user.uid),
        RideService.getActiveRideForUser(user.uid),
      ]);
      setHistory(historyData);
      setActiveRide(currentActive);
    } catch (e) {
      console.error('Failed to fetch user ride data:', e);
    } finally {
      setLoadingHistory(false);
      setRefreshing(false);
    }
  }, [user?.uid]);

  useFocusEffect(
    useCallback(() => {
      fetchActiveRideAndHistory();
      setIsBannerCollapsed(false);
    }, [fetchActiveRideAndHistory])
  );

  // Real-time Active Ride subscription
  useEffect(() => {
    if (!user?.uid) {
      setActiveRide(null);
      return;
    }
    const unsubscribe = RideService.subscribeToActiveRideForUser(user.uid, (currentActive) => {
      setActiveRide(currentActive);
      if (!currentActive) {
        fetchActiveRideAndHistory();
      }
    });
    return unsubscribe;
  }, [user?.uid, fetchActiveRideAndHistory]);

  const handleResumeRide = () => {
    if (!activeRide?.id) return;
    if (activeRide.status === 'lobby') {
      navigation.navigate('WaitingLobby', { rideId: activeRide.id });
    } else {
      navigation.navigate('Ride', { rideId: activeRide.id });
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    fetchActiveRideAndHistory();
  };

  // Compute Memoized Quick Stats (60 FPS Performance)
  const quickStats = useMemo(() => {
    const totalRides = history.length;
    const totalDistance = history.reduce((acc, curr) => acc + (curr.totalDistance || 0), 0);
    const totalDurationMs = history.reduce((acc, curr) => acc + (curr.duration || 0), 0);
    const totalHours = Math.round(totalDurationMs / (1000 * 60 * 60));
    const topSpeed = history.reduce((max, curr) => Math.max(max, curr.topSpeed || curr.averageSpeed || 0), 0);

    return {
      totalRides,
      totalDistance: formatDistance(totalDistance, preferences.distanceUnits),
      totalHours: `${totalHours} h`,
      topSpeed: formatSpeed(topSpeed, preferences.distanceUnits),
    };
  }, [history, preferences.distanceUnits]);

  // Compute Achievements (Only for users with >= 1 ride)
  const achievements = useMemo(() => {
    if (history.length === 0) return [];
    const totalDist = history.reduce((acc, curr) => acc + (curr.totalDistance || 0), 0);
    const hasNightRide = history.some((h) => {
      const hour = new Date(h.endTime).getHours();
      return hour >= 20 || hour < 5;
    });

    return [
      { id: '1', title: 'First Ride', icon: 'medal-outline', unlocked: history.length >= 1 },
      { id: '2', title: 'Night Rider', icon: 'moon-outline', unlocked: hasNightRide },
      { id: '3', title: 'Explorer', icon: 'compass-outline', unlocked: history.length >= 5 },
      { id: '4', title: '100 km Club', icon: 'flash-outline', unlocked: totalDist >= 100 },
      { id: '5', title: '1000 km Club', icon: 'trophy-outline', unlocked: totalDist >= 1000 },
    ];
  }, [history]);

  // Handle Overflow Menu Actions
  const handleOpenOverflow = (item: RideHistoryEntry) => {
    setSelectedHistoryItem(item);
    setShowOverflowModal(true);
  };

  const handleViewSummary = () => {
    if (!selectedHistoryItem) return;
    setShowOverflowModal(false);
    navigation.navigate('RideSummary', {
      summary: selectedHistoryItem,
    });
  };

  const handleShareRide = async () => {
    if (!selectedHistoryItem) return;
    setShowOverflowModal(false);
    try {
      const distance = formatDistance(selectedHistoryItem.totalDistance, preferences.distanceUnits);
      const duration = formatDuration(selectedHistoryItem.duration);
      await Share.share({
        message: `Check out my ride on Nami!\n\nDestination: ${selectedHistoryItem.destinationName}\nDistance: ${distance}\nDuration: ${duration}\nAvg Speed: ${formatSpeed(selectedHistoryItem.averageSpeed, preferences.distanceUnits)}\n\nRide together with Nami!`,
      });
    } catch (e) {
      console.error('Share failed:', e);
    }
  };

  const handleDeleteFromOverflow = () => {
    if (!selectedHistoryItem) return;
    const target = selectedHistoryItem;
    setShowOverflowModal(false);
    setItemToDelete(target);
  };

  const confirmDeleteSingleItem = async () => {
    if (!itemToDelete) return;
    const target = itemToDelete;
    setItemToDelete(null);
    setSelectedHistoryItem(null);

    // 1. Remove from local React state immediately so card disappears instantly
    setHistory((prev) => prev.filter((h) => h.id !== target.id));
    showToast('Ride deleted successfully.', 'success');

    try {
      // 2. Delete Firestore history document
      await RideService.deleteRideHistory(target.id, user?.uid, target.rideId);
    } catch (e) {
      console.error('Failed to delete history document:', e);
      showToast('Could not delete ride. Please try again.', 'error');
      // Restore state if delete failed
      await fetchActiveRideAndHistory();
    }
  };

  const confirmClearAllHistory = async () => {
    setShowClearAllModal(false);
    if (!user) return;

    // 1. Clear local history state immediately
    setHistory([]);

    try {
      // 2. Delete all user history records in Firestore
      await RideService.clearAllRideHistory(user.uid);
      showToast('Ride history cleared.', 'success');
    } catch (e) {
      console.error('Failed to clear ride history:', e);
      showToast('Could not clear history. Please try again.', 'error');
      await fetchActiveRideAndHistory();
    }
  };

  // Render History Card with 3-Dot Overflow Menu
  const renderHistoryItem = ({ item }: { item: RideHistoryEntry }) => {
    const formattedDate = new Date(item.endTime).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

    return (
      <View style={[styles.historyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.historyHeader}>
          <View style={{ flex: 1, marginRight: 8 }}>
            <Text style={[styles.historyName, { color: colors.text }]} numberOfLines={1}>{item.name}</Text>
            <Text style={[styles.historyDate, { color: colors.textMuted }]}>{formattedDate}</Text>
          </View>

          {/* 3-Dot Overflow Menu Button */}
          <TouchableOpacity
            onPress={() => handleOpenOverflow(item)}
            style={styles.overflowBtn}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="ellipsis-vertical" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        <View style={styles.destinationRow}>
          <Ionicons name="location-outline" size={14} color={colors.primary} style={{ marginRight: 4 }} />
          <Text style={[styles.historyDestination, { color: colors.textMuted }]} numberOfLines={1}>
            {item.destinationName}
          </Text>
        </View>

        <View style={styles.statsGrid}>
          <View style={styles.statBox}>
            <Ionicons name="navigate-outline" size={12} color={colors.textMuted} style={{ marginBottom: 2 }} />
            <Text style={[styles.statLabel, { color: colors.textMuted }]}>Distance</Text>
            <Text style={[styles.statVal, { color: colors.text }]}>{formatDistance(item.totalDistance, preferences.distanceUnits)}</Text>
          </View>
          <View style={styles.statBox}>
            <Ionicons name="time-outline" size={12} color={colors.textMuted} style={{ marginBottom: 2 }} />
            <Text style={[styles.statLabel, { color: colors.textMuted }]}>Duration</Text>
            <Text style={[styles.statVal, { color: colors.text }]}>{formatDuration(item.duration)}</Text>
          </View>
          <View style={styles.statBox}>
            <Ionicons name="speedometer-outline" size={12} color={colors.textMuted} style={{ marginBottom: 2 }} />
            <Text style={[styles.statLabel, { color: colors.textMuted }]}>Avg Speed</Text>
            <Text style={[styles.statVal, { color: colors.text }]}>{formatSpeed(item.averageSpeed, preferences.distanceUnits)}</Text>
          </View>
          <View style={styles.statBox}>
            <Ionicons name="people-outline" size={12} color={colors.textMuted} style={{ marginBottom: 2 }} />
            <Text style={[styles.statLabel, { color: colors.textMuted }]}>Riders</Text>
            <Text style={[styles.statVal, { color: colors.text }]}>{item.membersCount}</Text>
          </View>
        </View>
      </View>
    );
  };

  return (
    <SafeScreenWrapper style={[styles.container, { backgroundColor: colors.background }]}>
      <Animated.View style={{ flex: 1, opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          
          {/* 1. HEADER */}
          <View style={styles.header}>
            <TouchableOpacity
              style={styles.headerProfileRow}
              onPress={() => navigation.navigate('Profile')}
              activeOpacity={0.8}
            >
              {user?.photoURL ? (
                <Image source={{ uri: user.photoURL }} style={styles.headerAvatarImage} />
              ) : (
                <View style={[styles.headerAvatarPlaceholder, { backgroundColor: colors.primary }]}>
                  <Text style={styles.headerAvatarText}>{user?.name?.charAt(0).toUpperCase() || 'R'}</Text>
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={[styles.greetingText, { color: colors.textMuted }]}>{greetingText},</Text>
                <Text style={[styles.userName, { color: colors.text }]} numberOfLines={1}>{user?.name || 'Rider'}</Text>
              </View>
            </TouchableOpacity>

            {/* Circular Settings Button */}
            <TouchableOpacity
              style={[styles.circularSettingsBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => navigation.navigate('Settings')}
              activeOpacity={0.8}
            >
              <Ionicons name="settings-outline" size={20} color={colors.text} />
            </TouchableOpacity>
          </View>

          {/* 2. COMPACT MERGED WEATHER & RIDE READINESS CARD */}
          <View style={[styles.weatherCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.weatherHeaderRow}>
              <View style={styles.locationTag}>
                <Ionicons name="location-sharp" size={14} color={colors.primary} style={{ marginRight: 4 }} />
                <Text style={[styles.cityNameText, { color: colors.text }]}>{cityName}</Text>
                {weatherData && (
                  <Text style={[styles.tempText, { color: colors.textMuted }]}>
                    {' • '}
                    <Ionicons name={weatherData.icon as any} size={14} color="#F59E0B" /> {weatherData.temp}°C
                  </Text>
                )}
              </View>

              {/* Ride Readiness Badge */}
              <View
                style={[
                  styles.readinessBadge,
                  { backgroundColor: (weatherData?.readinessColor || '#10B981') + '1A' },
                ]}
              >
                <View
                  style={[
                    styles.readinessDot,
                    { backgroundColor: weatherData?.readinessColor || '#10B981' },
                  ]}
                />
                <Text
                  style={[
                    styles.readinessText,
                    { color: weatherData?.readinessColor || '#10B981' },
                  ]}
                >
                  {weatherData?.readinessStatus || 'Excellent'}
                </Text>
              </View>
            </View>

            <View style={[styles.weatherDivider, { backgroundColor: colors.border }]} />

            <Text style={[styles.readinessSubText, { color: colors.textMuted }]}>
              {weatherData?.readinessSub || 'Clear skies • Perfect conditions for riding today.'}
            </Text>
          </View>

          {/* 3. ACTIVE RIDE BANNER */}
          {activeRide &&
            activeRide.id &&
            (activeRide.status === 'lobby' || activeRide.status === 'active') &&
            Array.isArray(activeRide.members) &&
            activeRide.members.includes(user?.uid || '') && (
              <ActiveRideBanner
                ride={activeRide}
                userUid={user?.uid}
                onResume={handleResumeRide}
                onEndRide={() => setShowEndRideModal(true)}
                isCollapsed={isBannerCollapsed}
                onToggleCollapse={() => setIsBannerCollapsed((prev) => !prev)}
              />
            )}

          {/* 4. REDESIGNED QUICK ACTION CARDS */}
          <View style={styles.actionSection}>
            {/* Create Ride */}
            <TouchableOpacity
              style={[
                styles.actionBtn,
                { backgroundColor: colors.primary },
                !!activeRide && styles.actionBtnDisabled,
              ]}
              onPress={() => {
                if (activeRide && (activeRide.status === 'lobby' || activeRide.status === 'active')) {
                  showToast('A ride is already in progress. Resume or end it first.', 'error');
                  return;
                }
                navigation.navigate('CreateRide');
              }}
              activeOpacity={0.85}
            >
              {activeRide ? (
                <View style={styles.lockBadge}>
                  <Ionicons name="lock-closed" size={14} color="#FFFFFF" />
                </View>
              ) : null}
              <Ionicons name="add-circle" size={28} color="#FFFFFF" style={{ marginBottom: 6 }} />
              <Text style={styles.actionBtnText}>Create Ride</Text>
              <Text style={styles.actionBtnSub}>
                {activeRide ? 'Ride in progress' : 'Start a group lobby'}
              </Text>
            </TouchableOpacity>

            {/* Join Ride */}
            <TouchableOpacity
              style={[
                styles.actionBtn,
                { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 },
                !!activeRide && styles.actionBtnDisabled,
              ]}
              onPress={() => {
                if (activeRide && (activeRide.status === 'lobby' || activeRide.status === 'active')) {
                  showToast('A ride is already in progress. Resume or end it first.', 'error');
                  return;
                }
                navigation.navigate('JoinRide');
              }}
              activeOpacity={0.85}
            >
              {activeRide ? (
                <View style={styles.lockBadge}>
                  <Ionicons name="lock-closed" size={14} color={colors.textMuted} />
                </View>
              ) : null}
              <Ionicons name="key-outline" size={28} color={colors.primary} style={{ marginBottom: 6 }} />
              <Text style={[styles.actionBtnText, { color: colors.text }]}>Join Ride</Text>
              <Text style={[styles.actionBtnSub, { color: colors.textMuted }]}>
                {activeRide ? 'Ride in progress' : 'Enter invite code'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* 5. QUICK STATS CARDS */}
          <View style={styles.statsSection}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Quick Stats</Text>
            <View style={styles.quickStatsGrid}>
              <View style={[styles.quickStatCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Ionicons name="bicycle-outline" size={20} color={colors.primary} style={{ marginBottom: 4 }} />
                <Text style={[styles.quickStatVal, { color: colors.text }]}>{quickStats.totalRides}</Text>
                <Text style={[styles.quickStatLabel, { color: colors.textMuted }]}>Rides</Text>
              </View>

              <View style={[styles.quickStatCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Ionicons name="navigate-outline" size={20} color="#10B981" style={{ marginBottom: 4 }} />
                <Text style={[styles.quickStatVal, { color: colors.text }]}>{quickStats.totalDistance}</Text>
                <Text style={[styles.quickStatLabel, { color: colors.textMuted }]}>{preferences.distanceUnits}</Text>
              </View>

              <View style={[styles.quickStatCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Ionicons name="time-outline" size={20} color="#3B82F6" style={{ marginBottom: 4 }} />
                <Text style={[styles.quickStatVal, { color: colors.text }]}>{quickStats.totalHours}</Text>
                <Text style={[styles.quickStatLabel, { color: colors.textMuted }]}>Time</Text>
              </View>

              <View style={[styles.quickStatCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Ionicons name="flash-outline" size={20} color="#EF4444" style={{ marginBottom: 4 }} />
                <Text style={[styles.quickStatVal, { color: colors.text }]}>{quickStats.topSpeed}</Text>
                <Text style={[styles.quickStatLabel, { color: colors.textMuted }]}>Top Speed</Text>
              </View>
            </View>
          </View>

          {/* 6. RIDER ACHIEVEMENTS (Shown ONLY after completing at least 1 ride) */}
          {history.length >= 1 && achievements.length > 0 && (
            <View style={styles.achievementsSection}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Achievements</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.achievementsRow}>
                {achievements.map((item) => (
                  <View
                    key={item.id}
                    style={[
                      styles.achievementBadge,
                      {
                        backgroundColor: colors.card,
                        borderColor: item.unlocked ? colors.primary : colors.border,
                        opacity: item.unlocked ? 1 : 0.45,
                      },
                    ]}
                  >
                    <Ionicons
                      name={item.icon as any}
                      size={22}
                      color={item.unlocked ? colors.primary : colors.textMuted}
                      style={{ marginBottom: 4 }}
                    />
                    <Text style={[styles.achievementTitle, { color: colors.text }]}>{item.title}</Text>
                  </View>
                ))}
              </ScrollView>
            </View>
          )}

          {/* 7. PREVIOUS RIDES HISTORY */}
          <View style={styles.historySection}>
            <View style={styles.historySectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Previous Rides</Text>
              {history.length > 0 && (
                <TouchableOpacity onPress={() => setShowClearAllModal(true)}>
                  <Text style={[styles.clearAllText, { color: colors.danger }]}>Clear History</Text>
                </TouchableOpacity>
              )}
            </View>

            {loadingHistory ? (
              <ActivityIndicator size="large" color={colors.primary} style={{ marginVertical: 30 }} />
            ) : history.length === 0 ? (
              <View style={[styles.emptyContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={[styles.emptyIconCircle, { backgroundColor: isDark ? 'rgba(51, 65, 85, 0.4)' : 'rgba(241, 245, 249, 0.9)' }]}>
                  <Ionicons name="flag-outline" size={32} color={colors.textMuted} />
                </View>
                <Text style={[styles.emptyText, { color: colors.text }]}>No rides yet</Text>
                <Text style={[styles.emptySub, { color: colors.textMuted }]}>
                  Complete your first ride to build your riding history and unlock statistics.
                </Text>
                <TouchableOpacity
                  style={[styles.emptyCreateBtn, { borderColor: colors.primary }]}
                  onPress={() => navigation.navigate('CreateRide')}
                >
                  <Text style={[styles.emptyCreateBtnText, { color: colors.primary }]}>Create Your First Ride</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <FlatList
                data={history}
                renderItem={renderHistoryItem}
                keyExtractor={(item) => item.id}
                scrollEnabled={false}
              />
            )}
          </View>

          {/* 8. MOTIVATIONAL QUOTE (Displayed ONLY when user has no active ride & no history) */}
          {!activeRide && history.length === 0 && (
            <View style={styles.quoteContainer}>
              <Ionicons name="compass-outline" size={20} color={colors.textMuted} style={{ marginBottom: 6 }} />
              <Text style={[styles.quoteText, { color: colors.textMuted }]}>
                "The best roads are the ones yet to be ridden."
              </Text>
            </View>
          )}
        </ScrollView>
      </Animated.View>

      {/* Toast Notification */}
      {toastMessage && (
        <View
          style={[
            styles.toastContainer,
            { backgroundColor: toastMessage.type === 'success' ? '#10B981' : '#EF4444' },
          ]}
        >
          <Ionicons
            name={toastMessage.type === 'success' ? 'checkmark-circle' : 'warning'}
            size={18}
            color="#FFFFFF"
            style={{ marginRight: 8 }}
          />
          <Text style={styles.toastText}>{toastMessage.text}</Text>
        </View>
      )}

      {/* 3-Dot Overflow Menu Modal for Ride History */}
      <Modal
        visible={showOverflowModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowOverflowModal(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowOverflowModal(false)}
        >
          <View style={[styles.overflowMenuCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.overflowMenuTitle, { color: colors.text }]} numberOfLines={1}>
              {selectedHistoryItem?.name || 'Ride Options'}
            </Text>

            <TouchableOpacity style={styles.overflowOptionRow} onPress={handleViewSummary}>
              <Ionicons name="bar-chart-outline" size={20} color={colors.primary} style={{ marginRight: 12 }} />
              <Text style={[styles.overflowOptionText, { color: colors.text }]}>View Ride Summary</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.overflowOptionRow} onPress={handleShareRide}>
              <Ionicons name="share-outline" size={20} color="#3B82F6" style={{ marginRight: 12 }} />
              <Text style={[styles.overflowOptionText, { color: colors.text }]}>Share Ride</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.overflowOptionRow} onPress={handleDeleteFromOverflow}>
              <Ionicons name="trash-outline" size={20} color={colors.danger} style={{ marginRight: 12 }} />
              <Text style={[styles.overflowOptionText, { color: colors.danger }]}>Delete Ride</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Delete Single Ride Confirmation Bottom Sheet */}
      <ConfirmationBottomSheet
        visible={!!itemToDelete}
        title="Delete Ride History?"
        message={itemToDelete ? `Are you sure you want to delete "${itemToDelete.name || 'Group Ride'}"? This action cannot be undone.` : ''}
        confirmText="Delete Ride"
        cancelText="Cancel"
        icon="trash-outline"
        isDestructive={true}
        onConfirm={confirmDeleteSingleItem}
        onCancel={() => setItemToDelete(null)}
      />

      {/* Clear All History Bottom Sheet */}
      <ConfirmationBottomSheet
        visible={showClearAllModal}
        title="Clear All Ride History?"
        message="Are you sure you want to permanently delete all recorded ride history? This action cannot be undone."
        confirmText="Delete All"
        cancelText="Cancel"
        icon="trash-outline"
        isDestructive={true}
        onConfirm={confirmClearAllHistory}
        onCancel={() => setShowClearAllModal(false)}
      />
      {/* End Ride Confirmation Modal */}
      <ConfirmationBottomSheet
        visible={showEndRideModal}
        title="End this ride?"
        message="Ending the ride will complete navigation, save ride history for all participants, and unlock Create Ride and Join Ride."
        confirmText="End Ride"
        cancelText="Cancel"
        isDestructive={true}
        onConfirm={confirmEndRide}
        onCancel={() => setShowEndRideModal(false)}
      />
    </SafeScreenWrapper>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerProfileRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 12,
  },
  headerAvatarImage: {
    width: 44,
    height: 44,
    borderRadius: 22,
    marginRight: 12,
  },
  headerAvatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  headerAvatarText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  greetingText: {
    fontSize: 13,
    fontWeight: '600',
  },
  userName: {
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -0.5,
    marginTop: 2,
  },
  circularSettingsBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  weatherCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  weatherHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  locationTag: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cityNameText: {
    fontSize: 14,
    fontWeight: '800',
  },
  tempText: {
    fontSize: 13,
    fontWeight: '600',
  },
  readinessBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  readinessDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  readinessText: {
    fontSize: 12,
    fontWeight: '800',
  },
  weatherDivider: {
    height: 1,
    marginVertical: 10,
    opacity: 0.6,
  },
  readinessSubText: {
    fontSize: 12,
    fontWeight: '600',
  },
  actionSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
    gap: 12,
  },
  actionBtn: {
    flex: 1,
    borderRadius: 20,
    padding: 18,
    justifyContent: 'center',
    position: 'relative',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 3,
  },
  actionBtnDisabled: {
    opacity: 0.6,
  },
  lockBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
  },
  actionBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  actionBtnSub: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 11,
    marginTop: 4,
    fontWeight: '600',
  },
  statsSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 12,
    letterSpacing: -0.3,
  },
  quickStatsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  quickStatCard: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    padding: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  quickStatVal: {
    fontSize: 15,
    fontWeight: '900',
  },
  quickStatLabel: {
    fontSize: 10,
    fontWeight: '700',
    marginTop: 2,
  },
  achievementsSection: {
    marginBottom: 24,
  },
  achievementsRow: {
    gap: 10,
  },
  achievementBadge: {
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    width: 100,
  },
  achievementTitle: {
    fontSize: 10,
    fontWeight: '800',
    textAlign: 'center',
  },
  historySection: {
    marginBottom: 24,
  },
  historySectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  clearAllText: {
    fontSize: 13,
    fontWeight: '700',
  },
  historyCard: {
    borderWidth: 1,
    borderRadius: 20,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  historyName: {
    fontSize: 15,
    fontWeight: '800',
  },
  historyDate: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  overflowBtn: {
    padding: 4,
  },
  destinationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  historyDestination: {
    fontSize: 13,
    fontWeight: '600',
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statBox: {
    alignItems: 'flex-start',
  },
  statLabel: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  statVal: {
    fontSize: 13,
    fontWeight: '800',
  },
  emptyContainer: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 4,
  },
  emptySub: {
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 17,
    marginBottom: 16,
  },
  emptyCreateBtn: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  emptyCreateBtnText: {
    fontSize: 13,
    fontWeight: '800',
  },
  quoteContainer: {
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 20,
    paddingHorizontal: 20,
  },
  quoteText: {
    fontSize: 12,
    fontStyle: 'italic',
    textAlign: 'center',
  },
  toastContainer: {
    position: 'absolute',
    bottom: 30,
    left: 20,
    right: 20,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
  },
  toastText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  overflowMenuCard: {
    width: '100%',
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 6,
  },
  overflowMenuTitle: {
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 16,
  },
  overflowOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(150,150,150,0.1)',
  },
  overflowOptionText: {
    fontSize: 15,
    fontWeight: '700',
  },
});

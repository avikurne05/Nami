import React, { useEffect, useRef, useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Animated,
  Easing,
  StatusBar,
  Dimensions,
} from 'react-native';
import { StackScreenProps } from '@react-navigation/stack';
import { RootStackParamList } from '../types';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../hooks/useTheme';
import { NamiLogo } from '../components/BikerRadarLogo';
import SettingsService from '../services/SettingsService';
import RideService from '../services/RideService';

type Props = StackScreenProps<RootStackParamList, 'Splash'>;

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const LOADING_MESSAGES = [
  'Preparing navigation...',
  'Connecting your group...',
  'Syncing ride data...',
  'Checking rider locations...',
  'Loading maps...',
];

export default function SplashScreen({ navigation }: Props) {
  const { user, firebaseUser, loading: authLoading } = useAuth();
  const { colors } = useTheme();

  // Animation Refs
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(0.85)).current;
  const pulseScale = useRef(new Animated.Value(1.0)).current;
  const pulseOpacity = useRef(new Animated.Value(0)).current;
  const progressBarWidth = useRef(new Animated.Value(0)).current;
  const messageOpacity = useRef(new Animated.Value(1)).current;
  const screenFadeOut = useRef(new Animated.Value(1)).current;

  // Rotating loading message index state
  const [messageIndex, setMessageIndex] = useState(0);
  const [animationCompleted, setAnimationCompleted] = useState(false);

  // 1. Startup Sequence Animation Flow
  useEffect(() => {
    // Stage 1: 0–400 ms: Fade in logo & initial scale up
    Animated.parallel([
      Animated.timing(logoOpacity, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
      Animated.spring(logoScale, {
        toValue: 1.06,
        friction: 6,
        tension: 80,
        useNativeDriver: true,
      }),
    ]).start(() => {
      // Stage 2: 400–1200 ms: Radar pulse expands outward from logo
      pulseOpacity.setValue(0.7);
      Animated.parallel([
        Animated.timing(pulseScale, {
          toValue: 2.3,
          duration: 800,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(pulseOpacity, {
          toValue: 0,
          duration: 800,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        // Stage 3: 1200–1800 ms: Logo slightly settles into resting position
        Animated.timing(logoScale, {
          toValue: 1.0,
          duration: 600,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]).start(() => {
        setAnimationCompleted(true);
      });
    });

    // Progress Bar Animation (0 to 100% in 1.8s)
    Animated.timing(progressBarWidth, {
      toValue: 1,
      duration: 1800,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: false,
    }).start();
  }, []);

  // 2. Rotating Loading Messages Loop
  useEffect(() => {
    const interval = setInterval(() => {
      Animated.sequence([
        Animated.timing(messageOpacity, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(messageOpacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();

      setMessageIndex((prev) => (prev + 1) % LOADING_MESSAGES.length);
    }, 600);

    return () => clearInterval(interval);
  }, []);

  // 3. Seamless Fade-Out Navigation Transition
  useEffect(() => {
    // Only navigate when auth resolution is done AND splash minimum animation completed
    if (!authLoading && animationCompleted) {
      Animated.timing(screenFadeOut, {
        toValue: 0,
        duration: 350,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start(async () => {
        if (user || firebaseUser) {
          const uid = user?.uid || firebaseUser?.uid;
          if (uid) {
            try {
              const prefs = await SettingsService.getPreferences();
              if (prefs.autoResumeActiveRide) {
                const activeRide = await RideService.getActiveRideForUser(uid);
                if (activeRide && activeRide.id) {
                  if (activeRide.status === 'lobby') {
                    navigation.replace('WaitingLobby', { rideId: activeRide.id });
                    return;
                  } else if (activeRide.status === 'active') {
                    navigation.replace('Ride', { rideId: activeRide.id });
                    return;
                  }
                }
              }
            } catch (e) {
              console.warn('Auto resume active ride check failed:', e);
            }
          }
          navigation.replace('Home');
        } else {
          navigation.replace('Login');
        }
      });
    }
  }, [authLoading, animationCompleted, user, firebaseUser, navigation]);

  const progressInterpolated = progressBarWidth.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <Animated.View
      style={[
        styles.container,
        {
          backgroundColor: '#0F172A',
          opacity: screenFadeOut,
        },
      ]}
    >
      <StatusBar barStyle="light-content" backgroundColor="#0F172A" translucent />

      {/* Background: Subtle 3-5% Opacity Radar Grid & Contour Pattern */}
      <View style={styles.radarPatternContainer} pointerEvents="none">
        <View style={styles.radarRing1} />
        <View style={styles.radarRing2} />
        <View style={styles.radarRing3} />
        <View style={styles.gridLineHorizontal} />
        <View style={styles.gridLineVertical} />
      </View>

      {/* Main Logo & Branding Center */}
      <View style={styles.centerContent}>
        <View style={styles.logoWrapper}>
          {/* Outward Expanding Radar Pulse Ring */}
          <Animated.View
            style={[
              styles.pulseRing,
              {
                transform: [{ scale: pulseScale }],
                opacity: pulseOpacity,
              },
            ]}
          />

          {/* Premium Nami Logo */}
          <Animated.View
            style={{
              opacity: logoOpacity,
              transform: [{ scale: logoScale }],
            }}
          >
            <NamiLogo size={140} showRings={true} />
          </Animated.View>
        </View>

        {/* Title & Tagline */}
        <Animated.View style={[styles.textWrapper, { opacity: logoOpacity }]}>
          <Text style={styles.titleText}>NAMI</Text>
          <Text style={styles.subtitleText}>Ride Smarter Together</Text>
        </Animated.View>
      </View>

      {/* Bottom Loading Progress Bar & Message (No generic spinner) */}
      <View style={styles.bottomLoadingSection}>
        {/* Animated Progress Bar */}
        <View style={styles.progressBarTrack}>
          <Animated.View
            style={[
              styles.progressBarFill,
              {
                width: progressInterpolated,
              },
            ]}
          />
        </View>

        {/* Rotating Loading Messages */}
        <Animated.Text style={[styles.statusText, { opacity: messageOpacity }]}>
          {LOADING_MESSAGES[messageIndex]}
        </Animated.Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Background Radar Grid Pattern
  radarPatternContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radarRing1: {
    position: 'absolute',
    width: 260,
    height: 260,
    borderRadius: 130,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.04)',
  },
  radarRing2: {
    position: 'absolute',
    width: 440,
    height: 440,
    borderRadius: 220,
    borderWidth: 1,
    borderColor: 'rgba(0, 229, 255, 0.03)',
  },
  radarRing3: {
    position: 'absolute',
    width: 620,
    height: 620,
    borderRadius: 310,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.02)',
  },
  gridLineHorizontal: {
    position: 'absolute',
    width: '100%',
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
  },
  gridLineVertical: {
    position: 'absolute',
    width: 1,
    height: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
  },

  // Center Branding
  centerContent: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoWrapper: {
    width: 160,
    height: 160,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pulseRing: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(0, 229, 255, 0.25)',
    borderWidth: 1.5,
    borderColor: '#00E5FF',
  },
  textWrapper: {
    alignItems: 'center',
    marginTop: 28,
  },
  titleText: {
    fontSize: 28,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 4,
    textTransform: 'uppercase',
  },
  subtitleText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#00E5FF',
    marginTop: 6,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },

  // Bottom Progress & Rotating Status Text
  bottomLoadingSection: {
    position: 'absolute',
    bottom: 60,
    width: SCREEN_WIDTH * 0.75,
    alignItems: 'center',
  },
  progressBarTrack: {
    width: '100%',
    height: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 1.5,
    overflow: 'hidden',
    marginBottom: 14,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#00E5FF',
    borderRadius: 1.5,
    shadowColor: '#00E5FF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 6,
    elevation: 4,
  },
  statusText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#94A3B8',
    letterSpacing: 0.5,
  },
});

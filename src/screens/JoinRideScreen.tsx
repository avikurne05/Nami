import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Animated,
  Clipboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Modal,
  Vibration,
  Dimensions,
} from 'react-native';
import { CameraView, Camera } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { StackScreenProps } from '@react-navigation/stack';
import { RootStackParamList } from '../types';
import { useAuth } from '../hooks/useAuth';
import RideService from '../services/RideService';
import { useTheme } from '../hooks/useTheme';
import SafeScreenWrapper from '../components/SafeScreenWrapper';
import { TopAppBar } from '../components/TopAppBar';

type Props = StackScreenProps<RootStackParamList, 'JoinRide'>;

const CODE_LENGTH = 6;
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const SCANNER_SIZE = 260;

export default function JoinRideScreen({ navigation }: Props) {
  const { user } = useAuth();
  const { colors, isDark } = useTheme();

  // --- Main Form State ---
  const [code, setCode] = useState<string[]>(Array(CODE_LENGTH).fill(''));
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [focusedIndex, setFocusedIndex] = useState<number>(0);

  // --- Production Live Camera QR Scanner State ---
  const [showScannerModal, setShowScannerModal] = useState(false);
  const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const [cameraFacing, setCameraFacing] = useState<'back' | 'front'>('back');
  const [scanned, setScanned] = useState(false);
  const [qrErrorMessage, setQrErrorMessage] = useState<string | null>(null);
  const [scanSuccess, setScanSuccess] = useState(false);

  // --- Refs & Animations ---
  const inputRefs = useRef<(TextInput | null)[]>(Array(CODE_LENGTH).fill(null));
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const scanLineAnim = useRef(new Animated.Value(0)).current;
  const scanDebounceTimer = useRef<NodeJS.Timeout | null>(null);

  // Full manual code derived state
  const fullCode = code.join('');
  const isComplete = fullCode.length === CODE_LENGTH;

  // --- Laser Scan Line Animation ---
  useEffect(() => {
    if (showScannerModal) {
      scanLineAnim.setValue(0);
      const loopAnim = Animated.loop(
        Animated.sequence([
          Animated.timing(scanLineAnim, {
            toValue: SCANNER_SIZE - 20,
            duration: 2000,
            useNativeDriver: true,
          }),
          Animated.timing(scanLineAnim, {
            toValue: 0,
            duration: 2000,
            useNativeDriver: true,
          }),
        ])
      );
      loopAnim.start();
      return () => loopAnim.stop();
    }
  }, [showScannerModal, scanLineAnim]);

  // --- Shake animation for invalid code ---
  const triggerShake = useCallback(() => {
    shakeAnim.setValue(0);
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 4, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 60, useNativeDriver: true }),
    ]).start();
  }, [shakeAnim]);

  // --- Core Join Action ---
  const handleJoin = useCallback(async (overrideCode?: string) => {
    const cleanedCode = (overrideCode ?? fullCode).toUpperCase().trim();
    setErrorMsg(null);

    if (cleanedCode.length !== CODE_LENGTH) {
      setErrorMsg('Please enter all 6 characters of the room code.');
      triggerShake();
      return;
    }

    if (!user) {
      setErrorMsg('You must be logged in to join a ride.');
      return;
    }

    setLoading(true);
    try {
      const rideId = await RideService.joinRide(cleanedCode, user.uid);
      navigation.replace('WaitingLobby', { rideId });
    } catch (e: any) {
      console.error('Join ride error:', e);
      const msg = e?.message || 'Failed to join ride. Verify the room code is correct.';
      setErrorMsg(msg);
      triggerShake();
    } finally {
      setLoading(false);
    }
  }, [fullCode, user, navigation, triggerShake]);

  // --- Handle Manual OTP Code Box Input ---
  const handleBoxChange = useCallback((text: string, index: number) => {
    const char = text.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(-1);
    const newCode = [...code];
    newCode[index] = char;
    setCode(newCode);
    setErrorMsg(null);

    if (char && index < CODE_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    } else if (char && index === CODE_LENGTH - 1) {
      inputRefs.current[index]?.blur();
      const joinCode = newCode.join('');
      if (joinCode.length === CODE_LENGTH) {
        handleJoin(joinCode);
      }
    }
  }, [code, handleJoin]);

  const handleKeyPress = useCallback((key: string, index: number) => {
    if (key === 'Backspace') {
      const newCode = [...code];
      if (newCode[index]) {
        newCode[index] = '';
        setCode(newCode);
      } else if (index > 0) {
        newCode[index - 1] = '';
        setCode(newCode);
        inputRefs.current[index - 1]?.focus();
      }
    }
  }, [code]);

  // --- Paste from Clipboard ---
  const handlePaste = useCallback(async () => {
    try {
      const text = await Clipboard.getString();
      if (text) {
        let cleaned = text.trim().toUpperCase();
        if (cleaned.includes('BIKERRADAR:')) {
          cleaned = cleaned.split('BIKERRADAR:')[1] || '';
        }
        cleaned = cleaned.replace(/[^A-Z0-9]/g, '').slice(0, CODE_LENGTH);

        if (cleaned.length === CODE_LENGTH) {
          const newCode = cleaned.split('');
          setCode(newCode);
          setErrorMsg(null);
          setTimeout(() => handleJoin(cleaned), 100);
        } else {
          setErrorMsg('Clipboard does not contain a valid 6-character room code.');
        }
      }
    } catch (e) {
      console.warn('Clipboard error:', e);
    }
  }, [handleJoin]);

  // --- Open Production Camera Scanner ---
  const handleOpenScanner = async () => {
    setQrErrorMessage(null);
    setScanSuccess(false);
    setScanned(false);

    try {
      const { status } = await Camera.requestCameraPermissionsAsync();
      const isGranted = status === 'granted';
      setHasCameraPermission(isGranted);

      if (!isGranted) {
        setErrorMsg('Camera permission is required to scan QR codes.');
        return;
      }

      setShowScannerModal(true);
    } catch (e) {
      console.error('Camera permission request error:', e);
      setErrorMsg('Could not open camera.');
    }
  };

  // --- Automatic Real Barcode Scanned Event ---
  const handleBarcodeScanned = useCallback(
    async ({ data }: { data: string }) => {
      if (scanned || scanSuccess || !user) return;

      setScanned(true);

      if (!data || !data.trim()) {
        setQrErrorMessage('Invalid Biker Radar QR Code');
        Vibration.vibrate([0, 80, 80, 80]);
        resetScannerDebounced();
        return;
      }

      // Real-time Firestore ride validation with joinToken & network distinction
      const result = await RideService.validateAndJoinRide(data, user.uid);

      if (!result.success) {
        setQrErrorMessage(result.errorMessage || 'Invalid Biker Radar QR Code');
        Vibration.vibrate([0, 80, 80, 80]);
        resetScannerDebounced();
        return;
      }

      // ── Valid & Verified QR Code Detected ──
      Vibration.vibrate(100);
      setScanSuccess(true);
      setQrErrorMessage(null);

      // Auto-close scanner and navigate directly to Lobby or Active Ride
      setTimeout(() => {
        setShowScannerModal(false);
        setScanSuccess(false);
        if (result.status === 'active') {
          navigation.replace('Ride', { rideId: result.rideId! });
        } else {
          navigation.replace('WaitingLobby', { rideId: result.rideId! });
        }
      }, 600);
    },
    [scanned, scanSuccess, user, navigation]
  );

  const resetScannerDebounced = () => {
    if (scanDebounceTimer.current) clearTimeout(scanDebounceTimer.current);
    scanDebounceTimer.current = setTimeout(() => {
      setScanned(false);
      setQrErrorMessage(null);
    }, 2000);
  };

  const boxBorderColor = (index: number) => {
    if (errorMsg) return colors.danger;
    if (focusedIndex === index) return colors.primary;
    if (code[index]) return colors.primary + '80';
    return colors.border;
  };

  const boxBg = (index: number) => {
    if (code[index]) return isDark ? '#1E293B' : '#EFF6FF';
    return colors.background;
  };

  return (
    <SafeScreenWrapper style={[styles.container, { backgroundColor: colors.background }]}>
      <TopAppBar title="Join Ride" onBack={() => navigation.goBack()} />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Hero Icon */}
          <View style={styles.heroSection}>
            <View style={[styles.iconRing, { backgroundColor: isDark ? 'rgba(59,130,246,0.1)' : 'rgba(37,99,235,0.08)', borderColor: colors.border }]}>
              <View style={[styles.iconInner, { backgroundColor: isDark ? 'rgba(59,130,246,0.18)' : 'rgba(37,99,235,0.12)' }]}>
                <Ionicons name="people" size={38} color={colors.primary} />
              </View>
            </View>
            <Text style={[styles.heroTitle, { color: colors.text }]}>Join a Group Ride</Text>
            <Text style={[styles.heroSub, { color: colors.textMuted }]}>
              Ask your ride leader for the room code{'\n'}or scan their QR code to join instantly.
            </Text>
          </View>

          {/* OTP Code Boxes */}
          <Animated.View
            style={[
              styles.boxesSection,
              { transform: [{ translateX: shakeAnim }] },
            ]}
          >
            <Text style={[styles.inputLabel, { color: colors.textMuted }]}>ROOM CODE</Text>
            <View style={styles.boxesRow}>
              {Array(CODE_LENGTH).fill(0).map((_, index) => (
                <TextInput
                  key={index}
                  ref={(ref) => { inputRefs.current[index] = ref; }}
                  style={[
                    styles.codeBox,
                    {
                      backgroundColor: boxBg(index),
                      borderColor: boxBorderColor(index),
                      color: colors.text,
                      borderWidth: focusedIndex === index ? 2 : 1.5,
                    },
                  ]}
                  value={code[index]}
                  onChangeText={(text) => handleBoxChange(text, index)}
                  onKeyPress={({ nativeEvent }) => handleKeyPress(nativeEvent.key, index)}
                  onFocus={() => setFocusedIndex(index)}
                  onBlur={() => setFocusedIndex(-1)}
                  maxLength={2}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  keyboardType="default"
                  selectTextOnFocus
                  editable={!loading}
                  textAlign="center"
                />
              ))}
            </View>

            {/* Error Message */}
            {errorMsg ? (
              <View style={[styles.errorBox, { backgroundColor: 'rgba(239,68,68,0.1)', borderColor: colors.danger }]}>
                <Ionicons name="warning-outline" size={15} color={colors.danger} style={{ marginRight: 6 }} />
                <Text style={[styles.errorText, { color: colors.danger }]}>{errorMsg}</Text>
              </View>
            ) : (
              <Text style={[styles.helperText, { color: colors.textMuted }]}>
                Enter 6-character alphanumeric room code
              </Text>
            )}
          </Animated.View>

          {/* Paste + Scan QR Buttons */}
          <View style={styles.utilRow}>
            <TouchableOpacity
              style={[styles.utilBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={handlePaste}
              disabled={loading}
              activeOpacity={0.7}
            >
              <Ionicons name="clipboard-outline" size={18} color={colors.primary} style={{ marginRight: 8 }} />
              <Text style={[styles.utilBtnText, { color: colors.text }]}>Paste Code</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.utilBtn, { backgroundColor: colors.primary, borderColor: colors.primary }]}
              onPress={handleOpenScanner}
              disabled={loading}
              activeOpacity={0.85}
            >
              <Ionicons name="qr-code" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
              <Text style={[styles.utilBtnText, { color: '#FFFFFF', fontWeight: '800' }]}>Scan QR Code</Text>
            </TouchableOpacity>
          </View>

          {/* Primary Join Button */}
          <TouchableOpacity
            style={[
              styles.joinBtn,
              { backgroundColor: colors.primary },
              (!isComplete || loading) && styles.joinBtnDisabled,
            ]}
            onPress={() => handleJoin()}
            disabled={!isComplete || loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="flash" size={20} color="#FFFFFF" style={{ marginRight: 8 }} />
                <Text style={styles.joinBtnText}>Join Ride</Text>
              </>
            )}
          </TouchableOpacity>

          <View style={styles.dividerRow}>
            <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
            <Text style={[styles.dividerText, { color: colors.textMuted }]}>or</Text>
            <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
          </View>

          <TouchableOpacity
            style={styles.createLink}
            onPress={() => navigation.replace('Home')}
            disabled={loading}
          >
            <Text style={[styles.createLinkText, { color: colors.textMuted }]}>
              Don't have a code?{' '}
              <Text style={{ color: colors.primary, fontWeight: '700' }}>Create your own ride</Text>
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* ── FULL-SCREEN PRODUCTION LIVE CAMERA QR SCANNER MODAL ── */}
      <Modal
        visible={showScannerModal}
        transparent={false}
        animationType="slide"
        onRequestClose={() => setShowScannerModal(false)}
      >
        <View style={styles.fullCameraContainer}>
          {hasCameraPermission ? (
            <CameraView
              style={StyleSheet.absoluteFillObject}
              facing={cameraFacing}
              enableTorch={torchOn}
              barcodeScannerSettings={{
                barcodeTypes: ['qr'],
              }}
              onBarcodeScanned={scanned || scanSuccess ? undefined : handleBarcodeScanned}
            />
          ) : (
            <View style={styles.noCameraPermissionBox}>
              <Ionicons name="camera-outline" size={48} color="#94A3B8" />
              <Text style={styles.noCameraText}>Camera access required to scan QR code.</Text>
            </View>
          )}

          {/* Semi-transparent Dimmed Overlay Mask */}
          <View style={styles.overlayContainer}>
            <View style={styles.overlayTop}>
              {/* Header Controls Bar */}
              <View style={styles.scannerHeaderRow}>
                <TouchableOpacity
                  style={styles.scannerIconCircle}
                  onPress={() => setShowScannerModal(false)}
                  activeOpacity={0.8}
                >
                  <Ionicons name="close" size={24} color="#FFFFFF" />
                </TouchableOpacity>

                <Text style={styles.scannerHeaderTitle}>Scan Ride QR Code</Text>

                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <TouchableOpacity
                    style={[styles.scannerIconCircle, torchOn && { backgroundColor: '#F59E0B' }]}
                    onPress={() => setTorchOn(!torchOn)}
                    activeOpacity={0.8}
                  >
                    <Ionicons name={torchOn ? 'flash' : 'flash-outline'} size={20} color="#FFFFFF" />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.scannerIconCircle}
                    onPress={() => setCameraFacing(prev => prev === 'back' ? 'front' : 'back')}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="camera-reverse-outline" size={22} color="#FFFFFF" />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Invalid QR Warning Banner */}
              {qrErrorMessage && (
                <View style={styles.invalidBanner}>
                  <Ionicons name="alert-circle" size={20} color="#EF4444" style={{ marginRight: 8 }} />
                  <Text style={styles.invalidBannerText}>{qrErrorMessage}</Text>
                </View>
              )}

              {/* Valid QR Success Banner */}
              {scanSuccess && (
                <View style={styles.successBanner}>
                  <Ionicons name="checkmark-circle" size={22} color="#10B981" style={{ marginRight: 8 }} />
                  <Text style={styles.successBannerText}>Valid Biker Radar QR Code!</Text>
                </View>
              )}
            </View>

            {/* Middle Row with Center Transparent Viewfinder Cutout */}
            <View style={styles.overlayMiddleRow}>
              <View style={styles.overlaySide} />

              <View style={styles.viewfinderFrame}>
                {/* Viewfinder Corner Brackets */}
                <View style={[styles.cornerBracket, styles.bracketTL]} />
                <View style={[styles.cornerBracket, styles.bracketTR]} />
                <View style={[styles.cornerBracket, styles.bracketBL]} />
                <View style={[styles.cornerBracket, styles.bracketBR]} />

                {/* Animated Laser Scan Line */}
                {!scanSuccess && (
                  <Animated.View
                    style={[
                      styles.laserLine,
                      { transform: [{ translateY: scanLineAnim }] },
                    ]}
                  />
                )}
              </View>

              <View style={styles.overlaySide} />
            </View>

            {/* Bottom Overlay Info */}
            <View style={styles.overlayBottom}>
              <Text style={styles.instructionText}>
                Align the Ride QR code inside the frame.
              </Text>
            </View>
          </View>
        </View>
      </Modal>
    </SafeScreenWrapper>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 40,
    alignItems: 'center',
  },
  heroSection: {
    alignItems: 'center',
    marginBottom: 36,
    marginTop: 8,
  },
  iconRing: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  iconInner: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.3,
    marginBottom: 8,
    textAlign: 'center',
  },
  heroSub: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  boxesSection: {
    width: '100%',
    alignItems: 'center',
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginBottom: 14,
    alignSelf: 'flex-start',
  },
  boxesRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  codeBox: {
    width: 48,
    height: 58,
    borderRadius: 14,
    fontSize: 22,
    fontWeight: '800',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 4,
    alignSelf: 'stretch',
  },
  errorText: {
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  helperText: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 4,
  },
  utilRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
    marginBottom: 24,
  },
  utilBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 50,
    borderRadius: 14,
    borderWidth: 1,
  },
  utilBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
  joinBtn: {
    width: '100%',
    height: 54,
    borderRadius: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  joinBtnDisabled: {
    opacity: 0.45,
  },
  joinBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    marginBottom: 20,
    gap: 12,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    fontSize: 12,
    fontWeight: '600',
  },
  createLink: {
    paddingVertical: 4,
  },
  createLinkText: {
    fontSize: 14,
    textAlign: 'center',
  },

  // ── Production Camera View & Overlay Styles ──
  fullCameraContainer: {
    flex: 1,
    backgroundColor: '#000000',
  },
  noCameraPermissionBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  noCameraText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 16,
  },
  overlayContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
  },
  overlayTop: {
    height: (SCREEN_HEIGHT - SCANNER_SIZE) / 2 - 20,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    paddingTop: Platform.OS === 'ios' ? 50 : 24,
    paddingHorizontal: 20,
  },
  scannerHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  scannerHeaderTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  scannerIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  invalidBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.95)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 14,
    marginTop: 20,
    alignSelf: 'center',
  },
  invalidBannerText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.95)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 14,
    marginTop: 20,
    alignSelf: 'center',
  },
  successBannerText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  overlayMiddleRow: {
    height: SCANNER_SIZE,
    flexDirection: 'row',
  },
  overlaySide: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
  },
  viewfinderFrame: {
    width: SCANNER_SIZE,
    height: SCANNER_SIZE,
    position: 'relative',
    backgroundColor: 'transparent',
  },
  cornerBracket: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderColor: '#00E5FF',
  },
  bracketTL: { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 12 },
  bracketTR: { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 12 },
  bracketBL: { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 12 },
  bracketBR: { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 12 },
  laserLine: {
    height: 3,
    backgroundColor: '#00E5FF',
    shadowColor: '#00E5FF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 6,
    elevation: 4,
    marginHorizontal: 10,
    marginTop: 10,
  },
  overlayBottom: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 30,
  },
  instructionText: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 0.2,
  },
});

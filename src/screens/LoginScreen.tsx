import React, { useState, useRef, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Animated,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StackScreenProps } from '@react-navigation/stack';
import { RootStackParamList } from '../types';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../hooks/useTheme';
import AuthService from '../services/AuthService';

type Props = StackScreenProps<RootStackParamList, 'Login'>;

export default function LoginScreen({ navigation }: Props) {
  const { signIn, signInWithGoogle, signUp } = useAuth();
  const { colors, isDark } = useTheme();

  // Modes & Toggle
  const [isRegisterMode, setIsRegisterMode] = useState(false);

  // Fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [bikeName, setBikeName] = useState('');

  // Password Visibility Toggle State
  const [showPassword, setShowPassword] = useState(false);

  // Focus States for Micro-Animations
  const [isEmailFocused, setIsEmailFocused] = useState(false);
  const [isPasswordFocused, setIsPasswordFocused] = useState(false);
  const [isNameFocused, setIsNameFocused] = useState(false);

  // UI loading states
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Entrance Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 450,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 450,
        useNativeDriver: true,
      }),
    ]).start();
  }, [fadeAnim, slideAnim]);

  // Input Validation & Disabled state check
  const isEmailValid = email.trim().length > 3 && email.includes('@');
  const isPasswordValid = password.trim().length >= 6;
  const isNameValid = !isRegisterMode || name.trim().length > 0;

  const isFormValid = isEmailValid && isPasswordValid && isNameValid;

  const handleAction = async () => {
    if (!isFormValid || loading || googleLoading) return;
    setErrorMsg(null);
    setLoading(true);

    try {
      if (isRegisterMode) {
        await signUp(
          email.trim(),
          password.trim(),
          name.trim(),
          bikeName.trim() || undefined
        );
      } else {
        await signIn(email.trim(), password.trim());
      }
      navigation.replace('Home');
    } catch (e: any) {
      console.error('Auth failure:', e);
      let message = e.message || 'Authentication failed. Please try again.';
      if (e.code === 'auth/email-already-in-use') {
        message = 'This email is already registered. Please switch to Sign In.';
      } else if (
        e.code === 'auth/invalid-credential' ||
        e.code === 'auth/wrong-password' ||
        e.code === 'auth/user-not-found'
      ) {
        message = 'Invalid email or password. Please check your credentials.';
      } else if (e.code === 'auth/weak-password') {
        message = 'Password should be at least 6 characters long.';
      }
      setErrorMsg(message);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    if (googleLoading || loading) return;
    setErrorMsg(null);
    setGoogleLoading(true);

    try {
      await signInWithGoogle();
      navigation.replace('Home');
    } catch (e: any) {
      console.warn('Google Sign-In error:', e);
      const msg = e?.message || 'Authentication failed. Please try again.';
      if (msg !== 'Sign-in cancelled.') {
        setErrorMsg(msg);
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email.trim() || !email.includes('@')) {
      setErrorMsg('Please enter a valid email address first.');
      return;
    }
    setErrorMsg(null);
    setResetLoading(true);
    try {
      await AuthService.sendPasswordReset(email.trim());
      Alert.alert(
        'Password Reset Sent 📧',
        `A password reset link has been sent to ${email.trim()}. Please check your inbox.`,
        [{ text: 'OK' }]
      );
    } catch (e: any) {
      console.error(e);
      setErrorMsg(e.message || 'Failed to send password reset email.');
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContainer}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
          
          {/* 1. HEADER BRANDING */}
          <View style={styles.header}>
            <View style={[styles.logoCircle, { backgroundColor: isDark ? 'rgba(37, 99, 235, 0.15)' : 'rgba(37, 99, 235, 0.08)' }]}>
              <Ionicons name="navigate" size={40} color={colors.primary} />
            </View>
            <Text style={[styles.title, { color: colors.text }]}>Biker Radar</Text>
            <Text style={[styles.tagline, { color: colors.textMuted }]}>
              Ride together. Ride smarter.
            </Text>
          </View>

          {/* 2. QUICK SIGN IN (GOOGLE & APPLE BUTTONS) */}
          {!isRegisterMode && (
            <View style={styles.socialContainer}>
              {/* Google Sign-In */}
              <TouchableOpacity
                activeOpacity={0.85}
                style={styles.googleButton}
                onPress={handleGoogleSignIn}
                disabled={googleLoading || loading}
              >
                {googleLoading ? (
                  <ActivityIndicator color="#4285F4" size="small" />
                ) : (
                  <>
                    <View style={styles.googleIconContainer}>
                      <Ionicons name="logo-google" size={18} color="#4285F4" />
                    </View>
                    <Text style={styles.googleButtonText}>Continue with Google</Text>
                  </>
                )}
              </TouchableOpacity>

              {/* Apple Sign-In (iOS Only) */}
              {Platform.OS === 'ios' && (
                <TouchableOpacity
                  activeOpacity={0.85}
                  style={[styles.appleButton, { backgroundColor: isDark ? '#FFFFFF' : '#000000' }]}
                  onPress={() => setErrorMsg('Apple Sign-In is unavailable on this device.')}
                  disabled={googleLoading || loading}
                >
                  <Ionicons name="logo-apple" size={20} color={isDark ? '#000000' : '#FFFFFF'} style={{ marginRight: 8 }} />
                  <Text style={[styles.appleButtonText, { color: isDark ? '#000000' : '#FFFFFF' }]}>
                    Continue with Apple
                  </Text>
                </TouchableOpacity>
              )}

              {/* DIVIDER */}
              <View style={styles.dividerContainer}>
                <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
                <Text style={[styles.dividerText, { color: colors.textMuted, backgroundColor: colors.background }]}>
                  OR CONTINUE WITH EMAIL
                </Text>
                <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
              </View>
            </View>
          )}

          {/* 3. EMAIL & PASSWORD FORM CARD */}
          <View style={[styles.form, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {errorMsg && (
              <View style={styles.errorContainer}>
                <Ionicons name="alert-circle-outline" size={16} color="#EF4444" style={{ marginRight: 6 }} />
                <Text style={styles.errorText}>{errorMsg}</Text>
              </View>
            )}

            {isRegisterMode && (
              <>
                <View style={styles.inputContainer}>
                  <Text style={[styles.label, { color: colors.text }]}>Full Name *</Text>
                  <TextInput
                    style={[
                      styles.input,
                      {
                        backgroundColor: colors.background,
                        borderColor: isNameFocused ? colors.primary : colors.border,
                        color: colors.text,
                      },
                    ]}
                    placeholder="John Doe"
                    placeholderTextColor={colors.textMuted}
                    value={name}
                    onChangeText={setName}
                    onFocus={() => setIsNameFocused(true)}
                    onBlur={() => setIsNameFocused(false)}
                    autoCapitalize="words"
                    textContentType="name"
                  />
                </View>

                <View style={styles.inputContainer}>
                  <Text style={[styles.label, { color: colors.text }]}>Motorcycle Model (Optional)</Text>
                  <TextInput
                    style={[
                      styles.input,
                      {
                        backgroundColor: colors.background,
                        borderColor: colors.border,
                        color: colors.text,
                      },
                    ]}
                    placeholder="e.g. Royal Enfield Himalayan"
                    placeholderTextColor={colors.textMuted}
                    value={bikeName}
                    onChangeText={setBikeName}
                    autoCapitalize="words"
                  />
                </View>
              </>
            )}

            {/* Email Field */}
            <View style={styles.inputContainer}>
              <Text style={[styles.label, { color: colors.text }]}>Email Address *</Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: colors.background,
                    borderColor: isEmailFocused ? colors.primary : colors.border,
                    color: colors.text,
                  },
                ]}
                placeholder="rider@example.com"
                placeholderTextColor={colors.textMuted}
                value={email}
                onChangeText={setEmail}
                onFocus={() => setIsEmailFocused(true)}
                onBlur={() => setIsEmailFocused(false)}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                textContentType="emailAddress"
              />
            </View>

            {/* Password Field */}
            <View style={styles.inputContainer}>
              <Text style={[styles.label, { color: colors.text }]}>Password *</Text>
              <View style={styles.passwordWrapper}>
                <TextInput
                  style={[
                    styles.input,
                    styles.passwordInput,
                    {
                      backgroundColor: colors.background,
                      borderColor: isPasswordFocused ? colors.primary : colors.border,
                      color: colors.text,
                    },
                  ]}
                  placeholder="Enter your password"
                  placeholderTextColor={colors.textMuted}
                  secureTextEntry={!showPassword}
                  value={password}
                  onChangeText={setPassword}
                  onFocus={() => setIsPasswordFocused(true)}
                  onBlur={() => setIsPasswordFocused(false)}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="password"
                  textContentType="password"
                />
                <TouchableOpacity
                  style={styles.eyeButton}
                  onPress={() => setShowPassword(!showPassword)}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={showPassword ? 'eye-outline' : 'eye-off-outline'}
                    size={20}
                    color={colors.textMuted}
                  />
                </TouchableOpacity>
              </View>

              {/* Forgot Password Link */}
              {!isRegisterMode && (
                <TouchableOpacity
                  style={styles.forgotPasswordButton}
                  onPress={handleForgotPassword}
                  disabled={resetLoading}
                  activeOpacity={0.7}
                >
                  {resetLoading ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <Text style={[styles.forgotPasswordText, { color: colors.primary }]}>
                      Forgot Password?
                    </Text>
                  )}
                </TouchableOpacity>
              )}
            </View>

            {/* Submit Action Button */}
            <TouchableOpacity
              style={[
                styles.actionButton,
                { backgroundColor: colors.primary },
                (!isFormValid || loading || googleLoading) && styles.actionButtonDisabled,
              ]}
              onPress={handleAction}
              disabled={!isFormValid || loading || googleLoading}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.actionButtonText}>
                  {isRegisterMode ? 'Create Account' : 'Sign In'}
                </Text>
              )}
            </TouchableOpacity>

            {/* Sign In / Sign Up Mode Switcher */}
            <TouchableOpacity
              style={styles.switchButton}
              onPress={() => {
                setIsRegisterMode(!isRegisterMode);
                setErrorMsg(null);
              }}
              activeOpacity={0.75}
            >
              <Text style={[styles.switchButtonText, { color: colors.textMuted }]}>
                {isRegisterMode ? 'Already have an account? ' : "Don't have an account? "}
                <Text style={{ color: colors.primary, fontWeight: '700' }}>
                  {isRegisterMode ? 'Sign In' : 'Sign Up'}
                </Text>
              </Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 22,
    paddingVertical: 32,
  },
  header: {
    alignItems: 'center',
    marginBottom: 28,
  },
  logoCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  title: {
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  tagline: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 4,
    letterSpacing: 0.2,
  },
  socialContainer: {
    marginBottom: 20,
  },
  googleButton: {
    height: 50,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
    marginBottom: 10,
  },
  googleIconContainer: {
    marginRight: 10,
  },
  googleButtonText: {
    color: '#1E293B',
    fontSize: 15,
    fontWeight: '700',
  },
  appleButton: {
    height: 50,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  appleButtonText: {
    fontSize: 15,
    fontWeight: '700',
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 14,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    paddingHorizontal: 12,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  form: {
    borderRadius: 20,
    padding: 22,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 4,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderWidth: 1,
    borderColor: '#EF4444',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 16,
  },
  errorText: {
    color: '#EF4444',
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },
  inputContainer: {
    marginBottom: 16,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 6,
    letterSpacing: 0.2,
  },
  input: {
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    minHeight: 48,
  },
  passwordWrapper: {
    position: 'relative',
    justifyContent: 'center',
  },
  passwordInput: {
    paddingRight: 48,
  },
  eyeButton: {
    position: 'absolute',
    right: 12,
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  forgotPasswordButton: {
    alignSelf: 'flex-end',
    marginTop: 8,
    paddingVertical: 2,
  },
  forgotPasswordText: {
    fontSize: 12,
    fontWeight: '700',
  },
  actionButton: {
    height: 50,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  actionButtonDisabled: {
    opacity: 0.5,
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: 'bold',
  },
  switchButton: {
    marginTop: 18,
    alignItems: 'center',
    paddingVertical: 4,
  },
  switchButtonText: {
    fontSize: 13,
  },
});

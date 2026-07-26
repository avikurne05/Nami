import React, { useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Modal,
  Animated,
  TouchableWithoutFeedback,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export interface ConfirmationBottomSheetProps {
  visible: boolean;
  title: string;
  message: string;
  confirmText: string;
  cancelText?: string;
  icon?: keyof typeof Ionicons.glyphMap | string;
  isDestructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmationBottomSheet: React.FC<ConfirmationBottomSheetProps> = ({
  visible,
  title,
  message,
  confirmText,
  cancelText = 'Cancel',
  icon = 'warning-outline',
  isDestructive = true,
  onConfirm,
  onCancel,
}) => {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.spring(translateY, {
          toValue: 0,
          tension: 65,
          friction: 11,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(backdropOpacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: SCREEN_HEIGHT,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible]);

  if (!visible) return null;

  const validIconName = (icon in Ionicons.glyphMap ? icon : 'warning-outline') as keyof typeof Ionicons.glyphMap;

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        {/* Dimmed Backdrop */}
        <TouchableWithoutFeedback onPress={onCancel}>
          <Animated.View
            style={[
              styles.backdrop,
              {
                opacity: backdropOpacity,
              },
            ]}
          />
        </TouchableWithoutFeedback>

        {/* Sliding Bottom Sheet */}
        <Animated.View
          style={[
            styles.sheetContainer,
            {
              backgroundColor: isDark ? '#0F172A' : colors.card,
              borderColor: isDark ? '#334155' : colors.border,
              transform: [{ translateY }],
              paddingBottom: Math.max(insets.bottom + 20, 24),
            },
          ]}
        >
          {/* Top Handle bar */}
          <View style={styles.handleBar} />

          {/* Header Icon & Title Row */}
          <View style={styles.content}>
            {icon ? (
              <View
                style={[
                  styles.iconBadge,
                  {
                    backgroundColor: isDestructive ? 'rgba(239, 68, 68, 0.15)' : 'rgba(0, 229, 255, 0.15)',
                    borderColor: isDestructive ? '#EF4444' : '#00E5FF',
                  },
                ]}
              >
                <Ionicons
                  name={validIconName}
                  size={32}
                  color={isDestructive ? '#EF4444' : '#00E5FF'}
                />
              </View>
            ) : null}

            <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
            <Text style={[styles.message, { color: colors.textSecondary }]}>{message}</Text>

            {/* Action Buttons Column */}
            <View style={styles.buttonContainer}>
              {/* Primary Action Button */}
              <TouchableOpacity
                style={[
                  styles.actionButton,
                  styles.primaryButton,
                  {
                    backgroundColor: isDestructive ? '#EF4444' : colors.primary,
                  },
                ]}
                onPress={onConfirm}
                activeOpacity={0.8}
              >
                <Text style={styles.primaryButtonText}>{confirmText}</Text>
              </TouchableOpacity>

              {/* Secondary Cancel Button */}
              <TouchableOpacity
                style={[
                  styles.actionButton,
                  styles.cancelButton,
                  {
                    backgroundColor: isDark ? '#1E293B' : colors.inputBg,
                    borderColor: isDark ? '#334155' : colors.border,
                  },
                ]}
                onPress={onCancel}
                activeOpacity={0.7}
              >
                <Text style={[styles.cancelButtonText, { color: colors.text }]}>{cancelText}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
  },
  sheetContainer: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderBottomWidth: 0,
    paddingTop: 12,
    paddingHorizontal: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 20,
  },
  handleBar: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    alignSelf: 'center',
    marginBottom: 20,
  },
  content: {
    alignItems: 'center',
  },
  iconBadge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: -0.3,
  },
  message: {
    fontSize: 15,
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 28,
    paddingHorizontal: 8,
  },
  buttonContainer: {
    width: '100%',
    gap: 12,
  },
  actionButton: {
    width: '100%',
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryButton: {
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  cancelButton: {
    borderWidth: 1.5,
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
});

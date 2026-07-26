import React from 'react';
import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';

interface Props {
  title: string;
  onBack?: () => void;
  rightAction?: React.ReactNode;
}

export const TopAppBar: React.FC<Props> = ({ title, onBack, rightAction }) => {
  const { colors } = useTheme();

  return (
    <View style={[styles.bar, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
      {/* Centered Page Title */}
      <View style={styles.titleContainer} pointerEvents="none">
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
          {title}
        </Text>
      </View>

      {/* Left Close Button Box */}
      {onBack ? (
        <TouchableOpacity
          style={[
            styles.iconButtonBox,
            { backgroundColor: colors.inputBg, borderColor: colors.border },
          ]}
          onPress={onBack}
          activeOpacity={0.7}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="close" size={26} color={colors.text} />
        </TouchableOpacity>
      ) : (
        <View style={styles.iconPlaceholder} />
      )}

      {/* Right Action Button */}
      {rightAction ? (
        <View style={styles.rightActionContainer}>{rightAction}</View>
      ) : (
        <View style={styles.iconPlaceholder} />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  bar: {
    height: 68,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
    position: 'relative',
  },
  titleContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 72,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: 0.3,
    textAlign: 'center',
  },
  iconButtonBox: {
    width: 48,
    height: 48,
    borderRadius: 14,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  iconPlaceholder: {
    width: 48,
  },
  rightActionContainer: {
    width: 48,
    alignItems: 'flex-end',
    justifyContent: 'center',
    zIndex: 10,
  },
});

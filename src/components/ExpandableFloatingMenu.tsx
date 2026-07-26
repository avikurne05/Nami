import React, { useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Animated,
  Easing,
  useWindowDimensions,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { ColorPalette } from '../hooks/useTheme';

export type ActiveMenuType = 'NONE' | 'GROUP' | 'SAFETY' | 'SEARCH';

export interface MenuItem {
  id: string;
  label: string;
  iconName: string;
  iconType?: 'ionicons' | 'material';
  color: string;
  onPress: () => void;
}

interface Props {
  menuType: 'GROUP' | 'SAFETY' | 'SEARCH';
  mainIconName: string;
  mainIconType?: 'ionicons' | 'material';
  activeColor?: string;
  isExpanded: boolean;
  onToggle: () => void;
  items: MenuItem[];
  colors: ColorPalette;
  isDark: boolean;
}

// Height per menu row (must stay ≥52dp for glove usability)
const ITEM_HEIGHT = 56;
// Gap between trigger button bottom and popover bottom edge
const TRIGGER_HEIGHT = 52;
const POPOVER_GAP = 8;

export const ExpandableFloatingMenu: React.FC<Props> = ({
  menuType,
  mainIconName,
  mainIconType = 'ionicons',
  activeColor = '#00E5FF',
  isExpanded,
  onToggle,
  items,
  colors,
  isDark,
}) => {
  const animValue = useRef(new Animated.Value(0)).current;
  const inactivityTimerRef = useRef<NodeJS.Timeout | null>(null);

  // ── Animation: spring open, timing close ─────────────────────────────────
  useEffect(() => {
    if (isExpanded) {
      Animated.spring(animValue, {
        toValue: 1,
        friction: 7,
        tension: 65,
        useNativeDriver: true,
      }).start();
      startInactivityTimer();
    } else {
      Animated.timing(animValue, {
        toValue: 0,
        duration: 160,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }).start();
      clearInactivityTimer();
    }

    return () => clearInactivityTimer();
  }, [isExpanded]);

  // ── Inactivity auto-close (6 s) ───────────────────────────────────────────
  const startInactivityTimer = () => {
    clearInactivityTimer();
    inactivityTimerRef.current = setTimeout(() => {
      if (isExpanded) onToggle();
    }, 6000);
  };

  const clearInactivityTimer = () => {
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = null;
    }
  };

  const handleItemPress = (itemOnPress: () => void) => {
    clearInactivityTimer();
    itemOnPress();
    onToggle(); // Auto-collapse after selection
  };

  // ── Upward slide + fade + scale from bottom anchor ─────────────────────────
  // Total estimated popover height: items * ITEM_HEIGHT + vertical padding
  const estimatedPopoverHeight = items.length * ITEM_HEIGHT + 16;

  const opacity = animValue.interpolate({
    inputRange: [0, 0.35, 1],
    outputRange: [0, 0.75, 1],
  });

  // Slides upward: starts at the trigger, ends at full height above it
  const translateY = animValue.interpolate({
    inputRange: [0, 1],
    outputRange: [estimatedPopoverHeight * 0.35, 0],
  });

  // Scales from bottom-centre (scaleY grows upward visually)
  const scaleY = animValue.interpolate({
    inputRange: [0, 1],
    outputRange: [0.55, 1],
  });

  const scaleX = animValue.interpolate({
    inputRange: [0, 1],
    outputRange: [0.88, 1],
  });

  // Derived bottom position: popover sits directly above the trigger
  const popoverBottom = TRIGGER_HEIGHT + POPOVER_GAP;

  return (
    <View style={styles.container}>
      {/* ── Upward Expanding Menu Popover ───────────────────────────────────── */}
      {isExpanded && (
        <Animated.View
          style={[
            styles.menuPopOver,
            {
              bottom: popoverBottom,
              backgroundColor: isDark
                ? 'rgba(15, 23, 42, 0.97)'
                : 'rgba(255, 255, 255, 0.98)',
              borderColor: isDark
                ? `${activeColor}55`
                : 'rgba(2, 132, 199, 0.35)',
              opacity,
              transform: [
                { translateY },
                { scaleY },
                { scaleX },
              ],
            },
          ]}
          // Anchor scale origin at the bottom so it grows upward
          pointerEvents={isExpanded ? 'box-none' : 'none'}
        >
          {/* Render items top→bottom; top item is farthest from trigger */}
          {items.map((item, idx) => (
            <TouchableOpacity
              key={item.id}
              style={[
                styles.gloveFriendlyItem,
                idx < items.length - 1 && {
                  borderBottomWidth: 1,
                  borderBottomColor: isDark
                    ? 'rgba(255, 255, 255, 0.08)'
                    : 'rgba(0, 0, 0, 0.06)',
                },
              ]}
              onPress={() => handleItemPress(item.onPress)}
              activeOpacity={0.75}
              hitSlop={{ top: 6, bottom: 6, left: 12, right: 12 }}
            >
              <View
                style={[
                  styles.itemIconCircle,
                  { backgroundColor: `${item.color}22` },
                ]}
              >
                {item.iconType === 'material' ? (
                  <MaterialCommunityIcons
                    name={item.iconName as any}
                    size={22}
                    color={item.color}
                  />
                ) : (
                  <Ionicons
                    name={item.iconName as any}
                    size={22}
                    color={item.color}
                  />
                )}
              </View>
              <Text
                style={[
                  styles.itemLabelText,
                  { color: isDark ? '#F8FAFC' : '#0F172A' },
                ]}
                numberOfLines={1}
              >
                {item.label}
              </Text>
            </TouchableOpacity>
          ))}

          {/* Visual caret pointing down toward the trigger */}
          <View
            style={[
              styles.caretDown,
              {
                borderTopColor: isDark
                  ? `${activeColor}55`
                  : 'rgba(2, 132, 199, 0.35)',
              },
            ]}
          />
        </Animated.View>
      )}

      {/* ── Main Trigger Button ─────────────────────────────────────────────── */}
      <TouchableOpacity
        style={[
          styles.mainTriggerButton,
          {
            backgroundColor: isExpanded ? '#0F172A' : '#1E293B',
            borderColor: isExpanded
              ? activeColor
              : 'rgba(255, 255, 255, 0.22)',
            shadowColor: isExpanded ? activeColor : '#000',
          },
        ]}
        onPress={onToggle}
        activeOpacity={0.85}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        {isExpanded ? (
          <Ionicons name="close" size={26} color="#EF4444" />
        ) : mainIconType === 'material' ? (
          <MaterialCommunityIcons
            name={mainIconName as any}
            size={24}
            color={activeColor}
          />
        ) : (
          <Ionicons name={mainIconName as any} size={24} color={activeColor} />
        )}
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  // Outer wrapper: gives the trigger its place in the rail
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 5,
  },

  // ── Trigger button ──────────────────────────────────────────────────────────
  mainTriggerButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 10,
  },

  // ── Upward popover panel ───────────────────────────────────────────────────
  menuPopOver: {
    position: 'absolute',
    // "right: 0" aligns the popover flush with the right edge of the trigger
    // (the trigger is 52dp wide; the popover is wider so it extends to the left)
    right: 0,
    minWidth: 210,
    borderRadius: 16,
    borderWidth: 1.5,
    paddingVertical: 4,
    paddingHorizontal: 0,
    shadowColor: '#00E5FF',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 14,
    zIndex: 200,
    // transformOrigin is not natively supported in RN; the scaleY + translateY
    // combo creates the "grows from bottom" visual effect instead.
    overflow: 'hidden',
  },

  // ── Each menu row ──────────────────────────────────────────────────────────
  gloveFriendlyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: ITEM_HEIGHT, // 56dp — glove-safe minimum
    paddingHorizontal: 12,
    paddingVertical: 4,
  },

  itemIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },

  itemLabelText: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.2,
    flexShrink: 1,
  },

  // Small downward-pointing triangle at the bottom of the popover
  caretDown: {
    position: 'absolute',
    bottom: -10,
    right: 18,
    width: 0,
    height: 0,
    borderLeftWidth: 9,
    borderRightWidth: 9,
    borderTopWidth: 10,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
});

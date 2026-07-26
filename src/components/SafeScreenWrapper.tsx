import React from 'react';
import { StyleSheet, View, ViewStyle, StyleProp, StatusBar, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../hooks/useTheme';

interface SafeScreenWrapperProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  edges?: ('top' | 'bottom' | 'left' | 'right')[];
}

/**
 * Reusable Safe Area Container component that automatically applies notch, status bar, 
 * dynamic island, and rounded corner safe area insets to every screen across iOS & Android.
 */
export const SafeScreenWrapper: React.FC<SafeScreenWrapperProps> = ({
  children,
  style,
  edges = ['top', 'bottom', 'left', 'right'],
}) => {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();

  // Fallback top inset for Android status bar if inset is 0
  const topInset = edges.includes('top')
    ? Math.max(insets.top, Platform.OS === 'android' ? (StatusBar.currentHeight || 24) : 0)
    : 0;

  const bottomInset = edges.includes('bottom') ? insets.bottom : 0;
  const leftInset = edges.includes('left') ? insets.left : 0;
  const rightInset = edges.includes('right') ? insets.right : 0;

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.background,
          paddingTop: topInset,
          paddingBottom: bottomInset,
          paddingLeft: leftInset,
          paddingRight: rightInset,
        },
        style,
      ]}
    >
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={colors.background}
        translucent
      />
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});

export default SafeScreenWrapper;

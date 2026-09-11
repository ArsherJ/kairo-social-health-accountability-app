import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import { font, space, type Theme } from '../theme.ts';
import { Glass } from './Glass.tsx';
import { animationDuration } from './motion-policy.ts';
import { useReduceMotionState } from './motion.ts';
import { TAB_ITEMS, type TabId } from './tab-copy.ts';
import { tabPillGeometry } from './tab-pill-geometry.ts';
import { Text } from './Text.tsx';
import { useStyles, useTheme } from './use-theme.ts';

export type { TabId } from './tab-copy.ts';

export interface TabBarProps {
  value: TabId;
  onChange: (value: TabId) => void;
  bottomInset: number;
  onLongPress?: (value: TabId) => void;
}

/** The bar itself. The remaining clearance is owned by `TabPill`. */
const BAR_HEIGHT = 68;
const BAR_INSET = 16;
const ICON_SIZE = 22;
const GAP = 6;
const FOCUSED_FLEX = 1;
const TRAVEL_MS = 160;
const EASE = Easing.out(Easing.cubic);

/**
 * The shared four-item tab presentation used by the router and design preview.
 * Its measured wash cuts into place before Reduce Motion resolves and then
 * travels briefly between equal-width items when motion is allowed.
 */
export function TabBar({
  value,
  onChange,
  bottomInset,
  onLongPress,
}: TabBarProps) {
  const styles = useStyles(makeStyles);
  const { colors, ramp } = useTheme();
  const { reduce: reduceMotion, ready: motionReady } = useReduceMotionState();
  const focusedIndex = TAB_ITEMS.findIndex((item) => item.id === value);
  const [row, setRow] = useState({ w: 0, h: 0 });
  const left = useRef(new Animated.Value(0)).current;
  const width = useRef(new Animated.Value(0)).current;
  const didPlace = useRef(false);

  useEffect(() => {
    if (row.w <= 0 || focusedIndex < 0) return;

    const geometry = tabPillGeometry(
      focusedIndex,
      row.w,
      TAB_ITEMS.length,
      GAP,
      FOCUSED_FLEX,
    );
    const instant = !didPlace.current || !motionReady;
    const duration = instant ? 0 : animationDuration(TRAVEL_MS, reduceMotion);

    if (duration === 0) {
      left.setValue(geometry.left);
      width.setValue(geometry.width);
      if (motionReady) didPlace.current = true;
      return;
    }

    const animation = Animated.parallel([
      Animated.timing(left, {
        toValue: geometry.left,
        duration,
        easing: EASE,
        useNativeDriver: false,
      }),
      Animated.timing(width, {
        toValue: geometry.width,
        duration,
        easing: EASE,
        useNativeDriver: false,
      }),
    ]);
    animation.start();
    return () => animation.stop();
  }, [focusedIndex, row.w, reduceMotion, motionReady, left, width]);

  return (
    <Glass
      tone="light"
      style={[
        styles.bar,
        { bottom: bottomInset + space.sm, left: BAR_INSET, right: BAR_INSET },
      ]}
    >
      <View
        accessibilityRole="tablist"
        style={styles.row}
        onLayout={(event) => {
          const { width: w, height: h } = event.nativeEvent.layout;
          setRow((previous) =>
            previous.w === w && previous.h === h ? previous : { w, h },
          );
        }}
      >
        {row.w > 0 && focusedIndex >= 0 ? (
          <Animated.View
            pointerEvents="none"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={[styles.pill, { left, width }]}
          />
        ) : null}

        {TAB_ITEMS.map((item) => {
          const focused = item.id === value;
          return (
            <Pressable
              key={item.id}
              accessibilityRole="tab"
              accessibilityLabel={item.label}
              accessibilityState={{ selected: focused }}
              onPress={() => onChange(item.id)}
              onLongPress={
                onLongPress === undefined ? undefined : () => onLongPress(item.id)
              }
              style={({ pressed }) => [styles.item, pressed ? styles.itemPressed : null]}
            >
              <View
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                style={styles.itemBody}
              >
                <MaterialCommunityIcons
                  name={item.icon}
                  size={ICON_SIZE}
                  color={focused ? ramp.sage[800] : colors.muted}
                />
                <Text
                  scale="chrome"
                  numberOfLines={1}
                  style={[styles.label, focused ? styles.labelOn : null]}
                >
                  {item.label}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </Glass>
  );
}

const makeStyles = ({ colors, ramp }: Theme) =>
  StyleSheet.create({
    bar: {
      position: 'absolute',
      height: BAR_HEIGHT,
      padding: space.sm,
    },
    row: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'stretch',
      gap: GAP,
      position: 'relative',
    },
    pill: {
      position: 'absolute',
      top: space.xs,
      bottom: space.xs,
      borderRadius: 18,
      borderCurve: 'continuous',
      backgroundColor: ramp.sage[200],
    },
    item: {
      flex: FOCUSED_FLEX,
      minWidth: 0,
      alignItems: 'center',
      justifyContent: 'center',
    },
    itemPressed: { opacity: 0.62 },
    itemBody: {
      minWidth: 0,
      alignSelf: 'stretch',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 1,
      paddingHorizontal: space.xs,
    },
    label: {
      ...font.display.label,
      fontSize: 13,
      lineHeight: 15,
      color: colors.subtle,
      flexShrink: 1,
    },
    labelOn: { color: ramp.sage[800] },
  });

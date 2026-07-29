import { StyleSheet, View } from 'react-native';
import { colors, radius } from '@/theme.ts';

/**
 * Placeholder Hunter, drawn with plain Views — no asset pipeline and no new
 * dependency (react-native-svg is deliberately not installed).
 *
 * Phase 7 replaces this whole component with the generated art, four evolution
 * stages by dominant stat (§6). Until then `stage` only brightens the aura, so
 * levelling visibly does something.
 */
export function HunterSilhouette({ stage }: { stage: 1 | 2 | 3 | 4 }) {
  const auraOpacity = 0.1 + stage * 0.12;

  return (
    <View style={styles.frame}>
      <View style={[styles.aura, { opacity: auraOpacity }]} />
      <View style={styles.figure}>
        <View style={styles.head} />
        <View style={styles.shoulders} />
        <View style={styles.torso} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { height: 220, alignItems: 'center', justifyContent: 'flex-end' },
  aura: {
    position: 'absolute',
    width: 190,
    height: 190,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },
  figure: { alignItems: 'center' },
  head: {
    width: 46,
    height: 52,
    borderTopLeftRadius: 23,
    borderTopRightRadius: 23,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    backgroundColor: colors.text,
  },
  shoulders: {
    width: 132,
    height: 34,
    marginTop: -6,
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
    backgroundColor: colors.text,
  },
  torso: {
    width: 104,
    height: 96,
    borderBottomLeftRadius: 26,
    borderBottomRightRadius: 26,
    backgroundColor: colors.text,
  },
});

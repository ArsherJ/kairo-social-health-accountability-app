import { StyleSheet, View } from 'react-native';
import { Text } from './Text.tsx';
import { colors, font, ramp, radius } from '../theme.ts';

/**
 * A squadmate as a coin: their first initial on a tinted disc.
 *
 * The tint is derived from the name rather than stored, so a squad reads as
 * four distinguishable people the first time it renders and without a column
 * that could disagree with itself across devices. Only two hues are in play —
 * terracotta and sage — because the palette has exactly two, and inventing a
 * third to tell four people apart would cost more than it buys.
 */
const TINTS = [
  { bg: ramp.accent[400], ink: ramp.accent[900] },
  { bg: ramp.sage[400], ink: ramp.sage[900] },
  { bg: ramp.accent[300], ink: ramp.accent[900] },
  { bg: ramp.sage[300], ink: ramp.sage[900] },
] as const;

/** djb2, trimmed. Any stable spread will do; this one is four lines. */
function tintFor(name: string): (typeof TINTS)[number] {
  let hash = 5381;
  for (let i = 0; i < name.length; i++) hash = ((hash << 5) + hash + name.charCodeAt(i)) | 0;
  return TINTS[Math.abs(hash) % TINTS.length]!;
}

export function Avatar({
  name,
  size = 44,
  /** A ring in the page's own background, for overlapping stacks. */
  ringed = false,
  /** Marks this as you. */
  self = false,
}: {
  name: string;
  size?: number;
  ringed?: boolean;
  self?: boolean;
}) {
  const tint = self ? { bg: colors.accent, ink: colors.bg } : tintFor(name);
  // Intl-safe: `[...name]` splits by code point, so an emoji or an accented
  // character survives being taken as an initial instead of becoming half a
  // surrogate pair.
  const initial = ([...name.trim()][0] ?? '?').toUpperCase();

  return (
    <View
      style={[
        styles.disc,
        { width: size, height: size, backgroundColor: tint.bg },
        ringed && { borderWidth: 2, borderColor: ramp.neutral[100] },
      ]}
    >
      <Text style={[styles.initial, { color: tint.ink, fontSize: size * 0.38 }]}>{initial}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  disc: { borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  initial: { ...font.display.small },
});

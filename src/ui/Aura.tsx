import { StyleSheet, View } from 'react-native';
import { radius } from '../theme.ts';

/**
 * A glowing disc, optionally ringed with a halo. "Glow means earned" —
 * originally the Hunter's level/build indicator, general enough to also mark
 * the leading squadmate's row or the active tab.
 */
export function Aura({
  size,
  color,
  opacity,
  halo = false,
}: {
  size: number;
  color: string;
  opacity: number;
  /** A ring rather than more glow — see the comment below. */
  halo?: boolean;
}) {
  return (
    <>
      <View
        style={[
          styles.aura,
          {
            width: size,
            height: size,
            opacity,
            backgroundColor: color,
          },
        ]}
      />

      {/* The All-Rounder's halo. A ring rather than more glow, so it survives
          being screenshotted next to a bright STR aura. */}
      {halo && (
        <View
          style={[styles.halo, { width: size + 22, height: size + 22, borderColor: color }]}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  aura: { position: 'absolute', borderRadius: radius.pill },
  halo: {
    position: 'absolute',
    borderRadius: radius.pill,
    borderWidth: 2,
    opacity: 0.55,
  },
});

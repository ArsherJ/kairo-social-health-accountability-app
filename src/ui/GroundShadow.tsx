import { StyleSheet, View } from 'react-native';
import { ramp, radius } from '../theme.ts';

/**
 * The ellipse the Hunter stands on.
 *
 * This replaced the old palette's aura. "Glow means earned" was a rule built
 * for a near-black app; on cream and sage a bright disc behind a figure reads
 * as fog rather than as power. Contact with the floor says the same thing in
 * the light theme's own language — a figure with more presence casts a wider,
 * heavier shadow — so levelling still visibly does something.
 *
 * Positioned `bottom: 0` and centred by the parent, which must therefore be a
 * box with `alignItems: 'center'`. A parent that does not centre will pin it
 * to a corner instead of sitting it under the feet.
 */
export function GroundShadow({
  width,
  color = ramp.sage[700],
  opacity = 0.22,
}: {
  width: number;
  color?: string;
  opacity?: number;
}) {
  return (
    <View
      style={[
        styles.ground,
        { width, height: width * 0.19, borderRadius: width / 2, backgroundColor: color, opacity },
      ]}
    />
  );
}

/**
 * The All-Rounder's ring — §6's "cannot be bought, must be earned".
 *
 * A ring rather than more shadow, so it survives being screenshotted next to
 * a heavy STR figure, and because a ring is the one device this app reserves
 * for something earned (see `earnedColor`).
 */
export function PresenceRing({ size, color }: { size: number; color: string }) {
  return (
    <View
      style={[styles.ring, { width: size, height: size, borderColor: color }]}
    />
  );
}

const styles = StyleSheet.create({
  ground: { position: 'absolute', bottom: 0 },
  ring: {
    position: 'absolute',
    borderRadius: radius.pill,
    borderWidth: 2,
    opacity: 0.5,
  },
});

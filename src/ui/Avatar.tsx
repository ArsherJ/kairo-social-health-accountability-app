import { StyleSheet, View } from 'react-native';
import { Text } from './Text.tsx';
import { font, ramp, radius } from '../theme.ts';
import { avatarTint } from './avatar-tint.ts';
import { initialFor } from './initial.ts';

/**
 * A squadmate as a coin: their first initial on a tinted disc.
 *
 * **Nothing mounts this today.** Deviation #55 made every character a
 * Philippine eagle, and the six render boundaries that used to fall back to a
 * lettered disc each resolve through `displaySpecies()` instead. It is kept
 * because the fallback is one line away the next time a surface has a name and
 * no bird — and `avatar-tint.ts` is what makes that remount safe rather than a
 * fresh contrast bug.
 *
 * The tint table and the ink that goes on each ground live there, testable;
 * this file draws them.
 */
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
  const tint = avatarTint(name, self);
  const initial = initialFor(name);

  return (
    <View
      // Hidden, like `StatIcon`. The disc is a way to tell four people apart at
      // a glance, and every place it appears already draws the name beside it —
      // so announced it contributes a bare letter ("J") between the rank and
      // the name it is standing in for.
      accessibilityElementsHidden
      importantForAccessibility="no"
      style={[
        styles.disc,
        { width: size, height: size, backgroundColor: tint.bg },
        ringed && { borderWidth: 2, borderColor: ramp.neutral[100] },
      ]}
    >
      {/* `fixed`: the disc is a fixed square and the initial is sized as a
          fraction of it, so scaling the glyph alone pushes it out of the
          circle. Nothing is lost — the name is the accessible carrier. */}
      <Text scale="fixed" style={[styles.initial, { color: tint.ink, fontSize: size * 0.38 }]}>
        {initial}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  disc: { borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  initial: { ...font.display.small },
});

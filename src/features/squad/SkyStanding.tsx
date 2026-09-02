import { StyleSheet, View } from 'react-native';
import { RACE_FINISH_LINE, type Racer } from '@kairo/core';
import { colors, font, ramp, space } from '@/theme.ts';
import { Glass, Meter, Panel, Text } from '@/ui/index.ts';

/**
 * Where you stand, under the corridor (`Canvas.dc.html` 2c).
 *
 * The picture says who is ahead; this says by how much, and it is the only
 * place on the screen a figure is printed. It never prints a score total
 * (deviation #34) — the gap is in steps, which is what the corridor is a
 * picture of.
 *
 * One accessibility element: a headline, a rank, a bar and a sentence read as
 * four stops for a card that makes one statement.
 *
 * `floating` puts it on glass instead of a card, for the Sky tab, where it is
 * pinned over the flight rather than sitting under it. Same content, same
 * label, same single element — only the surface changes, which is why this is a
 * prop rather than a second component that would drift.
 */
export function SkyStanding({
  me,
  racers,
  floating = false,
}: {
  me: Racer;
  racers: readonly Racer[];
  floating?: boolean;
}) {
  const ahead = racers.find((r) => r.rank === me.rank - 1);
  const gap = ahead ? ahead.cappedSteps - me.cappedSteps : 0;

  const headline = me.finished
    ? 'You crossed the line'
    : ahead && gap > 0
      ? `${gap.toLocaleString()} steps behind ${ahead.characterName}`
      : `${(RACE_FINISH_LINE - me.cappedSteps).toLocaleString()} steps to the flag`;

  /**
   * **Null when there is nobody to be ranked against** (2026-09-02).
   *
   * A lone racer read "1 of 1" — an ordinal whose only possible meaning is that
   * they beat nobody, which is precisely what the Sky's solo state exists to
   * stop the screen saying. The same mistake `SoloBoard` made with `1st` over
   * `of 1` and was rewritten to remove.
   *
   * Only the position drops. The headline is the distance to the flag, which is
   * a complete and true reading of a day flown alone, and the whole point of
   * still drawing the corridor is that the ridge is a real opponent.
   */
  const position = racers.length > 1 ? `${me.rank} of ${racers.length}` : null;

  const hidden = {
    accessibilityElementsHidden: true,
    importantForAccessibility: 'no-hide-descendants',
  } as const;

  const Surface = floating ? FloatingSurface : Panel;

  return (
    <Surface variant="lift">
      <View
        accessible
        accessibilityLabel={
          position ? `${headline}. Position ${position}.` : `${headline}.`
        }
      >
        <View {...hidden} style={styles.head}>
          <Text scale="fixed" style={styles.headline}>
            {headline}
          </Text>
          {position !== null && (
            <Text scale="fixed" style={styles.position}>
              {position}
            </Text>
          )}
        </View>

        <View {...hidden} style={styles.meter}>
          <Meter
            fraction={me.progress}
            color={me.finished ? colors.accentEdge : colors.accent}
            height={10}
          />
        </View>
      </View>
    </Surface>
  );
}

/**
 * `Glass` wearing `Panel`'s signature, so the two are interchangeable above.
 *
 * `variant` is accepted and dropped: glass has one look, and the alternative —
 * branching on the surface at three separate places in the JSX — is how the two
 * renderings start disagreeing about the label.
 */
function FloatingSurface({ children }: { variant?: string; children: React.ReactNode }) {
  return (
    <Glass tone="light" style={styles.floating}>
      {children}
    </Glass>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm },
  // `flex: 1` so the position chip keeps its place when the headline wraps at
  // large type, rather than being pushed off the row.
  headline: { flex: 1, ...font.display.minor, color: colors.text },
  position: { ...font.body.label, color: ramp.neutral[500], flexShrink: 0 },
  meter: { marginTop: space.md },
  floating: { padding: space.md + 2 },
});

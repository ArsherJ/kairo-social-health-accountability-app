import { Image, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Button, Label, Text } from '@/ui/index.ts';
import { colors, font, radius, shadow, space } from '@/theme.ts';
import { SPECIES, SPECIES_IDS, type SpeciesId } from './species.ts';
import { SPECIES_FIGURES } from './species-art.ts';

// Shared by the card's `borderWidth` and the `textWidth` derivation below, so
// the two can never drift apart the way the hand-maintained sum already has
// twice. RN/Yoga lays out border-box: `borderWidth` is subtracted from the
// content box exactly like padding, so it has to appear in this arithmetic
// too, not just in the stylesheet.
const CARD_BORDER = 2;

/**
 * Choose an animal. Mounted by both routes — see `app/species.tsx` for why
 * there are two — with the commit behaviour supplied by the caller.
 *
 * **Vertical and scrolling, not the two-up row `/character` used.** That row
 * could not fit past ~1.3x Dynamic Type, and four cards each carrying art, a
 * name and a blurb is strictly worse. The three defences below are the ones
 * the permission sheet needed on 2026-08-17, and all three are load-bearing:
 * `Panel` and screens like this set `overflow: 'hidden'`, so oversized content
 * is not visibly spilled — it is silently clipped, and the control that lets
 * someone act disappears with no warning at any normal text size.
 */
export function SpeciesPicker({
  title,
  help,
  cta,
  selected,
  onSelect,
  onConfirm,
  busy = false,
}: {
  title: string;
  help: string;
  cta: string;
  selected: SpeciesId | null;
  onSelect: (id: SpeciesId) => void;
  onConfirm: (id: SpeciesId) => void;
  busy?: boolean;
}) {
  // An explicit point width for the text container. `width: '100%'` does NOT
  // work here: a percentage resolves against a ScrollView whose own size
  // depends on measuring this content, so direct Text children lay out wider
  // than the card and clip mid-word.
  //
  // Four terms subtracted from the screen width: the container's own
  // horizontal padding (`space.lg * 2`), the card's `borderWidth` on both
  // sides (`CARD_BORDER * 2` — Yoga lays out border-box, so this is real
  // content-box width, not a cosmetic outline), the card's padding on both
  // sides plus the row `gap` between the art and this text View — three
  // `space.md` widths, not two — and the art's fixed width (72).
  const { width } = useWindowDimensions();
  const textWidth = width - space.lg * 2 - space.md * 3 - CARD_BORDER * 2 - 72;

  return (
    <View style={styles.container}>
      <Label>CHOOSE YOUR COMPANION</Label>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.help}>{help}</Text>

      {/* flexGrow: 0 / flexShrink: 1 so the screen still hugs short content
          instead of always taking the full height. */}
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollInner}>
        {SPECIES_IDS.map((id) => {
          const s = SPECIES[id];
          const chosen = selected === id;
          return (
            <Pressable
              key={id}
              accessibilityRole="radio"
              accessibilityState={{ selected: chosen }}
              accessibilityLabel={`${s.name}. ${s.blurb}`}
              onPress={() => onSelect(id)}
              style={[styles.card, chosen && { borderColor: s.hue, borderWidth: 2 }]}
            >
              {/* The card's own label already names the species. */}
              <Image
                source={SPECIES_FIGURES[id]}
                style={styles.art}
                resizeMode="contain"
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
              />
              <View
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                style={{ width: textWidth }}
              >
                <Text style={styles.name}>{s.name}</Text>
                {/* `prose` is Text's default scale and is right here — the
                    card grows with the type. Stated by omission, not repeated. */}
                <Text style={styles.blurb}>{s.blurb}</Text>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>

      <Button
        label={cta}
        disabled={!selected}
        busy={busy}
        onPress={() => selected && onConfirm(selected)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: space.lg, gap: space.sm },
  // Tokens verified against theme.ts. There is no `font.display.md`; the
  // onboarding screen this replaces uses `font.body.title` for its title and
  // `colors.text` / `colors.subtle` for the pair, so this matches it.
  title: { color: colors.text, ...font.body.title, marginTop: space.sm },
  help: { color: colors.subtle, ...font.body.body, marginTop: space.sm },
  scroll: { flexGrow: 0, flexShrink: 1, marginTop: space.md },
  scrollInner: { gap: space.sm, paddingBottom: space.md },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    // radius.xl is the system's "rounded frame" step, which is what the
    // character screen's cards use. Depth is shadow, not a border — an
    // unchosen card carries no ring, so the border below is transparent.
    borderRadius: radius.xl,
    borderWidth: CARD_BORDER,
    borderColor: 'transparent',
    backgroundColor: colors.surfaceLift,
    ...shadow.sm,
  },
  art: { width: 72, height: 72 },
  name: { color: colors.text, ...font.display.small },
  blurb: { color: colors.subtle, ...font.body.body, marginTop: 2 },
});
